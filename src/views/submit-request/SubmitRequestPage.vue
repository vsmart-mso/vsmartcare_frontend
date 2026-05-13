<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
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

const router = useRouter()
const app    = useApplicationStore()
const auth   = useAuthStore()

const currentStep  = ref(1)
const stepReady    = ref(false)
const isSubmitting = ref(false)
const submitError  = ref('')

const steps = [
  { id: 1, label: 'ข้อมูลส่วนตัว' },
  { id: 2, label: 'เศรษฐกิจ' },
  { id: 3, label: 'ปัญหา' },
  { id: 4, label: 'เอกสาร' },
  { id: 5, label: 'ยืนยันข้อมูล' },
]

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
  else router.back()
}

function handleNext() {
  if (!stepReady.value) {
    // แสดง error ทุก field ให้ผู้ใช้รู้ว่าต้องกรอกอะไรอีก
    stepRef.value?.touchAll?.()
    return
  }
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
    submitError.value = 'กรุณากลับไป Step 3 และเลือกประเภทความช่วยเหลือที่ต้องการอย่างน้อย 1 รายการ'
    return
  }

  isSubmitting.value = true
  submitError.value  = ''

  try {
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
      await welfareApi.uploadEvidence(applicantId, attachmentTypeId, file)
    }

    // 3. ล้างข้อมูล draft ออกจาก memory และ sessionStorage
    app.clearAll()

    // 4. ไปหน้าสำเร็จพร้อม applicant_id (ใช้อ้างอิงคำร้อง)
    router.push({ name: 'submit-success', query: { caseId: String(applicantId) } })

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
         Header (fixed)
         ══════════════════════════════════════════════════════════ -->
    <header
      class="fixed top-0 left-0 right-0 z-50 h-14 bg-[#1A56DB] text-white shadow-md"
      style="padding-top: env(safe-area-inset-top)"
    >
      <div class="relative mx-auto w-full max-w-md flex items-center px-4 h-full">
        <h1 class="absolute inset-x-0 text-center text-white text-[16px] font-semibold pointer-events-none">
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
              <div
                class="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold transition-colors"
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
                class="text-[10px] mt-1 text-center leading-tight max-w-[3.5rem]"
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
      />
      <Step2Economics
        v-else-if="currentStep === 2"
        ref="stepRef"
        @update:ready="stepReady = $event"
      />
      <Step3Problem
        v-else-if="currentStep === 3"
        ref="stepRef"
        @update:ready="stepReady = $event"
      />
      <Step4Documents
        v-else-if="currentStep === 4"
        ref="stepRef"
        @update:ready="stepReady = $event"
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
        <p v-if="currentStep === 5" class="text-center text-[12px] text-slate-400 mb-2">
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
          <p class="text-[12px] text-red-700 leading-snug">{{ submitError }}</p>
        </div>

        <div class="flex gap-3">
          <!-- ปุ่มย้อนกลับ (ซ่อนใน Step 1) -->
          <button
            v-if="currentStep > 1"
            @click="handleBack"
            :disabled="isSubmitting"
            class="flex items-center justify-center gap-1.5 rounded-2xl px-5 py-3.5 text-[15px] font-semibold border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 active:bg-slate-100 transition-all duration-150 active:scale-[0.98] flex-shrink-0 disabled:opacity-50"
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
            class="flex-1 flex items-center justify-center gap-2 rounded-2xl py-3.5 text-[16px] font-semibold transition-all duration-150 active:scale-[0.98]"
            :class="stepReady
              ? 'bg-[#1A56DB] text-white shadow-md shadow-blue-200 hover:bg-[#1648C4]'
              : 'bg-slate-200 text-slate-400'"
          >
            ถัดไป
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </button>

          <button
            v-else
            @click="handleSubmit"
            :disabled="!stepReady || isSubmitting"
            class="flex-1 flex items-center justify-center gap-2 rounded-2xl py-3.5 text-[16px] font-semibold transition-all duration-150 active:scale-[0.98]"
            :class="stepReady && !isSubmitting
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
