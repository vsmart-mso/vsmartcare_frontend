// เก็บข้อมูลฟอร์มทั้งหมดตั้งแต่ PDPA → ตรวจสิทธิ์ → submit-request step 1-5
//
// ทำไมถึงใช้ Pinia + sessionStorage backup:
//  - Pinia (memory): reactive, type-safe, เก็บ File object ได้, ไม่รั่วไปที่อื่น
//  - sessionStorage backup: กู้คืนได้ถ้า user กด refresh ระหว่างกรอก
//  - ข้อมูลส่วนบุคคล (บัตรประชาชน, ที่อยู่) ไม่ควรอยู่ใน localStorage นานเกิน session

import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { CasePayload, FullCaseDetail, ReviewComment } from '@/api/welfare'
import type { OcrBankBookResponse } from '@/api/ocr'

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

// ข้อมูลสมาชิกครัวเรือน 1 แถว (ปสค.๒)
export interface HouseholdMemberForm {
  seq: number
  nationalId: string                                      // '' = ไม่มี → null
  prefixId: string                                        // '' = ใช้ prefixOther
  prefixOther: string
  firstName: string
  lastName: string
  dateOfBirth: string                                   // '' = ไม่ระบุ, format YYYY-MM-DD
  relationToApplicantId: number | null
  occupation: string
  monthlyIncome: string
  physicalCondition: 'normal' | 'disabled' | 'chronic_illness'
  selfCare: boolean
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
    subdistrict: string
    district: string
    province: string
    postalCode: string
    subDistrictPostcodeId: number | null  // bridge ID จาก geo API → address.sub_district_postcode_id
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
  householdMembers: HouseholdMemberForm[]  // household_members[] (แทน familyCount เดิม)
}

// ข้อมูล Step 2 — เศรษฐกิจ (economic_infos + income_sources + dependency_loads + welfare_histories)
export interface Step2Data {
  // occupation ไม่อยู่ที่นี่ — ดึงจาก CheckSelfData.occupation แทน
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
  aidTypes: string[]              // welfare_histories_types.received_welfare_type_id (หลาย row)
  aidTypeDetails: Record<string, string> // key = option id, value = ข้อความระบุรายละเอียด → welfare_histories_detail.received_other
}

// ข้อมูล Step 3 — ปัญหาและความต้องการ + บัญชีธนาคาร
export interface Step3Data {
  problemDescription: string  // applicants.problem_details
  aidTypes: string[]          // welfare_request_types.request_type_id (หลาย row)
  aidOtherText: string        // welfare_request_types.request_other_text (request_type_id=3)
  aidInKindText: string       // welfare_request_types.request_in_kind_text (request_type_id=2)
  bankNameId: string          // applicants.bank_name_id (FK → bank_name.id)
  bankAccount: string         // applicants.bank_account_no
  bankAccountTypeId: string   // applicants.bank_account_type_id (FK → bank_account_type.id)
  bankBranchName: string      // applicants.bank_branch_name — ชื่อสาขาจาก OCR
  // bankBookPhoto → ส่งแยกผ่าน files Map ใช้ key คงที่ 'bank_book'
}

// Metadata ของเอกสาร (JSON-serializable — เก็บลง sessionStorage ได้)
export interface DocumentMeta {
  id: string             // UUID หรือ key คงที่ เช่น 'exterior', 'bank_book'
  docType: string        // ประเภทเอกสาร เช่น 'id_card', 'household_registration'
  fileName: string       // ชื่อไฟล์ เช่น 'บัตรประชาชน.jpg'
  fileSizeBytes: number  // ขนาดไฟล์ (bytes)
  mimeType: string       // เช่น 'image/jpeg', 'application/pdf'
  otherTypeName?: string // ชื่อประเภทเอกสาร (ใช้เฉพาะ docType = 'other_doc')
}

// ─── ส่วนที่ serialize ลง sessionStorage ─────────────────────────────────────
// ทุก field ต้องเป็น JSON-serializable (ห้ามมี File object หรือ Blob URL)
interface SerializableDraft {
  pdpa:                  PdpaConsent | null
  checkSelf:             CheckSelfData | null
  selectedService:       string | null
  step1:                 Step1Data | null
  step2:                 Step2Data | null
  step3:                 Step3Data | null
  documentsMeta:         DocumentMeta[]
  editMode:              boolean
  editApplicantId:       number | null
  existingEvidenceIds:   Record<string, number>
  existingOtherTypeName: string
  savedAt:               string // ISO timestamp
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

// ─── Attachment type ID map: docType → attachment_types.id ───────────────────
export const ATTACHMENT_TYPE_MAP: Record<string, number> = {
  bank_book:    1,
  exterior:     2,
  interior:     3,
  person:       4,
  problem:      5,
  house_home:   6,
  house_person: 7,
  family:       8,
  other_doc:    99,
}

// ─── Reverse map: attachment_types.id → docType (ใช้ใน Edit Mode) ────────────
export const ATTACHMENT_ID_TO_DOCTYPE: Record<number, string> = Object.fromEntries(
  Object.entries(ATTACHMENT_TYPE_MAP).map(([k, v]) => [v, k])
)

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
  const files           = ref<Map<string, File>>(new Map())

  // review comments จากเจ้าหน้าที่ (status=8) — memory เท่านั้น ไม่ persist
  const reviewComments = ref<ReviewComment[]>([])

  // ── Edit Mode ─────────────────────────────────────────────────────────────
  // persist ลง sessionStorage ได้ (ยกเว้น existingImageUrls ที่เป็น Blob URL)
  const editMode              = ref<boolean>(saved?.editMode ?? false)
  const editApplicantId       = ref<number | null>(saved?.editApplicantId ?? null)
  // docType → evidence.id จาก server (สำหรับ lazy-load รูปใน Step3/Step4)
  const existingEvidenceIds   = ref<Record<string, number>>(saved?.existingEvidenceIds ?? {})
  // docType → blob URL (memory เท่านั้น — re-fetch เมื่อ Step mount ใหม่หลัง refresh)
  const existingImageUrls     = ref<Record<string, string>>({})
  // ชื่อเอกสาร other_doc (persist ได้)
  const existingOtherTypeName = ref<string>(saved?.existingOtherTypeName ?? '')

  // ── Bank Book OCR State (ไม่ persist เพราะ re-OCR ใหม่ทุกครั้ง) ──────────
  // เก็บผล OCR จากรูปสมุดบัญชี — ใช้ข้าม step (Step3 → Step5)
  const bankBookOcrResult = ref<OcrBankBookResponse | null>(null)
  // กำลัง OCR อยู่หรือไม่ (ใช้แสดง spinner ใน Step3)
  const bankBookOcrLoading = ref(false)
  // OCR result ID จาก POST response — ใช้สำหรับ PATCH link หลัง submit
  const bankBookOcrResultId = ref<number | null>(null)

  // ── Auto-save ลง sessionStorage ──────────────────────────────────────────
  // deep: true = ตรวจจับการเปลี่ยนแปลงภายใน object ด้วย (เช่น step1.address.houseNo)
  watch(
    [pdpa, checkSelf, selectedService, step1, step2, step3, documentsMeta,
     editMode, editApplicantId, existingEvidenceIds, existingOtherTypeName],
    () => {
      saveDraftToStorage({
        pdpa:                  pdpa.value,
        checkSelf:             checkSelf.value,
        selectedService:       selectedService.value,
        step1:                 step1.value,
        step2:                 step2.value,
        step3:                 step3.value,
        documentsMeta:         documentsMeta.value,
        editMode:              editMode.value,
        editApplicantId:       editApplicantId.value,
        existingEvidenceIds:   existingEvidenceIds.value,
        existingOtherTypeName: existingOtherTypeName.value,
        savedAt:               new Date().toISOString(),
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

  // อัปเดตเฉพาะข้อมูลบัญชี (เรียกจาก OCR auto-fill ใน Step4 — ตอนนั้น Step3 unmount แล้ว)
  // ถ้ายังไม่มี step3 ใน store ให้สร้าง draft ขึ้นมาก่อน
  function setBankInfo(
    bankNameId: string,
    bankAccount: string,
    bankAccountTypeId = '',
    bankBranchName = '',
  ) {
    if (step3.value) {
      step3.value = { ...step3.value, bankNameId, bankAccount, bankAccountTypeId, bankBranchName }
    } else {
      step3.value = {
        problemDescription: '',
        aidTypes:           [],
        aidOtherText:       '',
        aidInKindText:      '',
        bankNameId,
        bankAccount,
        bankAccountTypeId,
        bankBranchName,
      }
    }
  }

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

  // ─── buildApiPayload: แปลงข้อมูลจาก store → รูปแบบที่ POST /v1/cases ต้องการ ──
  // เรียกจาก handleSubmit() ใน SubmitRequestPage ก่อนส่ง API
  //
  // หมายเหตุ:
  //   - marital_status_id / housing_types_id: เก็บเป็น String(id) จาก API → แปลงด้วย Number()
  //   - incomeSources / caregiverRoles / aidTypes: เก็บเป็น string[] ของ id → แปลงด้วย Number()
  //   - requester_relation_id = 1 เสมอ (ตนเอง — มีแค่รายการเดียวใน DB)
  //   - initial_current_status_id = 1 (รับเรื่อง)
  function buildApiPayload(
    authUser: { dob?: string; person_id?: number } | null = null,
  ): CasePayload {
    const s1 = step1.value
    const s2 = step2.value
    const s3 = step3.value
    const cs = checkSelf.value

    // คำนวณอายุจากวันเกิด YYYY-MM-DD
    function computeAge(dob: string | null | undefined): number | null {
      if (!dob || !dob.trim()) return null
      const birth = new Date(dob)
      if (isNaN(birth.getTime())) return null
      const today = new Date()
      let y = today.getFullYear() - birth.getFullYear()
      const passed =
        today.getMonth() > birth.getMonth() ||
        (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate())
      if (!passed) y--
      return y
    }
    const effectiveDob = authUser?.dob?.trim() || cs?.dob || null
    const age = computeAge(effectiveDob)

    // ─── addresses ────────────────────────────────────────────────────────
    // address_type_id = 1 = "ที่อยู่ปัจจุบัน" (seed ข้อมูลไว้แล้ว)
    // sub_district_postcode_id ต้องไม่เป็น null — validate ใน handleSubmit ก่อนเรียกฟังก์ชันนี้
    const addresses: CasePayload['addresses'] = s1?.address.subDistrictPostcodeId
      ? [{
          sub_district_postcode_id: s1.address.subDistrictPostcodeId,
          address_type_id:          1,
          house_number:  s1.address.houseNo      || null,
          house_moo:     s1.address.mooNum       || null,
          house_name:    s1.address.villageName  || null,
          alley:         s1.address.alley        || null,
          sub_lane:      s1.address.soi          || null,
          road:          s1.address.road         || null,
          latitude:      s1.address.gpsLat       || null,
          longitude:     s1.address.gpsLng       || null,
        }]
      : []

    // ─── dependency_loads ─────────────────────────────────────────────────
    // caregiverRoles เก็บ id ของประเภทภาระการอุปการะ (string[] จาก API)
    // caregiverOther ใช้เป็น other_text กรณีเลือก "อื่น ๆ"
    const dependency_loads = (s2?.caregiverRoles ?? []).map(idStr => ({
      dependency_type_id:    Number(idStr),
      dependency_other_text: s2?.caregiverOther || null,
    }))

    // ─── economic_infos ───────────────────────────────────────────────────
    // income_sources เก็บ id ของแหล่งรายได้ (string[] จาก API)
    const income_sources = (s2?.incomeSources ?? []).map(idStr => ({
      income_source_type_id: Number(idStr),
      other_details:         s2?.incomeSourceOther || null,
    }))

    const householdMembersList = (s1?.householdMembers ?? []).map((m, i) => ({
      seq:                  m.seq || i + 1,
      national_id:          m.nationalId || null,
      prefix_id:            Number(m.prefixId) || null,
      prefix_other:         m.prefixOther || null,
      first_name:           m.firstName,
      last_name:            m.lastName,
      date_of_birth:        m.dateOfBirth || null,
      relation_to_applicant_id: m.relationToApplicantId ?? null,
      occupation:           m.occupation || null,
      monthly_income:       (() => { const n = Number(m.monthlyIncome); return m.monthlyIncome !== '' && !isNaN(n) ? n : null })(),
      physical_condition:   m.physicalCondition,
      self_care:            m.selfCare,
    }))

    const economic_infos: CasePayload['economic_infos'] = [{
      housing_types_id:   Number(s1?.housingType ?? '0') || null,
      housing_types_rent: s1?.rentPerMonth ? (Number(s1.rentPerMonth) || null) : null,
      occupation:        cs?.occupation || null,
      // Step2 เก็บรายได้ต่อเดือน; ถ้าไม่มีให้ fallback จาก CheckSelf (รายได้ต่อปี ÷ 12)
      monthly_income:    s2?.monthlyIncome
                           ? Number(s2.monthlyIncome)
                           : cs?.annualIncome
                             ? Math.round(cs.annualIncome / 12)
                             : null,
      household_members: householdMembersList.length > 0 ? householdMembersList.length : null,
      family_occupation: s2?.familyOccupation || null,
      income_sources,
    }]

    // ─── welfare_history ──────────────────────────────────────────────────
    // history_details เก็บ id ของประเภทสวัสดิการที่เคยได้รับ (string[] จาก API)
    const welfare_history: CasePayload['welfare_history'] =
      s2?.govAidHistory === 'received'
        ? {
            has_received_welfare:  true,
            received_count:        Number(s2.timesThisYear ?? '0') || null,
            total_received_amount: Number(s2.totalAmount ?? '0') || null,
            history_details: (s2.aidTypes ?? []).map(idStr => ({
              received_welfare_type_id: Number(idStr),
              received_other: s2.aidTypeDetails?.[idStr] || null,
            })),
          }
        : null

    return {
      applicant: {
        persons_id:            authUser?.person_id ?? 0,
        requester_relation_id: 1, // ตนเอง — ตาราง requester_relation_type มีเพียง id=1
        marital_status_id:     Number(s1?.maritalStatus) || 0,
        mobile_phone:          s1?.contact.mobile  || null,
        home_phone:            s1?.contact.phone   || null,
        fax_number:            s1?.contact.fax     || null,
        // trim แล้วส่ง null ถ้าว่าง — EmailStr ใน backend reject empty string
        email_address:         s1?.contact.email?.trim() || null,
        problem_details:       s3?.problemDescription || null,
        bank_name_id:          Number(s3?.bankNameId) || null,
        bank_account_no:       s3?.bankAccount     || null,
        bank_account_type_id:  Number(s3?.bankAccountTypeId) || null,
        bank_branch_name:      s3?.bankBranchName  || null,
        age,
      },
      addresses,
      dependency_loads,
      economic_infos,
      household_members: householdMembersList,
      // request_type_ids เก็บ id ของประเภทความช่วยเหลือที่ร้องขอ (Step3)
      request_type_ids: (s3?.aidTypes ?? []).map(idStr => Number(idStr)),
      request_other_text: s3?.aidOtherText || null,
      request_in_kind_text: s3?.aidInKindText || null,
      welfare_history,
      initial_current_status_id: 1, // รับเรื่อง
    }
  }

  // ─── Edit Mode Actions ────────────────────────────────────────────────────

  // ดึงข้อมูล case เดิมมา populate ฟอร์ม step1/2/3 และเก็บ evidence IDs สำหรับ lazy-load รูปใน Step4
  function populateFromCase(caseData: FullCaseDetail) {
    const a    = caseData.applicant
    const addr = caseData.addresses[0] ?? null
    const eco  = caseData.economic_infos[0] ?? null
    const wh   = caseData.welfare_history

    editMode.value        = true
    editApplicantId.value = a.id

    // ── Step 1 ──────────────────────────────────────────────────────────────
    const geo = addr?.sub_district_postcode
    step1.value = {
      relationship: 'ตนเอง',
      address: {
        houseNo:               addr?.house_number ?? '',
        mooNum:                addr?.house_moo    ?? '',
        villageName:           addr?.house_name   ?? '',
        alley:                 addr?.alley         ?? '',
        soi:                   addr?.sub_lane      ?? '',
        road:                  addr?.road         ?? '',
        subdistrict:           geo?.sub_district?.name                         ?? '',
        district:              geo?.sub_district?.district?.name               ?? '',
        province:              geo?.sub_district?.district?.province?.name     ?? '',
        postalCode:            geo?.postcode?.name                             ?? '',
        subDistrictPostcodeId: addr?.sub_district_postcode_id ?? null,
        gpsLat:                addr?.latitude  ?? '',
        gpsLng:                addr?.longitude ?? '',
      },
      contact: {
        phone:  a.home_phone    ?? '',
        fax:    a.fax_number    ?? '',
        mobile: a.mobile_phone  ?? '',
        email:  a.email_address ?? '',
      },
      maritalStatus: String(a.marital_status_id ?? ''),
      housingType:   String(eco?.housing_types_id ?? ''),
      // แปลง Decimal string จาก backend เป็น integer string (ตัดทศนิยมทิ้ง)
      rentPerMonth:  eco?.housing_types_rent ? String(Math.round(Number(eco.housing_types_rent))) : '',
      householdMembers: (caseData.household_members ?? []).map((m, i) => ({
        seq:                  m.seq ?? i + 1,
        nationalId:           m.national_id ?? '',
        prefixId:             String(m.prefix_id ?? ''),
        prefixOther:          m.prefix_other ?? '',
        firstName:            m.first_name ?? '',
        lastName:             m.last_name ?? '',
        dateOfBirth:          m.date_of_birth ?? '',
        relationToApplicantId: m.relation_to_applicant_id ?? null,
        occupation:           m.occupation ?? '',
        monthlyIncome:        m.monthly_income ? String(Math.round(Number(m.monthly_income))) : '',
        physicalCondition:    (m.physical_condition ?? 'normal') as 'normal' | 'disabled' | 'chronic_illness',
        selfCare:             m.self_care ?? true,
      })),
    }

    // ── checkSelf (occupation สำหรับ Step2) ─────────────────────────────────
    checkSelf.value = {
      occupation:   eco?.occupation ?? '',
      annualIncome: Number(eco?.monthly_income ?? 0) * 12,
      dob:          '',
      eligible:     true,
      checkedAt:    new Date().toISOString(),
    }

    // ── Step 2 ──────────────────────────────────────────────────────────────
    step2.value = {
      familyOccupation:      eco?.family_occupation ?? '',
      familyOccupationOther: '',
      monthlyIncome:         eco?.monthly_income    ?? '',
      incomeSources:         (eco?.income_sources ?? []).map(s => String(s.income_source_type_id)),
      incomeSourceOther:     (eco?.income_sources ?? []).find(s => s.other_details)?.other_details ?? '',
      caregiverRoles:        caseData.dependency_loads.map(d => String(d.dependency_type_id)),
      caregiverOther:        caseData.dependency_loads.find(d => d.dependency_other_text)?.dependency_other_text ?? '',
      govAidHistory:         wh?.has_received_welfare ? 'received' : 'none',
      timesThisYear:         String(wh?.received_count ?? ''),
      totalAmount:           String(wh?.total_received_amount ?? ''),
      aidTypes:              (wh?.history_details ?? []).map(d => String(d.received_welfare_type_id)),
      aidTypeDetails:        Object.fromEntries(
        (wh?.history_details ?? []).map(d => [String(d.received_welfare_type_id), d.received_other ?? ''])
      ),
    }

    // ── Step 3 ──────────────────────────────────────────────────────────────
    step3.value = {
      problemDescription: a.problem_details ?? '',
      aidTypes:           caseData.welfare_request_types.map(rt => String(rt.request_type_id)),
      aidOtherText:       caseData.welfare_request_types.find(rt => rt.request_type_id === 3)?.request_other_text ?? '',
      aidInKindText:      caseData.welfare_request_types.find(rt => rt.request_type_id === 2)?.request_in_kind_text ?? '',
      bankNameId:         String(a.bank_name_id ?? ''),
      bankAccount:        a.bank_account_no ?? '',
      bankAccountTypeId:  String(a.bank_account_type_id ?? ''),
      bankBranchName:     a.bank_branch_name ?? '',
    }

    // ── Evidence IDs สำหรับ lazy-load รูปใน Step4 ───────────────────────────
    existingEvidenceIds.value = {}
    existingOtherTypeName.value = ''
    for (const ev of caseData.welfare_evidences) {
      const docType = ATTACHMENT_ID_TO_DOCTYPE[ev.attachment_type_id]
      if (docType) {
        existingEvidenceIds.value = { ...existingEvidenceIds.value, [docType]: ev.id }
        if (docType === 'other_doc' && ev.file_other_type_name) {
          existingOtherTypeName.value = ev.file_other_type_name
        }
      }
    }
  }

  // เก็บ blob URL ที่ fetch มาแล้ว (reactive — ต้องสร้าง object ใหม่เพื่อ trigger)
  function setExistingImage(docType: string, url: string) {
    existingImageUrls.value = { ...existingImageUrls.value, [docType]: url }
  }

  // user กด "ลบ" รูปเดิม
  function clearExistingImage(docType: string) {
    const { [docType]: _, ...rest } = existingImageUrls.value
    existingImageUrls.value = rest
  }

  // ─── Bank Book OCR Actions ──────────────────────────────────────────────
  function setBankBookOcrLoading(loading: boolean) {
    bankBookOcrLoading.value = loading
  }
  function setBankBookOcrResult(result: OcrBankBookResponse | null) {
    bankBookOcrResult.value = result
    bankBookOcrResultId.value = result?.id ?? null
  }
  function clearBankBookOcr() {
    bankBookOcrResult.value = null
    bankBookOcrResultId.value = null
    bankBookOcrLoading.value = false
  }

  // ล้างข้อมูลทั้งหมด — เรียกหลัง submit สำเร็จ
  function clearAll() {
    pdpa.value            = null
    checkSelf.value       = null
    selectedService.value = null
    step1.value           = null
    step2.value           = null
    step3.value           = null
    documentsMeta.value   = []
    files.value           = new Map()
    // ล้าง edit mode
    editMode.value        = false
    editApplicantId.value = null
    existingEvidenceIds.value   = {}
    // revoke blob URLs เพื่อ free memory
    Object.values(existingImageUrls.value).forEach(url => URL.revokeObjectURL(url))
    existingImageUrls.value     = {}
    existingOtherTypeName.value = ''
    clearBankBookOcr()
    sessionStorage.removeItem(DRAFT_KEY)
  }

  return {
    // state
    pdpa,
    checkSelf,
    selectedService,
    step1,
    step2,
    step3,
    documentsMeta,
    editMode,
    editApplicantId,
    existingEvidenceIds,
    existingImageUrls,
    existingOtherTypeName,
    bankBookOcrResult,
    bankBookOcrLoading,
    bankBookOcrResultId,
    reviewComments,
    // actions
    setPdpa,
    setCheckSelf,
    setSelectedService,
    setStep1,
    setStep2,
    setStep3,
    setBankInfo,
    addDocument,
    removeDocument,
    getFile,
    buildApiPayload,
    populateFromCase,
    setExistingImage,
    clearExistingImage,
    clearAll,
    setBankBookOcrLoading,
    setBankBookOcrResult,
    clearBankBookOcr,
  }
})
