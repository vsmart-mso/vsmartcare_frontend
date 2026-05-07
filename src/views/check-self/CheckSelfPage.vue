<script setup lang="ts">
// นำเข้า ref, computed, onMounted จาก Vue
import { ref, computed, onMounted } from 'vue'
// นำเข้า useRouter สำหรับเปลี่ยนหน้า
import { useRouter } from 'vue-router'
// นำเข้า auth store เพื่อดึงข้อมูลผู้ใช้จริงที่ login ด้วย ThaiID
import { useAuthStore } from '@/stores/auth'
import type { ThaiDUser } from '@/types/auth'
import { useApplicationStore } from '@/stores/application'

const router = useRouter()
const authStore = useAuthStore()
const app = useApplicationStore()

// ─── Type Guard: แยก ThaiDUser ออกจาก DGAUser ────────────────────────────────
// AuthUser อาจเป็น ThaiDUser (มีชื่อ-นามสกุล) หรือ DGAUser (มีแค่ใบหน้า)
// ต้อง narrow type ก่อนนำไปใช้เพื่อความปลอดภัย
function isThaiDUser(u: unknown): u is ThaiDUser {
  return u != null && typeof (u as ThaiDUser).fname === 'string'
}

// ─── Auth User ─────────────────────────────────────────────────────────────────
// ดึง user จาก store และ narrow type ให้เป็น ThaiDUser
const authUser = computed((): ThaiDUser | null => {
  const u = authStore.user
  return isThaiDUser(u) ? u : null
})

// ─── Guard: redirect ถ้ายังไม่ได้ login หรือ login ด้วยวิธีอื่นที่ไม่ใช่ ThaiID ─
onMounted(() => {
  if (!authStore.isAuthenticated || !authUser.value) {
    router.replace({ name: 'login' })
  }
})

// ─── View State ────────────────────────────────────────────────────────────────
// currentView ควบคุมว่าจะแสดง 'form' (แบบฟอร์ม) หรือ 'result' (ผลลัพธ์)
const currentView = ref<'form' | 'result'>('form')

// เก็บเหตุผลที่ไม่ผ่านเกณฑ์ (อาจมีหลายข้อ)
const failReasons = ref<string[]>([])

// ─── DOB: MeResponse (/v1/me) ไม่มีฟิลด์ birthdate ────────────────────────────
// ThaiID.dob จะเป็น '' เสมอในระบบนี้ → ให้ผู้ใช้กรอกเองถ้าว่าง
// ตรวจว่า ThaiID ส่ง dob มาจริงหรือเปล่า
const dobFromThaiD = computed(() => {
  const d = authUser.value?.dob
  return !!(d && d.trim() !== '')
})

// วันเกิดที่ผู้ใช้กรอกเองเมื่อ ThaiID ไม่ส่งมา (format: YYYY-MM-DD จาก input[type=date])
const manualDob = ref('')

// dob ที่ใช้จริง: ใช้จาก ThaiID ถ้ามีข้อมูล มิฉะนั้นใช้ที่ผู้ใช้กรอกเอง
const effectiveDob = computed(() => {
  const d = authUser.value?.dob
  return d && d.trim() !== '' ? d : manualDob.value
})

// ─── Form Fields ───────────────────────────────────────────────────────────────
// อาชีพที่เลือก (เริ่มต้นว่างเปล่า)
const selectedOccupation = ref('')
// อาชีพอื่นๆ (แสดงเมื่อเลือก "อื่น ๆ")
const otherOccupation = ref('')
// เก็บตัวเลขล้วน (ไม่มีลูกน้ำ) — ใช้สำหรับคำนวณ
const annualIncome = ref('')
// ค่าที่แสดงใน input — จะมีลูกน้ำหลังจากผู้ใช้ออกจาก input (blur)
const displayIncome = ref('')

// รายการอาชีพ 10 ตัวเลือก + อื่นๆ
const occupationOptions = [
  'ราชการ / รัฐวิสาหกิจ',
  'พนักงานบริษัทเอกชน',
  'ค้าขาย / ธุรกิจส่วนตัว',
  'เกษตรกร',
  'รับจ้างทั่วไป',
  'ประมง',
  'นักเรียน / นักศึกษา',
  'แม่บ้าน / พ่อบ้าน',
  'ไม่มีอาชีพ / ว่างงาน',
  'ผู้สูงอายุ / เกษียณแล้ว',
  'อื่น ๆ',
]

// ─── Computed: คำนวณอายุจากวันเกิด ───────────────────────────────────────────
// คืน null ถ้าไม่มีวันเกิดหรือรูปแบบวันที่ไม่ถูกต้อง
const age = computed((): number | null => {
  if (!effectiveDob.value) return null
  const birthDate = new Date(effectiveDob.value)
  if (isNaN(birthDate.getTime())) return null
  const today = new Date()
  let years = today.getFullYear() - birthDate.getFullYear()
  // ตรวจว่ายังไม่ถึงวันเกิดในปีนี้หรือเปล่า ถ้าใช่ ลบ 1 ปี
  const hasBirthdayPassed =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate())
  if (!hasBirthdayPassed) years -= 1
  return years
})

// ─── Computed: ผ่านเกณฑ์อายุหรือไม่ ─────────────────────────────────────────
// null = ยังไม่ทราบ (รอผู้ใช้กรอกวันเกิด), true = ผ่าน, false = ไม่ผ่าน
const agePass = computed((): boolean | null => {
  if (age.value === null) return null
  return age.value >= 18
})

// ─── Computed: ตรวจสอบว่าเลือกอาชีพแล้ว (และถ้าเลือก "อื่น ๆ" ต้องกรอกด้วย) ─
const occupationValid = computed(() => {
  if (!selectedOccupation.value) return false
  if (selectedOccupation.value === 'อื่น ๆ' && !otherOccupation.value.trim()) return false
  return true
})

// ─── Handler: รับเฉพาะตัวเลข 0-9 เท่านั้น ────────────────────────────────────
// ใช้ @input แทน v-model เพื่อกรองทันทีก่อน Vue จะ bind ค่า
function handleIncomeInput(e: Event) {
  const input = e.target as HTMLInputElement
  // ลบทุกอย่างที่ไม่ใช่ตัวเลข 0-9 (รวมถึงลูกน้ำที่อาจติดมา)
  const digitsOnly = input.value.replace(/[^0-9]/g, '')
  annualIncome.value = digitsOnly
  displayIncome.value = digitsOnly
  input.value = digitsOnly
}

// ─── Handler: เอาลูกน้ำออกเมื่อ focus เพื่อให้แก้ไขตัวเลขได้ง่าย ─────────────
function handleIncomeFocus(e: Event) {
  const input = e.target as HTMLInputElement
  // แสดงตัวเลขล้วนขณะแก้ไข
  input.value = annualIncome.value
  displayIncome.value = annualIncome.value
}

// ─── Handler: ใส่ลูกน้ำเมื่อผู้ใช้ออกจาก input (blur) ──────────────────────
function handleIncomeBlur() {
  if (!annualIncome.value) return
  const num = parseInt(annualIncome.value, 10)
  if (!isNaN(num)) {
    // เช่น 100000 → "100,000"
    displayIncome.value = num.toLocaleString('th-TH')
  }
}

// ─── Computed: แปลง string รายได้เป็น number ─────────────────────────────────
const incomeNumber = computed(() => {
  if (!annualIncome.value) return null
  const num = parseInt(annualIncome.value, 10)
  return isNaN(num) ? null : num
})

// ─── Computed: ผ่านเกณฑ์รายได้หรือไม่ (ต้องไม่เกิน 100,000 บาท/ปี) ───────────
const incomePass = computed(() => {
  if (incomeNumber.value === null) return null // ยังไม่ได้กรอก
  return incomeNumber.value <= 100000
})

// ─── Computed: ผ่านเกณฑ์เบื้องต้นทุกข้อหรือไม่ ──────────────────────────────
// ใช้ === true เพื่อป้องกัน null ถูกแปลงเป็น truthy โดยไม่ตั้งใจ
const basicEligible = computed(() => {
  return agePass.value === true && occupationValid.value && incomePass.value === true
})

// ─── Computed: ฟอร์มพร้อมส่งหรือยัง ──────────────────────────────────────────
// ต้องกรอกทุกช่อง (รวมวันเกิด) จึงจะส่งได้
const formReady = computed(() => {
  return (
    effectiveDob.value !== '' &&
    occupationValid.value &&
    incomeNumber.value !== null
  )
})

// ─── Helper: จัดรูปแบบตัวเลขมี comma ─────────────────────────────────────────
// เช่น 100000 → "100,000"
function formatNumber(n: number): string {
  return n.toLocaleString('th-TH')
}

// ─── Helper: แปลงวันเกิดเป็นภาษาไทย พ.ศ. ─────────────────────────────────────
function formatThaiDate(dateStr: string): string {
  const date = new Date(dateStr)
  // guard ถ้าวันที่ไม่ valid ให้คืน string เดิมกลับไป
  if (isNaN(date.getTime())) return dateStr
  // ชื่อเดือนภาษาไทย (index 0 = มกราคม)
  const thaiMonths = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
    'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
    'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
  ]
  const day = date.getDate()
  const month = thaiMonths[date.getMonth()]
  // แปลงปี ค.ศ. เป็น พ.ศ. โดยบวก 543
  const year = date.getFullYear() + 543
  return `${day} ${month} ${year}`
}

// ─── Handler: เมื่อกดปุ่มตรวจสอบสิทธิ์ ──────────────────────────────────────
function handleSubmit() {
  const reasons: string[] = []

  // ใช้ === false เพื่อแยกจาก null (ยังไม่ทราบ) ออกจาก false (ไม่ผ่าน)
  if (agePass.value === false) {
    reasons.push(`อายุ ${age.value} ปี — ต้องมีอายุ 18 ปีขึ้นไป`)
  }
  if (incomePass.value === false && incomeNumber.value !== null) {
    reasons.push(`รายได้ ${formatNumber(incomeNumber.value)} บาท/ปี — ต้องไม่เกิน 100,000 บาท/ปี`)
  }
  // TODO: เกณฑ์ที่ 4 — ตรวจสอบประวัติใน MSO Logbook และ พม.Smart (รอ API)

  failReasons.value = reasons
  currentView.value = 'result'
}

// ─── Handler: กดปุ่มถัดไปหลังผ่านเกณฑ์ ──────────────────────────────────────
function handleProceed() {
  // บันทึกข้อมูลการตรวจสิทธิ์ลง store — ใช้ pre-fill Step2 และส่ง API ใน Step5
  const occupationValue = selectedOccupation.value === 'อื่น ๆ'
    ? otherOccupation.value.trim()
    : selectedOccupation.value
  app.setCheckSelf({
    occupation:   occupationValue,
    annualIncome: incomeNumber.value ?? 0,
    dob:          effectiveDob.value,
    eligible:     true,
    checkedAt:    new Date().toISOString(),
  })
  // ผ่านเกณฑ์เบื้องต้น → ไปยื่นคำขอรับความช่วยเหลือ
  router.push({ name: 'submit-request' })
}

// ─── Handler: กลับหน้าก่อนหน้า ───────────────────────────────────────────────
function handleBack() {
  if (currentView.value === 'result') {
    // กลับไปหน้าฟอร์ม
    currentView.value = 'form'
  } else {
    // กลับไปหน้า PDPA
    router.push({ name: 'pdpa' })
  }
}

// ─── Handler: กดปุ่มติดต่อเจ้าหน้าที่ ───────────────────────────────────────
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

        <!-- ชื่อหน้า — absolute center เหมือน PDPA เพื่อให้อยู่กลางจอเสมอ -->
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
        <!-- ไอคอน info -->
        <svg class="w-5 h-5 text-blue-500 flex-shrink-0 mt-[1px]" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clip-rule="evenodd" />
        </svg>
        <p class="text-[13px] text-blue-700 leading-relaxed">
          ระบบจะตรวจสอบเกณฑ์: <strong>อายุ</strong>, <strong>อาชีพ</strong> และ <strong>รายได้</strong>
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
          <div class="flex items-center justify-between bg-slate-50 border rounded-xl px-4 py-3"
               :class="{
                 'border-[#BE185D]/30': agePass === true,
                 'border-red-300': agePass === false,
                 'border-slate-200': agePass === null,
               }">
            <span class="text-[15px] font-medium"
                  :class="{
                    'text-slate-900': agePass === true,
                    'text-red-600': agePass === false,
                    'text-slate-400': agePass === null,
                  }">
              {{ age !== null ? `${age} ปี` : '—' }}
            </span>
            <!-- แสดงผลผ่าน/ไม่ผ่าน/รอข้อมูล -->
            <div class="flex items-center gap-1.5">
              <template v-if="agePass === true">
                <!-- ผ่าน: checkmark สีชมพู -->
                <svg class="w-4 h-4 text-[#BE185D]" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
                </svg>
                <span class="text-[13px] text-[#BE185D] font-medium">ผ่านเกณฑ์</span>
              </template>
              <template v-else-if="agePass === false">
                <!-- ไม่ผ่าน: X สีแดง -->
                <svg class="w-4 h-4 text-red-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd" />
                </svg>
                <span class="text-[13px] text-red-500 font-medium">ไม่ผ่านเกณฑ์</span>
              </template>
              <!-- agePass === null: รอผู้ใช้กรอกวันเกิด ไม่แสดงอะไร -->
            </div>
          </div>
          <!-- ข้อความอธิบายเกณฑ์ -->
          <p v-if="agePass === false" class="text-[12px] text-red-500 mt-1 px-1">
            ต้องมีอายุ 18 ปีขึ้นไปเท่านั้น
          </p>
        </div>
      </div>

      <!-- ─── Card: อาชีพ ──────────────────────────────────────────────────── -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-4">
        <p class="text-[12px] font-medium text-slate-400 uppercase tracking-wider mb-3">ข้อมูลอาชีพ</p>

        <!-- Dropdown เลือกอาชีพ -->
        <div class="mb-3">
          <label for="occupation" class="block text-[13px] text-slate-600 mb-1.5 font-medium">
            อาชีพปัจจุบัน <span class="text-red-500">*</span>
          </label>
          <div class="relative">
            <select
              id="occupation"
              v-model="selectedOccupation"
              class="w-full appearance-none bg-white border rounded-xl px-4 py-3 text-[15px] text-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30"
              :class="selectedOccupation ? 'border-slate-300' : 'border-slate-200'"
            >
              <option value="" disabled>— กรุณาเลือกอาชีพ —</option>
              <option v-for="opt in occupationOptions" :key="opt" :value="opt">
                {{ opt }}
              </option>
            </select>
            <!-- ไอคอนลูกศรลง custom (แทน default arrow ของ browser) -->
            <div class="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
              <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>

        <!-- ช่องกรอกอาชีพอื่นๆ (แสดงเฉพาะเมื่อเลือก "อื่น ๆ") -->
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          enter-from-class="opacity-0 -translate-y-1"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition-all duration-150 ease-in"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 -translate-y-1"
        >
          <div v-if="selectedOccupation === 'อื่น ๆ'">
            <label for="other-occupation" class="block text-[13px] text-slate-600 mb-1.5 font-medium">
              ระบุอาชีพ <span class="text-red-500">*</span>
            </label>
            <input
              id="other-occupation"
              v-model="otherOccupation"
              type="text"
              placeholder="กรุณาระบุอาชีพของท่าน"
              class="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
            />
          </div>
        </Transition>
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
              class="w-full bg-white border rounded-xl px-4 py-3 pr-16 text-[15px] text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2"
              :class="{
                'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]': incomePass === null,
                'border-[#BE185D]/30 focus:ring-[#BE185D]/20': incomePass === true,
                'border-red-300 focus:ring-red-200': incomePass === false,
              }"
            />
            <!-- หน่วย "บาท/ปี" ด้านขวา -->
            <span class="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[13px] text-slate-400">
              บาท/ปี
            </span>
          </div>

          <!-- ข้อความ validation แสดงผลแบบ real-time -->
          <Transition
            enter-active-class="transition-all duration-200 ease-out"
            enter-from-class="opacity-0 -translate-y-1"
            enter-to-class="opacity-100 translate-y-0"
          >
            <div v-if="incomeNumber !== null" class="mt-2 flex items-center gap-1.5 px-1">
              <!-- ผ่านเกณฑ์รายได้ -->
              <template v-if="incomePass === true">
                <svg class="w-4 h-4 text-[#BE185D] flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
                </svg>
                <span class="text-[13px] text-[#BE185D]">
                  รายได้ {{ formatNumber(incomeNumber!) }} บาท/ปี ผ่านเกณฑ์
                </span>
              </template>
              <!-- ไม่ผ่านเกณฑ์รายได้ -->
              <template v-else-if="incomePass === false">
                <svg class="w-4 h-4 text-red-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd" />
                </svg>
                <span class="text-[13px] text-red-500">
                  รายได้เกิน 100,000 บาท/ปี — ไม่ผ่านเกณฑ์
                </span>
              </template>
            </div>
          </Transition>
        </div>

        <!-- เส้นคั่น + ข้อความเกณฑ์ -->
        <div class="mt-4 pt-4 border-t border-slate-100">
          <p class="text-[12px] text-slate-400 leading-relaxed">
            เกณฑ์: รายได้รวมทุกแหล่งไม่เกิน <span class="font-medium text-slate-500">100,000 บาท</span> ต่อปี
          </p>
        </div>
      </div>

      <!-- TODO: เมื่อ API พร้อม ให้เรียก MSO Logbook + พม.Smart ตรงนี้ใน handleSubmit -->

      <!-- Banner สรุปผล (แสดงเมื่อกรอกครบ) -->
      <Transition
        enter-active-class="transition-all duration-300 ease-out"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
      >
        <div
          v-if="formReady"
          class="flex items-center gap-3 rounded-xl p-4 mb-4 border"
          :class="basicEligible
            ? 'bg-green-50 border-green-200'
            : 'bg-red-50 border-red-200'"
        >
          <!-- ผ่าน -->
          <template v-if="basicEligible">
            <svg class="w-5 h-5 text-green-600 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
            </svg>
            <p class="text-[13px] font-semibold text-green-700">ผ่านเกณฑ์เบื้องต้น สามารถยื่นคำขอได้</p>
          </template>
          <!-- ไม่ผ่าน -->
          <template v-else>
            <svg class="w-5 h-5 text-red-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd" />
            </svg>
            <p class="text-[13px] font-semibold text-red-600">ไม่ผ่านเกณฑ์เบื้องต้น</p>
          </template>
        </div>
      </Transition>

    </main>

    <!-- ══════════════════════════════════════════════════════════
         RESULT VIEW: แสดงผลการตรวจสอบ
         ══════════════════════════════════════════════════════════ -->
    <main v-else class="flex-1 flex flex-col mx-auto w-full max-w-md px-4 pt-[calc(3.5rem+2rem)] pb-32">

      <!-- ─── ผ่านเกณฑ์ ──────────────────────────────────────────────────── -->
      <template v-if="failReasons.length === 0">

        <!-- ไอคอน checkmark วงกลมสีเขียว -->
        <div class="flex justify-center mb-5">
          <div class="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
            <svg class="w-10 h-10 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        <h2 class="text-center text-[22px] font-bold text-green-700 mb-2">ผ่านเกณฑ์เบื้องต้น</h2>
        <p class="text-center text-[14px] text-slate-500 mb-6 leading-relaxed px-4">
          ท่านผ่านการตรวจสอบคุณสมบัติเบื้องต้นแล้ว<br>สามารถยื่นคำขอรับความช่วยเหลือได้
        </p>

        <!-- สรุปผลเกณฑ์ -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-4">
          <p class="text-[12px] font-medium text-slate-400 uppercase tracking-wider mb-3">สรุปผลการตรวจสอบ</p>
          <div class="space-y-3">
            <!-- แถวอายุ -->
            <div class="flex items-center justify-between">
              <span class="text-[14px] text-slate-600">อายุ</span>
              <div class="flex items-center gap-1.5">
                <svg class="w-4 h-4 text-green-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
                </svg>
                <span class="text-[13px] text-green-600 font-medium">{{ age !== null ? age : '?' }} ปี — ผ่าน</span>
              </div>
            </div>
            <!-- แถวอาชีพ -->
            <div class="flex items-center justify-between">
              <span class="text-[14px] text-slate-600">อาชีพ</span>
              <div class="flex items-center gap-1.5">
                <svg class="w-4 h-4 text-green-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
                </svg>
                <span class="text-[13px] text-green-600 font-medium">ผ่าน</span>
              </div>
            </div>
            <!-- แถวรายได้ -->
            <div class="flex items-center justify-between">
              <span class="text-[14px] text-slate-600">รายได้</span>
              <div class="flex items-center gap-1.5">
                <svg class="w-4 h-4 text-green-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
                </svg>
                <span class="text-[13px] text-green-600 font-medium">{{ incomeNumber !== null ? formatNumber(incomeNumber) : '' }} บาท/ปี — ผ่าน</span>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- ─── ไม่ผ่านเกณฑ์ ───────────────────────────────────────────────── -->
      <template v-else>

        <!-- ไอคอน X วงกลมสีแดง -->
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

        <!-- Card เหตุผล — header icon + เส้นคั่น + รายการเหตุผล -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm mb-4 overflow-hidden">
          <!-- Header ของ card -->
          <div class="flex items-center gap-2 px-5 py-3.5">
            <svg class="w-[18px] h-[18px] text-red-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd" />
            </svg>
            <p class="text-[14px] font-semibold text-slate-800">เหตุผล</p>
          </div>
          <!-- เส้นคั่น -->
          <div class="h-px bg-slate-100" />
          <!-- รายการเหตุผล -->
          <ul class="px-5 py-4 space-y-2">
            <li
              v-for="(reason, i) in failReasons"
              :key="i"
              class="text-[13px] text-slate-600 leading-relaxed"
            >
              {{ reason }}
            </li>
          </ul>
        </div>

        <!-- Card แนะนำทางเลือก (สีเหลือง) — bullet point แบบในรูป -->
        <div class="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-4">
          <!-- Header มี lightbulb icon -->
          <div class="flex items-center gap-2 mb-3">
            <svg class="w-4 h-4 text-amber-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
            </svg>
            <p class="text-[13px] font-semibold text-amber-800">ท่านยังสามารถ...</p>
          </div>
          <!-- รายการ bullet -->
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

        <!-- Footer สำหรับ Form View -->
        <template v-if="currentView === 'form'">
          <button
            @click="handleSubmit"
            :disabled="!formReady"
            class="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-[16px] font-semibold transition-all duration-150 active:scale-[0.98]"
            :class="formReady
              ? 'bg-[#1A56DB] text-white shadow-md shadow-blue-200 hover:bg-[#1648C4]'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed'"
          >
            ตรวจสอบสิทธิ์
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </button>
        </template>

        <!-- Footer สำหรับ Result View — ผ่านเกณฑ์ -->
        <template v-else-if="failReasons.length === 0">
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

        <!-- Footer สำหรับ Result View — ไม่ผ่านเกณฑ์ (ปุ่มเรียงแนวตั้ง) -->
        <template v-else>
          <div class="flex flex-col gap-2.5">
            <!-- ปุ่มติดต่อเจ้าหน้าที่ (outline สีน้ำเงิน) -->
            <button
              @click="handleContactStaff"
              class="w-full flex items-center justify-center gap-2 border-2 border-[#1A56DB] text-[#1A56DB] bg-white rounded-2xl py-3.5 text-[16px] font-semibold transition-all duration-150 hover:bg-blue-50 active:scale-[0.98]"
            >
              ติดต่อเจ้าหน้าที่
            </button>
            <!-- ปุ่มกลับหน้าหลัก (outline สีเทา) -->
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
