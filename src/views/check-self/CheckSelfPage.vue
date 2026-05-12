<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import type { ThaiDUser } from '@/types/auth'
import { useApplicationStore } from '@/stores/application'
import { welfareApi } from '@/api/welfare'

const router = useRouter()
const route  = useRoute()
const authStore = useAuthStore()
const app = useApplicationStore()

// ─── Type Guard ────────────────────────────────────────────────────────────────
function isThaiDUser(u: unknown): u is ThaiDUser {
  return u != null && typeof (u as ThaiDUser).fname === 'string'
}

// ─── Auth User ─────────────────────────────────────────────────────────────────
const authUser = computed((): ThaiDUser | null => {
  const u = authStore.user
  return isThaiDUser(u) ? u : null
})

onMounted(() => {
  if (!authStore.isAuthenticated || !authUser.value) {
    router.replace({ name: 'login' })
    return
  }
  // ถ้ามี query ?result=passed → แสดงหน้าผลการตรวจสอบโดยตรง (มาจาก SelectService ที่ตรวจพบว่าผ่านแล้ว)
  if (route.query.result === 'passed') {
    screeningPassed.value = true
    currentView.value = 'result'
    arrivedDirectlyAtResult.value = true
  }
})

// ─── View State ────────────────────────────────────────────────────────────────
const currentView = ref<'form' | 'result'>('form')
// true = มาที่หน้า result โดยตรง (ผ่านสิทธิ์แล้ว) ไม่ได้กรอก form → กดกลับควรออกจากหน้านี้
const arrivedDirectlyAtResult = ref(false)
// ผลการตรวจสอบ: true = ผ่าน, false = ไม่ผ่าน, null = ยังไม่ได้ตรวจ
const screeningPassed = ref<boolean | null>(null)
// สถานะระหว่างเรียก API
const isSubmitting = ref(false)
const submitError  = ref('')

// ─── วันเกิด ──────────────────────────────────────────────────────────────────
const dobFromThaiD = computed(() => {
  const d = authUser.value?.dob
  return !!(d && d.trim() !== '')
})
const manualDob = ref('')
const effectiveDob = computed(() => {
  const d = authUser.value?.dob
  return d && d.trim() !== '' ? d : manualDob.value
})

// ─── Form Fields ───────────────────────────────────────────────────────────────
const selectedOccupation = ref('')
const annualIncome = ref('')    // ตัวเลขล้วน ไม่มีลูกน้ำ
const displayIncome = ref('')   // ค่าที่แสดงใน input (มีลูกน้ำ)

// ─── Computed: อายุจากวันเกิด ─────────────────────────────────────────────────
const age = computed((): number | null => {
  if (!effectiveDob.value) return null
  const birthDate = new Date(effectiveDob.value)
  if (isNaN(birthDate.getTime())) return null
  const today = new Date()
  let years = today.getFullYear() - birthDate.getFullYear()
  const hasBirthdayPassed =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate())
  if (!hasBirthdayPassed) years -= 1
  return years
})

// ─── Computed: รายได้เป็น number ──────────────────────────────────────────────
const incomeNumber = computed(() => {
  if (!annualIncome.value) return null
  const num = parseInt(annualIncome.value, 10)
  return isNaN(num) ? null : num
})

// ─── Computed: ฟอร์มพร้อมส่งหรือยัง ──────────────────────────────────────────
const formReady = computed(() =>
  effectiveDob.value !== '' &&
  selectedOccupation.value.trim() !== '' &&
  incomeNumber.value !== null
)

// ─── Handlers: income input ───────────────────────────────────────────────────
function handleIncomeInput(e: Event) {
  const input = e.target as HTMLInputElement
  const digitsOnly = input.value.replace(/[^0-9]/g, '')
  annualIncome.value = digitsOnly
  const formatted = digitsOnly ? Number(digitsOnly).toLocaleString('th-TH') : ''
  displayIncome.value = formatted
  input.value = formatted
}
function handleIncomeFocus() {}
function handleIncomeBlur() {
  if (!annualIncome.value) return
  const num = parseInt(annualIncome.value, 10)
  if (!isNaN(num)) displayIncome.value = num.toLocaleString('th-TH')
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function formatThaiDate(dateStr: string): string {
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return dateStr
  const thaiMonths = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
    'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
    'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
  ]
  const day = date.getDate()
  const month = thaiMonths[date.getMonth()]
  const year = date.getFullYear() + 543
  return `${day} ${month} ${year}`
}

// ─── Handler: กดปุ่ม "ตรวจสอบสิทธิ์" ────────────────────────────────────────
// เกณฑ์หลัก 2 ข้อ: อายุ >= 18 ปี, รายได้ <= 100,000 บาท/ปี
async function handleSubmit() {
  if (!formReady.value || isSubmitting.value) return

  const ageVal    = age.value ?? 0
  const income    = incomeNumber.value ?? 0
  const ageOk     = ageVal >= 18
  const incomeOk  = income <= 100000
  const passed    = ageOk && incomeOk

  // สร้าง failure_reason_code จากเกณฑ์ที่ไม่ผ่าน
  const failCodes: string[] = []
  if (!ageOk)    failCodes.push('AGE_UNDER_18')
  if (!incomeOk) failCodes.push('INCOME_OVER_100000')
  const failureReasonCode = failCodes.length > 0 ? failCodes.join(',') : null

  const u = authStore.user
  const personId = isThaiDUser(u) ? u.person_id : 0

  isSubmitting.value = true
  submitError.value  = ''
  try {
    // บันทึกผลการคัดกรองลงฐานข้อมูล พร้อม user_agent เพื่อระบุอุปกรณ์ของผู้ใช้
    await welfareApi.createScreeningLog({
      person_id:           personId,
      criteria_version:    '1.0',
      screening_status:    passed,
      failure_reason_code: failureReasonCode,
      input_data_snapshot: {
        birthdate:     effectiveDob.value,
        age:           ageVal,
        occupation:    selectedOccupation.value.trim(),
        annual_income: income,
      },
      user_agent: navigator.userAgent,
      ip_address:  null, // frontend ไม่สามารถระบุ IP จริงได้ — backend ตรวจจากต้นทาง request
    })

    // บันทึกลง store เพื่อ pre-fill Step2
    app.setCheckSelf({
      occupation:   selectedOccupation.value.trim(),
      annualIncome: income,
      dob:          effectiveDob.value,
      eligible:     passed,
      checkedAt:    new Date().toISOString(),
    })

    screeningPassed.value = passed
    currentView.value = 'result'
  } catch {
    submitError.value = 'เกิดข้อผิดพลาดในการบันทึก กรุณาลองใหม่อีกครั้ง'
  } finally {
    isSubmitting.value = false
  }
}

// ─── Handler: ดำเนินการต่อหลังผ่านเกณฑ์ ──────────────────────────────────────
function handleProceed() {
  router.push({ name: 'submit-request' })
}

// ─── Handler: ย้อนกลับ ────────────────────────────────────────────────────────
function handleBack() {
  if (currentView.value === 'result' && !arrivedDirectlyAtResult.value) {
    // กรอก form แล้วได้ผล → กดกลับควรไปที่ form
    currentView.value = 'form'
  } else {
    // มาโดยตรงจาก select-service หรืออยู่ที่ form → กลับหน้าก่อนหน้า
    router.back()
  }
}

function handleContactStaff() {
  window.open('tel:1300')
}
</script>

<template>
  <!--
    Layout หลัก: fixed app bar + scrollable content + fixed footer
    - min-h-dvh รองรับ browser bar บนมือถือ
    - flex flex-col เพื่อให้ content ขยายเต็มพื้นที่
  -->
  <div class="min-h-dvh flex flex-col bg-[#F8FAFC]">

    <!-- ══════════════════════════════════════════════════════════
         App Bar: fixed ด้านบน — เปลี่ยน title ตาม view
         fixed top-0 left-0 right-0 = ติดบนสุดเหมือนหน้า PDPA
         ══════════════════════════════════════════════════════════ -->
    <header class="fixed top-0 left-0 right-0 z-50 h-14 bg-[#1A56DB] text-white shadow-md"
            style="padding-top: env(safe-area-inset-top)">
      <div class="relative mx-auto w-full max-w-md flex items-center px-4 h-full">

        <!-- ปุ่มย้อนกลับ: แสดงเฉพาะ form view เท่านั้น -->
        <button
          v-if="currentView === 'form'"
          @click="handleBack"
          class="flex items-center justify-center w-9 h-9 rounded-full hover:bg-white/20 active:bg-white/30 transition-colors flex-shrink-0"
          aria-label="ย้อนกลับ"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <!-- ชื่อหน้า -->
        <h1 class="absolute inset-x-0 text-center text-white text-[16px] font-semibold pointer-events-none">
          {{ currentView === 'form' ? 'ตรวจสอบสิทธิ์เบื้องต้น' : 'ผลการตรวจสอบสิทธิ์' }}
        </h1>
      </div>
    </header>

    <!-- ══════════════════════════════════════════════════════════
         FORM VIEW: แบบฟอร์มกรอกข้อมูล
         ══════════════════════════════════════════════════════════ -->
    <!-- pt-14 ชดเชยความสูง fixed header, pb-32 ชดเชย fixed footer -->
    <main v-if="currentView === 'form'" class="flex-1 flex flex-col mx-auto w-full max-w-md px-4 pt-[calc(3.5rem+1.25rem)] pb-32">

      <!-- ทักทายผู้ใช้ -->
      <div class="mb-4">
        <p class="text-[15px] text-slate-700">
          สวัสดี,
          <span class="font-semibold text-slate-900">{{ authUser?.title }}{{ authUser?.fname }} {{ authUser?.lname }}</span>
        </p>
      </div>

      <!-- Banner แจ้งเกณฑ์ที่จะตรวจสอบ -->
      <div class="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5">
        <svg class="w-5 h-5 text-blue-500 flex-shrink-0 mt-[1px]" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clip-rule="evenodd" />
        </svg>
        <p class="text-[13px] text-blue-700 leading-relaxed">
          ระบบจะตรวจสอบเกณฑ์: อายุ อาชีพ และรายได้
        </p>
      </div>

      <!-- ─── Card: ข้อมูลอายุ (อ่านจาก auth — read-only) ─────────────────── -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-4">
        <p class="text-[12px] font-medium text-slate-400 uppercase tracking-wider mb-3">ข้อมูลส่วนตัว</p>

        <!-- วันเกิด: read-only ถ้า ThaiID ส่งมา / date picker ถ้าไม่มีข้อมูล -->
        <div class="mb-3">
          <label class="block text-[13px] text-slate-500 mb-1">วันเกิด</label>

          <!-- ThaiID ส่ง dob มา → แสดงแบบ read-only พร้อมไอคอนล็อค -->
          <template v-if="dobFromThaiD">
            <div class="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
              <span class="text-[15px] text-slate-700">{{ formatThaiDate(effectiveDob) }}</span>
              <!-- ไอคอนล็อค แสดงว่าแก้ไขไม่ได้ -->
              <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
          </template>

          <!-- ThaiID ไม่ส่ง dob → ให้ผู้ใช้กรอกเอง -->
          <template v-else>
            <input
              id="dob"
              v-model="manualDob"
              type="date"
              :max="new Date().toISOString().slice(0, 10)"
              class="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-[15px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
            />
            <p class="text-[12px] text-slate-400 mt-1 px-1">ThaiID ไม่ส่งข้อมูลวันเกิดมา — กรุณากรอกวันเกิดของท่าน</p>
          </template>
        </div>

        <!-- อายุที่คำนวณได้ -->
        <div>
          <label class="block text-[13px] text-slate-500 mb-1">อายุ</label>
          <div class="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            <span class="text-[15px] font-medium" :class="age !== null ? 'text-slate-900' : 'text-slate-400'">
              {{ age !== null ? `${age} ปี` : '—' }}
            </span>
          </div>
        </div>
      </div>

      <!-- ─── Card: อาชีพ ──────────────────────────────────────────────────── -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-4">
        <p class="text-[12px] font-medium text-slate-400 uppercase tracking-wider mb-3">ข้อมูลอาชีพ</p>

        <!-- ช่องพิมพ์อาชีพ: freetext แทน dropdown -->
        <div>
          <label for="occupation" class="block text-[13px] text-slate-600 mb-1.5 font-medium">
            อาชีพปัจจุบัน <span class="text-red-500">*</span>
          </label>
          <input
            id="occupation"
            v-model="selectedOccupation"
            type="text"
            placeholder="เช่น เกษตรกร, รับจ้างทั่วไป, ค้าขาย"
            class="w-full bg-white border rounded-xl px-4 py-3 text-[15px] text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
            :class="selectedOccupation ? 'border-slate-300' : 'border-slate-200'"
          />
        </div>
      </div>

      <!-- ─── Card: รายได้ ─────────────────────────────────────────────────── -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-4">
        <p class="text-[12px] font-medium text-slate-400 uppercase tracking-wider mb-3">ข้อมูลรายได้</p>

        <div>
          <label for="income" class="block text-[13px] text-slate-600 mb-1.5 font-medium">
            รายได้รวมต่อปี (บาท) <span class="text-red-500">*</span>
          </label>
          <div class="relative">
            <input
              id="income"
              :value="displayIncome"
              @input="handleIncomeInput"
              @focus="handleIncomeFocus"
              @blur="handleIncomeBlur"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              placeholder="0"
              class="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 pr-16 text-[15px] text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
            />
            <span class="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[13px] text-slate-400">
              บาท/ปี
            </span>
          </div>
        </div>
      </div>

      <!-- Error message จาก API -->
      <p v-if="submitError" class="text-[13px] text-red-500 text-center mb-4">{{ submitError }}</p>

    </main>

    <!-- ══════════════════════════════════════════════════════════
         RESULT VIEW: แสดงผลการตรวจสอบ (ผ่าน / ไม่ผ่าน เท่านั้น)
         ══════════════════════════════════════════════════════════ -->
    <main v-else class="flex-1 flex flex-col mx-auto w-full max-w-md px-4 pt-[calc(3.5rem+2rem)] pb-32">

      <!-- ─── ผ่านเกณฑ์ ──────────────────────────────────────────────────── -->
      <template v-if="screeningPassed === true">
        <div class="flex justify-center mb-5">
          <div class="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
            <svg class="w-10 h-10 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <h2 class="text-center text-[22px] font-bold text-green-700 mb-2">ผ่านเกณฑ์เบื้องต้น</h2>
        <p class="text-center text-[14px] text-slate-500 leading-relaxed px-4">
          ท่านผ่านการตรวจสอบคุณสมบัติเบื้องต้นแล้ว<br>สามารถยื่นคำขอรับความช่วยเหลือได้
        </p>
      </template>

      <!-- ─── ไม่ผ่านเกณฑ์ ───────────────────────────────────────────────── -->
      <template v-else>
        <div class="flex justify-center mb-5">
          <div class="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
            <svg class="w-10 h-10 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <h2 class="text-center text-[22px] font-bold text-red-600 mb-2">ไม่ผ่านเกณฑ์การพิจารณา</h2>
        <p class="text-center text-[14px] text-slate-500 mb-6">
          ท่านไม่ผ่านเกณฑ์คุณสมบัติขั้นต้น
        </p>

        <!-- Card แนะนำทางเลือก -->
        <div class="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-4">
          <div class="flex items-center gap-2 mb-3">
            <svg class="w-4 h-4 text-amber-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
            </svg>
            <p class="text-[13px] font-semibold text-amber-800">ท่านยังสามารถ...</p>
          </div>
          <ul class="space-y-2">
            <li class="flex items-start gap-2">
              <span class="text-amber-600 font-bold leading-[1.6] flex-shrink-0">•</span>
              <span class="text-[13px] text-amber-800 leading-relaxed">
                ติดต่อเจ้าหน้าที่ที่ <strong>พม. จังหวัด</strong> ใกล้บ้านท่านโดยตรง
              </span>
            </li>
            <li class="flex items-start gap-2">
              <span class="text-amber-600 font-bold leading-[1.6] flex-shrink-0">•</span>
              <span class="text-[13px] text-amber-800 leading-relaxed">
                โทรสายด่วน <strong>1300</strong> เพื่อรับคำปรึกษา
              </span>
            </li>
            <li class="flex items-start gap-2">
              <span class="text-amber-600 font-bold leading-[1.6] flex-shrink-0">•</span>
              <span class="text-[13px] text-amber-800 leading-relaxed">
                เยี่ยมชมเว็บไซต์ พม. เพื่อดูโครงการช่วยเหลืออื่นๆ
              </span>
            </li>
          </ul>
        </div>
      </template>

    </main>

    <!-- ══════════════════════════════════════════════════════════
         Footer Fixed: ปุ่ม action ด้านล่าง
         ══════════════════════════════════════════════════════════ -->
    <footer
      class="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]"
      style="padding-bottom: max(env(safe-area-inset-bottom), 16px)"
    >
      <div class="mx-auto w-full max-w-md px-4 pt-3 pb-1">

        <!-- Footer: Form View -->
        <template v-if="currentView === 'form'">
          <button
            @click="handleSubmit"
            :disabled="!formReady || isSubmitting"
            class="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-[16px] font-semibold transition-all duration-150 active:scale-[0.98]"
            :class="formReady && !isSubmitting
              ? 'bg-[#1A56DB] text-white shadow-md shadow-blue-200 hover:bg-[#1648C4]'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed'"
          >
            <svg v-if="isSubmitting" class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <template v-else>
              ตรวจสอบสิทธิ์
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </template>
          </button>
        </template>

        <!-- Footer: Result View — ผ่านเกณฑ์ -->
        <template v-else-if="screeningPassed === true">
          <button
            @click="handleProceed"
            class="w-full flex items-center justify-center gap-2 bg-[#1A56DB] text-white rounded-2xl py-3.5 text-[16px] font-semibold shadow-md shadow-blue-200 hover:bg-[#1648C4] transition-all duration-150 active:scale-[0.98]"
          >
            ดำเนินการต่อ
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </button>
        </template>

        <!-- Footer: Result View — ไม่ผ่านเกณฑ์ -->
        <template v-else>
          <div class="flex flex-col gap-2.5">
            <button
              @click="handleContactStaff"
              class="w-full flex items-center justify-center gap-2 border-2 border-[#1A56DB] text-[#1A56DB] bg-white rounded-2xl py-3.5 text-[16px] font-semibold transition-all duration-150 hover:bg-blue-50 active:scale-[0.98]"
            >
              ติดต่อเจ้าหน้าที่
            </button>
            <button
              @click="router.push({ name: 'login' })"
              class="w-full flex items-center justify-center gap-2 border-2 border-slate-200 text-slate-600 bg-white rounded-2xl py-3.5 text-[16px] font-semibold transition-all duration-150 hover:bg-slate-50 active:scale-[0.98]"
            >
              กลับหน้าหลัก
            </button>
          </div>
        </template>

      </div>
    </footer>

  </div>
</template>
