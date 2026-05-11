// เก็บข้อมูลฟอร์มทั้งหมดตั้งแต่ PDPA → ตรวจสิทธิ์ → submit-request step 1-5
//
// ทำไมถึงใช้ Pinia + sessionStorage backup:
//  - Pinia (memory): reactive, type-safe, เก็บ File object ได้, ไม่รั่วไปที่อื่น
//  - sessionStorage backup: กู้คืนได้ถ้า user กด refresh ระหว่างกรอก
//  - ข้อมูลส่วนบุคคล (บัตรประชาชน, ที่อยู่) ไม่ควรอยู่ใน localStorage นานเกิน session

import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

// ─── Key สำหรับ sessionStorage ───────────────────────────────────────────────
const DRAFT_KEY = 'application_draft'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PdpaConsent {
  consented: boolean
  consentedAt: string   // ISO date string เช่น "2025-05-06T10:30:00.000Z"
  version: string       // เวอร์ชัน PDPA ที่ยินยอม เช่น "1.0"
}

// ผลการตรวจสอบสิทธิ์เบื้องต้น (CheckSelfPage)
// รวม occupation + annualIncome ไว้ด้วย เพื่อ pre-fill ใน Step2
export interface CheckSelfData {
  occupation: string    // อาชีพที่เลือก — map to economic_infos.occupation + applicants.is_government_officer
  annualIncome: number  // รายได้ต่อปี (บาท) — ÷12 → economic_infos.monthly_income
  dob: string           // วันเกิด (YYYY-MM-DD) เผื่อ ThaiID ไม่ส่ง → applicants.birth_date
  eligible: boolean     // ผ่านสิทธิ์หรือไม่
  checkedAt: string     // ISO date
}

/** map label จาก UI → requester_relation_type.id (ดู `/v1/lookups/requester-relation-types`) */
export const REQUESTER_RELATION_MAP: Readonly<Record<string, number>> = {
  ตนเอง: 1,
}

// ข้อมูล Step 1 — ข้อมูลส่วนตัว, ที่อยู่, ติดต่อ
export interface Step1Data {
  relationship: string  // ข้อความแสดงผล — ส่ง API เป็น applicants.requester_relation_id
  address: {
    houseNo: string       // address.house_number
    mooNum: string        // address.house_moo
    villageName: string   // address.house_name
    alley: string         // (เพิ่มเติม)
    soi: string           // address.sub_lane
    road: string          // address.road
    subdistrict: string   // ใช้ resolve → address.sub_district_postcode_id
    district: string
    province: string
    postalCode: string    // ใช้ resolve → address.sub_district_postcode_id
    gpsLat: string        // address.latitude
    gpsLng: string        // address.longitude
  }
  contact: {
    phone: string   // applicants.home_phone
    fax: string     // applicants.fax_number
    mobile: string  // applicants.mobile_phone
    email: string   // applicants.email_address
  }
  maritalStatus: string   // applicants.marital_status_id (string → int ตอนส่ง API)
  housingType: string     // economic_infos.housing_types_id (string → int ตอนส่ง API)
  rentPerMonth: string    // economic_infos.housing_types_rent
  familyCount: string     // economic_infos.household_members
}

// ข้อมูล Step 2 — เศรษฐกิจ (economic_infos + income_sources + dependency_loads + welfare_histories)
export interface Step2Data {
  occupation: string          // economic_infos.occupation (pre-fill จาก CheckSelf)
  occupationOther: string     // กรณีเลือก "อื่นๆ" ในอาชีพหลัก
  familyOccupation: string    // economic_infos.family_occupation
  familyOccupationOther: string // กรณีเลือก "อื่นๆ" ในอาชีพของคนในครอบครัว
  monthlyIncome: string       // economic_infos.monthly_income (บาท/เดือน)
  incomeSources: string[]     // economic_income_sources.income_source_type_id (หลาย row)
  incomeSourceOther: string   // กรณีเลือก "อื่นๆ"
  caregiverRoles: string[]    // dependency_loads.dependency_type_id (หลาย row)
  caregiverOther: string      // กรณีเลือก "อื่นๆ"
  govAidHistory: 'none' | 'received' // welfare_histories.has_received_welfare
  timesThisYear: string       // welfare_histories.received_count
  totalAmount: string         // welfare_histories.total_received_amount
  aidTypes: string[]          // welfare_histories_types.received_welfare_type_id (หลาย row)
  aidTypeOther: string        // กรณีเลือก "อื่นๆ"
}

// ข้อมูล Step 3 — ปัญหาและความต้องการ + บัญชีธนาคาร
export interface Step3Data {
  problemDescription: string  // applicants.problem_details
  aidTypes: string[]          // welfare_request_types.request_type_id (หลาย row)
  bankName: string            // frontend only (แสดงชื่อธนาคาร — ไม่ส่ง API)
  bankAccount: string         // applicants.bank_account_no
  bankAccountName: string     // applicants.bank_account_name
  // bankBookPhoto → ส่งแยกผ่าน files Map ใช้ key คงที่ 'bank_book'
}

// Metadata ของเอกสาร (JSON-serializable — เก็บลง sessionStorage ได้)
export interface DocumentMeta {
  id: string            // UUID หรือ key คงที่ เช่น 'exterior', 'bank_book'
  docType: string       // ประเภทเอกสาร เช่น 'id_card', 'household_registration'
  fileName: string      // ชื่อไฟล์ เช่น 'บัตรประชาชน.jpg'
  fileSizeBytes: number // ขนาดไฟล์ (bytes)
  mimeType: string      // เช่น 'image/jpeg', 'application/pdf'
}

// ─── ส่วนที่ serialize ลง sessionStorage ─────────────────────────────────────
// ทุก field ต้องเป็น JSON-serializable (ห้ามมี File object)
interface SerializableDraft {
  pdpa:            PdpaConsent | null
  checkSelf:       CheckSelfData | null
  selectedService: string | null
  step1:           Step1Data | null
  step2:           Step2Data | null
  step3:           Step3Data | null
  documentsMeta:   DocumentMeta[]
  savedAt:         string // ISO timestamp
}

// ─── Helper: อ่าน draft จาก sessionStorage ───────────────────────────────────
function loadDraftFromStorage(): SerializableDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    return JSON.parse(raw) as SerializableDraft
  } catch {
    return null
  }
}

// ─── Helper: บันทึก draft ลง sessionStorage ──────────────────────────────────
function saveDraftToStorage(draft: SerializableDraft): void {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // storage เต็มหรือ private browsing block — ไม่ทำให้แอปพัง
  }
}

// ─── Mapping tables: string → int ตาม ERD ────────────────────────────────────
// ใช้ตอนสร้าง payload ก่อนส่ง API

const MARITAL_STATUS_MAP: Record<string, number> = {
  'โสด': 1,
  'สมรส': 2,
  'หม้าย': 3,
  'หย่าร้าง': 4,
  'แยกกันอยู่': 5,
}

const HOUSING_TYPE_MAP: Record<string, number> = {
  'บ้านตนเอง': 1,
  'บ้านเช่า': 2,
  'บ้านผู้อื่น': 3,
  'ไม่มีที่พัก': 4,
}

const PREFIX_MAP: Record<string, number> = {
  'นาย': 1,
  'นาง': 2,
  'นางสาว': 3,
}

// ─── Store ────────────────────────────────────────────────────────────────────
export const useApplicationStore = defineStore('application', () => {
  // อ่าน draft จาก sessionStorage ถ้ามี (กรณี user กด refresh)
  const saved = loadDraftFromStorage()

  // ── State ──────────────────────────────────────────────────────────────────

  const pdpa            = ref<PdpaConsent | null>(saved?.pdpa ?? null)
  const checkSelf       = ref<CheckSelfData | null>(saved?.checkSelf ?? null)
  const selectedService = ref<string | null>(saved?.selectedService ?? null)
  const step1           = ref<Step1Data | null>(saved?.step1 ?? null)
  const step2           = ref<Step2Data | null>(saved?.step2 ?? null)
  const step3           = ref<Step3Data | null>(saved?.step3 ?? null)

  // documentsMeta — metadata เท่านั้น (เก็บ sessionStorage ได้)
  const documentsMeta   = ref<DocumentMeta[]>(saved?.documentsMeta ?? [])

  // files — File objects จริงๆ อยู่ใน memory เท่านั้น ไม่ serialize
  // Map<id, File> ใช้ id จาก DocumentMeta เป็น key
  const files           = ref<Map<string, File>>(new Map())

  // ── Auto-save ลง sessionStorage ──────────────────────────────────────────
  // deep: true = ตรวจจับการเปลี่ยนแปลงภายใน object ด้วย (เช่น step1.address.houseNo)
  watch(
    [pdpa, checkSelf, selectedService, step1, step2, step3, documentsMeta],
    () => {
      saveDraftToStorage({
        pdpa:            pdpa.value,
        checkSelf:       checkSelf.value,
        selectedService: selectedService.value,
        step1:           step1.value,
        step2:           step2.value,
        step3:           step3.value,
        documentsMeta:   documentsMeta.value,
        savedAt:         new Date().toISOString(),
      })
    },
    { deep: true },
  )

  // ── Actions ───────────────────────────────────────────────────────────────

  // บันทึกผลยินยอม PDPA — เรียกจาก PDPAPage เมื่อ consent ครบ
  function setPdpa(consented: boolean, version = '1.0') {
    pdpa.value = {
      consented,
      consentedAt: new Date().toISOString(),
      version,
    }
  }

  // บันทึกผลตรวจสอบสิทธิ์ + ข้อมูลเบื้องต้น — เรียกจาก CheckSelfPage
  function setCheckSelf(data: CheckSelfData) {
    checkSelf.value = data
  }

  // บันทึกบริการที่เลือก
  function setSelectedService(service: string) {
    selectedService.value = service
  }

  // บันทึกข้อมูลแต่ละ step
  function setStep1(data: Step1Data) { step1.value = data }
  function setStep2(data: Step2Data) { step2.value = data }
  function setStep3(data: Step3Data) { step3.value = data }

  // เพิ่มเอกสาร — บันทึก metadata + File object แยกกัน
  function addDocument(meta: DocumentMeta, file: File) {
    // ถ้า id นี้มีอยู่แล้ว ให้แทนที่แทนการซ้ำ
    const existingIdx = documentsMeta.value.findIndex((d) => d.id === meta.id)
    if (existingIdx >= 0) {
      documentsMeta.value[existingIdx] = meta
    } else {
      documentsMeta.value.push(meta)
    }
    files.value.set(meta.id, file)
  }

  // ลบเอกสาร
  function removeDocument(id: string) {
    documentsMeta.value = documentsMeta.value.filter((d) => d.id !== id)
    files.value.delete(id)
  }

  // รับ File object จาก id (ใช้ตอนอัปโหลดไฟล์จริง)
  function getFile(id: string): File | undefined {
    return files.value.get(id)
  }

  // ─── buildApiPayload: แปลงข้อมูลจาก store → ERD field names ──────────────
  // เรียกจาก handleSubmit() ใน SubmitRequestPage ก่อนส่ง API
  //
  // หมายเหตุ:
  //   - prefix_id, marital_status_id, housing_types_id: map string → int
  //   - sub_district_postcode_id: ต้อง resolve จาก thai-address.json (TODO)
  //   - ค่า null แสดงว่าข้อมูลยังไม่ครบ — API ควร validate อีกรอบ
  function buildApiPayload(authUser: { title?: string; fname?: string; lname?: string; pid?: string; dob?: string } | null = null) {
    const s1 = step1.value
    const s2 = step2.value
    const s3 = step3.value
    const cs = checkSelf.value

    return {
      // ─── applicants ──────────────────────────────────────────────────────
      applicant: {
        prefix_id:              PREFIX_MAP[authUser?.title ?? ''] ?? null,
        first_name:             authUser?.fname ?? null,
        last_name:              authUser?.lname ?? null,
        cid:                    authUser?.pid ?? null,
        birth_date:             authUser?.dob || cs?.dob || null,
        requester_relation_id:  REQUESTER_RELATION_MAP[s1?.relationship ?? ''] ?? 1,
        case_number:            null as string | null,
        marital_status_id:      MARITAL_STATUS_MAP[s1?.maritalStatus ?? ''] ?? null,
        mobile_phone:           s1?.contact.mobile ?? null,
        home_phone:             s1?.contact.phone ?? null,
        fax_number:             s1?.contact.fax ?? null,
        email_address:          s1?.contact.email ?? null,
        // ข้าราชการ = true ถ้า occupation เป็น 'ข้าราชการ'
        is_government_officer:  s2?.occupation === 'ข้าราชการ',
        problem_details:        s3?.problemDescription ?? null,
        bank_account_name:      s3?.bankAccountName ?? null,
        bank_account_no:        s3?.bankAccount ?? null,
      },

      // ─── address ─────────────────────────────────────────────────────────
      address: {
        house_number:             s1?.address.houseNo ?? null,
        house_moo:                s1?.address.mooNum ?? null,
        house_name:               s1?.address.villageName ?? null,
        sub_lane:                 s1?.address.soi ?? null,
        road:                     s1?.address.road ?? null,
        latitude:                 s1?.address.gpsLat ?? null,
        longitude:                s1?.address.gpsLng ?? null,
        // TODO: resolve subdistrict + postalCode string → sub_district_postcode_id int
        // โดยใช้ข้อมูลจาก /public/thai-address.json
        sub_district_postcode_id: null as number | null,
      },

      // ─── economic_infos ───────────────────────────────────────────────────
      economic_info: {
        occupation:         s2?.occupation ?? cs?.occupation ?? null,
        family_occupation:  s2?.familyOccupation ?? null,
        // รายได้ต่อปี ÷ 12 = รายได้ต่อเดือน; ถ้ากรอก Step2 ใช้ Step2 ก่อน
        monthly_income:     s2?.monthlyIncome
                              ? Number(s2.monthlyIncome)
                              : cs?.annualIncome
                                ? Math.round(cs.annualIncome / 12)
                                : null,
        household_members:  Number(s1?.familyCount ?? 0) || null,
        housing_types_id:   HOUSING_TYPE_MAP[s1?.housingType ?? ''] ?? null,
        housing_types_rent: Number(s1?.rentPerMonth ?? 0) || null,
      },

      // ─── economic_income_sources (many rows) ──────────────────────────────
      // TODO: map string label → income_source_type_id int ตาม lookup table
      income_sources:   s2?.incomeSources ?? [],

      // ─── dependency_loads (many rows) ─────────────────────────────────────
      // TODO: map string label → dependency_type_id int ตาม lookup table
      dependency_loads: s2?.caregiverRoles ?? [],

      // ─── welfare_histories ────────────────────────────────────────────────
      welfare_history: {
        has_received_welfare:   s2?.govAidHistory === 'received',
        received_count:         Number(s2?.timesThisYear ?? 0) || null,
        total_received_amount:  Number(s2?.totalAmount ?? 0) || null,
        // welfare_histories_types (many rows)
        // TODO: map string label → received_welfare_type_id int
        received_types: s2?.aidTypes ?? [],
      },

      // ─── welfare_request_types (many rows) ────────────────────────────────
      // TODO: map string label → request_type_id int ตาม lookup table
      request_types: s3?.aidTypes ?? [],

      // ─── welfare_request_consents ─────────────────────────────────────────
      consents: {
        // consent_type = 'Initial': บันทึกตอน PDPA ยินยอม
        Initial_pdpa_accepted:    pdpa.value?.consented ?? false,
        Initial_terms_accepted:   pdpa.value?.consented ?? false,
        initial_warning_accepted: pdpa.value?.consented ?? false,
        // consent_type = 'final': บันทึกตอน Step5 ยืนยัน
        final_data_correct_accepted: true,
      },

      // ─── welfare_evidences (many rows): metadata ไฟล์ ────────────────────
      // ไฟล์จริงส่งแยกผ่าน multipart/form-data โดยใช้ getFile(id)
      documents: documentsMeta.value,

      // ─── metadata ─────────────────────────────────────────────────────────
      selected_service: selectedService.value,
    }
  }

  // ล้างข้อมูลทั้งหมด — เรียกหลัง submit สำเร็จ
  // เพื่อไม่ให้ข้อมูลส่วนบุคคลค้างอยู่ใน memory/storage
  function clearAll() {
    pdpa.value            = null
    checkSelf.value       = null
    selectedService.value = null
    step1.value           = null
    step2.value           = null
    step3.value           = null
    documentsMeta.value   = []
    files.value           = new Map()
    sessionStorage.removeItem(DRAFT_KEY)
  }

  return {
    // state (read-only จาก component)
    pdpa,
    checkSelf,
    selectedService,
    step1,
    step2,
    step3,
    documentsMeta,
    // actions
    setPdpa,
    setCheckSelf,
    setSelectedService,
    setStep1,
    setStep2,
    setStep3,
    addDocument,
    removeDocument,
    getFile,
    buildApiPayload,
    clearAll,
  }
})
