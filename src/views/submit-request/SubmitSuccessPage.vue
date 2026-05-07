<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route  = useRoute()
const router = useRouter()

// รับ case ID จาก query param ที่ส่งมาตอน submit
const caseId = computed(() => (route.query.caseId as string) || 'CASE-000001')

// วันที่ยื่นในรูปแบบไทย (พ.ศ.)
const submittedDate = new Date().toLocaleDateString('th-TH', {
  day:   'numeric',
  month: 'short',
  year:  'numeric',
})

// copy case ID ไปยัง clipboard
const copied = ref(false)
async function copyCaseId() {
  try {
    await navigator.clipboard.writeText(caseId.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // browser เก่าที่ไม่รองรับ clipboard API — silent fail
  }
}

// ขั้นตอนการดำเนินการ
const statusSteps = [
  { id: 1, label: 'รอรับเรื่อง',      active: true  },
  { id: 2, label: 'รับเรื่องแล้ว',    active: false },
  { id: 3, label: 'รอคณะกรรมการ',     active: false },
  { id: 4, label: 'คกก. รับทราบ',     active: false },
  { id: 5, label: 'อนุมัติแล้ว',      active: false },
  { id: 6, label: 'กำลังเบิกจ่าย',   active: false },
  { id: 7, label: 'ช่วยเหลือแล้ว',   active: false },
]

// scroll timeline ซ้าย/ขวา
const timelineRef = ref<HTMLElement | null>(null)
function scrollTimeline(dir: 'left' | 'right') {
  timelineRef.value?.scrollBy({ left: dir === 'right' ? 140 : -140, behavior: 'smooth' })
}

function goToTracking() {
  router.push({ name: 'case-tracking', query: { caseId: caseId.value } })
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
      <div class="relative mx-auto w-full max-w-md flex items-center px-4 h-full">
        <button
          @click="router.push({ name: 'select-service' })"
          class="flex items-center justify-center w-9 h-9 rounded-full hover:bg-white/20 active:bg-white/30 transition-colors flex-shrink-0"
          aria-label="กลับ"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 class="absolute inset-x-0 text-center text-white text-[16px] font-semibold pointer-events-none">
          ยื่นคำขอสำเร็จ
        </h1>
      </div>
    </header>

    <!-- ══════════════════════════════════════════════════════════
         Main Content
         ══════════════════════════════════════════════════════════ -->
    <main class="flex-1 mx-auto w-full max-w-md px-4 pt-[4.5rem] pb-8 space-y-4">

      <!-- ── Hero: checkmark + ชื่อสถานะ ── -->
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
              <span class="text-[22px] font-bold text-[#1A56DB] tracking-wide">{{ caseId }}</span>
              <button
                type="button"
                @click="copyCaseId"
                class="text-slate-400 hover:text-[#1A56DB] active:scale-90 transition-all"
                :aria-label="copied ? 'คัดลอกแล้ว' : 'คัดลอกหมายเลขคำขอ'"
              >
                <!-- copy icon -->
                <svg v-if="!copied" class="w-4.5 h-4.5 w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <!-- check icon (copied) -->
                <svg v-else class="w-[18px] h-[18px] text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </button>
            </div>
            <!-- คัดลอกแล้ว toast inline -->
            <p v-if="copied" class="text-[11px] text-green-500 mt-0.5 transition-opacity">คัดลอกแล้ว</p>
          </div>

          <div class="h-px bg-slate-100" />

          <!-- วันที่ยื่น -->
          <p class="text-center text-[13px] text-slate-500">
            วันที่ยื่น: <span class="font-medium text-slate-700">{{ submittedDate }}</span>
          </p>

          <!-- badge สถานะ -->
          <div class="flex justify-center">
            <span class="text-[12px] font-semibold px-3 py-1 rounded-full bg-pink-100 text-pink-600">
              รายใหม่ (ผ่านคณะกรรมการ)
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

      <!-- ── Timeline สถานะ (horizontal scroll) ── -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="px-4 pt-3 pb-1">
          <p class="text-[12px] font-semibold text-slate-500 mb-3">ขั้นตอนการดำเนินการ</p>
        </div>

        <div class="relative flex items-center px-2 pb-4">
          <!-- ลูกศรซ้าย -->
          <button
            type="button"
            @click="scrollTimeline('left')"
            class="flex-shrink-0 w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm z-10 active:scale-90 transition-all"
            aria-label="เลื่อนซ้าย"
          >
            <svg class="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <!-- Steps -->
          <div
            ref="timelineRef"
            class="flex-1 overflow-x-auto scrollbar-hide px-1"
            style="scrollbar-width: none; -ms-overflow-style: none;"
          >
            <div class="flex items-start gap-0 min-w-max py-1">
              <template v-for="(step, i) in statusSteps" :key="step.id">
                <!-- Step item -->
                <div class="flex flex-col items-center w-[72px]">
                  <!-- Circle -->
                  <div
                    class="w-9 h-9 rounded-full flex items-center justify-center font-bold text-[13px] flex-shrink-0 transition-colors"
                    :class="step.active
                      ? 'bg-amber-500 text-white shadow-md shadow-amber-200'
                      : 'bg-slate-100 text-slate-400'"
                  >
                    <!-- hourglass icon สำหรับ step ที่ active (กำลังรอ) -->
                    <svg v-if="step.active" class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span v-else>{{ step.id }}</span>
                  </div>
                  <!-- Label -->
                  <p
                    class="text-[10px] text-center mt-1.5 leading-tight max-w-[64px]"
                    :class="step.active ? 'text-amber-600 font-semibold' : 'text-slate-400'"
                  >
                    {{ step.label }}
                  </p>
                </div>

                <!-- Connector line (ไม่แสดงหลัง step สุดท้าย) -->
                <div
                  v-if="i < statusSteps.length - 1"
                  class="h-px w-4 mt-[18px] flex-shrink-0"
                  :class="step.active ? 'bg-amber-300' : 'bg-slate-200'"
                />
              </template>
            </div>
          </div>

          <!-- ลูกศรขวา -->
          <button
            type="button"
            @click="scrollTimeline('right')"
            class="flex-shrink-0 w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm z-10 active:scale-90 transition-all"
            aria-label="เลื่อนขวา"
          >
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
