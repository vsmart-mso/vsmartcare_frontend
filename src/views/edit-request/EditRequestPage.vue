<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch, provide } from 'vue'
import { useRouter } from 'vue-router'
import { useApplicationStore, ATTACHMENT_TYPE_MAP } from '@/stores/application'
import type { Step1Data, Step2Data, Step3Data } from '@/stores/application'
import { useAuthStore } from '@/stores/auth'
import type { ThaiDUser } from '@/types/auth'
import { welfareApi } from '@/api/welfare'
import type { ReviewComment } from '@/api/welfare'
import { linkOcrResult } from '@/api/ocr'
import Step1PersonalInfo from '@/views/submit-request/steps/Step1PersonalInfo.vue'
import Step2Economics   from '@/views/submit-request/steps/Step2Economics.vue'
import Step3Problem     from '@/views/submit-request/steps/Step3Problem.vue'
import Step4Documents   from '@/views/submit-request/steps/Step4Documents.vue'
import EditFieldConfirmPanel from '@/components/edit-request/EditFieldConfirmPanel.vue'
import { EDIT_FIELD_CONFIRM_KEY } from '@/composables/useEditFieldConfirm'

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
      .filter(c => {
        if (c.step !== step || c.name === 'remarks') return false
        // doc_ktb_corporate ปิดใช้งานแล้ว (is_active = false) — ข้าม comment นี้เสมอ ไม่ว่าเคสจะเคย reject ไว้หรือไม่
        if (c.name === 'doc_ktb_corporate') return false
        return true
      })
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
    // รูปภาพเอกสารสมาชิก → แสดง section สมาชิกในครัวเรือน (ส่วน photo อยู่ใน card)
    if (names.has('household_member_photos')) names.add('household_members')
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

// ─── Dirty snapshot: ใช้คำนวณ confirmation_type (edited vs unchanged_ok) เท่านั้น
// ไม่ใช้เป็นเงื่อนไขบล็อกการส่งกลับอีกต่อไป (TASK_211)
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

// field รูปภาพ (step 4) → docType ใน documentsMeta — dirty เมื่อมีไฟล์ใหม่
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
// คืน null = ไม่รู้จัก field นี้ (จะถูกข้าม)
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
      if (data.isRentHousing === false) return null
      return String(data.rentPerMonth ?? '')
    }
    case 'household_members':           return JSON.stringify(data.householdMembers ?? [])
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
    case 'requested_assistance_money':
      return (data.aidTypes as string[] | undefined)?.includes('1') ? '1' : ''
    case 'requested_assistance_in_kind':
      return JSON.stringify({
        on:   (data.aidTypes as string[] | undefined)?.includes('2') ?? false,
        text: data.aidInKindText ?? '',
      })
    case 'requested_assistance_other':
      return JSON.stringify({
        on:   (data.aidTypes as string[] | undefined)?.includes('3') ?? false,
        text: data.aidOtherText ?? '',
      })
    case 'requested_assistance_type':
    case 'requested_assistance_detail':
      return JSON.stringify({
        types:   data.aidTypes      ?? [],
        other:   data.aidOtherText  ?? '',
        inKind:  data.aidInKindText ?? '',
      })
    case 'bank_name':                 return String(data.bankNameId ?? '')
    case 'bank_account_number':       return String(data.bankAccount ?? '')
    default: return null
  }
}

/** true = ค่าปัจจุบันต่างจาก baseline (หรือมีไฟล์ใหม่) */
function isFieldDirty(name: string): boolean {
  const docType = FILE_FIELD_DOCTYPE[name]
  if (docType) {
    if (docType === 'other_doc') {
      return app.documentsMeta.some(
        m => m.id === 'other_doc_0' || m.id === 'other_doc_1' || m.id === 'other_doc_2'
      )
    }
    return app.documentsMeta.some(m => m.id === docType)
  }

  if (name === 'requested_assistance_money') return false

  if (
    (name === 'household_members' || name === 'family_members_count') &&
    (app.memberFiles.size > 0 || app.memberRemovedEvidenceKeys.size > 0)
  ) {
    return true
  }

  const comment = app.reviewComments.find(c => c.name === name)
  const step = comment?.step
  if (step == null || step === 4) return false

  const base = baseline.value[step]
  const cur  = snapshot(step)
  if (base == null || cur == null) return false

  const curData = JSON.parse(cur) as Record<string, unknown>
  if (name === 'housing_rent' && curData.isRentHousing === false) {
    // เปลี่ยนประเภทที่อยู่แล้ว — ถือว่ามีการแก้
    const baseData = JSON.parse(base) as Record<string, unknown>
    return baseData.isRentHousing !== false
  }

  const baseVal = fieldValue(name, JSON.parse(base) as Record<string, unknown>)
  const curVal  = fieldValue(name, curData)
  if (baseVal == null) return false
  return baseVal !== curVal
}

// ─── TASK_211: ยืนยันต่อฟิลด์ (แทน dirty-check เป็น gate) ─────────────────────
// ต้องตรงกับ case-service `_SKIP_CONFIRM_FIELD_NAMES` — ห้ามส่ง id ที่ไม่อยู่ใน required
// ไม่งั้นได้ 422 field_confirmations_invalid_field
const SKIP_CONFIRM_NAMES = new Set([
  'remarks',
  'doc_ktb_corporate',
  'requested_assistance_money', // ล็อกเลือกไว้เสมอ — BE ไม่รับ confirmation ของฟิลด์นี้
])

/**
 * ฟิลด์ลูกที่โชว์ตามเงื่อนไข (ต้องเลือก parent ก่อนถึงจะเห็น)
 * — ไม่บังคับติ๊กยืนยันใน UI เพราะมักถูกซ่อนแล้วผู้ใช้พลาด
 * — ตอน resubmit ยังส่ง confirmation อัตโนมัติตาม dirty state (BE บังคับมี)
 */
const CONDITIONAL_CONFIRM_NAMES = new Set([
  'housing_rent',           // โชว์เมื่อเลือกประเภทที่อยู่ = เช่า
  'income_source_other',    // โชว์เมื่อเลือกที่มาของรายได้ = อื่นๆ
  'dependents_other',       // โชว์เมื่อเลือกภาระอุปการะ = อื่นๆ
  'gov_aid_count',          // โชว์เมื่อเคยรับความช่วยเหลือ
  'gov_aid_amount',
  'gov_aid_types',
  'gov_aid_type_detail',
])

/** ฟิลด์ที่ผู้ใช้ต้องติ๊ก “ตรวจสอบแล้ว” บนหน้าจอ */
const requiredConfirmFields = computed((): ReviewComment[] =>
  app.reviewComments.filter(
    c => !SKIP_CONFIRM_NAMES.has(c.name) && !CONDITIONAL_CONFIRM_NAMES.has(c.name),
  )
)

/** ฟิลด์ที่ต้องส่งใน field_confirmations (รวมเงื่อนไขที่ auto-confirm) */
const resubmitConfirmFields = computed((): ReviewComment[] =>
  app.reviewComments.filter(c => !SKIP_CONFIRM_NAMES.has(c.name))
)

/** review_field_id → ติ๊กยืนยันแล้ว */
const fieldConfirmations = ref<Record<number, boolean>>({})

const fieldIdByName = computed((): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const f of requiredConfirmFields.value) out[f.name] = f.review_field_id
  return out
})

function toggleFieldConfirmation(fieldId: number, checked: boolean) {
  fieldConfirmations.value = { ...fieldConfirmations.value, [fieldId]: checked }
}

function toggleManyFieldConfirmations(fieldIds: number[], checked: boolean) {
  if (fieldIds.length === 0) return
  const updated = { ...fieldConfirmations.value }
  for (const id of fieldIds) updated[id] = checked
  fieldConfirmations.value = updated
}

const allFieldsConfirmed = computed(() => {
  const fields = requiredConfirmFields.value
  if (fields.length === 0) return true
  return fields.every(f => fieldConfirmations.value[f.review_field_id])
})

/** เมื่อค่าฟิลด์เปลี่ยนหลังติ๊กแล้ว → ล้าง confirmation ของฟิลด์นั้น */
const interactionTick = ref(0)
function bumpInteraction() {
  interactionTick.value++
}

const confirmationTypes = computed((): Record<number, 'edited' | 'unchanged_ok'> => {
  void interactionTick.value
  void app.documentsMeta.length
  void app.memberFiles.size
  void app.memberRemovedEvidenceKeys.size
  const out: Record<number, 'edited' | 'unchanged_ok'> = {}
  for (const f of requiredConfirmFields.value) {
    out[f.review_field_id] = isFieldDirty(f.name) ? 'edited' : 'unchanged_ok'
  }
  return out
})

provide(EDIT_FIELD_CONFIRM_KEY, {
  confirmations: fieldConfirmations,
  confirmationTypes,
  fieldIdByName,
  toggle: toggleFieldConfirmation,
  toggleMany: toggleManyFieldConfirmations,
})

function confirmationTypeFor(field: ReviewComment): 'edited' | 'unchanged_ok' {
  return isFieldDirty(field.name) ? 'edited' : 'unchanged_ok'
}

const dirtySignature = computed(() => {
  void interactionTick.value
  // ผูก reactive deps ของไฟล์ / รูปสมาชิก
  void app.documentsMeta.length
  void app.memberFiles.size
  void app.memberRemovedEvidenceKeys.size
  return requiredConfirmFields.value
    .map(f => `${f.review_field_id}:${isFieldDirty(f.name) ? 1 : 0}`)
    .join('|')
})

watch(dirtySignature, (next, prev) => {
  if (prev == null || prev === '' || next === prev) return
  const prevMap = new Map(
    prev.split('|').filter(Boolean).map(s => {
      const [id, dirty] = s.split(':')
      return [Number(id), dirty === '1'] as const
    })
  )
  const nextMap = new Map(
    next.split('|').filter(Boolean).map(s => {
      const [id, dirty] = s.split(':')
      return [Number(id), dirty === '1'] as const
    })
  )
  let changed = false
  const updated = { ...fieldConfirmations.value }
  for (const [id, dirty] of nextMap) {
    if (prevMap.get(id) !== dirty && updated[id]) {
      updated[id] = false
      changed = true
    }
  }
  if (changed) fieldConfirmations.value = updated
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
    const missing: string[] = []
    if (showStep1.value && !step1Ready.value) missing.push('ส่วนที่ 1 (ที่อยู่ / ครอบครัว / ที่อยู่อาศัย)')
    if (showStep2.value && !step2Ready.value) missing.push('ส่วนที่ 2 (เศรษฐกิจ / สวัสดิการ)')
    if (showStep3.value && !step3Ready.value) missing.push('ส่วนที่ 3 (ปัญหา / ความช่วยเหลือ)')
    if (showStep4.value && !step4Ready.value) missing.push('ส่วนที่ 4 (เอกสารและรูป)')
    submitError.value = missing.length > 0
      ? `กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วนใน: ${missing.join(', ')}`
      : 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน'
    return
  }
  if (isSubmitting.value) return

  // ต้องยืนยันครบทุกฟิลด์ที่ถูกสั่งแก้ (TASK_211) — ไม่บังคับเปลี่ยนค่า
  if (!allFieldsConfirmed.value) {
    submitError.value = 'กรุณายืนยันการตรวจสอบให้ครบทุกหัวข้อที่เจ้าหน้าที่ระบุ'
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

    // 3. reset สถานะกลับเป็น "รอรับเรื่อง" — พร้อม field_confirmations (TASK_211)
    // รวมฟิลด์เงื่อนไขที่ไม่ได้บังคับติ๊กใน UI (auto ตาม dirty)
    const field_confirmations = resubmitConfirmFields.value.map(f => ({
      review_field_id: f.review_field_id,
      confirmation_type: confirmationTypeFor(f),
    }))
    await welfareApi.resubmitCase(
      app.editApplicantId!,
      field_confirmations.length > 0 ? { field_confirmations } : undefined,
    )

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
      // จัดการ slot "รูปอื่นๆ" ที่ไม่มีไฟล์ใหม่
      // รองรับสูงสุด 3 slot (other_doc_0 / other_doc_1 / other_doc_2)
      for (const key of ['other_doc_0', 'other_doc_1', 'other_doc_2'] as const) {
        const hasNewFile = app.documentsMeta.some(m => m.id === key)
        const evidenceId = app.existingEvidenceIds[key]
        const name = app.existingOtherTypeNames[key]
        if (hasNewFile || !evidenceId) continue
        // ลบแล้ว = กด "ลบ" รูปตรงๆ (removedEvidenceKeys) หรือกด "ลบช่องนี้" ทั้ง slot (ชื่อว่าง)
        if (app.removedEvidenceKeys.has(key) || !name) {
          await welfareApi.deleteEvidence(app.editApplicantId!, evidenceId)
        } else {
          // มีชื่อ และไม่ได้ถูกลบ → แค่อัปเดตชื่อ (ไม่ได้เปลี่ยนรูป)
          await welfareApi.updateEvidenceName(app.editApplicantId!, evidenceId, name)
        }
      }
    }

    // 4.5 อัปโหลด/อัปเดต/ลบรูปภาพเอกสารของสมาชิกในครัวเรือน (household_members อยู่ใน step 1)
    if (showStep1.value) {
      const memberDocTypeMap: Record<string, number> = {
        id_card: 12, house_home: 6, house_person: 7, other: 99,
      }
      for (const [key, file] of app.memberFiles.entries()) {
        const match = key.match(/^m(\d+)_(.+)$/)
        if (!match) continue
        const seq      = Number(match[1])
        const docType  = match[2]
        const attachmentTypeId = memberDocTypeMap[docType]
        if (!attachmentTypeId) continue
        // ลบ evidence เดิมก่อน (ถ้ามี) เพื่อไม่ให้มีรูปซ้ำซ้อนใน DB และ disk
        const oldEvidenceId = app.memberExistingEvidenceIds[key]
        if (oldEvidenceId) {
          await welfareApi.deleteEvidence(app.editApplicantId!, oldEvidenceId)
        }
        const otherName = docType === 'other' ? app.memberExistingOtherTypeNames[key] : undefined
        await welfareApi.uploadMemberEvidence(app.editApplicantId!, seq, attachmentTypeId, file, otherName)
      }
      // กรณีแก้แค่ชื่อ "อื่นๆ" ของสมาชิกโดยไม่ได้เปลี่ยนรูป → PATCH ชื่อโดยไม่ต้อง re-upload
      for (const [key, name] of Object.entries(app.memberExistingOtherTypeNames)) {
        if (!key.endsWith('_other')) continue
        const hasNewFile = app.memberFiles.has(key)
        const evidenceId = app.memberExistingEvidenceIds[key]
        if (!hasNewFile && evidenceId && name) {
          await welfareApi.updateEvidenceName(app.editApplicantId!, evidenceId, name)
        }
      }
      // ลบรูปสมาชิกที่ผู้ใช้กด "ลบ" ทิ้งจากของเดิมโดยไม่ได้อัปโหลดรูปใหม่แทน
      for (const key of app.memberRemovedEvidenceKeys) {
        if (app.memberFiles.has(key)) continue
        const evidenceId = app.memberExistingEvidenceIds[key]
        if (evidenceId) {
          await welfareApi.deleteEvidence(app.editApplicantId!, evidenceId)
        }
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

    <main
      class="pt-[4.5rem] pb-32 px-4 space-y-4"
      @input="bumpInteraction"
      @change="bumpInteraction"
    >

      <!-- Banner แจ้งผู้ใช้ -->
      <div class="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-5 mt-2">
        <svg class="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <div>
          <p class="text-body-xs font-semibold text-amber-800">กรุณาตรวจสอบและยืนยันข้อมูลที่ถูกระบุ</p>
          <p class="text-hint text-amber-700 mt-1 leading-relaxed">
            เจ้าหน้าที่ระบุส่วนที่ต้องตรวจสอบไว้แล้ว — สามารถแก้ค่าหรือยืนยันว่าข้อมูลเดิมถูกต้อง
            แล้วติ๊ก “ตรวจสอบแล้ว” ให้ครบทุกหัวข้อก่อนกดบันทึก
          </p>
        </div>
      </div>

      <!-- สรุปความคืบหน้าการยืนยัน (checkbox อยู่คู่กับแต่ละฟิลด์) -->
      <EditFieldConfirmPanel
        v-if="requiredConfirmFields.length > 0"
        v-model="fieldConfirmations"
        :fields="requiredConfirmFields"
      />

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
          :class="allReady && allFieldsConfirmed && !isSubmitting && !anyLoading && !ocrBlocksSubmit
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
