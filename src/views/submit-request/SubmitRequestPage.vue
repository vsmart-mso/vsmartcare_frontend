<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import Step1PersonalInfo from './steps/Step1PersonalInfo.vue'
import Step2Economics   from './steps/Step2Economics.vue'
import Step3Problem     from './steps/Step3Problem.vue'
import Step4Documents   from './steps/Step4Documents.vue'
import Step5Confirmation from './steps/Step5Confirmation.vue'
import { useApplicationStore } from '@/stores/application'
import type { Step1Data, Step2Data, Step3Data } from '@/stores/application'
import { useAuthStore } from '@/stores/auth'
import type { ThaiDUser } from '@/types/auth'

const router = useRouter()
const app    = useApplicationStore()
const auth   = useAuthStore()

const currentStep = ref(1)
const stepReady   = ref(false)

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
  else router.push({ name: 'select-service' })
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

// Step 5: submit form
async function handleSubmit() {
  if (!stepReady.value) return
  void stepRef.value?.getData()

  // แปลง auth.user เป็น ThaiDUser เพื่อส่งเข้า buildApiPayload
  const thaiDUser = auth.user as ThaiDUser | null

  // สร้าง payload ที่ map ไปยัง ERD field names
  const payload = app.buildApiPayload(thaiDUser)
  console.log('[submit payload]', payload)

  // TODO: เรียก API จริงเมื่อ backend พร้อม
  // const { caseId } = await submitApi.create(payload)
  // const fileEntries = app.documentsMeta.map(d => ({ meta: d, file: app.getFile(d.id)! }))
  // await submitApi.uploadFiles(caseId, fileEntries)
  // app.clearAll()

  const mockCaseId = `CASE-${String(Date.now()).slice(-6).padStart(6, '0')}`
  router.push({ name: 'submit-success', query: { caseId: mockCaseId } })
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
        <button
          @click="handleBack"
          class="flex items-center justify-center w-9 h-9 rounded-full hover:bg-white/20 active:bg-white/30 transition-colors flex-shrink-0"
          aria-label="ย้อนกลับ"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
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

        <div class="flex gap-3">
          <!-- ปุ่มย้อนกลับ -->
          <button
            @click="handleBack"
            class="flex items-center justify-center gap-1.5 rounded-2xl px-5 py-3.5 text-[15px] font-semibold border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 active:bg-slate-100 transition-all duration-150 active:scale-[0.98] flex-shrink-0"
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
            :disabled="!stepReady"
            class="flex-1 flex items-center justify-center gap-2 rounded-2xl py-3.5 text-[16px] font-semibold transition-all duration-150 active:scale-[0.98]"
            :class="stepReady
              ? 'bg-[#1A56DB] text-white shadow-md shadow-blue-200 hover:bg-[#1648C4]'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed'"
          >
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            ยืนยันและส่งคำขอ
          </button>
        </div>
      </div>
    </footer>

  </div>
</template>
