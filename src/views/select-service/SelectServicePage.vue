<template>
  <div class="min-h-dvh flex flex-col bg-[#F8FAFC]">

    <!-- ══════════════════════════════════════════════════════════
         Header: fixed สีน้ำเงิน (ตรงกับ PDPA / CheckSelf)
         ══════════════════════════════════════════════════════════ -->
    <header
      class="fixed top-0 left-0 right-0 z-50 h-14 bg-[#1A56DB] text-white shadow-md"
      style="padding-top: env(safe-area-inset-top)"
    >
      <div class="relative mx-auto w-full max-w-md flex items-center justify-center px-4 h-full">
        <h1 class="text-white text-[16px] font-semibold">
          เลือกบริการ
        </h1>
      </div>
    </header>

    <!-- ══════════════════════════════════════════════════════════
         Main: pt ชดเชย header, pb เผื่อ safe area ล่าง
         ══════════════════════════════════════════════════════════ -->
    <main class="flex-1 mx-auto w-full max-w-md px-4 pt-[calc(3.5rem+1.75rem)] pb-10">

      <!-- ── Hero Section: ไอคอน + คำอธิบาย ──────────────────────────────────── -->
      <div class="flex flex-col items-center text-center mb-7">
        <div class="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mb-4" aria-hidden="true">
          <svg class="w-8 h-8 text-[#1A56DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        </div>
        <h2 class="text-[20px] font-bold text-slate-900 leading-snug mb-1.5">
          ต้องการทำอะไร?
        </h2>
        <p class="text-[14px] text-slate-500 leading-relaxed">
          ลงทะเบียนยื่นคำขอ หรือ ติดตามผลคำขอของคุณ
        </p>
      </div>

      <!-- ── Card: ลงทะเบียนยื่นคำขอ ──────────────────────────────────────────── -->
      <button
        type="button"
        :disabled="isChecking"
        class="group w-full text-left mb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A56DB]/50 rounded-2xl disabled:opacity-70 disabled:cursor-wait"
        @click="selectOption('register')"
      >
        <div class="bg-white rounded-2xl border-2 border-blue-200 shadow-sm p-5 transition-all duration-200 hover:border-blue-400 hover:shadow-md active:scale-[0.98] active:bg-blue-50">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-[#1A56DB] flex items-center justify-center flex-shrink-0 shadow-sm" aria-hidden="true">
              <!-- loading spinner ขณะตรวจสอบ -->
              <svg v-if="isChecking" class="w-6 h-6 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <svg v-else class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[16px] font-bold text-slate-900 leading-snug mb-0.5">ลงทะเบียนยื่นคำขอ</p>
              <p class="text-[13px] text-slate-500 leading-relaxed">
                {{ isChecking ? 'กำลังตรวจสอบสถานะ...' : 'ยื่นคำขอรับความช่วยเหลือด้านสังคมสงเคราะห์' }}
              </p>
            </div>
            <svg
              class="w-5 h-5 text-slate-300 flex-shrink-0 transition-colors group-hover:text-blue-500"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </button>

      <!-- ── Card: ติดตามผลคำขอ ─────────────────────────────────────────────── -->
      <button
        type="button"
        class="group w-full text-left mb-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500/50 rounded-2xl"
        @click="selectOption('track')"
      >
        <div class="bg-white rounded-2xl border-2 border-green-200 shadow-sm p-5 transition-all duration-200 hover:border-green-400 hover:shadow-md active:scale-[0.98] active:bg-green-50">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-green-600 flex items-center justify-center flex-shrink-0 shadow-sm" aria-hidden="true">
              <svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[16px] font-bold text-slate-900 leading-snug mb-0.5">ติดตามผลคำขอ</p>
              <p class="text-[13px] text-slate-500 leading-relaxed">ตรวจสอบสถานะคำขอที่ยื่นไว้แล้ว</p>
            </div>
            <svg
              class="w-5 h-5 text-slate-300 flex-shrink-0 transition-colors group-hover:text-green-500"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </button>

      <!-- ── Info Alert ─────────────────────────────────────────────────────── -->
      <div class="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3.5">
        <svg class="w-[18px] h-[18px] text-blue-500 flex-shrink-0 mt-[1px]" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
            clip-rule="evenodd" />
        </svg>
        <p class="text-[13px] text-blue-700 leading-[1.65]">
          ระบบจะตรวจสอบว่าท่านมีคำขอค้างอยู่หรือไม่
          และนำท่านไปยังหน้าที่เหมาะสมโดยอัตโนมัติ
        </p>
      </div>

    </main>

    <!-- ── Footer: copyright ──────────────────────────────────────────────────── -->
    <footer
      class="text-center py-4"
      style="padding-bottom: max(env(safe-area-inset-bottom), 16px)"
    >
      <p class="text-[12px] text-slate-400">
        © 2568 กระทรวงการพัฒนาสังคมและความมั่นคงของมนุษย์
      </p>
    </footer>

  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import type { ThaiDUser } from '@/types/auth'
import { welfareApi } from '@/api/welfare'

type ServiceOption = 'register' | 'track'

const router = useRouter()
const authStore = useAuthStore()
const isChecking = ref(false)

function isThaiDUser(u: unknown): u is ThaiDUser {
  return u != null && typeof (u as ThaiDUser).fname === 'string'
}


async function selectOption(option: ServiceOption) {
  if (option === 'track') {
    router.push({ name: 'case-tracking' })
    return
  }

  // ตรวจสอบว่าเคยผ่านการ screening แล้วหรือยัง
  const u = authStore.user
  const personId = isThaiDUser(u) ? u.person_id : 0

  if (personId > 0) {
    isChecking.value = true
    try {
      // ดึงรายการคำร้องทั้งหมดของ person แล้วเช็กว่ามี case ที่ยังดำเนินการอยู่หรือไม่
      // สถานะที่ถือว่า "active": 1=รับเรื่อง, 2=อยู่ระหว่างการเบิก, 3=เบิกจ่ายสำเร็จ
      // 1. เช็คว่ามี case ที่ยังดำเนินการอยู่หรือไม่ (สถานะ 1/2/3)
      const cases = await welfareApi.getCasesDisplay(personId)
      const activeCase = cases.find(c => [1, 2, 3].includes(c.current_status?.id ?? -1))
      if (activeCase) {
        router.push({ name: 'case-tracking', query: { applicantId: String(activeCase.applicant_id) } })
        return
      }

      // 2. เช็คว่าเคยผ่านการตรวจสอบสิทธิ์แล้วหรือยัง
      const latestPassed = await welfareApi.getLatestPassedScreening(personId)
      if (latestPassed) {
        // ผ่านแล้ว → ข้ามไปหน้าผลการตรวจสอบสิทธิ์โดยตรง
        router.push({ name: 'check-self', query: { result: 'passed' } })
        return
      }
    } catch {
      // ถ้า API ล้มเหลวให้ไปตามปกติ ไม่ block user
    } finally {
      isChecking.value = false
    }
  }

  // ยังไม่เคยผ่าน หรือยังไม่เคยตรวจสอบ → ไปหน้า PDPA ตามปกติ
  router.push({ name: 'pdpa' })
}
</script>
