<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import type { ThaiDUser } from '@/types/auth'
import { welfareApi } from '@/api/welfare'

const route  = useRoute()
const router = useRouter()
const auth   = useAuthStore()

// applicant_id ที่ได้หลัง submit สำเร็จ
const applicantId = computed(() => Number(route.query.caseId) || 0)

// วันที่ยื่น = ตอนนี้เลย (เพิ่งยื่นสำเร็จ)
const submittedDate = new Date().toLocaleDateString('th-TH', {
  day: 'numeric', month: 'long', year: 'numeric',
  hour: '2-digit', minute: '2-digit',
})

// ─── โหลด case_number + is_existing_case จาก API ───────────────────────────────
const caseNumber    = ref<string | null>(null)
const isExistingCase = ref<boolean | null>(null)

onMounted(async () => {
  const u = auth.user as ThaiDUser | null
  if (!u?.person_id || !applicantId.value) return
  try {
    const cases = await welfareApi.getCasesDisplay(u.person_id)
    const found = cases.find(c => c.applicant_id === applicantId.value)
    if (found) {
      caseNumber.value    = found.case_number
      isExistingCase.value = found.is_existing_case
    }
  } catch {
    // ถ้าโหลดไม่ได้ แสดง applicant_id แทน — ไม่ block หน้า
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

// ─── Timeline: 4 steps จริงจาก DB (post-submit เสมออยู่ที่ step 1 = รอรับเรื่อง) ──
const TIMELINE_STEPS = [
  { id: 1, label: 'รอรับเรื่อง' },
  { id: 2, label: 'รับเรื่องเรียบร้อย' },
  { id: 3, label: 'อยู่ระหว่างการเบิก' },
  { id: 4, label: 'เบิกจ่ายสำเร็จ' },
]

const timelineRef = ref<HTMLElement | null>(null)
function scrollTimeline(dir: 'left' | 'right') {
  timelineRef.value?.scrollBy({ left: dir === 'right' ? 140 : -140, behavior: 'smooth' })
}

function goToTracking() {
  router.push({ name: 'case-tracking', query: { applicantId: String(applicantId.value) } })
}
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
        <h1 class="text-white text-[16px] font-semibold">
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
        <h2 class="text-[22px] font-bold text-green-600">ยื่นคำขอเรียบร้อยแล้ว</h2>
      </div>

      <!-- ── Card: หมายเลขคำขอ + วันที่ + สถานะ ── -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="px-5 py-4 space-y-3">

          <!-- หมายเลขคำขอ -->
          <div class="text-center">
            <p class="text-[12px] text-slate-400 mb-1">หมายเลขคำขอ</p>
            <div class="flex items-center justify-center gap-2">
              <span class="text-[22px] font-bold text-[#1A56DB] tracking-wide">{{ displayCaseId }}</span>
              <button
                type="button"
                @click="copyCaseId"
                class="text-slate-400 hover:text-[#1A56DB] active:scale-90 transition-all"
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
            <p v-if="copied" class="text-[11px] text-green-500 mt-0.5">คัดลอกแล้ว</p>
          </div>

          <div class="h-px bg-slate-100" />

          <!-- วันที่ยื่น -->
          <p class="text-center text-[13px] text-slate-500">
            วันที่ยื่น: <span class="font-medium text-slate-700">{{ submittedDate }}</span>
          </p>

          <!-- badge รายใหม่/รายเดิม (แสดงเฉพาะเมื่อโหลดข้อมูลสำเร็จ) -->
          <div v-if="isExistingCase !== null" class="flex justify-center">
            <span
              class="text-[12px] font-semibold px-3 py-1 rounded-full"
              :class="isExistingCase ? 'bg-slate-100 text-slate-600' : 'bg-pink-100 text-pink-600'"
            >
              {{ isExistingCase ? 'รายเดิม' : 'รายใหม่' }}
            </span>
          </div>

        </div>
      </div>

      <!-- ── ระยะเวลาดำเนินการ ── -->
      <div class="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 flex items-start gap-3">
        <svg class="w-4 h-4 text-[#1A56DB] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <p class="text-[13px] font-semibold text-[#1A56DB]">ระยะเวลาดำเนินการ</p>
          <p class="text-[12px] text-slate-500 mt-0.5">
            เจ้าหน้าที่จะตรวจสอบและติดต่อกลับภายใน 7-15 วันทำการ
          </p>
        </div>
      </div>

      <!-- ── Timeline ── -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="px-4 pt-3 pb-1">
          <p class="text-[12px] font-semibold text-slate-500 mb-3">ขั้นตอนการดำเนินการ</p>
        </div>

        <div class="relative flex items-center px-2 pb-4">
          <!-- ลูกศรซ้าย -->
          <button type="button" @click="scrollTimeline('left')"
            class="flex-shrink-0 w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm z-10 active:scale-90 transition-all"
            aria-label="เลื่อนซ้าย">
            <svg class="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div ref="timelineRef" class="flex-1 overflow-x-auto px-1" style="scrollbar-width: none; -ms-overflow-style: none;">
            <div class="flex items-start gap-0 min-w-max py-1">
              <template v-for="(step, i) in TIMELINE_STEPS" :key="step.id">
                <div class="flex flex-col items-center w-[72px]">
                  <div class="w-9 h-9 rounded-full flex items-center justify-center font-bold text-[13px] flex-shrink-0 transition-colors"
                    :class="step.id === 1
                      ? 'bg-amber-500 text-white shadow-md shadow-amber-200'
                      : 'bg-slate-100 text-slate-400'"
                  >
                    <svg v-if="step.id === 1" class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    <span v-else>{{ step.id }}</span>
                  </div>
                  <p class="text-[10px] text-center mt-1.5 leading-tight max-w-[64px]"
                    :class="step.id === 1 ? 'text-amber-600 font-semibold' : 'text-slate-400'">
                    {{ step.label }}
                  </p>
                </div>
                <div v-if="i < TIMELINE_STEPS.length - 1"
                  class="h-px w-4 mt-[18px] flex-shrink-0"
                  :class="step.id === 1 ? 'bg-amber-300' : 'bg-slate-200'" />
              </template>
            </div>
          </div>

          <!-- ลูกศรขวา -->
          <button type="button" @click="scrollTimeline('right')"
            class="flex-shrink-0 w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm z-10 active:scale-90 transition-all"
            aria-label="เลื่อนขวา">
            <svg class="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      <!-- ── ปุ่ม ── -->
      <div class="space-y-3 pt-1 pb-4">
        <button
          type="button"
          @click="goToTracking"
          class="w-full flex items-center justify-center gap-2 bg-[#1A56DB] text-white rounded-2xl py-3.5 text-[16px] font-semibold shadow-md shadow-blue-200 hover:bg-[#1648C4] active:scale-[0.98] transition-all"
        >
          ติดตามสถานะคำขอ
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </button>
      </div>

    </main>
  </div>
</template>
