<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import Step1PersonalInfo from './steps/Step1PersonalInfo.vue'
import Step2Economics   from './steps/Step2Economics.vue'
import Step3Problem     from './steps/Step3Problem.vue'
import Step4Documents   from './steps/Step4Documents.vue'
import Step5Confirmation from './steps/Step5Confirmation.vue'
import { useApplicationStore, ATTACHMENT_TYPE_MAP } from '@/stores/application'
import type { Step1Data, Step2Data, Step3Data } from '@/stores/application'
import { useAuthStore } from '@/stores/auth'
import type { ThaiDUser } from '@/types/auth'
import { welfareApi } from '@/api/welfare'
import { useEligibilityStore } from '@/stores/eligibility'
import { linkOcrResult } from '@/api/ocr'

const router = useRouter()
const route  = useRoute()
const app    = useApplicationStore()
const auth   = useAuthStore()
const eligibilityStore = useEligibilityStore()

const currentStep  = ref(1)

function isThaiDUser(u: unknown): u is ThaiDUser {
  return u != null && typeof (u as ThaiDUser).person_id === 'number'
}

// ถ้ามี ?step=X ใน URL ให้เริ่มที่ step นั้น (ใช้เมื่อกลับมาแก้ไขจาก case-tracking)
onMounted(async () => {
  const personId = isThaiDUser(auth.user) ? auth.user.person_id : 0
  if (personId) {
    try {
      const eligibility = await eligibilityStore.fetchEligibility(personId)
      if (!eligibility.can_submit) {
        router.replace({ name: 'case-tracking' })
        return
      }
    } catch {
      // API ล้มเหลว → ปล่อยให้เข้าหน้าปกติ
    }
  }

  const s = Number(route.query.step)
  if (s >= 1 && s <= steps.length) {
    currentStep.value = s
    stepReady.value = true
  }
})
const stepReady    = ref(false)
const isSubmitting = ref(false)
const submitError  = ref('')
// จังหวัดถูกปิดระหว่างกรอกฟอร์ม (TASK-v-care-12062026-01) → แสดง overlay แล้วเตะออก
const provinceBlocked = ref(false)

// stepLoading = step ปัจจุบันกำลังโหลดข้อมูลจาก API หรือไม่
// ระหว่าง true: step จะโชว์ skeleton และปุ่ม "ถัดไป/ยืนยัน/ย้อนกลับ" จะถูกปิด
// เพื่อกันไม่ให้ผู้ใช้กดดำเนินการต่อก่อนที่หน้าจอจะพร้อม
const stepLoading = ref(false)

// เมื่อสลับ step: รีเซ็ตสถานะโหลดก่อน — step ใหม่จะส่งค่าจริงกลับมาเองตอน mount
// แล้วเลื่อนหน้าจอกลับขึ้นบนสุด ไม่งั้น step ใหม่จะค้างอยู่ที่ตำแหน่ง scroll เดิมของ step ก่อนหน้า
// ใช้ nextTick รอให้ DOM ของ step ใหม่ render เสร็จก่อน แล้วค่อยเลื่อน (กันการ clamp ตำแหน่งผิด)
watch(currentStep, async () => {
  stepLoading.value = false
  await nextTick()
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
})

const steps = [
  { id: 1, label: 'ข้อมูลส่วนตัว' },
  { id: 2, label: 'เศรษฐกิจ' },
  { id: 3, label: 'ปัญหา' },
  { id: 4, label: 'เอกสาร' },
  { id: 5, label: 'ยืนยันข้อมูล' },
]

// ─── Step 4 OCR Status (อ่านจาก store — sync โดย BankBookOcrStatus ใน Step4) ─
type Step3OcrState = 'loading' | 'ok' | 'review' | 'bad'

const step3OcrState = computed<Step3OcrState>(() => {
  if (app.bankBookOcrLoading) return 'loading'
  const r = app.bankBookOcrResult
  if (!r) return 'ok' // ยังไม่มีผล หรือล้างแล้ว — แสดงปกติ
  const info = r.bank_info
  const s = info?.match_status

  // ต้องอ่านข้อมูลได้ครบทั้ง 5 อย่าง: ธนาคาร + เลขที่บัญชี + ชื่อบัญชี + ประเภทเงินฝาก + ชื่อสาขา
  // (branch_code เป็นข้อมูลเสริม ไม่บังคับ) — ถ้าขาดอย่างใดอย่างหนึ่ง → ถือว่าไม่ผ่าน (bad) แม้ชื่อจะตรงก็ตาม
  const hasAccountType = !!(info?.deposit_type?.trim() || app.step3?.bankAccountTypeId?.trim())
  const hasAllInfo = !!(
    info?.bank_name?.trim() &&
    info?.account_number?.trim() &&
    info?.account_name?.trim() &&
    hasAccountType &&
    info?.branch_name?.trim()
  )

  if (s === 'match')  return hasAllInfo ? 'ok' : 'bad'
  if (s === 'review') return hasAllInfo ? 'review' : 'bad'
  // mismatch, blurry, no_text หรือ error → bad
  if (s === 'mismatch' || s === 'blurry' || s === 'no_text') return 'bad'
  return 'ok'
})

/** OCR อยู่ในสถานะที่ยังไม่ควร submit (กำลังโหลด หรือ mismatch / blurry / no_text) */
const ocrBlocksSubmit = computed(() =>
  step3OcrState.value === 'loading' || step3OcrState.value === 'bad'
)

/** ปุ่ม "ถัดไป" ใน Step 4 ต้องถูก disable เพิ่มเติมเมื่อ OCR สมุดบัญชีไม่ผ่าน */
const missingBankAccountType = computed(() => {
  const info = app.bankBookOcrResult?.bank_info
  return !!(
    info &&
    (info.match_status === 'match' || info.match_status === 'review') &&
    !info.deposit_type?.trim() &&
    !app.step3?.bankAccountTypeId?.trim()
  )
})

const nextBlocked = computed(() => currentStep.value === 4 && ocrBlocksSubmit.value)

// stepRef ใช้ดึงข้อมูลผ่าน getData() เมื่อกด "ถัดไป"
// ใช้ interface กลางแทนการผูกกับ component type เฉพาะ
interface StepExpose {
  getData: () => Record<string, unknown>
  // touchAll ทำให้ทุก field แสดง error พร้อมกันเมื่อผู้ใช้กด "ถัดไป" โดยที่ยังไม่กรอกข้อมูล
  touchAll?: () => void
}
const stepRef = ref<StepExpose | null>(null)

function handleBack() {
  if (currentStep.value > 1) currentStep.value--
  else if (app.editMode && app.editApplicantId) {
    router.push({ name: 'case-tracking', state: { applicantId: app.editApplicantId } })
  } else router.back()
}

function handleNext() {
  // กัน double-tap ระหว่าง step กำลังโหลด (ปุ่มถูก disable อยู่แล้ว — กันไว้อีกชั้น)
  if (stepLoading.value) return
  if (!stepReady.value) {
    // แสดง error ทุก field ให้ผู้ใช้รู้ว่าต้องกรอกอะไรอีก
    stepRef.value?.touchAll?.()
    return
  }

  // ── Guard: OCR ผลไม่ดี → ห้ามผ่าน step 4 (สมุดบัญชีย้ายมาที่นี่แล้ว) ────────
  if (currentStep.value === 4 && ocrBlocksSubmit.value) {
    submitError.value = 'กรุณาอัปโหลดรูปสมุดบัญชีธนาคารที่ถูกต้องก่อนดำเนินการต่อ'
    return
  }

  submitError.value = ''

  const data = stepRef.value?.getData()
  if (data) {
    // บันทึกข้อมูลแต่ละ step ลง store — ใช้ type cast เพราะ StepExpose.getData คืน Record
    if (currentStep.value === 1) app.setStep1(data as unknown as Step1Data)
    if (currentStep.value === 2) app.setStep2(data as unknown as Step2Data)
    if (currentStep.value === 3) app.setStep3(data as unknown as Step3Data)
    // Step 4: ไฟล์ถูกบันทึกลง store แล้วผ่าน watch ใน Step4Documents โดยตรง
  }
  currentStep.value = Math.min(currentStep.value + 1, steps.length)
}

// ใช้โดย Step4 section 13 ปุ่ม "แก้ไข" เพื่อข้ามไปยัง step ที่ระบุ
function handleNavigateTo(step: number) {
  currentStep.value = step
  stepReady.value = true // step ก่อนหน้าผ่านมาแล้ว ถือว่า valid
}

// Step 5: submit form — บันทึกคำร้อง แล้วอัปโหลดไฟล์ทีละไฟล์
async function handleSubmit() {
  if (!stepReady.value || isSubmitting.value) return

  // ตรวจสอบว่ามี person_id (ต้องเข้าสู่ระบบผ่าน ThaiD แล้ว)
  const thaiDUser = auth.user as ThaiDUser | null
  if (!thaiDUser?.person_id) {
    submitError.value = 'ไม่พบข้อมูลผู้ใช้ กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่'
    return
  }

  const payload = app.buildApiPayload(thaiDUser)

  // ── guard ตรวจสอบ payload ก่อนส่ง ──────────────────────────────────────────
  if (!payload.addresses[0]?.sub_district_postcode_id) {
    submitError.value = 'กรุณากลับไป Step 1 และเลือกตำบล/แขวงให้ครบถ้วน'
    return
  }
  if (!payload.applicant.marital_status_id) {
    submitError.value = 'กรุณากลับไป Step 1 และเลือกสถานภาพสมรส'
    return
  }
  if (payload.request_type_ids.length === 0) {
    submitError.value = 'กรุณากลับไป Step 3 และระบุรายละเอียดการช่วยเหลือที่ต้องการ'
    return
  }

  // ── Guard: OCR ผลไม่ดี → ห้าม submit (สมุดบัญชีอยู่ Step4 แล้ว) ──────────────
  if (missingBankAccountType.value) {
    submitError.value = 'กรุณากลับไป Step 4 และเลือกประเภทเงินฝากของสมุดบัญชีธนาคาร'
    return
  }

  if (ocrBlocksSubmit.value) {
    submitError.value = 'กรุณากลับไป Step 4 และอัปโหลดรูปสมุดบัญชีธนาคารที่ถูกต้อง'
    return
  }

  isSubmitting.value = true
  submitError.value  = ''

  try {
    // ── Edit Mode (PATCH) ─────────────────────────────────────────────────────
    if (app.editMode && app.editApplicantId) {
      const { initial_current_status_id: _unused, ...updatePayload } = payload
      await welfareApi.updateCase(app.editApplicantId, updatePayload)

      // เพิ่ม log สถานะ "รอรับเรื่อง" (id=1) ผ่าน endpoint ที่มีอยู่แล้ว
      await welfareApi.addStatusLog(app.editApplicantId, 1)

      // อัปโหลดเฉพาะไฟล์ใหม่ที่ผู้ใช้เลือก (slots ที่ไม่มี File = ยังใช้รูปเดิมจาก server)
      for (const meta of app.documentsMeta) {
        const file = app.getFile(meta.id)
        if (!file) continue
        // ลบ evidence เดิมก่อน (ถ้ามี) เพื่อไม่ให้มีรูปซ้ำซ้อนใน DB และ disk
        const oldEvidenceId = app.existingEvidenceIds[meta.docType]
        if (oldEvidenceId) {
          await welfareApi.deleteEvidence(app.editApplicantId, oldEvidenceId)
        }
        const attachmentTypeId = ATTACHMENT_TYPE_MAP[meta.docType] ?? 8
        await welfareApi.uploadEvidence(app.editApplicantId, attachmentTypeId, file, meta.otherTypeName)
      }

      // กรณีแก้แค่ชื่อเอกสาร "อื่นๆ" แต่ไม่ได้เปลี่ยนรูป → PATCH ชื่อโดยไม่ต้อง re-upload
      const otherDocHasNewFile = app.documentsMeta.some(m => m.id === 'other_doc')
      const otherDocEvidenceId = app.existingEvidenceIds['other_doc']
      if (!otherDocHasNewFile && otherDocEvidenceId && app.existingOtherTypeName) {
        await welfareApi.updateEvidenceName(app.editApplicantId, otherDocEvidenceId, app.existingOtherTypeName)
      }

      const editedId = app.editApplicantId

      // Link OCR result (ถ้ามีการอัปโหลดรูปสมุดบัญชีใหม่ใน edit mode)
      const ocrId = app.bankBookOcrResultId
      app.clearAll()
      if (ocrId != null) {
        linkOcrResult(ocrId, editedId).catch(() => { /* silent */ })
      }

      router.push({ name: 'case-tracking', state: { applicantId: editedId } })
      return
    }

    // ── Create Mode (POST) ────────────────────────────────────────────────────
    // 1. บันทึกคำร้องและตารางย่อยทั้งหมดในครั้งเดียว
    const result      = await welfareApi.createCase(payload)
    const applicantId = result.applicant.id as number

    // 2. บันทึก consent ยืนยันความถูกต้องข้อมูล (final)
    //    initial_* = false เพราะ PDPA ถูกบันทึกแยกไปแล้วในขั้นตอนแรก
    await welfareApi.createConsent({
      person_id:                   thaiDUser.person_id,
      consent_type:                'final',
      initial_pdpa_accepted:       false,
      initial_terms_accepted:      false,
      initial_warning_accepted:    false,
      final_data_correct_accepted: true,
    })

    // 3. อัปโหลดไฟล์หลักฐานทีละไฟล์ (ลำดับ: bank_book ก่อน แล้วตามด้วยรูปเยี่ยมบ้าน)
    for (const meta of app.documentsMeta) {
      const file = app.getFile(meta.id)
      if (!file) continue
      const attachmentTypeId = ATTACHMENT_TYPE_MAP[meta.docType] ?? 8
      await welfareApi.uploadEvidence(applicantId, attachmentTypeId, file, meta.otherTypeName)
    }

    // 4. ล้างข้อมูล draft ออกจาก memory และ sessionStorage
    // ── Link OCR result กับ applicant_id ก่อนล้าง store ─────────────────────
    const ocrId = app.bankBookOcrResultId
    app.clearAll()

    // 5. ผูกผล OCR กับ applicant_id (ถ้ามี)
    if (ocrId != null) {
      await linkOcrResult(ocrId, applicantId).catch(() => { /* silent */ })
    }

    // 6. ไปหน้าสำเร็จพร้อม applicant_id (ใช้อ้างอิงคำร้อง)
    router.replace({ name: 'submit-success', state: { caseId: applicantId } })

  } catch (err: unknown) {
    // FastAPI 422 ส่ง detail เป็น array of {loc, msg, type}; 4xx อื่นส่งเป็น string
    // ofetch/fetch error มี .data = parsed response body
    const rawDetail = (err as { data?: { detail?: unknown } })?.data?.detail
    let detail: string
    if (Array.isArray(rawDetail)) {
      // validation errors — แสดงเฉพาะ msg แต่ละรายการ
      detail = rawDetail
        .map(d => (d as { msg?: string })?.msg ?? JSON.stringify(d))
        .join(', ')
    } else if (typeof rawDetail === 'string') {
      detail = rawDetail
      // จังหวัดถูกปิดระหว่างกรอกฟอร์ม → แสดงข้อความมาตรฐานแล้วเตะออกจากระบบ
      if (detail === 'province_not_enabled') {
        provinceBlocked.value = true
        window.setTimeout(() => {
          auth.clearAuth()
          app.clearAll()
          router.replace({ name: 'login' })
        }, 4000)
        return
      }
      if (detail === 'submission_cooldown_active' || detail === 'active_case_exists') {
        const personId = isThaiDUser(auth.user) ? auth.user.person_id : 0
        if (personId) {
          await eligibilityStore.fetchEligibility(personId, true)
        }
        router.replace({ name: 'case-tracking' })
        return
      }
    } else {
      detail = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'
    }
    submitError.value = `บันทึกคำขอไม่สำเร็จ: ${detail}`
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="min-h-dvh flex flex-col bg-slate-100">

    <!-- ══════════════════════════════════════════════════════════
         Overlay: จังหวัดยังไม่เปิดบริการ (ถูกปิดระหว่างกรอกฟอร์ม)
         แสดงข้อความมาตรฐานแล้วระบบจะพาออกจากระบบอัตโนมัติ
         ══════════════════════════════════════════════════════════ -->
    <div
      v-if="provinceBlocked"
      class="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/95 px-6 text-center"
      role="alertdialog"
      aria-live="assertive"
    >
      <p class="text-h3-legend font-semibold text-slate-800 mb-3">
        ยังไม่เปิดให้บริการในพื้นที่ของท่าน
      </p>
      <p class="text-body-md text-slate-500 leading-relaxed max-w-sm">
        ขออภัยในความไม่สะดวก ขณะนี้ระบบ พม. CARE
        ยังไม่เปิดให้บริการบันทึกข้อมูลสำหรับจังหวัดของท่าน
      </p>
      <p class="text-body-xs text-slate-400 mt-6">
        ระบบจะพาท่านออกจากระบบโดยอัตโนมัติ…
      </p>
    </div>

    <!-- ══════════════════════════════════════════════════════════
         Header (fixed)
         ══════════════════════════════════════════════════════════ -->
    <header
      class="fixed top-0 left-0 right-0 z-50 h-14 bg-[#1A56DB] text-white shadow-md"
      style="padding-top: env(safe-area-inset-top)"
    >
      <div class="relative mx-auto w-full max-w-md flex items-center px-4 h-full">
        <h1 class="absolute inset-x-0 text-center text-white text-body font-semibold pointer-events-none">
          ยื่นคำขอรับความช่วยเหลือ
        </h1>
      </div>
    </header>

    <!-- ══════════════════════════════════════════════════════════
         Step Progress Bar (fixed ใต้ header)
         ══════════════════════════════════════════════════════════ -->
    <div class="fixed top-14 left-0 right-0 z-40 bg-white border-b border-slate-200 shadow-sm">
      <div class="mx-auto w-full max-w-md px-4 py-2.5">
        <div class="flex items-start justify-between">
          <template v-for="(step, i) in steps" :key="step.id">
            <div class="flex flex-col items-center" style="min-width: 3rem">

              <!-- ═══ Step 4: OCR-aware circle (bank book OCR อยู่ใน Step4) ═══ -->
              <template v-if="step.id === 4">
                <!-- OCR กำลังทำงาน → spinner -->
                <div
                  v-if="step3OcrState === 'loading'"
                  class="w-7 h-7 rounded-full flex items-center justify-center bg-[#1A56DB] text-white"
                >
                  <svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                </div>
                <!-- OCR ผลไม่ดี → ❌ -->
                <div
                  v-else-if="step3OcrState === 'bad'"
                  class="w-7 h-7 rounded-full flex items-center justify-center bg-red-500 text-white"
                >
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <!-- OCR review → ⚠ (สีเหลือง) — step ยังผ่านได้ -->
                <div
                  v-else-if="step3OcrState === 'review' && step.id <= currentStep"
                  class="w-7 h-7 rounded-full flex items-center justify-center bg-amber-500 text-white"
                >
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                </div>
                <!-- ปกติ (OCR ok หรือยังไม่มีผล) -->
                <div
                  v-else
                  class="w-7 h-7 rounded-full flex items-center justify-center text-hint font-bold transition-colors"
                  :class="step.id === currentStep
                    ? 'bg-[#1A56DB] text-white'
                    : step.id < currentStep
                      ? 'bg-[#1A56DB] text-white'
                      : 'bg-slate-200 text-slate-400'"
                >
                  <svg v-if="step.id < currentStep" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span v-else>{{ step.id }}</span>
                </div>
              </template>

              <!-- ═══ Step อื่นๆ: ปกติ ═══ -->
              <div
                v-else
                class="w-7 h-7 rounded-full flex items-center justify-center text-hint font-bold transition-colors"
                :class="step.id === currentStep
                  ? 'bg-[#1A56DB] text-white'
                  : step.id < currentStep
                    ? 'bg-[#1A56DB] text-white'
                    : 'bg-slate-200 text-slate-400'"
              >
                <!-- แสดง ✓ สำหรับ step ที่ผ่านมาแล้ว -->
                <svg v-if="step.id < currentStep" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span v-else>{{ step.id }}</span>
              </div>

              <p
                class="text-tiny mt-1 text-center leading-tight max-w-[3.5rem]"
                :class="step.id === currentStep ? 'text-[#1A56DB] font-semibold' : 'text-slate-400'"
              >
                {{ step.label }}
              </p>
            </div>
            <div
              v-if="i < steps.length - 1"
              class="flex-1 h-px mt-3.5 mx-1 transition-colors"
              :class="step.id < currentStep ? 'bg-[#1A56DB]' : 'bg-slate-200'"
            />
          </template>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════
         Main Content
         pt ชดเชย: header 56px + step bar ~72px
         pb ชดเชย: fixed footer
         ══════════════════════════════════════════════════════════ -->
    <main class="flex-1 mx-auto w-full max-w-md px-4 pt-[8rem] pb-28">
      <Step1PersonalInfo
        v-if="currentStep === 1"
        ref="stepRef"
        @update:ready="stepReady = $event"
        @update:loading="stepLoading = $event"
      />
      <Step2Economics
        v-else-if="currentStep === 2"
        ref="stepRef"
        @update:ready="stepReady = $event"
        @update:loading="stepLoading = $event"
      />
      <Step3Problem
        v-else-if="currentStep === 3"
        ref="stepRef"
        @update:ready="stepReady = $event"
        @update:loading="stepLoading = $event"
      />
      <Step4Documents
        v-else-if="currentStep === 4"
        ref="stepRef"
        @update:ready="stepReady = $event"
        @update:loading="stepLoading = $event"
        @navigate-to-step="handleNavigateTo"
      />
      <Step5Confirmation
        v-else-if="currentStep === 5"
        ref="stepRef"
        @update:ready="stepReady = $event"
      />
    </main>

    <!-- ══════════════════════════════════════════════════════════
         Footer (fixed)
         ══════════════════════════════════════════════════════════ -->
    <footer
      class="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]"
      style="padding-bottom: max(env(safe-area-inset-bottom), 16px)"
    >
      <div class="mx-auto w-full max-w-md px-4 pt-3 pb-1">
        <!-- hint text บน step 5 -->
        <p v-if="currentStep === 5" class="text-center text-hint text-slate-400 mb-2">
          กรุณายืนยันรายการทั้งหมดก่อนดำเนินการต่อ
        </p>

        <!-- error message กรณีส่งคำขอไม่สำเร็จ -->
        <div
          v-if="submitError"
          class="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-2"
        >
          <svg class="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd"/>
          </svg>
          <p class="text-hint text-red-700 leading-snug">{{ submitError }}</p>
        </div>

        <div class="flex gap-3">
          <!-- ปุ่มย้อนกลับ (ซ่อนใน Step 1 ยกเว้นโหมดแก้ไข) -->
          <button
            v-if="currentStep > 1 || app.editMode"
            @click="handleBack"
            :disabled="isSubmitting || stepLoading"
            class="flex items-center justify-center gap-1.5 rounded-2xl px-5 py-3.5 text-body font-semibold border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 active:bg-slate-100 transition-all duration-150 active:scale-[0.98] flex-shrink-0 disabled:opacity-50"
            aria-label="ย้อนกลับ"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            ย้อนกลับ
          </button>

          <!-- ปุ่มถัดไป / ยืนยัน -->
          <button
            v-if="currentStep < 5"
            @click="handleNext"
            :disabled="stepLoading || nextBlocked"
            class="flex-1 flex items-center justify-center gap-2 rounded-2xl py-3.5 text-body font-semibold transition-all duration-150 active:scale-[0.98]"
            :class="stepReady && !stepLoading && !nextBlocked
              ? 'bg-[#1A56DB] text-white shadow-md shadow-blue-200 hover:bg-[#1648C4]'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'"
          >
            <!-- spinner: ขณะ stepLoading หรือ OCR กำลังประมวลผล -->
            <svg
              v-if="stepLoading || (currentStep === 4 && step3OcrState === 'loading')"
              class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true"
            >
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            {{
              stepLoading ? 'กำลังโหลด...'
              : (currentStep === 4 && step3OcrState === 'loading') ? 'รอผล OCR...'
              : 'ถัดไป'
            }}
            <svg
              v-if="!stepLoading && !(currentStep === 4 && step3OcrState === 'loading')"
              class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </button>

          <button
            v-else
            @click="handleSubmit"
            :disabled="!stepReady || isSubmitting || stepLoading"
            class="flex-1 flex items-center justify-center gap-2 rounded-2xl py-3.5 text-body font-semibold transition-all duration-150 active:scale-[0.98]"
            :class="stepReady && !isSubmitting && !stepLoading
              ? 'bg-[#1A56DB] text-white shadow-md shadow-blue-200 hover:bg-[#1648C4]'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed'"
          >
            <!-- spinner ขณะกำลังบันทึก -->
            <svg v-if="isSubmitting" class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <svg v-else class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {{ isSubmitting ? 'กำลังบันทึก...' : 'ยืนยันและส่งคำขอ' }}
          </button>
        </div>
      </div>
    </footer>

  </div>
</template>
