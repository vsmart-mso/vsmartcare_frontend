<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useApplicationStore, ATTACHMENT_TYPE_MAP } from '@/stores/application'
import type { Step1Data, Step2Data, Step3Data } from '@/stores/application'
import { useAuthStore } from '@/stores/auth'
import type { ThaiDUser } from '@/types/auth'
import { welfareApi } from '@/api/welfare'
import { linkOcrResult } from '@/api/ocr'
import Step1PersonalInfo from '@/views/submit-request/steps/Step1PersonalInfo.vue'
import Step2Economics   from '@/views/submit-request/steps/Step2Economics.vue'
import Step3Problem     from '@/views/submit-request/steps/Step3Problem.vue'
import Step4Documents   from '@/views/submit-request/steps/Step4Documents.vue'

const router = useRouter()
const app    = useApplicationStore()
const auth   = useAuthStore()

// ─── Guard: ถ้าไม่มี reviewComments → redirect กลับ case-tracking ─────────────
onMounted(() => {
  if (!app.editMode || !app.editApplicantId || app.reviewComments.length === 0) {
    router.replace({ name: 'case-tracking' })
  }
})

// ─── buildFilterFields: แปลง reviewComments → ชื่อ field ที่ต้องแสดงใน step ──
// พร้อม dependency expansion (เช่น subdistrict ต้องการ province + district)
function buildFilterFields(step: number): string[] {
  const names = new Set(
    app.reviewComments
      .filter(c => c.step === step && c.name !== 'remarks')
      .map(c => c.name)
  )

  if (step === 1) {
    // Address cascade: subdistrict ต้องการ district + province
    if (names.has('current_address_subdistrict')) {
      names.add('current_address_district')
      names.add('current_address_province')
    }
    if (names.has('current_address_district')) {
      names.add('current_address_province')
    }
    // ค่าเช่าต้องการ housingType เพื่อ toggle เงื่อนไข
    if (names.has('housing_rent')) names.add('housing_type')
  }

  if (step === 2) {
    // "อื่นๆ" ต้องการ parent checkbox group
    if (names.has('income_source_other')) names.add('income_sources')
    if (names.has('dependents_other'))    names.add('dependents')
    // รายละเอียด gov_aid ต้องการ radio toggle ก่อน
    const govAidDetail = ['gov_aid_count', 'gov_aid_amount', 'gov_aid_types', 'gov_aid_type_detail']
    if (govAidDetail.some(n => names.has(n))) names.add('gov_aid_received')
  }

  return Array.from(names)
}

// ─── คำนวณ filterFields ต่อ step ────────────────────────────────────────────────
const filterFields1 = computed(() => buildFilterFields(1))
const filterFields2 = computed(() => buildFilterFields(2))
const filterFields3 = computed(() => buildFilterFields(3))
const filterFields4 = computed(() => buildFilterFields(4))

// แสดง section ของ step ใดก็ต่อเมื่อมี field ที่ต้องแก้ใน step นั้น
const showStep1 = computed(() => filterFields1.value.length > 0)
const showStep2 = computed(() => filterFields2.value.length > 0)
const showStep3 = computed(() => filterFields3.value.length > 0)
const showStep4 = computed(() => filterFields4.value.length > 0)

// ─── Refs ของ step components ───────────────────────────────────────────────────
interface StepExpose {
  getData: () => Record<string, unknown>
  touchAll?: () => void
}
const step1Ref = ref<InstanceType<typeof Step1PersonalInfo> | null>(null)
const step2Ref = ref<InstanceType<typeof Step2Economics>    | null>(null)
const step3Ref = ref<InstanceType<typeof Step3Problem>      | null>(null)
// Step 4 ไม่ต้องใช้ ref — ไฟล์รูปถูก sync เข้า store โดยตรงผ่าน watch ใน Step4Documents

// ─── Readiness ──────────────────────────────────────────────────────────────────
const step1Ready = ref(!showStep1.value)
const step2Ready = ref(!showStep2.value)
const step3Ready = ref(!showStep3.value)
const step4Ready = ref(!showStep4.value)

const allReady = computed(() =>
  (!showStep1.value || step1Ready.value) &&
  (!showStep2.value || step2Ready.value) &&
  (!showStep3.value || step3Ready.value) &&
  (!showStep4.value || step4Ready.value)
)

// ─── Dirty check: ต้องแก้ไข "ทุก" field ที่ถูกตีกลับก่อน จึงจะบันทึกได้ ────────────
// เก็บ snapshot ค่า "ตั้งต้น" ของแต่ละ step ทันทีที่ restore เสร็จ (loading = false)
// แล้วเทียบทีละ field ตอนจะบันทึก — ถ้ายังมี field ใดที่ค่าเท่าเดิม = ยังไม่ได้แก้ → ห้ามบันทึก
// (เทียบผ่าน getData() ทั้งคู่ จึง normalize เหมือนกัน ไม่เกิด false dirty จากการแปลงค่า)
const baseline = ref<Record<number, string | null>>({})

/** อ่าน instance ของ step component ตามหมายเลข (null = ยังไม่ mount) */
function stepInstance(step: number): StepExpose | null {
  const r = ({ 1: step1Ref, 2: step2Ref, 3: step3Ref } as const)[step as 1 | 2 | 3]
  return (r?.value as unknown as StepExpose) ?? null
}

/** snapshot ค่าปัจจุบันของ step เป็น JSON string (null = ยังไม่มี ref ให้อ่าน) */
function snapshot(step: number): string | null {
  const inst = stepInstance(step)
  if (!inst?.getData) return null
  return JSON.stringify(inst.getData())
}

/** เก็บค่าตั้งต้นครั้งเดียวต่อ step — เรียกตอน loading กลายเป็น false หลัง restore */
function captureBaseline(step: number) {
  if (baseline.value[step] != null) return
  baseline.value = { ...baseline.value, [step]: snapshot(step) }
}

// field รูปภาพ (step 4) → docType ใน documentsMeta — ถือว่า "แก้ไข" เมื่อมีไฟล์ใหม่ถูกอัปโหลด
const FILE_FIELD_DOCTYPE: Record<string, string> = {
  evidence_house_exterior:       'exterior',
  evidence_house_interior:       'interior',
  evidence_person_photo:         'person',
  evidence_problem_photo:        'problem',
  evidence_family_photo:         'family',
  doc_house_registration_house:  'house_home',
  doc_house_registration_person: 'house_person',
  doc_ktb_corporate:             'ktb_form',
  doc_other:                     'other_doc',
  bank_book_photo:               'bank_book',
}

// แปลงชื่อ field (จาก reviewComments) → ค่าที่ใช้เทียบ จาก object ผลของ getData()
// คืน null = ไม่รู้จัก field นี้ (จะถูกข้าม ไม่นำมาบังคับ — กันเคส field ที่ยังไม่มีในฟอร์ม)
function fieldValue(name: string, data: Record<string, unknown> | null): string | null {
  if (!data) return null
  const a = (data.address as Record<string, unknown>) ?? {}
  const c = (data.contact as Record<string, unknown>) ?? {}
  switch (name) {
    // ── Step 1: ที่อยู่ / ติดต่อ / ข้อมูลทั่วไป ──
    case 'current_address_house_no':    return String(a.houseNo ?? '')
    case 'current_address_moo':         return String(a.mooNum ?? '')
    case 'current_address_village':     return String(a.villageName ?? '')
    case 'current_address_alley':       return String(a.alley ?? '')
    case 'current_address_soi':         return String(a.soi ?? '')
    case 'current_address_road':        return String(a.road ?? '')
    case 'current_address_province':    return String(a.province ?? '')
    case 'current_address_district':    return String(a.district ?? '')
    case 'current_address_subdistrict': return String(a.subdistrict ?? '')
    case 'current_address_gps':         return `${a.gpsLat ?? ''},${a.gpsLng ?? ''}`
    case 'contact_phone_home':          return String(c.phone ?? '')
    case 'contact_fax':                 return String(c.fax ?? '')
    case 'contact_mobile':              return String(c.mobile ?? '')
    case 'contact_email':               return String(c.email ?? '')
    case 'marital_status':              return String(data.maritalStatus ?? '')
    case 'housing_type':                return String(data.housingType ?? '')
    case 'housing_rent': {
      // ไม่บังคับแก้ค่าเช่าเมื่อเปลี่ยนเป็นประเภทที่ไม่ใช่บ้านเช่าแล้ว
      if (data.isRentHousing === false) return null
      return String(data.rentPerMonth ?? '')
    }
    case 'household_members':           return JSON.stringify(data.householdMembers ?? [])
    // backward compat: comment เก่าที่ยังใช้ชื่อเดิมก่อน migration 0060
    case 'family_members_count':        return JSON.stringify(data.householdMembers ?? [])
    // ── Step 2: เศรษฐกิจ / สวัสดิการ ──
    case 'family_occupation':   return String(data.familyOccupation ?? '')
    case 'family_income':       return String(data.monthlyIncome ?? '')
    case 'income_sources':      return JSON.stringify(data.incomeSources ?? [])
    case 'income_source_other': return String(data.incomeSourceOther ?? '')
    case 'dependents':          return JSON.stringify(data.caregiverRoles ?? [])
    case 'dependents_other':    return String(data.caregiverOther ?? '')
    case 'gov_aid_received':    return String(data.govAidHistory ?? '')
    case 'gov_aid_count':       return String(data.timesThisYear ?? '')
    case 'gov_aid_amount':      return String(data.totalAmount ?? '')
    case 'gov_aid_types':       return JSON.stringify(data.aidTypes ?? [])
    case 'gov_aid_type_detail': return JSON.stringify(data.aidTypeDetails ?? {})
    // ── Step 3: ปัญหา / ความช่วยเหลือ / ธนาคาร ──
    case 'family_problems':           return String(data.problemDescription ?? '')
    // รวม aidTypes + aidOtherText + aidInKindText ให้ dirty-check ตรวจได้ครบ
    case 'requested_assistance_type': return JSON.stringify({
      types:   data.aidTypes      ?? [],
      other:   data.aidOtherText  ?? '',
      inKind:  data.aidInKindText ?? '',
    })
    case 'bank_name':                 return String(data.bankNameId ?? '')
    case 'bank_account_number':       return String(data.bankAccount ?? '')
    default: return null
  }
}

// true = แก้ไขครบ "ทุก" field ที่ถูกตีกลับแล้ว (ถ้ายังเหลือ field ที่ค่าเท่าเดิม → false)
const allFieldsEdited = computed(() => {
  const comments = app.reviewComments.filter(c => c.name !== 'remarks')
  if (comments.length === 0) return false // ไม่มีอะไรให้แก้ (ปกติ guard redirect ไปแล้ว)

  for (const c of comments) {
    // ── field รูปภาพ (step 4): ต้องอัปโหลดไฟล์ใหม่ทับ ──
    const docType = FILE_FIELD_DOCTYPE[c.name]
    if (docType) {
      if (!app.documentsMeta.some(m => m.id === docType)) return false
      continue
    }
    // ── field ข้อความ/ตัวเลือก: เทียบค่าปัจจุบันกับค่าตั้งต้นทีละ field ──
    const base = baseline.value[c.step]
    const cur  = snapshot(c.step)
    if (base == null || cur == null) return false // restore ยังไม่เสร็จ → ยังบันทึกไม่ได้
    const curData = JSON.parse(cur) as Record<string, unknown>
    // ค่าเช่า: ถ้าเปลี่ยนเป็นที่อยู่ที่ไม่ใช่บ้านเช่าแล้ว ถือว่าแก้ครบ (ไม่บังคับแก้ตัวเลขค่าเช่า)
    if (c.name === 'housing_rent' && curData.isRentHousing === false) continue
    const baseVal = fieldValue(c.name, JSON.parse(base) as Record<string, unknown>)
    const curVal  = fieldValue(c.name, curData)
    if (baseVal == null) continue        // resolver ไม่รู้จัก field → ข้าม ไม่บังคับ
    if (baseVal === curVal) return false  // field นี้ยังไม่ถูกแก้ → ห้ามบันทึก
  }
  return true
})

// ─── สถานะการโหลดของแต่ละ step ──────────────────────────────────────────────
// แต่ละ step component ดึง options จาก API ตอน mount และส่งสถานะนี้กลับมา
// ระหว่างที่ step ใดยังโหลดอยู่ จะปิดปุ่ม "บันทึกการแก้ไข" กันผู้ใช้กดก่อนพร้อม
const step1Loading = ref(false)
const step2Loading = ref(false)
const step3Loading = ref(false)
const step4Loading = ref(false)

const anyLoading = computed(() =>
  (showStep1.value && step1Loading.value) ||
  (showStep2.value && step2Loading.value) ||
  (showStep3.value && step3Loading.value) ||
  (showStep4.value && step4Loading.value)
)

// ─── OCR gate ของรูปสมุดบัญชี (เฉพาะเมื่อ bank_book_photo อยู่ใน scope การแก้ไข) ──
// เลียนแบบ logic ใน SubmitRequestPage: ระหว่าง OCR โหลด หรือผลไม่ผ่าน/ข้อมูลไม่ครบ
// → ห้ามบันทึก กันผู้ใช้กดก่อน OCR ตรวจเสร็จ
const editingBankBook = computed(() => filterFields4.value.includes('bank_book_photo'))

const ocrBlocksSubmit = computed(() => {
  if (!editingBankBook.value) return false
  if (app.bankBookOcrLoading) return true
  const info = app.bankBookOcrResult?.bank_info
  if (!info) return false // ยังไม่มีผล (ยังไม่เปลี่ยนรูป) — ใช้รูปเดิมได้ ไม่บล็อก
  const s = info.match_status
  // ต้องอ่านได้ครบ ธนาคาร + เลขที่บัญชี + ชื่อบัญชี
  const hasAllInfo = !!(
    info.bank_name?.trim() &&
    info.account_number?.trim() &&
    info.account_name?.trim()
  )
  if (s === 'match' || s === 'review') return !hasAllInfo
  return true // mismatch, blurry, no_text
})

// ─── Submit ─────────────────────────────────────────────────────────────────────
const isSubmitting = ref(false)
const submitError  = ref('')

async function handleSave() {
  // force-show errors ก่อน
  if (!allReady.value) {
    if (showStep1.value) (step1Ref.value as unknown as StepExpose)?.touchAll?.()
    if (showStep3.value) (step3Ref.value as unknown as StepExpose)?.touchAll?.()
    submitError.value = 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน'
    return
  }
  if (isSubmitting.value) return

  // ต้องแก้ไขครบทุก field ที่ถูกตีกลับก่อน — ถ้ายังมีหัวข้อที่ค่าเท่าเดิม ไม่ให้บันทึก
  if (!allFieldsEdited.value) {
    submitError.value = 'กรุณาแก้ไขข้อมูลให้ครบทุกหัวข้อที่ถูกตีกลับก่อนกดบันทึก'
    return
  }

  // กัน OCR สมุดบัญชียังไม่เสร็จ หรือผลไม่ผ่าน
  if (ocrBlocksSubmit.value) {
    submitError.value = app.bankBookOcrLoading
      ? 'กรุณารอตรวจสอบรูปสมุดบัญชีธนาคารให้เสร็จก่อนบันทึก'
      : 'กรุณาอัปโหลดรูปสมุดบัญชีธนาคารที่ถูกต้องก่อนบันทึก'
    return
  }

  isSubmitting.value = true
  submitError.value  = ''

  try {
    const thaiDUser = auth.user as ThaiDUser | null
    if (!thaiDUser?.person_id) {
      submitError.value = 'ไม่พบข้อมูลผู้ใช้ กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่'
      return
    }

    // 1. บันทึกข้อมูลจากแต่ละ step ที่แสดงลง store
    if (showStep1.value && step1Ref.value) {
      app.setStep1((step1Ref.value as unknown as StepExpose).getData() as unknown as Step1Data)
    }
    if (showStep2.value && step2Ref.value) {
      app.setStep2((step2Ref.value as unknown as StepExpose).getData() as unknown as Step2Data)
    }
    if (showStep3.value && step3Ref.value) {
      app.setStep3((step3Ref.value as unknown as StepExpose).getData() as unknown as Step3Data)
    }

    // 2. สร้าง payload จาก store แล้วเลือกเฉพาะ section ที่มี comment
    const payload = app.buildApiPayload(thaiDUser)
    const { initial_current_status_id: _unused, ...updatePayload } = payload

    const partialUpdate: Partial<typeof updatePayload> = {}
    // housing_type / housing_rent อยู่ใน Step 1 แต่ถูก map ไปที่ economic_infos ใน buildApiPayload()
    // ถ้าแก้ housing ใน Step 1 ต้องส่ง economic_infos ไปด้วย ไม่งั้น backend จะไม่อัปเดต
    const editingHousing =
      filterFields1.value.includes('housing_type') ||
      filterFields1.value.includes('housing_rent')
    // applicant รวม field จาก step1 (address contact) + step3 (bank)
    // reset_processing_state: true ทุกครั้ง — backend clear process_started_at,
    // process_sla_days, type_money_category_id เพราะ case กลับไปสถานะ "รอรับเรื่อง"
    if (showStep1.value || showStep3.value) {
      partialUpdate.applicant = { ...updatePayload.applicant, reset_processing_state: true }
    } else {
      partialUpdate.applicant = { reset_processing_state: true } as typeof updatePayload.applicant
    }
    if (showStep1.value) {
      partialUpdate.addresses         = updatePayload.addresses
      partialUpdate.household_members = updatePayload.household_members
    }
    if (showStep2.value || (showStep1.value && editingHousing)) {
      partialUpdate.economic_infos   = updatePayload.economic_infos
      // dependency_loads/welfare_history เป็น Step 2 เท่านั้น
      if (showStep2.value) {
        partialUpdate.dependency_loads = updatePayload.dependency_loads
        partialUpdate.welfare_history  = updatePayload.welfare_history
      }
    }
    if (showStep3.value) {
      partialUpdate.request_type_ids    = updatePayload.request_type_ids
      partialUpdate.request_other_text  = updatePayload.request_other_text
      partialUpdate.request_in_kind_text = updatePayload.request_in_kind_text
    }

    await welfareApi.updateCase(app.editApplicantId!, partialUpdate)

    // 3. reset สถานะกลับเป็น "รอรับเรื่อง"
    await welfareApi.addStatusLog(app.editApplicantId!, 1)

    // 4. อัปโหลดไฟล์ใหม่ (step4) — ลบเดิมก่อน แล้ว upload ใหม่
    if (showStep4.value) {
      for (const meta of app.documentsMeta) {
        const file = app.getFile(meta.id)
        if (!file) continue
        const oldEvidenceId = app.existingEvidenceIds[meta.docType]
        if (oldEvidenceId) {
          await welfareApi.deleteEvidence(app.editApplicantId!, oldEvidenceId)
        }
        const attachmentTypeId = ATTACHMENT_TYPE_MAP[meta.docType] ?? 8
        await welfareApi.uploadEvidence(app.editApplicantId!, attachmentTypeId, file, meta.otherTypeName)
      }
      // กรณีแก้แค่ชื่อเอกสาร "อื่นๆ" แต่ไม่ได้เปลี่ยนรูป
      const otherDocHasNewFile = app.documentsMeta.some(m => m.id === 'other_doc')
      const otherDocEvidenceId = app.existingEvidenceIds['other_doc']
      if (!otherDocHasNewFile && otherDocEvidenceId && app.existingOtherTypeName) {
        await welfareApi.updateEvidenceName(app.editApplicantId!, otherDocEvidenceId, app.existingOtherTypeName)
      }
    }

    const editedId = app.editApplicantId

    // ผูกผล OCR กับ applicant_id (กรณีอัปโหลดรูปสมุดบัญชีใหม่) ก่อนล้าง store
    const ocrId = app.bankBookOcrResultId
    app.clearAll()
    if (ocrId != null) {
      linkOcrResult(ocrId, editedId!).catch(() => { /* silent — ไม่ block การแก้ไขที่สำเร็จแล้ว */ })
    }

    router.push({ name: 'case-tracking', state: { applicantId: editedId } })

  } catch (err: unknown) {
    const rawDetail = (err as { data?: { detail?: unknown } })?.data?.detail
    if (Array.isArray(rawDetail)) {
      submitError.value = rawDetail.map((e: { msg?: string }) => e.msg ?? String(e)).join(', ')
    } else if (typeof rawDetail === 'string') {
      submitError.value = rawDetail
    } else {
      submitError.value = 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'
    }
  } finally {
    isSubmitting.value = false
  }
}

// ชื่อหัวข้อแต่ละ step
const STEP_LABELS: Record<number, string> = {
  1: 'ตัวตน / ที่อยู่ / ครอบครัว',
  2: 'เศรษฐกิจ / สวัสดิการ',
  3: 'ปัญหา / ความช่วยเหลือ',
  4: 'เอกสารและรูปประกอบ',
}
</script>

<template>
  <div class="min-h-dvh flex flex-col bg-slate-100">

    <!-- Header -->
    <header class="fixed inset-x-0 top-0 z-20 bg-[#1A56DB] px-4 py-3.5 flex items-center justify-center shadow">
      <p class="text-h1-page font-bold text-white">แก้ไขข้อมูล</p>
    </header>

    <!-- overlay ปิดกั้น interaction ทั้งหน้าขณะกำลังบันทึก (z-10: ต่ำกว่า header/footer z-20) -->
    <div v-if="isSubmitting"
      class="fixed inset-0 z-10 bg-white/40 cursor-not-allowed"
      aria-hidden="true"
    />

    <main class="pt-[4.5rem] pb-32 px-4 space-y-4">

      <!-- Banner แจ้งผู้ใช้ -->
      <div class="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-5 mt-2">
        <svg class="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <div>
          <p class="text-body-xs font-semibold text-amber-800">กรุณาแก้ไขเฉพาะส่วนที่ไฮไลต์</p>
          <p class="text-hint text-amber-700 mt-1 leading-relaxed">
            เจ้าหน้าที่ระบุส่วนที่ต้องแก้ไขไว้แล้ว กรุณากรอกให้ครบถ้วนแล้วกด "บันทึกการแก้ไข"
          </p>
        </div>
      </div>

      <!-- ─── Section Step 1 ─── -->
      <template v-if="showStep1">
        <div class="flex items-center gap-3 bg-amber-500 text-white px-4 py-2.5 rounded-xl">
          <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span class="text-h2-section font-bold">ส่วนที่ 1: {{ STEP_LABELS[1] }}</span>
        </div>
        <Step1PersonalInfo
          ref="step1Ref"
          :filterFields="filterFields1"
          @update:ready="v => step1Ready = v"
          @update:loading="v => { step1Loading = v; if (!v) captureBaseline(1) }"
        />
      </template>

      <!-- ─── Section Step 2 ─── -->
      <template v-if="showStep2">
        <div class="flex items-center gap-3 bg-amber-500 text-white px-4 py-2.5 rounded-xl">
          <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 10h18M3 6h18M3 14h18M3 18h18" />
          </svg>
          <span class="text-h2-section font-bold">ส่วนที่ 2: {{ STEP_LABELS[2] }}</span>
        </div>
        <Step2Economics
          ref="step2Ref"
          :filterFields="filterFields2"
          @update:ready="v => step2Ready = v"
          @update:loading="v => { step2Loading = v; if (!v) captureBaseline(2) }"
        />
      </template>

      <!-- ─── Section Step 3 ─── -->
      <template v-if="showStep3">
        <div class="flex items-center gap-3 bg-amber-500 text-white px-4 py-2.5 rounded-xl">
          <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span class="text-h2-section font-bold">ส่วนที่ 3: {{ STEP_LABELS[3] }}</span>
        </div>
        <Step3Problem
          ref="step3Ref"
          :filterFields="filterFields3"
          @update:ready="v => step3Ready = v"
          @update:loading="v => { step3Loading = v; if (!v) nextTick(() => captureBaseline(3)) }"
        />
      </template>

      <!-- ─── Section Step 4 ─── -->
      <template v-if="showStep4">
        <div class="flex items-center gap-3 bg-amber-500 text-white px-4 py-2.5 rounded-xl">
          <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span class="text-h2-section font-bold">ส่วนที่ 4: {{ STEP_LABELS[4] }}</span>
        </div>
        <Step4Documents
          :filterFields="filterFields4"
          @update:ready="v => step4Ready = v"
          @update:loading="v => step4Loading = v"
        />
      </template>

    </main>

    <!-- Footer: submit error + ปุ่ม -->
    <footer class="fixed inset-x-0 bottom-0 z-20 bg-white border-t border-slate-200 px-4 py-3 space-y-2 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">

      <!-- Error message -->
      <div v-if="submitError" class="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
        <svg class="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        <p class="text-hint text-red-600 leading-relaxed">{{ submitError }}</p>
      </div>

      <div class="flex gap-3">
        <!-- ปุ่มย้อนกลับ -->
        <button
          type="button"
          @click="router.push({ name: 'case-tracking', state: app.editApplicantId ? { applicantId: app.editApplicantId } : undefined })"
          class="flex-[0_0_auto] w-[96px] py-3 rounded-xl border-2 border-slate-200 text-body-md font-semibold text-slate-600 hover:border-slate-300 active:scale-[0.98] transition-all"
        >
          ย้อนกลับ
        </button>

        <!-- ปุ่มบันทึก -->
        <button
          type="button"
          @click="handleSave"
          :disabled="isSubmitting || anyLoading || ocrBlocksSubmit"
          class="flex-1 py-3 rounded-xl text-body-md font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          :class="allReady && allFieldsEdited && !isSubmitting && !anyLoading && !ocrBlocksSubmit
            ? 'bg-[#1A56DB] text-white shadow-md shadow-blue-200 hover:bg-blue-700'
            : 'bg-slate-200 text-slate-400 cursor-not-allowed'"
        >
          <svg v-if="isSubmitting || anyLoading || (ocrBlocksSubmit && app.bankBookOcrLoading)" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          {{ isSubmitting ? 'กำลังบันทึก...' : anyLoading ? 'กำลังโหลด...' : (ocrBlocksSubmit && app.bankBookOcrLoading) ? 'กำลังตรวจสอบสมุดบัญชี...' : 'บันทึกการแก้ไข' }}
        </button>
      </div>
    </footer>

  </div>
</template>
