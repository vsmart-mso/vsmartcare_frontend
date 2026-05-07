<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import type { ThaiDUser } from '@/types/auth'

const route  = useRoute()
const router = useRouter()
const auth   = useAuthStore()

// รับ caseId จาก query param
const caseId = computed(() => (route.query.caseId as string) || 'CASE-000001')

// วันที่ยื่นในรูปแบบไทย (mock)
const submittedDate = '6 พฤษภาคม 2569'

// auth.user เป็น ThaiDUser ในกรณีที่ login ด้วย ThaID
// field ที่ถูกต้อง: title, fname, lname, pid (ไม่ใช่ fullName / nationalId)
const thaiDUser = computed(() => auth.user as ThaiDUser | null)

// ชื่อเต็ม: รวม คำนำหน้า + ชื่อ + นามสกุล
const fullName = computed(() => {
  const u = thaiDUser.value
  if (!u?.fname) return 'ผู้ใช้งาน'
  return `${u.title} ${u.fname} ${u.lname}`.trim()
})

// อักษรย่อสำหรับ avatar: ตัวแรกของชื่อ
const avatarLetter = computed(() => fullName.value.charAt(0))

// เลขบัตรประชาชน
const nationalId = computed(() => thaiDUser.value?.pid ?? '—')

// ขั้นตอนการดำเนินการ
const statusSteps = [
  { id: 1, label: 'รอรับเรื่อง',     active: true  },
  { id: 2, label: 'รับเรื่องแล้ว',   active: false },
  { id: 3, label: 'รอคณะกรรมการ',    active: false },
  { id: 4, label: 'คกก. รับทราบ',    active: false },
  { id: 5, label: 'อนุมัติแล้ว',     active: false },
  { id: 6, label: 'กำลังเบิกจ่าย',  active: false },
  { id: 7, label: 'ช่วยเหลือแล้ว',  active: false },
]

const currentStatus = statusSteps.find((s) => s.active)!

// ประวัติการเปลี่ยนสถานะ (mock — จะมาจาก API จริงในอนาคต)
const historyLog = [
  {
    id:        1,
    timestamp: '6/5/2569 14:45:30',
    status:    'รอรับเรื่อง',
    detail:    'ยื่นคำขอแล้ว รอ นสค.',
    actor:     fullName,
    action:    'ยื่นคำขอผ่านระบบ พม. CARE',
  },
]

// collapse/expand history
const historyOpen = ref(true)

// scroll timeline
const timelineRef = ref<HTMLElement | null>(null)
function scrollTimeline(dir: 'left' | 'right') {
  timelineRef.value?.scrollBy({ left: dir === 'right' ? 140 : -140, behavior: 'smooth' })
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
          @click="router.back()"
          class="flex items-center justify-center w-9 h-9 rounded-full hover:bg-white/20 active:bg-white/30 transition-colors flex-shrink-0"
          aria-label="ย้อนกลับ"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 class="absolute inset-x-0 text-center text-white text-[16px] font-semibold pointer-events-none">
          ติดตามสถานะคำขอ
        </h1>
      </div>
    </header>

    <!-- ══════════════════════════════════════════════════════════
         Main Content
         ══════════════════════════════════════════════════════════ -->
    <main class="flex-1 mx-auto w-full max-w-md px-4 pt-[4.5rem] pb-8 space-y-3">

      <!-- ── User Card ── -->
      <div class="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-[#1A56DB] flex items-center justify-center flex-shrink-0">
          <span class="text-white text-[15px] font-bold">{{ avatarLetter }}</span>
        </div>
        <div class="min-w-0">
          <p class="text-[14px] font-semibold text-slate-800 truncate">{{ fullName }}'s Case</p>
          <p class="text-[12px] text-slate-500">{{ nationalId }}</p>
        </div>
      </div>

      <!-- ── Case Info ── -->
      <div class="px-1">
        <p class="text-[14px] text-slate-700">
          หมายเลขคำขอ: <span class="font-bold text-slate-900">{{ caseId }}</span>
        </p>
        <p class="text-[13px] text-slate-500 mt-0.5">วันที่ยื่น: {{ submittedDate }}</p>
      </div>

      <!-- ── สถานะปัจจุบัน ── -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-4">
        <p class="text-[12px] font-semibold text-slate-400 mb-3">สถานะปัจจุบัน</p>
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-start gap-3">
            <span class="w-2.5 h-2.5 rounded-full bg-amber-500 flex-shrink-0 mt-1.5"></span>
            <div>
              <p class="text-[15px] font-bold text-amber-600">{{ currentStatus.label }}</p>
              <p class="text-[12px] text-slate-500 mt-0.5">ยื่นคำขอแล้ว รอ นสค.</p>
            </div>
          </div>
          <span class="text-[12px] font-semibold px-2.5 py-1 rounded-full bg-pink-100 text-pink-600 flex-shrink-0">
            รายใหม่
          </span>
        </div>
      </div>

      <!-- ── Timeline ── -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="relative flex items-center px-2 py-4">

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
            class="flex-1 overflow-x-auto px-1"
            style="scrollbar-width: none; -ms-overflow-style: none;"
          >
            <div class="flex items-start gap-0 min-w-max py-1">
              <template v-for="(step, i) in statusSteps" :key="step.id">
                <div class="flex flex-col items-center w-[72px]">
                  <div
                    class="w-9 h-9 rounded-full flex items-center justify-center font-bold text-[13px] flex-shrink-0 transition-colors"
                    :class="step.active
                      ? 'bg-amber-500 text-white shadow-md shadow-amber-200'
                      : 'bg-slate-100 text-slate-400'"
                  >
                    <svg v-if="step.active" class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span v-else>{{ step.id }}</span>
                  </div>
                  <p
                    class="text-[10px] text-center mt-1.5 leading-tight max-w-[64px]"
                    :class="step.active ? 'text-amber-600 font-semibold' : 'text-slate-400'"
                  >
                    {{ step.label }}
                  </p>
                </div>
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

      <!-- ── ประวัติการเปลี่ยนสถานะ ── -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

        <!-- Header: collapsible -->
        <button
          type="button"
          class="w-full flex items-center justify-between px-4 py-3.5 hover:bg-slate-50 active:bg-slate-100 transition-colors"
          @click="historyOpen = !historyOpen"
        >
          <span class="text-[14px] font-semibold text-slate-800">
            ประวัติการเปลี่ยนสถานะ
            <span class="text-[13px] text-slate-400 font-normal ml-1">({{ historyLog.length }})</span>
          </span>
          <svg
            class="w-5 h-5 text-slate-400 flex-shrink-0 transition-transform duration-200"
            :class="historyOpen ? 'rotate-0' : '-rotate-180'"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>

        <!-- History items -->
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          enter-from-class="opacity-0 -translate-y-1"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition-all duration-150 ease-in"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 -translate-y-1"
        >
          <div v-if="historyOpen" class="border-t border-slate-100">
            <div
              v-for="log in historyLog"
              :key="log.id"
              class="px-4 py-4 flex items-start gap-3"
            >
              <!-- dot + line (ถ้ามีหลายรายการ) -->
              <div class="flex flex-col items-center flex-shrink-0">
                <span class="w-2.5 h-2.5 rounded-full bg-[#1A56DB] mt-1"></span>
              </div>

              <div class="flex-1 min-w-0">
                <!-- timestamp -->
                <p class="text-[11px] text-slate-400 mb-1.5">{{ log.timestamp }}</p>

                <!-- status badge -->
                <div class="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mb-2">
                  <span class="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0"></span>
                  <div>
                    <p class="text-[13px] font-bold text-amber-700 leading-tight">{{ log.status }}</p>
                    <p class="text-[11px] text-amber-600">{{ log.detail }}</p>
                  </div>
                </div>

                <!-- actor + action -->
                <p class="text-[13px] font-medium text-slate-700">{{ log.actor }}</p>
                <p class="text-[12px] text-slate-400 mt-0.5">{{ log.action }}</p>
              </div>
            </div>
          </div>
        </Transition>
      </div>

    </main>
  </div>
</template>
