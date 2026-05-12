<script setup lang="ts">
import { ref, computed, reactive, watch, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import type { ThaiDUser } from '@/types/auth'
import { useThaiAddress } from '@/composables/useThaiAddress'
import { useApplicationStore } from '@/stores/application'
import { formatThaiDate } from '@/utils/formatDate'
import { lookupsApi } from '@/api/lookups'

// ─── Auth ─────────────────────────────────────────────────────────────────────
const authStore = useAuthStore()
const app       = useApplicationStore()

// Type guard: ตรวจว่าเป็น ThaiDUser (มีชื่อ-นามสกุล) ไม่ใช่ DGAUser
function isThaiDUser(u: unknown): u is ThaiDUser {
  return u != null && typeof (u as ThaiDUser).fname === 'string'
}

const authUser = computed((): ThaiDUser | null => {
  const u = authStore.user
  return isThaiDUser(u) ? u : null
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

// วันเกิดที่ใช้แสดง: ดึงจาก ThaiID ก่อน ถ้าไม่มีให้ fallback ไปที่ที่กรอกใน CheckSelf
// (CheckSelfPage บันทึก manualDob ไว้ใน app.checkSelf.dob)
const effectiveDob = computed(() => {
  const d = authUser.value?.dob
  if (d && d.trim() !== '') return d
  return app.checkSelf?.dob ?? ''
})

// คำนวณอายุจาก effectiveDob (null ถ้าไม่มีข้อมูล)
const age = computed((): number | null => {
  const dob = effectiveDob.value
  if (!dob || dob.trim() === '') return null
  const birth = new Date(dob)
  if (isNaN(birth.getTime())) return null
  const today = new Date()
  let y = today.getFullYear() - birth.getFullYear()
  const passed =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate())
  if (!passed) y -= 1
  return y
})

// จัดรูปแบบเลขบัตรประชาชน: 1-2345-67890-12-3
function formatPID(pid: string): string {
  if (!pid || pid.length !== 13) return pid
  return `${pid[0]}-${pid.slice(1, 5)}-${pid.slice(5, 10)}-${pid.slice(10, 12)}-${pid[12]}`
}

// แปลงวันเกิดเป็น DD/MM/พ.ศ.

// ─── 1.2 ความเกี่ยวข้อง — ล็อคเป็น "ตนเอง" ──────────────────────────────────
// ในกรณีที่ผู้ใช้ยื่นด้วยตนเอง ค่านี้ต้องเป็น "ตนเอง" เสมอ ไม่สามารถแก้ไขได้
const RELATIONSHIP = 'ตนเอง'

// ─── 2.1 ที่อยู่ปัจจุบัน ──────────────────────────────────────────────────────
// ใช้ useThaiAddress composable สำหรับ cascade dropdown จังหวัด/อำเภอ/ตำบล/ไปรษณีย์
const addr = useThaiAddress()

const houseNo     = ref('')
const mooNum      = ref('')
const villageName = ref('')
const alley       = ref('')
const soi         = ref('')
const road        = ref('')
const gpsLat      = ref('')
const gpsLng      = ref('')

// ─── 2.2 ข้อมูลติดต่อ ─────────────────────────────────────────────────────────
const phone  = ref('')
const fax    = ref('')
const mobile = ref('')
const email  = ref('')

// ─── 3.1 สถานภาพสมรส ─────────────────────────────────────────────────────────
const maritalStatus = ref('')
// ดึงจาก API แทนการ hardcode — ใช้ String(id) เป็น value เพื่อให้ตรงกับ store ที่เก็บ string
const maritalOptions = ref<{ value: string; label: string }[]>([])

// ─── 4.1 ลักษณะที่อยู่อาศัย ───────────────────────────────────────────────────
const housingType = ref('')
// ดึงจาก API แทนการ hardcode
const housingOptions = ref<{ value: string; label: string }[]>([])

// ─── 4.2 ค่าเช่าต่อเดือน ──────────────────────────────────────────────────────
const rentPerMonth  = ref('')   // ตัวเลขล้วน ใช้คำนวณ
const displayRent   = ref('')   // แสดงใน input (มีลูกน้ำหลัง blur)

// ─── 5.1 จำนวนสมาชิกในครอบครัว ───────────────────────────────────────────────
const familyCount = ref('')

// ─── Validation helpers ────────────────────────────────────────────────────────

// โทรศัพท์มือถือไทย: 10 หลัก ขึ้นต้นด้วย 06x / 08x / 09x (ตามหลักสากล NBTC)
function isValidMobile(val: string): boolean {
  return /^0[689]\d{8}$/.test(val.trim())
}

// โทรศัพท์บ้าน/ที่ทำงานไทย: 9 หลัก ขึ้นต้นด้วย 02–07
// - 02xxxxxxx  = กรุงเทพฯ/ปริมณฑล
// - 03x–07x + 6 หลัก = ต่างจังหวัด
function isValidPhone(val: string): boolean {
  return /^0[2-7]\d{7}$/.test(val.trim())
}

// โทรสาร: ใช้รูปแบบเดียวกับโทรศัพท์บ้าน
function isValidFax(val: string): boolean {
  return isValidPhone(val)
}

function isValidEmail(val: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim())
}

// ─── Touched state ─────────────────────────────────────────────────────────────
// แสดง error เฉพาะ field ที่ผู้ใช้เคย interact แล้ว หรือกดถัดไปแล้ว
// หลีกเลี่ยงการแสดง error ทันทีที่เปิดหน้า (ซึ่งทำให้ UX แย่)
const touched = reactive({
  houseNo:       false,
  province:      false,
  district:      false,
  subdistrict:   false,
  phone:         false,
  fax:           false,
  mobile:        false,
  email:         false,
  maritalStatus: false,
  housingType:   false,
  rentPerMonth:  false,
  familyCount:   false,
})

// parent เรียกก่อน handleNext เพื่อ force-show error ทุก field ที่ยังไม่กรอก
function touchAll() {
  (Object.keys(touched) as (keyof typeof touched)[]).forEach(k => {
    touched[k] = true
  })
}

// ─── Computed errors ───────────────────────────────────────────────────────────
// คืน string ข้อความ error (ว่างหมายความว่าไม่มี error)
const errors = computed(() => ({
  houseNo:
    touched.houseNo && !houseNo.value.trim()
      ? 'กรุณากรอกบ้านเลขที่'
      : '',
  province:
    touched.province && !addr.province.value
      ? 'กรุณาเลือกจังหวัด'
      : '',
  district:
    touched.district && !addr.district.value
      ? 'กรุณาเลือกอำเภอ/เขต'
      : '',
  subdistrict:
    touched.subdistrict && !addr.subdistrict.value
      ? 'กรุณาเลือกตำบล/แขวง'
      : '',
  // phone/fax เป็น optional — error เฉพาะเมื่อกรอกแล้วผิดรูปแบบ
  phone:
    touched.phone && phone.value.trim() && !isValidPhone(phone.value)
      ? 'เบอร์บ้าน/ที่ทำงานต้อง 9 หลัก ขึ้นต้นด้วย 02–07 เช่น 021234567'
      : '',
  fax:
    touched.fax && fax.value.trim() && !isValidFax(fax.value)
      ? 'เบอร์โทรสารต้อง 9 หลัก ขึ้นต้นด้วย 02–07 เช่น 021234567'
      : '',
  mobile:
    touched.mobile && !isValidMobile(mobile.value)
      ? 'เบอร์มือถือต้อง 10 หลัก ขึ้นต้นด้วย 06x / 08x / 09x เช่น 0812345678'
      : '',
  // email เป็น optional — error เฉพาะเมื่อกรอกแล้วผิดรูปแบบ
  email:
    touched.email && email.value.trim() && !isValidEmail(email.value)
      ? 'รูปแบบอีเมลไม่ถูกต้อง'
      : '',
  maritalStatus:
    touched.maritalStatus && !maritalStatus.value
      ? 'กรุณาเลือกสถานภาพสมรส'
      : '',
  housingType:
    touched.housingType && !housingType.value
      ? 'กรุณาเลือกลักษณะที่อยู่อาศัย'
      : '',
  rentPerMonth:
    touched.rentPerMonth && housingType.value === 'rent' && !rentPerMonth.value
      ? 'กรุณากรอกค่าเช่าต่อเดือน'
      : '',
  familyCount:
    touched.familyCount && !familyCount.value
      ? 'กรุณากรอกจำนวนสมาชิก'
      : '',
}))

// ─── Handlers ─────────────────────────────────────────────────────────────────
function handleGetGPS() {
  if (!navigator.geolocation) return
  navigator.geolocation.getCurrentPosition(
    pos => {
      gpsLat.value = pos.coords.latitude.toFixed(6)
      gpsLng.value = pos.coords.longitude.toFixed(6)
    },
    () => {},
  )
}

// บ้านเลขที่: รับตัวเลขและ / เท่านั้น (เช่น 123/4)
function handleHouseNoInput(e: Event) {
  const el = e.target as HTMLInputElement
  const filtered = el.value.replace(/[^0-9/]/g, '')
  houseNo.value = filtered
  el.value = filtered
}

// หมู่ที่, โทรศัพท์บ้าน, โทรสาร, มือถือ, จำนวนสมาชิก: รับตัวเลขเท่านั้น
// ใช้ setter callback แทนการส่ง ref โดยตรง เพราะ Vue auto-unwrap refs ใน template
function handleDigitsInput(e: Event, setter: (v: string) => void) {
  const el = e.target as HTMLInputElement
  const digits = el.value.replace(/[^0-9]/g, '')
  setter(digits)
  el.value = digits
}

// ค่าเช่า: รับตัวเลขเท่านั้น + แสดง raw ระหว่างพิมพ์
function handleRentInput(e: Event) {
  const el = e.target as HTMLInputElement
  const digits = el.value.replace(/[^0-9]/g, '')
  rentPerMonth.value = digits
  // ใส่ลูกน้ำขณะพิมพ์เหมือน Step2 เช่น 1000 → "1,000"
  const formatted = digits ? Number(digits).toLocaleString('th-TH') : ''
  displayRent.value = formatted
  el.value = formatted
}

// ค่าเช่า: แค่ mark touched เมื่อ focus (ไม่ตัดลูกน้ำออก)
function handleRentFocus() {
  touched.rentPerMonth = true
}

// ─── isReady: ฟอร์มพร้อมส่งหรือยัง ───────────────────────────────────────────
const isReady = computed(() => {
  const base =
    houseNo.value.trim()    !== '' &&
    addr.province.value     !== '' &&
    addr.district.value     !== '' &&
    addr.subdistrict.value  !== '' &&
    isValidMobile(mobile.value)    &&
    maritalStatus.value     !== '' &&
    housingType.value       !== '' &&
    familyCount.value       !== ''
  if (housingType.value === 'rent') return base && rentPerMonth.value !== ''
  return base
})

// แจ้ง parent ทุกครั้งที่ความพร้อมเปลี่ยน
const emit = defineEmits<{ 'update:ready': [boolean] }>()
watch(isReady, val => emit('update:ready', val), { immediate: true })

// ─── Pre-fill จาก store เมื่อ user ย้อนกลับมาจาก step ถัดไป ─────────────────
onMounted(async () => {
  // ดึง lookup options จาก API พร้อมกัน
  const [maritalData, housingData] = await Promise.all([
    lookupsApi.fetchMaritalStatusTypes().catch(() => []),
    lookupsApi.fetchHousingTypes().catch(() => []),
  ])
  maritalOptions.value = maritalData.map(d => ({ value: String(d.id), label: d.name }))
  housingOptions.value = housingData.map(d => ({ value: String(d.id), label: d.name }))

  const s = app.step1
  if (!s) return
  houseNo.value     = s.address.houseNo
  mooNum.value      = s.address.mooNum
  villageName.value = s.address.villageName
  alley.value       = s.address.alley
  soi.value         = s.address.soi
  road.value        = s.address.road
  gpsLat.value      = s.address.gpsLat
  gpsLng.value      = s.address.gpsLng
  phone.value       = s.contact.phone
  fax.value         = s.contact.fax
  mobile.value      = s.contact.mobile
  email.value       = s.contact.email
  maritalStatus.value = s.maritalStatus
  housingType.value   = s.housingType
  if (s.rentPerMonth) {
    rentPerMonth.value = s.rentPerMonth
    const n = parseInt(s.rentPerMonth, 10)
    displayRent.value = isNaN(n) ? s.rentPerMonth : n.toLocaleString('th-TH')
  }
  familyCount.value = s.familyCount

  // ใช้ restore() จาก useThaiAddress ซึ่ง await API fetch แต่ละระดับจนเสร็จก่อนตั้งค่าถัดไป
  // แก้ปัญหา nextTick() ไม่เพียงพอเพราะ API fetch เป็น async และใช้เวลานานกว่า 1 tick
  await addr.restore(s.address.province, s.address.district, s.address.subdistrict)
})

// expose ให้ parent เรียก touchAll() ก่อน handleNext และ getData() เพื่อรวบรวมข้อมูล
defineExpose({
  touchAll,
  getData: () => ({
    relationship: RELATIONSHIP,
    address: {
      houseNo:     houseNo.value,
      mooNum:      mooNum.value,
      villageName: villageName.value,
      alley:       alley.value,
      soi:         soi.value,
      road:        road.value,
      subdistrict:            addr.subdistrict.value,
      district:               addr.district.value,
      province:               addr.province.value,
      postalCode:             addr.zipcode.value,
      subDistrictPostcodeId:  addr.subDistrictPostcodeId.value,
      gpsLat:      gpsLat.value,
      gpsLng:      gpsLng.value,
    },
    contact: {
      phone:  phone.value,
      fax:    fax.value,
      mobile: mobile.value,
      email:  email.value,
    },
    maritalStatus: maritalStatus.value,
    housingType:   housingType.value,
    rentPerMonth:  rentPerMonth.value,
    familyCount:   familyCount.value,
  }),
})
</script>

<template>
  <div class="space-y-4">

    <!-- Banner: ยืนยันตัวตนผ่าน ThaiD -->
    <div class="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
      <div class="w-9 h-9 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0">
        <svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
      </div>
      <div>
        <p class="text-[13px] font-semibold text-green-800 flex items-center gap-1.5">
          ยืนยันตัวตนผ่าน ThaiD แล้ว
          <svg class="w-4 h-4 text-green-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
          </svg>
        </p>
        <p class="text-[12px] text-green-700 mt-0.5">ข้อมูลตัวตนถูกล็อค ไม่สามารถแก้ไขได้</p>
      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════
         Section 1: ผู้ยื่นคำร้อง
         ════════════════════════════════════════════════════════ -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="flex items-center gap-3 bg-blue-50 px-4 py-3 border-b border-blue-100">
        <div class="w-8 h-8 rounded-full bg-[#1A56DB] flex items-center justify-center flex-shrink-0">
          <span class="text-white text-[13px] font-bold">1</span>
        </div>
        <p class="text-[14px] font-bold text-[#1A56DB]">ผู้ยื่นคำร้อง / ผู้แจ้งแทน / ผู้ยื่นคำขอ</p>
      </div>
      <div class="p-4">

        <!-- 1.1 ข้อมูลจาก ThaiD (read-only) -->
        <div class="flex items-center gap-2 mb-3">
          <span class="bg-blue-100 text-[#1A56DB] text-[11px] font-bold px-2 py-0.5 rounded-md">1.1</span>
          <span class="text-[13px] font-medium text-slate-600">ข้อมูลจาก ThaiD</span>
        </div>

        <!-- ไอคอนล็อค (ใช้ซ้ำในทุก read-only field) -->
        <!-- คำนำหน้า + ชื่อ -->
        <div class="flex gap-3 mb-3">
          <div class="w-[35%]">
            <label class="block text-[12px] text-slate-500 mb-1.5">คำนำหน้าชื่อ</label>
            <div class="flex items-center justify-between bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5">
              <span class="text-[14px] text-slate-700">{{ authUser?.title ?? '—' }}</span>
              <svg class="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
          </div>
          <div class="flex-1">
            <label class="block text-[12px] text-slate-500 mb-1.5">ชื่อ</label>
            <div class="flex items-center justify-between bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5">
              <span class="text-[14px] text-slate-700">{{ authUser?.fname ?? '—' }}</span>
              <svg class="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
          </div>
        </div>

        <!-- นามสกุล -->
        <div class="mb-3">
          <label class="block text-[12px] text-slate-500 mb-1.5">นามสกุล</label>
          <div class="flex items-center justify-between bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5">
            <span class="text-[14px] text-slate-700">{{ authUser?.lname ?? '—' }}</span>
            <svg class="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
        </div>

        <!-- เลขบัตรประชาชน -->
        <div class="mb-3">
          <label class="block text-[12px] text-slate-500 mb-1.5">เลขประจำตัวประชาชน 13 หลัก</label>
          <div class="flex items-center justify-between bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5">
            <span class="text-[14px] text-slate-700 tracking-wide">
              {{ authUser?.pid ? formatPID(authUser.pid) : '—' }}
            </span>
            <svg class="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
        </div>

        <!-- วันเกิด + อายุ -->
        <div class="flex gap-3 mb-3">
          <div class="flex-1">
            <label class="block text-[12px] text-slate-500 mb-1.5">วัน/เดือน/ปีเกิด</label>
            <div class="flex items-center justify-between bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5">
              <span class="text-[14px] text-slate-700">
                {{ formatThaiDate(effectiveDob) }}
              </span>
              <svg class="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
          </div>
          <div class="w-[28%]">
            <label class="block text-[12px] text-slate-500 mb-1.5">อายุ</label>
            <div class="flex items-center justify-between bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5">
              <span class="text-[14px] text-slate-700">{{ age !== null ? `${age} ปี` : '—' }}</span>
              <svg class="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
          </div>
        </div>

        <div class="flex items-start gap-1.5 mb-4">
          <svg class="w-4 h-4 text-[#1A56DB] flex-shrink-0 mt-[1px]" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clip-rule="evenodd" />
          </svg>
          <div>
            <p class="text-[11px] text-[#1A56DB] font-medium">ข้อมูลทั้งหมดดึงจาก ThaiD โดยอัตโนมัติ</p>
            <p class="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              ข้อมูลนี้อ้างอิงจากข้อมูลยืนยันตัวตนจากขั้นตอนคัดกรองเบื้องต้น
            </p>
          </div>
        </div>

        <div class="h-px bg-slate-100 mb-4" />

        <!-- 1.2 ความเกี่ยวข้อง — ล็อคเป็น "ตนเอง" -->
        <div class="flex items-center gap-2 mb-3">
          <span class="bg-blue-100 text-[#1A56DB] text-[11px] font-bold px-2 py-0.5 rounded-md">1.2</span>
          <span class="text-[13px] font-medium text-slate-600">ความเกี่ยวข้อง</span>
        </div>
        <div>
          <label class="block text-[13px] text-slate-600 mb-1.5 font-medium">
            ความสัมพันธ์กับผู้ประสบปัญหา
          </label>
          <!-- ล็อคเป็น "ตนเอง" เสมอ เนื่องจากผู้ใช้ยื่นด้วยตนเองผ่าน ThaiD -->
          <div class="flex items-center justify-between bg-slate-100 border border-slate-200 rounded-xl px-4 py-3">
            <span class="text-[14px] text-slate-700 font-medium">{{ RELATIONSHIP }}</span>
            <svg class="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <p class="text-[11px] text-slate-400 mt-1.5 px-1">
            ระบบล็อคค่านี้เนื่องจากท่านยืนยันตัวตนด้วย ThaiD ของตนเอง
          </p>
        </div>

      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════
         Section 2: ที่อยู่และข้อมูลติดต่อ
         ════════════════════════════════════════════════════════ -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="flex items-center gap-3 bg-blue-50 px-4 py-3 border-b border-blue-100">
        <div class="w-8 h-8 rounded-full bg-[#1A56DB] flex items-center justify-center flex-shrink-0">
          <span class="text-white text-[13px] font-bold">2</span>
        </div>
        <p class="text-[14px] font-bold text-[#1A56DB]">ที่อยู่และข้อมูลติดต่อ</p>
      </div>
      <div class="p-4">

        <!-- 2.1 ที่อยู่ปัจจุบัน -->
        <div class="flex items-center gap-2 mb-3">
          <span class="bg-blue-100 text-[#1A56DB] text-[11px] font-bold px-2 py-0.5 rounded-md">2.1</span>
          <span class="text-[13px] font-medium text-slate-600">ที่อยู่ปัจจุบัน</span>
        </div>

        <!-- บ้านเลขที่ + หมู่ที่ -->
        <div class="flex gap-3 mb-3">
          <div class="flex-1">
            <label class="block text-[12px] text-slate-600 mb-1.5 font-medium">
              บ้านเลขที่ <span class="text-red-500">*</span>
            </label>
            <input
              :value="houseNo"
              @input="handleHouseNoInput"
              @blur="touched.houseNo = true"
              type="text"
              inputmode="numeric"
              placeholder="123/4"
              class="w-full border rounded-xl px-3 py-2.5 text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB] transition-colors"
              :class="errors.houseNo ? 'border-red-300' : 'border-slate-200'"
            />
            <p v-if="errors.houseNo" class="text-[11px] text-red-500 mt-1 px-1">{{ errors.houseNo }}</p>
          </div>
          <div class="w-[33%]">
            <label class="block text-[12px] text-slate-600 mb-1.5 font-medium">หมู่ที่</label>
            <input
              :value="mooNum"
              @input="(e) => handleDigitsInput(e, v => mooNum = v)"
              type="text"
              inputmode="numeric"
              placeholder="5"
              class="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
            />
          </div>
        </div>

        <!-- ชื่อหมู่บ้าน -->
        <div class="mb-3">
          <label class="block text-[12px] text-slate-600 mb-1.5 font-medium">ชื่อหมู่บ้าน</label>
          <input
            v-model="villageName"
            type="text"
            placeholder="บ้านสุขใจ"
            class="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
          />
        </div>

        <!-- ตรอก + ซอย -->
        <div class="flex gap-3 mb-3">
          <div class="flex-1">
            <label class="block text-[12px] text-slate-600 mb-1.5 font-medium">ตรอก</label>
            <input
              v-model="alley"
              type="text"
              class="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
            />
          </div>
          <div class="flex-1">
            <label class="block text-[12px] text-slate-600 mb-1.5 font-medium">ซอย</label>
            <input
              v-model="soi"
              type="text"
              placeholder="สุขสวัสดิ์ 3"
              class="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
            />
          </div>
        </div>

        <!-- ถนน -->
        <div class="mb-3">
          <label class="block text-[12px] text-slate-600 mb-1.5 font-medium">ถนน</label>
          <input
            v-model="road"
            type="text"
            placeholder="พหลโยธิน"
            class="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
          />
        </div>

        <!-- ═══ Cascade Dropdown: จังหวัด → อำเภอ → ตำบล → ไปรษณีย์ ═══ -->

        <!-- Loading state -->
        <div v-if="addr.isLoading.value" class="flex items-center gap-2 py-3 mb-3">
          <div class="w-4 h-4 rounded-full border-2 border-[#1A56DB] border-t-transparent animate-spin" />
          <span class="text-[13px] text-slate-500">กำลังโหลดข้อมูลที่อยู่...</span>
        </div>

        <!-- Error state -->
        <div v-else-if="addr.loadError.value" class="bg-red-50 border border-red-200 rounded-xl p-3 mb-3">
          <p class="text-[12px] text-red-600">ไม่สามารถโหลดข้อมูลที่อยู่ได้ กรุณาลองใหม่อีกครั้ง</p>
        </div>

        <!-- Dropdowns -->
        <template v-else>
          <!-- จังหวัด -->
          <div class="mb-3">
            <label class="block text-[12px] text-slate-600 mb-1.5 font-medium">
              จังหวัด <span class="text-red-500">*</span>
            </label>
            <div class="relative">
              <select
                v-model="addr.province.value"
                @change="touched.province = true"
                @blur="touched.province = true"
                class="w-full appearance-none border rounded-xl px-3 py-2.5 text-[14px] bg-white focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB] transition-colors"
                :class="errors.province ? 'border-red-300' : 'border-slate-200'"
              >
                <option value="">— เลือกจังหวัด —</option>
                <option v-for="p in addr.provinceList.value" :key="p.id" :value="p.name">{{ p.name }}</option>
              </select>
              <div class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            <p v-if="errors.province" class="text-[11px] text-red-500 mt-1 px-1">{{ errors.province }}</p>
          </div>

          <!-- อำเภอ/เขต -->
          <div class="mb-3">
            <label class="block text-[12px] text-slate-600 mb-1.5 font-medium">
              อำเภอ/เขต <span class="text-red-500">*</span>
            </label>
            <div class="relative">
              <select
                v-model="addr.district.value"
                @change="touched.district = true"
                @blur="touched.district = true"
                :disabled="!addr.province.value"
                class="w-full appearance-none border rounded-xl px-3 py-2.5 text-[14px] bg-white focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB] transition-colors disabled:bg-slate-50 disabled:text-slate-400"
                :class="errors.district ? 'border-red-300' : 'border-slate-200'"
              >
                <option value="">{{ addr.province.value ? '— เลือกอำเภอ/เขต —' : '— เลือกจังหวัดก่อน —' }}</option>
                <option v-for="d in addr.districtList.value" :key="d.id" :value="d.name">{{ d.name }}</option>
              </select>
              <div class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            <p v-if="errors.district" class="text-[11px] text-red-500 mt-1 px-1">{{ errors.district }}</p>
          </div>

          <!-- ตำบล/แขวง -->
          <div class="mb-3">
            <label class="block text-[12px] text-slate-600 mb-1.5 font-medium">
              ตำบล/แขวง <span class="text-red-500">*</span>
            </label>
            <div class="relative">
              <select
                v-model="addr.subdistrict.value"
                @change="touched.subdistrict = true"
                @blur="touched.subdistrict = true"
                :disabled="!addr.district.value"
                class="w-full appearance-none border rounded-xl px-3 py-2.5 text-[14px] bg-white focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB] transition-colors disabled:bg-slate-50 disabled:text-slate-400"
                :class="errors.subdistrict ? 'border-red-300' : 'border-slate-200'"
              >
                <option value="">{{ addr.district.value ? '— เลือกตำบล/แขวง —' : '— เลือกอำเภอก่อน —' }}</option>
                <option v-for="s in addr.subdistrictList.value" :key="s.name" :value="s.name">{{ s.name }}</option>
              </select>
              <div class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            <p v-if="errors.subdistrict" class="text-[11px] text-red-500 mt-1 px-1">{{ errors.subdistrict }}</p>
          </div>

          <!-- รหัสไปรษณีย์ — auto-fill จากตำบลที่เลือก (read-only) -->
          <div class="mb-4">
            <label class="block text-[12px] text-slate-600 mb-1.5 font-medium">รหัสไปรษณีย์</label>
            <div class="flex items-center justify-between bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5">
              <span class="text-[14px]" :class="addr.zipcode.value ? 'text-slate-700' : 'text-slate-400'">
                {{ addr.zipcode.value || '— กรอกอัตโนมัติเมื่อเลือกตำบล —' }}
              </span>
              <svg v-if="addr.zipcode.value" class="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
          </div>
        </template>

        <!-- GPS -->
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div class="flex items-center justify-between mb-3">
            <p class="text-[13px] font-medium text-slate-600">พิกัด GPS (ที่อยู่ปัจจุบัน)</p>
            <button
              @click="handleGetGPS"
              type="button"
              class="flex items-center gap-1.5 bg-[#1A56DB] text-white text-[12px] font-semibold px-3 py-1.5 rounded-lg hover:bg-[#1648C4] active:scale-[0.97] transition-all"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.273 1.765 11.842 11.842 0 00.976.544l.062.029.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" clip-rule="evenodd" />
              </svg>
              รับพิกัด GPS
            </button>
          </div>
          <div class="flex gap-3">
            <div class="flex-1">
              <label class="block text-[11px] text-slate-500 mb-1">Latitude</label>
              <input
                v-model="gpsLat"
                type="text"
                placeholder="เช่น 16.8211"
                class="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-[13px] placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
              />
            </div>
            <div class="flex-1">
              <label class="block text-[11px] text-slate-500 mb-1">Longitude</label>
              <input
                v-model="gpsLng"
                type="text"
                placeholder="เช่น 100.2659"
                class="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-[13px] placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
              />
            </div>
          </div>
        </div>

        <div class="h-px bg-slate-100 my-4" />

        <!-- 2.2 ข้อมูลติดต่อ -->
        <div class="flex items-center gap-2 mb-3">
          <span class="bg-blue-100 text-[#1A56DB] text-[11px] font-bold px-2 py-0.5 rounded-md">2.2</span>
          <span class="text-[13px] font-medium text-slate-600">ข้อมูลติดต่อ</span>
        </div>

        <!-- โทรศัพท์ (บ้าน/ที่ทำงาน) — optional, 9 หลัก -->
        <div class="mb-3">
          <label class="block text-[12px] text-slate-600 mb-1.5 font-medium">โทรศัพท์</label>
          <input
            :value="phone"
            @input="(e) => handleDigitsInput(e, v => phone = v)"
            @blur="touched.phone = true"
            type="text"
            inputmode="tel"
            maxlength="9"
            placeholder="เช่น 021234567"
            class="w-full border rounded-xl px-3 py-2.5 text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors"
            :class="errors.phone
              ? 'border-red-300 focus:ring-red-200'
              : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'"
          />
          <p v-if="errors.phone" class="text-[11px] text-red-500 mt-1 px-1">{{ errors.phone }}</p>
        </div>

        <!-- โทรสาร — optional, 9 หลัก -->
        <div class="mb-3">
          <label class="block text-[12px] text-slate-600 mb-1.5 font-medium">โทรสาร</label>
          <input
            :value="fax"
            @input="(e) => handleDigitsInput(e, v => fax = v)"
            @blur="touched.fax = true"
            type="text"
            inputmode="tel"
            maxlength="9"
            placeholder="เช่น 021234567"
            class="w-full border rounded-xl px-3 py-2.5 text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors"
            :class="errors.fax
              ? 'border-red-300 focus:ring-red-200'
              : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'"
          />
          <p v-if="errors.fax" class="text-[11px] text-red-500 mt-1 px-1">{{ errors.fax }}</p>
        </div>

        <!-- โทรศัพท์มือถือ — required, validate format -->
        <div class="mb-3">
          <label class="block text-[12px] text-slate-600 mb-1.5 font-medium">
            โทรศัพท์มือถือ <span class="text-red-500">*</span>
          </label>
          <input
            :value="mobile"
            @input="(e) => handleDigitsInput(e, v => mobile = v)"
            type="text"
            inputmode="tel"
            maxlength="10"
            placeholder="0812345678"
            @blur="touched.mobile = true"
            class="w-full border rounded-xl px-3 py-2.5 text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors"
            :class="errors.mobile
              ? 'border-red-300 focus:ring-red-200'
              : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'"
          />
          <p v-if="errors.mobile" class="text-[11px] text-red-500 mt-1 px-1">{{ errors.mobile }}</p>
        </div>

        <!-- อีเมล — optional, validate format if filled -->
        <div>
          <label class="block text-[12px] text-slate-600 mb-1.5 font-medium">อีเมล</label>
          <input
            v-model="email"
            type="email"
            inputmode="email"
            placeholder="example@email.com"
            @blur="touched.email = true"
            class="w-full border rounded-xl px-3 py-2.5 text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors"
            :class="errors.email
              ? 'border-red-300 focus:ring-red-200'
              : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'"
          />
          <p v-if="errors.email" class="text-[11px] text-red-500 mt-1 px-1">{{ errors.email }}</p>
        </div>

      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════
         Section 3: สถานภาพ
         ════════════════════════════════════════════════════════ -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="flex items-center gap-3 bg-blue-50 px-4 py-3 border-b border-blue-100">
        <div class="w-8 h-8 rounded-full bg-[#1A56DB] flex items-center justify-center flex-shrink-0">
          <span class="text-white text-[13px] font-bold">3</span>
        </div>
        <p class="text-[14px] font-bold text-[#1A56DB]">สถานภาพ</p>
      </div>
      <div class="p-4">
        <div class="flex items-center gap-2 mb-3">
          <span class="bg-blue-100 text-[#1A56DB] text-[11px] font-bold px-2 py-0.5 rounded-md">3.1</span>
          <span class="text-[13px] font-medium text-slate-600">
            สถานภาพสมรส <span class="text-red-500">*</span>
          </span>
        </div>
        <div class="space-y-2">
          <label
            v-for="opt in maritalOptions"
            :key="opt.value"
            @click="touched.maritalStatus = true"
            class="flex items-center gap-3 border rounded-xl px-4 py-3 cursor-pointer transition-all duration-150"
            :class="maritalStatus === opt.value ? 'border-[#1A56DB] bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'"
          >
            <input type="radio" v-model="maritalStatus" :value="opt.value" class="sr-only" />
            <div
              class="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors"
              :class="maritalStatus === opt.value ? 'border-[#1A56DB]' : 'border-slate-300'"
            >
              <div v-if="maritalStatus === opt.value" class="w-2.5 h-2.5 rounded-full bg-[#1A56DB]" />
            </div>
            <span class="text-[14px] transition-colors" :class="maritalStatus === opt.value ? 'text-[#1A56DB] font-medium' : 'text-slate-700'">
              {{ opt.label }}
            </span>
          </label>
        </div>
        <p v-if="errors.maritalStatus" class="text-[11px] text-red-500 mt-2 px-1">{{ errors.maritalStatus }}</p>
      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════
         Section 4: สภาพที่อยู่อาศัย
         ════════════════════════════════════════════════════════ -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="flex items-center gap-3 bg-blue-50 px-4 py-3 border-b border-blue-100">
        <div class="w-8 h-8 rounded-full bg-[#1A56DB] flex items-center justify-center flex-shrink-0">
          <span class="text-white text-[13px] font-bold">4</span>
        </div>
        <p class="text-[14px] font-bold text-[#1A56DB]">สภาพที่อยู่อาศัย</p>
      </div>
      <div class="p-4">
        <div class="flex items-center gap-2 mb-3">
          <span class="bg-blue-100 text-[#1A56DB] text-[11px] font-bold px-2 py-0.5 rounded-md">4.1</span>
          <span class="text-[13px] font-medium text-slate-600">
            ลักษณะที่อยู่อาศัย <span class="text-red-500">*</span>
          </span>
        </div>
        <div class="space-y-2">
          <label
            v-for="opt in housingOptions"
            :key="opt.value"
            @click="touched.housingType = true"
            class="flex items-center gap-3 border rounded-xl px-4 py-3 cursor-pointer transition-all duration-150"
            :class="housingType === opt.value ? 'border-[#1A56DB] bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'"
          >
            <input type="radio" v-model="housingType" :value="opt.value" class="sr-only" />
            <div
              class="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors"
              :class="housingType === opt.value ? 'border-[#1A56DB]' : 'border-slate-300'"
            >
              <div v-if="housingType === opt.value" class="w-2.5 h-2.5 rounded-full bg-[#1A56DB]" />
            </div>
            <span class="text-[14px] transition-colors" :class="housingType === opt.value ? 'text-[#1A56DB] font-medium' : 'text-slate-700'">
              {{ opt.label }}
            </span>
          </label>
        </div>
        <p v-if="errors.housingType" class="text-[11px] text-red-500 mt-2 px-1">{{ errors.housingType }}</p>

        <!-- 4.2 ค่าเช่าต่อเดือน (แสดงเฉพาะเมื่อเลือก "บ้านเช่า") -->
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          enter-from-class="opacity-0 -translate-y-1"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition-all duration-150 ease-in"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 -translate-y-1"
        >
          <div v-if="housingType === 'rent'" class="mt-4 pt-4 border-t border-slate-100">
            <div class="flex items-center gap-2 mb-3">
              <span class="bg-blue-100 text-[#1A56DB] text-[11px] font-bold px-2 py-0.5 rounded-md">4.2</span>
              <span class="text-[13px] font-medium text-slate-600">ค่าเช่าต่อเดือน</span>
            </div>
            <label class="block text-[12px] text-slate-600 mb-1.5 font-medium">
              ค่าเช่าต่อเดือน (บาท) <span class="text-red-500">*</span>
            </label>
            <div class="relative">
              <input
                :value="displayRent"
                @input="handleRentInput"
                @focus="handleRentFocus"
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                placeholder="2,500"
                class="w-full border rounded-xl px-3 py-2.5 pr-20 text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors"
                :class="errors.rentPerMonth
                  ? 'border-red-300 focus:ring-red-200'
                  : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'"
              />
              <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-slate-400">บาท/เดือน</span>
            </div>
            <p v-if="errors.rentPerMonth" class="text-[11px] text-red-500 mt-1 px-1">{{ errors.rentPerMonth }}</p>
          </div>
        </Transition>
      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════
         Section 5: สมาชิกในครอบครัว
         ════════════════════════════════════════════════════════ -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="flex items-center gap-3 bg-blue-50 px-4 py-3 border-b border-blue-100">
        <div class="w-8 h-8 rounded-full bg-[#1A56DB] flex items-center justify-center flex-shrink-0">
          <span class="text-white text-[13px] font-bold">5</span>
        </div>
        <p class="text-[14px] font-bold text-[#1A56DB]">สมาชิกในครอบครัว</p>
      </div>
      <div class="p-4">
        <div class="flex items-center gap-2 mb-3">
          <span class="bg-blue-100 text-[#1A56DB] text-[11px] font-bold px-2 py-0.5 rounded-md">5.1</span>
          <span class="text-[13px] font-medium text-slate-600">จำนวนสมาชิก</span>
        </div>
        <div class="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl p-3 mb-3">
          <svg class="w-4 h-4 text-blue-500 flex-shrink-0 mt-[1px]" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clip-rule="evenodd" />
          </svg>
          <p class="text-[12px] text-blue-700 leading-relaxed">
            สมาชิกในครอบครัว (ไม่รวมผู้ประสบปัญหาทางสังคม และต้องเป็นสมาชิกในครอบครัวเท่านั้น)
          </p>
        </div>
        <div>
          <label class="block text-[12px] text-slate-600 mb-1.5 font-medium">
            จำนวนสมาชิกในครอบครัว (คน) <span class="text-red-500">*</span>
          </label>
          <div class="relative">
            <input
              :value="familyCount"
              @input="(e) => handleDigitsInput(e, v => familyCount = v)"
              @blur="touched.familyCount = true"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              placeholder="0"
              class="w-full border rounded-xl px-3 py-2.5 pr-10 text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors"
              :class="errors.familyCount
                ? 'border-red-300 focus:ring-red-200'
                : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'"
            />
            <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-slate-400">คน</span>
          </div>
          <p v-if="errors.familyCount" class="text-[11px] text-red-500 mt-1 px-1">{{ errors.familyCount }}</p>
        </div>
      </div>
    </div>

  </div>
</template>
