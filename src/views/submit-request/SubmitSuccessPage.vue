<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import type { ThaiDUser } from '@/types/auth'
import { welfareApi } from '@/api/welfare'
import Skeleton from '@/components/ui/Skeleton.vue'

const router = useRouter()
const auth   = useAuthStore()

// applicant_id ที่ได้หลัง submit สำเร็จ — ส่งมาทาง history.state (ไม่ใส่ใน URL เพื่อกัน id รั่ว)
// snapshot ครั้งเดียวตอน setup เพราะ history.state ไม่ reactive และไม่เปลี่ยนระหว่างอยู่หน้านี้
const applicantId = ref<number>(Number(window.history.state?.caseId) || 0)

// วันที่ยื่น = ตอนนี้เลย (เพิ่งยื่นสำเร็จ)
const submittedDate = new Date().toLocaleDateString('th-TH', {
  day: 'numeric', month: 'long', year: 'numeric',
  hour: '2-digit', minute: '2-digit',
})

// ─── โหลด case_number + is_existing_case จาก API ───────────────────────────────
const caseNumber    = ref<string | null>(null)
const isExistingCase = ref<boolean | null>(null)
// isLoadingCaseId = true ระหว่างรอ API คืนหมายเลขคำขอจริง — โชว์ skeleton แทน
const isLoadingCaseId = ref(true)

// ดักทุก navigation ออกจากหน้า success (รวม back button) ให้ไป case-tracking แทน
// onBeforeRouteLeave ของ Vue Router ทำงานได้กับทั้ง back button และ router.push/replace
onBeforeRouteLeave((to) => {
  if (to.name !== 'case-tracking') {
    router.replace({ name: 'case-tracking', state: applicantId.value ? { applicantId: applicantId.value } : undefined })
    return false  // ยกเลิก navigation เดิม (Vue Router จะ restore URL ก่อน replace)
  }
})

onMounted(async () => {
  const u = auth.user as ThaiDUser | null
  if (!u?.person_id || !applicantId.value) {
    isLoadingCaseId.value = false
    return
  }
  try {
    const cases = await welfareApi.getCasesDisplay(u.person_id)
    const found = cases.find(c => c.applicant_id === applicantId.value)
    if (found) {
      caseNumber.value     = found.case_number
      isExistingCase.value = found.is_existing_case
    }
  } catch {
    // ถ้าโหลดไม่ได้ แสดง applicant_id แทน — ไม่ block หน้า
  } finally {
    // ปิด skeleton เสมอ — สำเร็จก็ดี ล้มเหลวก็ใช้ #applicant_id แทน
    isLoadingCaseId.value = false
  }
})

// หมายเลขที่แสดง: case_number จาก API หรือ fallback เป็น applicant_id
const displayCaseId = computed(() => caseNumber.value ?? (applicantId.value ? `#${applicantId.value}` : '—'))

// ─── copy ───────────────────────────────────────────────────────────────────────
const copied = ref(false)
async function copyCaseId() {
  try {
    await navigator.clipboard.writeText(displayCaseId.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch { /* silent */ }
}

function goToTracking() {
  router.replace({ name: 'case-tracking', state: { applicantId: applicantId.value } })
}

// ─── Satisfaction Survey ─────────────────────────────────────────────────────
/* [ปิดใช้งานชั่วคราว] แบบประเมินความพึงพอใจหลังกรอกฟอร์ม — เดี๋ยวอนาคตจะกลับมาใช้
// สถานะ: 'pending' = ยังไม่ประเมิน | 'submitting' = กำลังส่ง | 'done' = ส่งแล้ว
const surveyState   = ref<'pending' | 'submitting' | 'done'>('pending')
const selectedRating = ref(0)   // 1-5 ดาวที่ user กด (0 = ยังไม่เลือก)
const hoverRating    = ref(0)   // ดาวที่ mouse hover อยู่ (สำหรับ highlight)
const surveyComment  = ref('')
const surveyError    = ref('')

// แต่ละดาวแสดงชื่อ tooltip
const starLabels = ['', 'ปรับปรุง', 'พอใช้', 'ดี', 'ดีมาก', 'ดีเยี่ยม']

// ดาวที่ควร highlight: ใช้ hover ถ้ากำลัง hover, ไม่งั้นใช้ที่เลือกแล้ว
const activeRating = computed(() => hoverRating.value || selectedRating.value)

async function submitSurvey() {
  if (!selectedRating.value || surveyState.value !== 'pending') return
  surveyState.value = 'submitting'
  surveyError.value = ''
  try {
    await welfareApi.submitSatisfaction({
      applicant_id: applicantId.value,
      survey_type:  'system_usage',
      rating:       selectedRating.value,
      comment:      surveyComment.value.trim() || null,
    })
    surveyState.value = 'done'
  } catch {
    surveyState.value = 'pending'
    surveyError.value = 'ส่งผลประเมินไม่สำเร็จ กรุณาลองใหม่'
  }
}

function skipSurvey() {
  surveyState.value = 'done'
}
*/
</script>

<template>
  <div class="min-h-dvh flex flex-col bg-slate-100">

    <!-- ══════════════════════════════════════════════════════════
         Header
         ══════════════════════════════════════════════════════════ -->
    <header
      class="fixed top-0 left-0 right-0 z-50 h-14 bg-[#1A56DB] text-white shadow-md"
      style="padding-top: env(safe-area-inset-top)"
    >
      <div class="relative mx-auto w-full max-w-md flex items-center justify-center px-4 h-full">
        <h1 class="text-white text-body font-semibold">
          ยื่นคำขอสำเร็จ
        </h1>
      </div>
    </header>

    <!-- ══════════════════════════════════════════════════════════
         Main Content
         ══════════════════════════════════════════════════════════ -->
    <main class="flex-1 mx-auto w-full max-w-md px-4 pt-[4.5rem] pb-8 space-y-4">

      <!-- ── Hero ── -->
      <div class="flex flex-col items-center pt-6 pb-2">
        <div class="w-[72px] h-[72px] rounded-full bg-green-500 flex items-center justify-center shadow-lg shadow-green-200 mb-4">
          <svg class="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 class="text-h2-section font-bold text-green-600">ส่งคำขอเรียบร้อยแล้ว</h2>
      </div>

      <!-- ── Card: หมายเลขคำขอ + วันที่ + สถานะ ── -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="px-5 py-4 space-y-3">

          <!-- หมายเลขคำขอ -->
          <div class="text-center">
            <p class="text-hint text-slate-400 mb-1">หมายเลขคำขอ</p>
            <div class="flex items-center justify-center gap-2">
              <!-- ระหว่างรอ API: โชว์ skeleton แทนหมายเลขคำขอ -->
              <Skeleton v-if="isLoadingCaseId" width="7rem" height="1.75rem" rounded="rounded-lg" />
              <span v-else class="text-h2-section font-bold text-[#1A56DB] tracking-wide">{{ displayCaseId }}</span>
              <button
                type="button"
                @click="copyCaseId"
                :disabled="isLoadingCaseId"
                class="text-slate-400 hover:text-[#1A56DB] active:scale-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                :aria-label="copied ? 'คัดลอกแล้ว' : 'คัดลอกหมายเลขคำขอ'"
              >
                <svg v-if="!copied" class="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <svg v-else class="w-[18px] h-[18px] text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </button>
            </div>
            <p v-if="copied" class="text-micro text-green-500 mt-0.5">คัดลอกแล้ว</p>
          </div>

          <div class="h-px bg-slate-200" />

          <!-- วันที่ยื่น -->
          <p class="text-center text-body-xs text-slate-500">
            วันที่ยื่น: <span class="font-medium text-slate-700">{{ submittedDate }}</span>
          </p>

        </div>
      </div>

      <!-- ════════════════════════════════════════════════════════════════
           [ปิดใช้งานชั่วคราว] แบบประเมินความพึงพอใจ "หลังกรอกฟอร์มสำเร็จ"
           เก็บโค้ดไว้ก่อน เดี๋ยวอนาคตจะกลับมาเปิดใช้งานใหม่
           (หมายเหตุ: HTML comment ซ้อนกันไม่ได้ จึงถอดคอมเมนต์ย่อยภายในออกชั่วคราว)
           ════════════════════════════════════════════════════════════════
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

        สถานะ: ส่งแล้ว ── แสดงขอบคุณ
        <div v-if="surveyState === 'done'" class="flex flex-col items-center px-5 py-6 gap-2">
          <div class="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center mb-1">
            <svg class="w-7 h-7 text-yellow-400" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </div>
          <p class="text-body font-bold text-slate-800">ขอบคุณสำหรับการประเมิน</p>
          <p class="text-body-xs text-slate-500 text-center">ความคิดเห็นของท่านมีคุณค่าต่อการพัฒนาระบบ</p>
        </div>

        สถานะ: ยังไม่ประเมิน / กำลังส่ง
        <template v-else>
          หัว
          <div class="flex gap-3 px-4 pt-4 pb-3">
            <div class="w-9 h-9 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0" aria-hidden="true">
              <svg class="w-5 h-5 text-yellow-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </div>
            <div>
              <p class="text-micro font-semibold text-yellow-600 uppercase tracking-wider mb-0.5">แบบสอบถาม</p>
              <p class="text-body font-bold text-slate-900">ประเมินความพึงพอใจการใช้งาน</p>
            </div>
          </div>

          <div class="px-4 pb-4 space-y-4">
            <p class="text-body-xs text-slate-600">ท่านพึงพอใจกับระบบการยื่นคำขอรับความช่วยเหลือมากน้อยเพียงใด?</p>

            ดาว 1-5
            <div class="flex justify-center gap-3">
              <button
                v-for="star in 5"
                :key="star"
                type="button"
                @click="selectedRating = star"
                @mouseenter="hoverRating = star"
                @mouseleave="hoverRating = 0"
                :aria-label="`${star} ดาว — ${starLabels[star]}`"
                class="flex flex-col items-center gap-1 focus:outline-none active:scale-95 transition-transform"
              >
                <svg
                  class="w-9 h-9 transition-colors duration-150"
                  :class="star <= activeRating ? 'text-yellow-400' : 'text-slate-200'"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
                <span class="text-tiny text-slate-400 leading-none">{{ starLabels[star] }}</span>
              </button>
            </div>

            ช่องความคิดเห็นเพิ่มเติม (ไม่บังคับ)
            <textarea
              v-model="surveyComment"
              rows="2"
              placeholder="ความคิดเห็นเพิ่มเติม (ไม่บังคับ)"
              maxlength="500"
              class="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-body-xs placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB] resize-none"
            />

            error
            <p v-if="surveyError" class="text-hint text-red-500 text-center">{{ surveyError }}</p>

            ปุ่ม
            <div class="flex gap-2">
              <button
                type="button"
                @click="skipSurvey"
                class="flex-1 border border-slate-200 rounded-xl py-2.5 text-body-md font-medium text-slate-500 hover:bg-slate-50 active:scale-[0.98] transition-all"
              >
                ข้ามขั้นตอนนี้
              </button>
              <button
                type="button"
                @click="submitSurvey"
                :disabled="!selectedRating || surveyState === 'submitting'"
                class="flex-1 rounded-xl py-2.5 text-body-md font-semibold transition-all active:scale-[0.98]"
                :class="selectedRating && surveyState !== 'submitting'
                  ? 'bg-[#1A56DB] text-white hover:bg-[#1648C4]'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'"
              >
                {{ surveyState === 'submitting' ? 'กำลังส่ง...' : 'ส่งผลประเมิน' }}
              </button>
            </div>

          </div>
        </template>
      </div>
      -->

      <!-- ── ปุ่ม ── -->
      <div class="space-y-3 pt-1 pb-4">
        <button
          type="button"
          @click="goToTracking"
          class="w-full flex items-center justify-center gap-2 bg-[#1A56DB] text-white rounded-2xl py-3.5 text-body font-semibold shadow-md shadow-blue-200 hover:bg-[#1648C4] active:scale-[0.98] transition-all"
        >
          ติดตามสถานะคำขอ
        </button>
      </div>

    </main>
  </div>
</template>
