<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import type { ThaiDUser } from '@/types/auth'
import { useApplicationStore } from '@/stores/application'
import { welfareApi } from '@/api/welfare'
import { lookupsApi, type LookupItem } from '@/api/lookups'
import { useEligibilityStore } from '@/stores/eligibility'
import { estimateAgeFromThaiDBirthdate, formatThaiDBirthdateLabel, normalizeThaiDBirthdateForApp } from '@/utils/birthdate'

const router = useRouter()
const authStore = useAuthStore()
const app = useApplicationStore()
const eligibilityStore = useEligibilityStore()

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
      const eligibility = await eligibilityStore.fetchEligibility(personId)
      if (
        eligibility.reason === 'active_case'
        || eligibility.reason === 'cooldown'
        || !eligibility.can_submit
      ) {
        router.replace({ name: 'case-tracking' })
        return
      }
    } catch {
      // API ล้มเหลว → ปล่อยให้เข้าหน้าปกติ
    }
  }
  // ดึงรายการอาชีพจาก API
  lookupsApi.fetchOccupationTypes().then(data => {
    occupationTypeOptions.value = data
  }).catch(() => {})

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
  if (d && d.trim() !== '') return normalizeThaiDBirthdateForApp(d)
  return manualDob.value
})

// ─── Form Fields ───────────────────────────────────────────────────────────────
const occupationTypeOptions = ref<LookupItem[]>([])
const selectedOccupationTypeId = ref<number | null>(null)
const selectedOccupation = ref('')   // free-text เมื่อเลือก "อื่นๆ" (id=99)
const OCCUPATION_OTHER_ID = 99
const annualIncome = ref('')    // ตัวเลขล้วน ไม่มีลูกน้ำ
const displayIncome = ref('')   // ค่าที่แสดงใน input (มีลูกน้ำ)

// ─── Computed: อายุจากวันเกิด ─────────────────────────────────────────────────
const age = computed((): number | null => estimateAgeFromThaiDBirthdate(effectiveDob.value))

// ─── Computed: รายได้เป็น number ──────────────────────────────────────────────
const incomeNumber = computed(() => {
  if (!annualIncome.value) return null
  const num = parseInt(annualIncome.value, 10)
  return isNaN(num) ? null : num
})

// ─── Computed: ฟอร์มพร้อมส่งหรือยัง ──────────────────────────────────────────
const formReady = computed(() => {
  if (effectiveDob.value === '') return false
  if (selectedOccupationTypeId.value === null) return false
  if (selectedOccupationTypeId.value === OCCUPATION_OTHER_ID && !selectedOccupation.value.trim()) return false
  if (incomeNumber.value === null) return false
  return true
})

// ─── Handlers: income input ───────────────────────────────────────────────────
function handleIncomeInput(e: Event) {
  const input = e.target as HTMLInputElement
  const digitsOnly = input.value.replace(/[^0-9]/g, '').slice(0, 10)
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
  return formatThaiDBirthdateLabel(dateStr)
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
    const occupationLabel = occupationTypeOptions.value.find(o => o.id === selectedOccupationTypeId.value)?.name ?? ''
    const occupationText = selectedOccupationTypeId.value === OCCUPATION_OTHER_ID
      ? selectedOccupation.value.trim()
      : occupationLabel

    await welfareApi.createScreeningLog({
      person_id:           personId,
      criteria_version:    '1.0',
      screening_status:    passed,
      failure_reason_code: failureReasonCode,
      input_data_snapshot: {
        birthdate:     effectiveDob.value,
        age:           ageVal,
        occupation:    occupationText,
        annual_income: income,
      },
      user_agent: navigator.userAgent,
      ip_address:  null,
    })

    app.setCheckSelf({
      occupationTypeId: selectedOccupationTypeId.value,
      occupation:   selectedOccupationTypeId.value === OCCUPATION_OTHER_ID ? selectedOccupation.value.trim() : '',
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
  // กันย้อนกลับระหว่างกำลังบันทึกผลตรวจสิทธิ์ (API ทำงานอยู่)
  if (isSubmitting.value) return
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
          :disabled="isSubmitting"
          class="flex items-center justify-center w-9 h-9 rounded-full hover:bg-white/20 active:bg-white/30 transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          aria-label="ย้อนกลับ"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <h1 class="absolute inset-x-0 text-center text-white text-body font-semibold pointer-events-none">
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
        <p class="text-body text-slate-700">
          สวัสดี,
          <span class="font-semibold text-slate-900">{{ authUser?.title }}{{ authUser?.fname }} {{ authUser?.lname }}</span>
        </p>
      </div>

      <!-- Banner แจ้งเกณฑ์ที่จะตรวจสอบ -->
      <div class="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5">
        <svg class="w-5 h-5 text-blue-500 flex-shrink-0 mt-[1px]" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clip-rule="evenodd" />
        </svg>
        <p class="text-body-xs text-blue-700 leading-relaxed">
          ระบบจะตรวจสอบเกณฑ์: อายุ อาชีพ และรายได้
        </p>
      </div>

      <!-- ─── Card: ข้อมูลอายุ ─────────────────────────────────────────────── -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-4">
        <p class="text-body-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">ข้อมูลส่วนตัว</p>

        <!-- วันเกิด: read-only ถ้า ThaiID ส่งมา / date picker ถ้าไม่มีข้อมูล -->
        <div class="mb-3">
          <label class="block text-body text-slate-500 mb-1">วันเกิด</label>

          <template v-if="dobFromThaiD">
            <div class="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
              <span class="text-body text-slate-700">{{ formatThaiDate(effectiveDob) }}</span>
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
              :disabled="isSubmitting"
              type="date"
              :max="new Date().toISOString().slice(0, 10)"
              class="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-body text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB] disabled:bg-slate-100 disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <p class="text-hint text-slate-400 mt-1 px-1">ThaiID ไม่ส่งข้อมูลวันเกิดมา — กรุณากรอกวันเกิดของท่าน</p>
          </template>
        </div>

        <!-- อายุที่คำนวณได้ -->
        <div>
          <label class="block text-body text-slate-500 mb-1">อายุปัจจุบัน</label>
          <div class="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            <span class="text-body font-medium" :class="age !== null ? 'text-slate-900' : 'text-slate-400'">
              {{ age !== null ? `${age} ปี` : '—' }}
            </span>
          </div>
        </div>
      </div>

      <!-- ─── Card: อาชีพ ──────────────────────────────────────────────────── -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-4">
        <p class="text-body-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">ข้อมูลอาชีพ</p>

        <div>
          <label for="occupation" class="block text-body text-slate-600 mb-1.5 font-medium">
            อาชีพปัจจุบัน <span class="text-red-500">*</span>
          </label>
          <select
            id="occupation"
            v-model="selectedOccupationTypeId"
            :disabled="isSubmitting"
            class="w-full bg-white border rounded-xl px-4 py-3 text-body text-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB] disabled:bg-slate-100 disabled:opacity-60 disabled:cursor-not-allowed appearance-none"
            :class="selectedOccupationTypeId !== null ? 'border-slate-300' : 'border-slate-200'"
          >
            <option :value="null" disabled>-- เลือกอาชีพ --</option>
            <option v-for="opt in occupationTypeOptions" :key="opt.id" :value="opt.id">{{ opt.name }}</option>
          </select>

          <!-- ช่องระบุอาชีพอื่นๆ — แสดงเมื่อเลือก id=99 -->
          <Transition
            enter-active-class="transition-all duration-200 ease-out"
            enter-from-class="opacity-0 -translate-y-1"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition-all duration-150 ease-in"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 -translate-y-1"
          >
            <div v-if="selectedOccupationTypeId === OCCUPATION_OTHER_ID" class="mt-2">
              <input
                v-model="selectedOccupation"
                :disabled="isSubmitting"
                type="text"
                maxlength="255"
                placeholder="ระบุอาชีพ"
                class="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-body text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB] disabled:bg-slate-100 disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
          </Transition>
        </div>
      </div>

      <!-- ─── Card: รายได้ ─────────────────────────────────────────────────── -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-4">
        <p class="text-body-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">ข้อมูลรายได้</p>

        <div>
          <label for="income" class="block text-body text-slate-600 mb-1.5 font-medium">
            รายได้รวมต่อปี (บาท) <span class="text-red-500">*</span>
          </label>
          <div class="relative">
            <input
              id="income"
              :value="displayIncome"
              @input="handleIncomeInput"
              @focus="handleIncomeFocus"
              @blur="handleIncomeBlur"
              :disabled="isSubmitting"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              placeholder="0"
              class="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 pr-16 text-body text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB] disabled:bg-slate-100 disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <span class="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-body-xs text-slate-400">
              บาท/ปี
            </span>
          </div>
        </div>
      </div>

      <!-- Error: ไม่ผ่านเกณฑ์ → แสดงข้อความมาตรฐาน ไม่ไปต่อ -->
      <div
        v-if="failedEligibility"
        class="flex items-start gap-3 bg-red-50 border-2 border-red-300 rounded-2xl px-4 py-4 mb-4 shadow-md shadow-red-100"
        role="alert"
        aria-live="assertive"
      >
        <!-- ไอคอน -->
        <div class="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
          </svg>
        </div>
        <!-- ข้อความทั้งหมดอยู่ด้วยกัน -->
        <div class="flex-1 min-w-0">
          <p class="text-body font-bold text-red-700 leading-snug mb-1">
            คุณสมบัติไม่ตรงตามหลักเกณฑ์เบื้องต้น
          </p>
          <p class="text-body text-red-800 leading-relaxed">
            ระบบไม่สามารถดำเนินการต่อได้
          </p>
        </div>
      </div>

      <!-- Error: ข้อผิดพลาดจาก API -->
      <p v-if="submitError" class="text-body-xs text-red-500 text-center mb-4">{{ submitError }}</p>

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
          class="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-body font-semibold transition-all duration-150 active:scale-[0.98]"
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
