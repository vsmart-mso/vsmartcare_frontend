<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import type { ThaiDUser } from '@/types/auth'
import { useApplicationStore } from '@/stores/application'
import { welfareApi } from '@/api/welfare'
import Skeleton from '@/components/ui/Skeleton.vue'

const router = useRouter()
const authStore = useAuthStore()
const app = useApplicationStore()

// isChecking = true ระหว่างเช็คว่าผู้ใช้เคยผ่านสิทธิ์แล้วหรือยัง (ใน onMounted)
// ถ้าเคยผ่าน → เด้งไปหน้ากรอกฟอร์มเลย; ระหว่างนี้โชว์ skeleton กันฟอร์มกระพริบ
const isChecking = ref(true)

// ─── Type Guard ────────────────────────────────────────────────────────────────
function isThaiDUser(u: unknown): u is ThaiDUser {
  return u != null && typeof (u as ThaiDUser).fname === 'string'
}

// ─── Auth User ─────────────────────────────────────────────────────────────────
const authUser = computed((): ThaiDUser | null => {
  const u = authStore.user
  return isThaiDUser(u) ? u : null
})

onMounted(async () => {
  if (!authStore.isAuthenticated || !authUser.value) {
    router.replace({ name: 'login' })
    return   // ค้าง skeleton ไว้จนกว่าจะ redirect เสร็จ — ไม่โชว์ฟอร์ม
  }
  // ถ้าผ่านการตรวจสอบสิทธิ์แล้ว → ไม่ต้องทำซ้ำ ไปหน้ากรอกฟอร์มโดยตรง
  const personId = authUser.value.person_id
  if (personId) {
    try {
      const passed = await welfareApi.getLatestPassedScreening(personId)
      if (passed) {
        router.replace({ name: 'submit-request' })
        return   // กำลัง redirect — ค้าง skeleton ไว้ ไม่ต้องโชว์ฟอร์ม
      }
    } catch {
      // API ล้มเหลว → ปล่อยให้เข้าหน้าปกติ
    }
  }
  // ไม่ต้อง redirect → ปิด skeleton แสดงฟอร์มตรวจสิทธิ์ให้ผู้ใช้กรอก
  isChecking.value = false
})

// ─── State ─────────────────────────────────────────────────────────────────────
const isSubmitting = ref(false)
// submitError = ข้อความ error จาก API, failedEligibility = ไม่ผ่านเกณฑ์
const submitError       = ref('')
const failedEligibility = ref(false)

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

// ─── Validate: อาชีพ — รับเฉพาะตัวอักษรไทย/อังกฤษ และช่องว่าง ────────────────
// ห้ามตัวเลขและอักขระพิเศษทุกชนิด
const occupationError = computed(() => {
  const val = selectedOccupation.value.trim()
  if (!val) return ''
  return /[^ก-๙฀-๿a-zA-Z\s]/.test(val)
    ? 'กรอกได้เฉพาะตัวอักษรไทยหรืออังกฤษเท่านั้น'
    : ''
})

function handleOccupationInput(e: Event) {
  const input = e.target as HTMLInputElement
  // กรองออกทันทีขณะพิมพ์ — ไม่ให้ตัวเลข/อักขระพิเศษโผล่ในช่อง
  const filtered = input.value.replace(/[^ก-๙฀-๿a-zA-Z\s]/g, '')
  selectedOccupation.value = filtered
  input.value = filtered
}

// ─── Computed: ฟอร์มพร้อมส่งหรือยัง ──────────────────────────────────────────
const formReady = computed(() =>
  effectiveDob.value !== '' &&
  selectedOccupation.value.trim() !== '' &&
  occupationError.value === '' &&
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
// ถ้าผ่าน → ไปหน้ากรอกฟอร์มทันที
// ถ้าไม่ผ่าน → แสดง error message ในหน้าเดิม ไม่ไปต่อ
async function handleSubmit() {
  if (!formReady.value || isSubmitting.value) return

  const ageVal   = age.value ?? 0
  const income   = incomeNumber.value ?? 0
  const ageOk    = ageVal >= 18
  const incomeOk = income <= 100000
  const passed   = ageOk && incomeOk

  const failCodes: string[] = []
  if (!ageOk)    failCodes.push('AGE_UNDER_18')
  if (!incomeOk) failCodes.push('INCOME_OVER_100000')
  const failureReasonCode = failCodes.length > 0 ? failCodes.join(',') : null

  const u = authStore.user
  const personId = isThaiDUser(u) ? u.person_id : 0

  isSubmitting.value      = true
  submitError.value       = ''
  failedEligibility.value = false
  try {
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
      ip_address:  null,
    })

    app.setCheckSelf({
      occupation:   selectedOccupation.value.trim(),
      annualIncome: income,
      dob:          effectiveDob.value,
      eligible:     passed,
      checkedAt:    new Date().toISOString(),
    })

    if (passed) {
      // ผ่านเกณฑ์ → ไปหน้ากรอกฟอร์มทันที
      router.push({ name: 'submit-request' })
    } else {
      // ไม่ผ่านเกณฑ์ → แสดง error ในหน้าเดิม ไม่ไปต่อ
      failedEligibility.value = true
    }
  } catch {
    submitError.value = 'เกิดข้อผิดพลาดในการบันทึก กรุณาลองใหม่อีกครั้ง'
  } finally {
    isSubmitting.value = false
  }
}

// ─── Handler: ย้อนกลับ ────────────────────────────────────────────────────────
function handleBack() {
  router.back()
}
</script>

<template>
  <div class="min-h-dvh flex flex-col bg-[#F8FAFC]">

    <!-- ══════════════════════════════════════════════════════════
         App Bar
         ══════════════════════════════════════════════════════════ -->
    <header class="fixed top-0 left-0 right-0 z-50 h-14 bg-[#1A56DB] text-white shadow-md"
            style="padding-top: env(safe-area-inset-top)">
      <div class="relative mx-auto w-full max-w-md flex items-center px-4 h-full">

        <!-- ปุ่มย้อนกลับ -->
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
          ตรวจสอบสิทธิ์เบื้องต้น
        </h1>
      </div>
    </header>

    <!-- ══════════════════════════════════════════════════════════
         Main Content
         ══════════════════════════════════════════════════════════ -->
    <main class="flex-1 flex flex-col mx-auto w-full max-w-md px-4 pt-[calc(3.5rem+1.25rem)] pb-32">

      <!-- Loading guard: โครงหน้าจอจำลองระหว่างเช็คว่าเคยผ่านสิทธิ์แล้วหรือยัง -->
      <div v-if="isChecking" class="space-y-4" role="status" aria-label="กำลังตรวจสอบ">
        <Skeleton width="55%" height="0.95rem" />
        <Skeleton width="100%" height="3.5rem" rounded="rounded-xl" />
        <div
          v-for="c in 2"
          :key="c"
          class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3"
        >
          <Skeleton width="35%" height="0.7rem" />
          <Skeleton width="100%" height="3rem" rounded="rounded-xl" />
          <Skeleton width="100%" height="3rem" rounded="rounded-xl" />
        </div>
        <span class="sr-only">กำลังตรวจสอบข้อมูล กรุณารอสักครู่...</span>
      </div>

      <!-- เนื้อหาจริง — แสดงเมื่อเช็คเสร็จและไม่ต้อง redirect -->
      <template v-else>

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

      <!-- ─── Card: ข้อมูลอายุ ─────────────────────────────────────────────── -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-4">
        <p class="text-[12px] font-medium text-slate-400 uppercase tracking-wider mb-3">ข้อมูลส่วนตัว</p>

        <!-- วันเกิด: read-only ถ้า ThaiID ส่งมา / date picker ถ้าไม่มีข้อมูล -->
        <div class="mb-3">
          <label class="block text-[13px] text-slate-500 mb-1">วันเกิด</label>

          <template v-if="dobFromThaiD">
            <div class="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
              <span class="text-[15px] text-slate-700">{{ formatThaiDate(effectiveDob) }}</span>
              <!-- ไอคอนล็อค: ข้อมูลจาก ThaiD แก้ไขไม่ได้ -->
              <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
          </template>

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
          <label class="block text-[13px] text-slate-500 mb-1">อายุปัจจุบัน</label>
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

        <div>
          <label for="occupation" class="block text-[13px] text-slate-600 mb-1.5 font-medium">
            อาชีพปัจจุบัน <span class="text-red-500">*</span>
          </label>
          <input
            id="occupation"
            :value="selectedOccupation"
            @input="handleOccupationInput"
            type="text"
            placeholder="เช่น เกษตรกร, รับจ้างทั่วไป, ค้าขาย"
            class="w-full bg-white border rounded-xl px-4 py-3 text-[15px] text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
            :class="occupationError ? 'border-red-300' : selectedOccupation ? 'border-slate-300' : 'border-slate-200'"
          />
          <p v-if="occupationError" class="text-[12px] text-red-500 mt-1 px-1">{{ occupationError }}</p>
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

      <!-- Error: ไม่ผ่านเกณฑ์ → แสดงข้อความ ไม่ไปต่อ -->
      <div
        v-if="failedEligibility"
        class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4"
        role="alert"
      >
        <p class="text-[13px] text-red-700 leading-relaxed">
          ไม่สามารถดำเนินการต่อได้ กรุณาตรวจสอบข้อมูลที่กรอกหรือติดต่อเจ้าหน้าที่
        </p>
      </div>

      <!-- Error: ข้อผิดพลาดจาก API -->
      <p v-if="submitError" class="text-[13px] text-red-500 text-center mb-4">{{ submitError }}</p>

      </template>

    </main>

    <!-- ══════════════════════════════════════════════════════════
         Footer Fixed
         ══════════════════════════════════════════════════════════ -->
    <footer
      class="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]"
      style="padding-bottom: max(env(safe-area-inset-bottom), 16px)"
    >
      <div class="mx-auto w-full max-w-md px-4 pt-3 pb-1">
        <button
          @click="handleSubmit"
          :disabled="!formReady || isSubmitting || isChecking"
          class="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-[16px] font-semibold transition-all duration-150 active:scale-[0.98]"
          :class="formReady && !isSubmitting
            ? 'bg-[#1A56DB] text-white shadow-md shadow-blue-200 hover:bg-[#1648C4]'
            : 'bg-slate-100 text-slate-400 cursor-not-allowed'"
        >
          <!-- ไอคอน loading วนเมื่อกำลังตรวจสอบ -->
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
      </div>
    </footer>

  </div>
</template>
