<script setup lang="ts">
import { ref, computed, reactive, watch, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import type { ThaiDUser } from '@/types/auth'
import { useThaiAddress } from '@/composables/useThaiAddress'
import { useApplicationStore } from '@/stores/application'
import type { HouseholdMemberForm } from '@/stores/application'
import { formatThaiDate } from '@/utils/formatDate'
import { lookupsApi } from '@/api/lookups'
import GpsMapPicker from '@/components/GpsMapPicker.vue'
import SearchableSelect from '@/components/SearchableSelect.vue'
import FieldAlert from '@/components/ui/FieldAlert.vue'
import StepFormSkeleton from '../components/StepFormSkeleton.vue'

// ─── สถานะการโหลด ──────────────────────────────────────────────────────────────
// isLoading = true ระหว่างรอ API (ตัวเลือกสมรส/ที่อยู่อาศัย + ข้อมูลที่อยู่)
// ระหว่างนี้จะโชว์ skeleton แทนฟอร์มจริง และ parent จะปิดปุ่ม "ถัดไป"
const isLoading = ref(true)

// ─── filterFields prop ────────────────────────────────────────────────────────
// ถ้าไม่ส่ง → แสดงทุก field (โหมดปกติ)
// ถ้าส่ง → แสดงเฉพาะ field ที่อยู่ใน list (โหมด EditRequestPage)
const props = defineProps<{ filterFields?: string[] }>()
const show = (name: string): boolean => !props.filterFields || props.filterFields.includes(name)

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
const age = computed((): number | null => calcMemberAge(effectiveDob.value ?? ''))

// จัดรูปแบบเลขบัตรประชาชน: 1-2345-67890-12-3
function formatPID(pid: string): string {
  if (!pid || pid.length !== 13) return pid
  return `${pid[0]}-${pid.slice(1, 5)}-${pid.slice(5, 10)}-${pid.slice(10, 12)}-${pid[12]}`
}

// format เลขบัตรแบบ progressive สำหรับ "ระหว่างพิมพ์" — ใส่ - ตามรูปแบบ x-xxxx-xxxxx-xx-x
// รับ digits (ตัวเลขล้วน) คืน string ที่มี - คั่น (ใช้แสดงในช่อง input เท่านั้น ไม่ใช่ค่าที่เก็บ)
function formatPIDInput(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 13)
  const parts: string[] = []
  parts.push(d.slice(0, 1))
  if (d.length > 1)  parts.push(d.slice(1, 5))
  if (d.length > 5)  parts.push(d.slice(5, 10))
  if (d.length > 10) parts.push(d.slice(10, 12))
  if (d.length > 12) parts.push(d.slice(12, 13))
  return parts.filter(p => p).join('-')
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

// หา id ของตัวเลือก "บ้านเช่า" จาก API — ใช้แทน hardcode 'rent'
// เพราะ value จริงคือ String(id) เช่น "3" ไม่ใช่ "rent"
const rentOptionId = computed(() =>
  housingOptions.value.find(o => o.label.includes('เช่า'))?.value ?? '__rent__'
)
const isRentSelected = computed(() => housingType.value === rentOptionId.value)

// เปลี่ยนจากบ้านเช่าเป็นประเภทอื่น → ล้างค่าเช่า (ไม่ต้องกรอก + ไม่ติด dirty-check ค่าเดิม)
watch([housingType, rentOptionId], ([ht, rentId]) => {
  if (ht && ht !== rentId) {
    rentPerMonth.value = ''
    displayRent.value = ''
  }
})

// ─── 4.2 ค่าเช่าต่อเดือน ──────────────────────────────────────────────────────
const rentPerMonth  = ref('')   // ตัวเลขล้วน ใช้คำนวณ
const displayRent   = ref('')   // แสดงใน input (มีลูกน้ำหลัง blur)

// ─── 5. สมาชิกในครัวเรือน (ปสค.๒) ────────────────────────────────────────────
const householdMembers = ref<HouseholdMemberForm[]>([])
const householdMemberCount = ref('0')
const householdMembersTouched = ref(false)

type MemberFieldErrors = {
  prefixId: string
  firstName: string
  lastName: string
  dateOfBirth: string
  nationalId: string
  relationToApplicantId: string
  occupation: string
  monthlyIncome: string
  physicalCondition: string
  selfCare: string
}

const memberDobPartsList = ref<{ day: string; month: string; year: string }[]>([])
const displayIncomeList = ref<string[]>([])
const memberErrorsList = ref<MemberFieldErrors[]>([])
const nationalIdSuccessList = ref<string[]>([])

function _blankMemberErrors(): MemberFieldErrors {
  return {
    prefixId: '', firstName: '', lastName: '', dateOfBirth: '',
    nationalId: '', relationToApplicantId: '', occupation: '',
    monthlyIncome: '', physicalCondition: '', selfCare: '',
  }
}

function formatIncomeDisplay(raw: string): string {
  if (!raw) return ''
  return Number(raw).toLocaleString('th-TH')
}

// ตรวจ checksum เลขบัตรประชาชนไทย 13 หลัก (MOD11 algorithm)
function isValidThaiNationalId(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false
  let sum = 0
  for (let i = 0; i < 12; i++) sum += parseInt(id[i]) * (13 - i)
  return (11 - (sum % 11)) % 10 === parseInt(id[12])
}

function _blankMember(seq: number): HouseholdMemberForm {
  return {
    seq, nationalId: '', prefixId: '', prefixOther: '',
    firstName: '', lastName: '', dateOfBirth: '',
    relationToApplicantId: null, occupation: '', monthlyIncome: '',
    physicalCondition: '', selfCare: null,
  }
}

function ensureMemberAuxState() {
  const n = householdMembers.value.length
  while (memberDobPartsList.value.length < n) {
    memberDobPartsList.value.push({ day: '', month: '', year: '' })
    displayIncomeList.value.push('')
    memberErrorsList.value.push(_blankMemberErrors())
    nationalIdSuccessList.value.push('')
  }
  memberDobPartsList.value.splice(n)
  displayIncomeList.value.splice(n)
  memberErrorsList.value.splice(n)
  nationalIdSuccessList.value.splice(n)
}

function syncMembersToCount() {
  const count = parseInt(householdMemberCount.value, 10) || 0
  const current = householdMembers.value.length
  if (count > current) {
    for (let i = current; i < count; i++) {
      householdMembers.value.push(_blankMember(i + 1))
    }
  } else if (count < current) {
    householdMembers.value.splice(count)
  }
  householdMembers.value.forEach((m, i) => { m.seq = i + 1 })
  ensureMemberAuxState()
}

function handleHouseholdCountInput(e: Event) {
  const el = e.target as HTMLInputElement
  const digits = el.value.replace(/[^0-9]/g, '')
  householdMemberCount.value = digits
  el.value = digits
  syncMembersToCount()
}

function isDuplicateMemberId(val: string, excludeIdx: number): boolean {
  return householdMembers.value.some((m, idx) => idx !== excludeIdx && m.nationalId === val && val !== '')
}

function validateNationalId(val: string, idx: number, fromBlur = false) {
  const errs = memberErrorsList.value[idx]
  if (!errs) return
  nationalIdSuccessList.value[idx] = ''
  if (!val) {
    errs.nationalId = ''
  } else if (val.length === 13) {
    if (!isValidThaiNationalId(val)) {
      errs.nationalId = 'เลขบัตรประชาชนไม่ถูกต้อง (ตรวจสอบอีกครั้ง)'
    } else if (authUser.value?.pid && val === authUser.value.pid) {
      errs.nationalId = 'เลขบัตรนี้ซ้ำกับผู้ประสบปัญหาทางสังคม'
    } else if (isDuplicateMemberId(val, idx)) {
      errs.nationalId = 'เลขบัตรนี้ซ้ำกับสมาชิกคนอื่นในครัวเรือน'
    } else {
      errs.nationalId = ''
      nationalIdSuccessList.value[idx] = 'เลขบัตรประชาชนถูกต้อง'
    }
  } else if (fromBlur) {
    errs.nationalId = `กรอกไม่ครบ (${val.length}/13 หลัก)`
  } else {
    errs.nationalId = ''
  }
}

function handleNationalIdBlur(idx: number) {
  const m = householdMembers.value[idx]
  if (m) validateNationalId(m.nationalId, idx, true)
}

// คำนวณอายุจากวันเกิด (YYYY-MM-DD) → number | null — ใช้ร่วมกันทั้ง main applicant และ household member
function calcMemberAge(dob: string): number | null {
  if (!dob) return null
  const birth = new Date(dob)
  if (isNaN(birth.getTime())) return null
  const today = new Date()
  let y = today.getFullYear() - birth.getFullYear()
  const passed = today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate())
  if (!passed) y -= 1
  return y < 0 ? 0 : y
}

// ── Thai date picker helpers ────────────────────────────────────────────────
const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']

const dobYearOptions = computed(() => {
  const currentBE = new Date().getFullYear() + 543
  const result: number[] = []
  for (let y = currentBE; y >= currentBE - 120; y--) result.push(y)
  return result
})

function dobDayOptionsFor(idx: number): number {
  const parts = memberDobPartsList.value[idx]
  if (!parts) return 31
  const m = Number(parts.month)
  if (!m) return 31
  const ceYear = parts.year ? Number(parts.year) - 543 : 2000
  return new Date(ceYear, m, 0).getDate()
}

function syncDobPartsFromMember(idx: number) {
  const dob = householdMembers.value[idx]?.dateOfBirth
  const parts = memberDobPartsList.value[idx]
  if (!parts) return
  if (!dob) {
    parts.day = ''; parts.month = ''; parts.year = ''
    return
  }
  const d = new Date(dob)
  if (isNaN(d.getTime())) return
  parts.day   = String(d.getDate())
  parts.month = String(d.getMonth() + 1)
  parts.year  = String(d.getFullYear() + 543)
}

function handleDobPartChange(idx: number) {
  const parts = memberDobPartsList.value[idx]
  const m = householdMembers.value[idx]
  if (!parts || !m) return
  if (parts.month) {
    const monthNum = Number(parts.month)
    const ceYear = parts.year ? Number(parts.year) - 543 : 2000
    const maxDay = new Date(ceYear, monthNum, 0).getDate()
    if (Number(parts.day) > maxDay) parts.day = ''
  }
  const { day, month, year } = parts
  if (!day || !month || !year) {
    m.dateOfBirth = ''
    return
  }
  const ceYear = Number(year) - 543
  const iso = `${String(ceYear).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const dt = new Date(iso)
  if (isNaN(dt.getTime())) return
  m.dateOfBirth = iso
}

function handleMemberDigitsInput(e: Event, idx: number, field: 'nationalId') {
  const el = e.target as HTMLInputElement
  const digits = el.value.replace(/[^0-9]/g, '').slice(0, 13)
  const m = householdMembers.value[idx]
  if (m) m[field] = digits
  el.value = formatPIDInput(digits)
  validateNationalId(digits, idx)
}

function handleMemberNameInput(e: Event, idx: number, field: 'firstName' | 'lastName') {
  const el = e.target as HTMLInputElement
  const filtered = el.value.replace(/[^ก-๛a-zA-Z\s\-]/g, '')
  const m = householdMembers.value[idx]
  if (m) m[field] = filtered
  el.value = filtered
}

function handleMemberIncomeInput(e: Event, idx: number) {
  const el = e.target as HTMLInputElement
  const digits = el.value.replace(/[^0-9]/g, '').slice(0, 10)
  const m = householdMembers.value[idx]
  if (m) m.monthlyIncome = digits
  const formatted = digits ? Number(digits).toLocaleString('th-TH') : ''
  displayIncomeList.value[idx] = formatted
  el.value = formatted
}

function validateMemberAtIndex(idx: number): boolean {
  const m = householdMembers.value[idx]
  const errs = memberErrorsList.value[idx]
  if (!m || !errs) return false

  errs.prefixId = m.prefixId ? '' : 'กรุณาเลือกคำนำหน้า'
  errs.firstName = m.firstName.trim() ? '' : 'กรุณากรอกชื่อ'
  errs.lastName = m.lastName.trim() ? '' : 'กรุณากรอกนามสกุล'
  errs.relationToApplicantId = m.relationToApplicantId !== null ? '' : 'กรุณาเลือกความสัมพันธ์'
  errs.occupation = m.occupation.trim() ? '' : 'กรุณากรอกอาชีพ'
  errs.physicalCondition = m.physicalCondition ? '' : 'กรุณาเลือกสภาพทางร่างกาย'
  errs.selfCare = m.selfCare !== null ? '' : 'กรุณาเลือกการช่วยเหลือตนเอง'

  if (!m.dateOfBirth) {
    errs.dateOfBirth = 'กรุณากรอกวันเกิด'
  } else {
    const dob = new Date(m.dateOfBirth)
    if (isNaN(dob.getTime())) {
      errs.dateOfBirth = 'วันเกิดไม่ถูกต้อง'
    } else if (dob > new Date()) {
      errs.dateOfBirth = 'วันเกิดไม่สามารถเป็นวันในอนาคตได้'
    } else {
      errs.dateOfBirth = ''
    }
  }

  validateNationalId(m.nationalId, idx, true)

  if (!m.monthlyIncome) {
    errs.monthlyIncome = 'กรุณากรอกรายได้ต่อเดือน'
  } else if (!/^\d+$/.test(m.monthlyIncome)) {
    errs.monthlyIncome = 'รายได้ต้องเป็นตัวเลขเท่านั้น'
  } else {
    errs.monthlyIncome = ''
  }

  return !Object.values(errs).some(e => e)
}

function isMemberComplete(m: HouseholdMemberForm, idx: number): boolean {
  if (!m.prefixId || !m.firstName.trim() || !m.lastName.trim()) return false
  if (!m.dateOfBirth || m.relationToApplicantId === null) return false
  if (!m.occupation.trim() || !m.physicalCondition || m.selfCare === null) return false
  if (!m.monthlyIncome || !/^\d+$/.test(m.monthlyIncome)) return false
  if (m.nationalId) {
    if (m.nationalId.length !== 13 || !isValidThaiNationalId(m.nationalId)) return false
    if (authUser.value?.pid && m.nationalId === authUser.value.pid) return false
    if (isDuplicateMemberId(m.nationalId, idx)) return false
  }
  const dob = new Date(m.dateOfBirth)
  if (isNaN(dob.getTime()) || dob > new Date()) return false
  return true
}

function isHouseholdSectionValid(): boolean {
  const count = parseInt(householdMemberCount.value, 10) || 0
  if (count === 0) return true
  if (householdMembers.value.length !== count) return false
  return householdMembers.value.every((m, i) => isMemberComplete(m, i))
}

const prefixOptions        = ref<{ value: string; label: string }[]>([])
const relationTypeOptions  = ref<{ value: number; label: string }[]>([])
const physicalConditionOptions = [
  { value: 'normal', label: 'ปกติ' },
  { value: 'disabled', label: 'พิการ' },
  { value: 'chronic_illness', label: 'ป่วยเรื้อรัง' },
]

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
})

// parent เรียกก่อน handleNext เพื่อ force-show error ทุก field ที่ยังไม่กรอก
function touchAll() {
  const fieldNameMap: Record<keyof typeof touched, string> = {
    houseNo:       'current_address_house_no',
    province:      'current_address_province',
    district:      'current_address_district',
    subdistrict:   'current_address_subdistrict',
    phone:         'contact_phone_home',
    fax:           'contact_fax',
    mobile:        'contact_mobile',
    email:         'contact_email',
    maritalStatus: 'marital_status',
    housingType:   'housing_type',
    rentPerMonth:  'housing_rent',
  }
  ;(Object.keys(touched) as (keyof typeof touched)[]).forEach(k => {
    if (!show(fieldNameMap[k])) return
    // ค่าเช่าไม่บังคับเมื่อไม่ได้เลือกบ้านเช่า
    if (k === 'rentPerMonth' && !isRentSelected.value) return
    touched[k] = true
  })
  if (show('household_members') || show('family_members_count')) {
    householdMembersTouched.value = true
    for (let i = 0; i < householdMembers.value.length; i++) {
      validateMemberAtIndex(i)
    }
  }
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
  // email optional — validate format เฉพาะเมื่อมีค่า
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
    touched.rentPerMonth && isRentSelected.value && !rentPerMonth.value
      ? 'กรุณากรอกค่าเช่าต่อเดือน'
      : '',
}))

// ─── Handlers ─────────────────────────────────────────────────────────────────

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
  const formatted = digits ? Number(digits).toLocaleString('th-TH') : ''
  displayRent.value = formatted
  el.value = formatted
}

// ค่าเช่า: แค่ mark touched เมื่อ focus (ไม่ตัดลูกน้ำออก)
function handleRentFocus() {
  touched.rentPerMonth = true
}

// ─── Options สำหรับ SearchableSelect ──────────────────────────────────────────
// แปลงข้อมูลจาก API → { value, label } เพื่อใช้กับ SearchableSelect
const provinceOptions    = computed(() =>
  addr.provinceList.value.map(p => ({ value: p.name, label: p.name }))
)
const districtOptions    = computed(() =>
  addr.districtList.value.map(d => ({ value: d.name, label: d.name }))
)
const subdistrictOptions = computed(() =>
  addr.subdistrictList.value.map(s => ({ value: s.name, label: s.name }))
)

// ─── isReady: ฟอร์มพร้อมส่งหรือยัง ───────────────────────────────────────────
// field ที่ซ่อน (ไม่อยู่ใน filterFields) ถือว่า valid เสมอ
const isReady = computed(() => {
  const showHousehold = show('household_members') || show('family_members_count')

  const base =
    (!show('current_address_house_no')    || houseNo.value.trim()   !== '') &&
    (!show('current_address_province')    || addr.province.value    !== '') &&
    (!show('current_address_district')    || addr.district.value    !== '') &&
    (!show('current_address_subdistrict') || addr.subdistrict.value !== '') &&
    // phone/fax เป็น optional — ว่างได้ แต่ถ้ากรอกแล้วต้องถูก format (ขึ้นต้น 02–07, 9 หลัก)
    // ถ้าไม่เช็คตรงนี้ ปุ่ม "ถัดไป" จะกดได้ทั้งที่ช่องโชว์ error อยู่
    (!show('contact_phone_home')          || !phone.value.trim() || isValidPhone(phone.value)) &&
    (!show('contact_fax')                 || !fax.value.trim()   || isValidFax(fax.value))     &&
    (!show('contact_mobile')              || isValidMobile(mobile.value))   &&
    (!show('contact_email')               || !email.value.trim() || isValidEmail(email.value.trim())) &&
    (!show('marital_status')              || maritalStatus.value    !== '') &&
    (!show('housing_type')                || housingType.value      !== '') &&
    (!showHousehold || isHouseholdSectionValid())
  if (show('housing_rent') && isRentSelected.value) return base && rentPerMonth.value !== ''
  return base
})

// แจ้ง parent ทุกครั้งที่ความพร้อมเปลี่ยน + แจ้งสถานะกำลังโหลด
const emit = defineEmits<{
  'update:ready': [boolean]
  'update:loading': [boolean]
}>()
watch(isReady, val => emit('update:ready', val), { immediate: true })
watch(isLoading, val => emit('update:loading', val), { immediate: true })

// ─── Pre-fill จาก store เมื่อ user ย้อนกลับมาจาก step ถัดไป ─────────────────
onMounted(async () => {
  try {
    // ดึง lookup options จาก API พร้อมกัน
    const [maritalData, housingData, prefixData, relationData] = await Promise.all([
      lookupsApi.fetchMaritalStatusTypes().catch(() => []),
      lookupsApi.fetchHousingTypes().catch(() => []),
      lookupsApi.fetchPrefixTypes().catch(() => []),
      lookupsApi.fetchHouseholdMemberRelationTypes().catch(() => []),
    ])
    maritalOptions.value       = maritalData.map(d => ({ value: String(d.id), label: d.name }))
    housingOptions.value       = housingData.map(d => ({ value: String(d.id), label: d.name }))
    prefixOptions.value        = prefixData.map(d => ({ value: String(d.id), label: d.name }))
    relationTypeOptions.value  = relationData.map(d => ({ value: d.id, label: d.name }))

    // เติมข้อมูลเดิมจาก store เมื่อ user ย้อนกลับมาจาก step ถัดไป
    const s = app.step1
    if (s) {
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
      householdMembers.value = s.householdMembers ?? []
      householdMemberCount.value = String(householdMembers.value.length)
      ensureMemberAuxState()
      householdMembers.value.forEach((m, i) => {
        syncDobPartsFromMember(i)
        displayIncomeList.value[i] = formatIncomeDisplay(m.monthlyIncome)
      })

      // ใช้ restore() จาก useThaiAddress ซึ่ง await API fetch แต่ละระดับจนเสร็จก่อนตั้งค่าถัดไป
      // แก้ปัญหา nextTick() ไม่เพียงพอเพราะ API fetch เป็น async และใช้เวลานานกว่า 1 tick
      await addr.restore(s.address.province, s.address.district, s.address.subdistrict)
    }
  } finally {
    // ปิด skeleton เสมอ — ไม่ว่าจะโหลดสำเร็จหรือเกิดข้อผิดพลาด ผู้ใช้ต้องได้เห็นฟอร์ม
    isLoading.value = false
  }
})

// ─── Review comments map (name → reason) ──────────────────────────────────────
const commentMap = computed(() => {
  const m = new Map<string, string>()
  for (const c of app.reviewComments) m.set(c.name, c.reason)
  return m
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
    isRentHousing: isRentSelected.value,
    rentPerMonth:  isRentSelected.value ? rentPerMonth.value : '',
    householdMembers:  householdMembers.value,
  }),
})
</script>

<template>
  <!-- ระหว่างรอ API: โชว์โครงฟอร์มจำลอง (skeleton) — ผู้ใช้กดอะไรไม่ได้ -->
  <StepFormSkeleton v-if="isLoading" :cards="3" :rows-per-card="4" />

  <div v-else class="space-y-4">

    <!-- Banner: ยืนยันตัวตนผ่าน ThaiD (ซ่อนในโหมด edit-request เพราะไม่มี field ตัวตน) -->
    <div v-if="!props.filterFields" class="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
      <div class="w-9 h-9 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0">
        <svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
      </div>
      <div>
        <p class="text-body-xs font-semibold text-green-800 flex items-center gap-1.5">
          ยืนยันตัวตนผ่าน ThaiD แล้ว
          <svg class="w-4 h-4 text-green-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
          </svg>
        </p>
        <p class="text-hint text-green-700 mt-0.5">ข้อมูลตัวตนถูกล็อค ไม่สามารถแก้ไขได้</p>
      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════
         Section 1: ผู้ยื่นคำร้อง (ข้อมูลจาก ThaiD — ซ่อนในโหมด edit-request)
         ════════════════════════════════════════════════════════ -->
    <div v-if="!props.filterFields" class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="flex items-center gap-3 bg-blue-50 px-4 py-3 border-b border-blue-100">
        <div class="w-8 h-8 rounded-full bg-[#1A56DB] flex items-center justify-center flex-shrink-0">
          <span class="text-white text-body-xs font-bold">1</span>
        </div>
        <p class="text-h2-section font-bold text-[#1A56DB]">ผู้ประสบปัญหาทางสังคม</p>
      </div>
      <div class="p-4">

        <!-- 1.1 ข้อมูลจาก ThaiD (read-only) -->
        <div class="flex items-center gap-2 mb-3">
          <span class="bg-blue-100 text-[#1A56DB] text-micro font-bold px-2 py-0.5 rounded-md">1.1</span>
          <span class="text-h3-legend font-medium text-slate-600">ข้อมูลจาก ThaiD</span>
        </div>

        <!-- ไอคอนล็อค (ใช้ซ้ำในทุก read-only field) -->
        <!-- คำนำหน้า + ชื่อ -->
        <div class="flex gap-3 mb-3">
          <div class="w-[35%]">
            <label class="block text-body text-slate-500 mb-1.5">คำนำหน้าชื่อ</label>
            <div class="flex items-center justify-between bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5">
              <span class="text-body text-slate-700">{{ authUser?.title ?? '—' }}</span>
              <svg class="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
          </div>
          <div class="flex-1">
            <label class="block text-body text-slate-500 mb-1.5">ชื่อ</label>
            <div class="flex items-center justify-between bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5">
              <span class="text-body text-slate-700">{{ authUser?.fname ?? '—' }}</span>
              <svg class="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
          </div>
        </div>

        <!-- นามสกุล -->
        <div class="mb-3">
          <label class="block text-body text-slate-500 mb-1.5">นามสกุล</label>
          <div class="flex items-center justify-between bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5">
            <span class="text-body text-slate-700">{{ authUser?.lname ?? '—' }}</span>
            <svg class="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
        </div>

        <!-- เลขบัตรประชาชน -->
        <div class="mb-3">
          <label class="block text-body text-slate-500 mb-1.5">เลขประจำตัวประชาชน 13 หลัก</label>
          <div class="flex items-center justify-between bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5">
            <span class="text-body text-slate-700 tracking-wide">
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
            <label class="block text-body text-slate-500 mb-1.5">วัน/เดือน/ปีเกิด</label>
            <div class="flex items-center justify-between bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5">
              <span class="text-body text-slate-700">
                {{ formatThaiDate(effectiveDob) }}
              </span>
              <svg class="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
          </div>
          <div class="w-[28%]">
            <label class="block text-body text-slate-500 mb-1.5">อายุ</label>
            <div class="flex items-center justify-between bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5">
              <span class="text-body text-slate-700">{{ age !== null ? `${age} ปี` : '—' }}</span>
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
            <p class="text-micro text-[#1A56DB] font-medium">ข้อมูลทั้งหมดดึงจาก ThaiD โดยอัตโนมัติ</p>
            <p class="text-micro text-slate-400 mt-0.5 leading-relaxed">
              ข้อมูลนี้อ้างอิงจากข้อมูลยืนยันตัวตนจากขั้นตอนคัดกรองเบื้องต้น
            </p>
          </div>
        </div>

        <div class="h-px bg-slate-100 mb-4" />

        <!-- 1.2 ความเกี่ยวข้อง — ซ่อนจาก UI ตามที่ประชุมตกลง แต่ค่า RELATIONSHIP ยังทำงานอยู่ -->
        <div class="hidden">
          <div class="flex items-center gap-2 mb-3">
            <span class="bg-blue-100 text-[#1A56DB] text-micro font-bold px-2 py-0.5 rounded-md">1.2</span>
            <span class="text-h3-legend font-medium text-slate-600">ความเกี่ยวข้อง</span>
          </div>
          <div>
            <label class="block text-body text-slate-600 mb-1.5 font-medium">
              ความสัมพันธ์กับผู้ประสบปัญหา
            </label>
            <!-- ล็อคเป็น "ตนเอง" เสมอ เนื่องจากผู้ใช้ยื่นด้วยตนเองผ่าน ThaiD -->
            <div class="flex items-center justify-between bg-slate-100 border border-slate-200 rounded-xl px-4 py-3">
              <span class="text-body text-slate-700 font-medium">{{ RELATIONSHIP }}</span>
              <svg class="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <p class="text-micro text-slate-400 mt-1.5 px-1">
              ระบบล็อคค่านี้เนื่องจากท่านยืนยันตัวตนด้วย ThaiD ของตนเอง
            </p>
          </div>
        </div>

      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════
         Section 2: ที่อยู่และข้อมูลติดต่อ
         ════════════════════════════════════════════════════════ -->
    <div
      v-if="['current_address_house_no','current_address_moo','current_address_village','current_address_alley','current_address_soi','current_address_road','current_address_province','current_address_district','current_address_subdistrict','current_address_gps','contact_phone_home','contact_fax','contact_mobile','contact_email'].some(f => show(f))"
      class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
    >
      <div class="flex items-center gap-3 bg-blue-50 px-4 py-3 border-b border-blue-100">
        <div class="w-8 h-8 rounded-full bg-[#1A56DB] flex items-center justify-center flex-shrink-0">
          <span class="text-white text-body-xs font-bold">2</span>
        </div>
        <p class="text-h2-section font-bold text-[#1A56DB]">ที่อยู่และข้อมูลติดต่อ</p>
      </div>
      <div class="p-4">

        <!-- 2.1 ที่อยู่ปัจจุบัน -->
        <div
          v-if="['current_address_house_no','current_address_moo','current_address_village','current_address_alley','current_address_soi','current_address_road','current_address_province','current_address_district','current_address_subdistrict','current_address_gps'].some(f => show(f))"
          class="flex items-center gap-2 mb-3"
        >
          <span class="bg-blue-100 text-[#1A56DB] text-micro font-bold px-2 py-0.5 rounded-md">2.1</span>
          <span class="text-h3-legend font-medium text-slate-600">ที่อยู่ปัจจุบัน</span>
        </div>

        <!-- บ้านเลขที่ + หมู่ที่ -->
        <div v-if="show('current_address_house_no') || show('current_address_moo')" class="flex gap-3 mb-3">
          <div v-if="show('current_address_house_no')" class="flex-1">
            <label class="flex items-center gap-1 text-body text-slate-600 mb-1.5 font-medium">
              <span>บ้านเลขที่ <span class="text-red-500">*</span></span>
              <FieldAlert v-if="commentMap.has('current_address_house_no')" :reason="commentMap.get('current_address_house_no')!" />
            </label>
            <input
              :value="houseNo"
              @input="handleHouseNoInput"
              @blur="touched.houseNo = true"
              type="text"
              inputmode="text"
              maxlength="50"
              class="w-full border rounded-xl px-3 py-2.5 text-body placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB] transition-colors"
              :class="errors.houseNo ? 'border-red-300' : 'border-slate-200'"
            />
            <p v-if="errors.houseNo" class="text-micro text-red-500 mt-1 px-1">{{ errors.houseNo }}</p>
          </div>
          <div v-if="show('current_address_moo')" class="w-[33%]">
            <label class="flex items-center gap-1 text-body text-slate-600 mb-1.5 font-medium">
              <span>หมู่ที่</span>
              <FieldAlert v-if="commentMap.has('current_address_moo')" :reason="commentMap.get('current_address_moo')!" />
            </label>
            <input
              :value="mooNum"
              @input="(e) => handleDigitsInput(e, v => mooNum = v)"
              type="text"
              inputmode="numeric"
              maxlength="50"
              class="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-body placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
            />
          </div>
        </div>

        <!-- ชื่อหมู่บ้าน -->
        <div v-if="show('current_address_village')" class="mb-3">
          <label class="flex items-center gap-1 text-body text-slate-600 mb-1.5 font-medium">
            <span>ชื่อหมู่บ้าน</span>
            <FieldAlert v-if="commentMap.has('current_address_village')" :reason="commentMap.get('current_address_village')!" />
          </label>
          <input
            v-model="villageName"
            type="text"
            maxlength="255"
            class="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-body placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
          />
        </div>

        <!-- ตรอก + ซอย -->
        <div v-if="show('current_address_alley') || show('current_address_soi')" class="flex gap-3 mb-3">
          <div v-if="show('current_address_alley')" class="flex-1">
            <label class="flex items-center gap-1 text-body text-slate-600 mb-1.5 font-medium">
              <span>ตรอก</span>
              <FieldAlert v-if="commentMap.has('current_address_alley')" :reason="commentMap.get('current_address_alley')!" />
            </label>
            <input
              v-model="alley"
              type="text"
              maxlength="255"
              class="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-body placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
            />
          </div>
          <div v-if="show('current_address_soi')" class="flex-1">
            <label class="flex items-center gap-1 text-body text-slate-600 mb-1.5 font-medium">
              <span>ซอย</span>
              <FieldAlert v-if="commentMap.has('current_address_soi')" :reason="commentMap.get('current_address_soi')!" />
            </label>
            <input
              v-model="soi"
              type="text"
              maxlength="255"
              class="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-body placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
            />
          </div>
        </div>

        <!-- ถนน -->
        <div v-if="show('current_address_road')" class="mb-3">
          <label class="flex items-center gap-1 text-body text-slate-600 mb-1.5 font-medium">
            <span>ถนน</span>
            <FieldAlert v-if="commentMap.has('current_address_road')" :reason="commentMap.get('current_address_road')!" />
          </label>
          <input
            v-model="road"
            type="text"
            maxlength="255"
            class="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-body placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
          />
        </div>

        <!-- ═══ Cascade Dropdown: จังหวัด → อำเภอ → ตำบล → ไปรษณีย์ ═══ -->

        <!-- Loading state -->
        <div v-if="addr.isLoading.value" class="flex items-center gap-2 py-3 mb-3">
          <div class="w-4 h-4 rounded-full border-2 border-[#1A56DB] border-t-transparent animate-spin" />
          <span class="text-body-xs text-slate-500">กำลังโหลดข้อมูลที่อยู่...</span>
        </div>

        <!-- Error state -->
        <div v-else-if="addr.loadError.value" class="bg-red-50 border border-red-200 rounded-xl p-3 mb-3">
          <p class="text-hint text-red-600">ไม่สามารถโหลดข้อมูลที่อยู่ได้ กรุณาลองใหม่อีกครั้ง</p>
        </div>

        <!-- Dropdowns -->
        <template v-else>
          <!-- จังหวัด -->
          <div v-if="show('current_address_province')" class="mb-3">
            <label class="flex items-center gap-1 text-body text-slate-600 mb-1.5 font-medium">
              <span>จังหวัด <span class="text-red-500">*</span></span>
              <FieldAlert v-if="commentMap.has('current_address_province')" :reason="commentMap.get('current_address_province')!" />
            </label>
            <SearchableSelect
              v-model="addr.province.value"
              :options="provinceOptions"
              placeholder="— เลือกจังหวัด —"
              :has-error="!!errors.province"
              @change="touched.province = true"
              @blur="touched.province = true"
            />
            <p v-if="errors.province" class="text-micro text-red-500 mt-1 px-1">{{ errors.province }}</p>
          </div>

          <!-- อำเภอ/เขต -->
          <div v-if="show('current_address_district')" class="mb-3">
            <label class="flex items-center gap-1 text-body text-slate-600 mb-1.5 font-medium">
              <span>อำเภอ/เขต <span class="text-red-500">*</span></span>
              <FieldAlert v-if="commentMap.has('current_address_district')" :reason="commentMap.get('current_address_district')!" />
            </label>
            <SearchableSelect
              v-model="addr.district.value"
              :options="districtOptions"
              placeholder="— เลือกอำเภอ/เขต —"
              :disabled="!addr.province.value"
              :has-error="!!errors.district"
              @change="touched.district = true"
              @blur="touched.district = true"
            />
            <p v-if="errors.district" class="text-micro text-red-500 mt-1 px-1">{{ errors.district }}</p>
          </div>

          <!-- ตำบล/แขวง -->
          <div v-if="show('current_address_subdistrict')" class="mb-3">
            <label class="flex items-center gap-1 text-body text-slate-600 mb-1.5 font-medium">
              <span>ตำบล/แขวง <span class="text-red-500">*</span></span>
              <FieldAlert v-if="commentMap.has('current_address_subdistrict')" :reason="commentMap.get('current_address_subdistrict')!" />
            </label>
            <SearchableSelect
              v-model="addr.subdistrict.value"
              :options="subdistrictOptions"
              placeholder="— เลือกตำบล/แขวง —"
              :disabled="!addr.district.value"
              :has-error="!!errors.subdistrict"
              @change="touched.subdistrict = true"
              @blur="touched.subdistrict = true"
            />
            <p v-if="errors.subdistrict" class="text-micro text-red-500 mt-1 px-1">{{ errors.subdistrict }}</p>
          </div>

          <!-- รหัสไปรษณีย์ — auto-fill จากตำบลที่เลือก (read-only, แสดงเมื่อ cascade แสดง) -->
          <div v-if="show('current_address_province') || show('current_address_district') || show('current_address_subdistrict')" class="mb-4">
            <label class="block text-body text-slate-600 mb-1.5 font-medium">รหัสไปรษณีย์</label>
            <div class="flex items-center justify-between bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5">
              <span class="text-body" :class="addr.zipcode.value ? 'text-slate-700' : 'text-slate-400'">
                {{ addr.zipcode.value || ' ' }}
              </span>
              <svg v-if="addr.zipcode.value" class="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
          </div>
        </template>

        <!-- GPS — แผนที่แบบ interactive -->
        <div v-if="show('current_address_gps')" class="flex items-center gap-1 mb-2">
          <span class="text-body text-slate-600 font-medium">ตำแหน่ง GPS</span>
          <FieldAlert v-if="commentMap.has('current_address_gps')" :reason="commentMap.get('current_address_gps')!" />
        </div>
        <GpsMapPicker
          v-if="show('current_address_gps')"
          :lat="gpsLat"
          :lng="gpsLng"
          :address-hint="[addr.subdistrict.value, addr.district.value, addr.province.value].filter(Boolean).join(' ')"
          @update:lat="gpsLat = $event"
          @update:lng="gpsLng = $event"
        />

        <div
          v-if="['contact_phone_home','contact_fax','contact_mobile','contact_email'].some(f => show(f))"
          class="h-px bg-slate-100 my-4"
        />

        <!-- 2.2 ข้อมูลติดต่อ -->
        <div
          v-if="['contact_phone_home','contact_fax','contact_mobile','contact_email'].some(f => show(f))"
          class="flex items-center gap-2 mb-3"
        >
          <span class="bg-blue-100 text-[#1A56DB] text-micro font-bold px-2 py-0.5 rounded-md">2.2</span>
          <span class="text-h3-legend font-medium text-slate-600">ข้อมูลติดต่อ</span>
        </div>

        <!-- โทรศัพท์ (บ้าน/ที่ทำงาน) — optional, 9 หลัก -->
        <div v-if="show('contact_phone_home')" class="mb-3">
          <label class="flex items-center gap-1 text-body text-slate-600 mb-1.5 font-medium">
            <span>โทรศัพท์</span>
            <FieldAlert v-if="commentMap.has('contact_phone_home')" :reason="commentMap.get('contact_phone_home')!" />
          </label>
          <input
            :value="phone"
            @input="(e) => handleDigitsInput(e, v => phone = v)"
            @blur="touched.phone = true"
            type="text"
            inputmode="tel"
            maxlength="9"
            placeholder="เบอร์บ้าน/ที่ทำงาน"
            class="w-full border rounded-xl px-3 py-2.5 text-body placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors"
            :class="errors.phone
              ? 'border-red-300 focus:ring-red-200'
              : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'"
          />
          <p v-if="errors.phone" class="text-micro text-red-500 mt-1 px-1">{{ errors.phone }}</p>
        </div>

        <!-- โทรสาร — optional, 9 หลัก -->
        <div v-if="show('contact_fax')" class="mb-3">
          <label class="flex items-center gap-1 text-body text-slate-600 mb-1.5 font-medium">
            <span>โทรสาร</span>
            <FieldAlert v-if="commentMap.has('contact_fax')" :reason="commentMap.get('contact_fax')!" />
          </label>
          <input
            :value="fax"
            @input="(e) => handleDigitsInput(e, v => fax = v)"
            @blur="touched.fax = true"
            type="text"
            inputmode="tel"
            maxlength="9"
            class="w-full border rounded-xl px-3 py-2.5 text-body placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors"
            :class="errors.fax
              ? 'border-red-300 focus:ring-red-200'
              : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'"
          />
          <p v-if="errors.fax" class="text-micro text-red-500 mt-1 px-1">{{ errors.fax }}</p>
        </div>

        <!-- โทรศัพท์มือถือ — required, validate format -->
        <div v-if="show('contact_mobile')" class="mb-3">
          <label class="flex items-center gap-1 text-body text-slate-600 mb-1.5 font-medium">
            <span>โทรศัพท์มือถือ <span class="text-red-500">*</span></span>
            <FieldAlert v-if="commentMap.has('contact_mobile')" :reason="commentMap.get('contact_mobile')!" />
          </label>
          <input
            :value="mobile"
            @input="(e) => handleDigitsInput(e, v => mobile = v)"
            type="text"
            inputmode="tel"
            maxlength="10"
            @blur="touched.mobile = true"
            class="w-full border rounded-xl px-3 py-2.5 text-body placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors"
            :class="errors.mobile
              ? 'border-red-300 focus:ring-red-200'
              : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'"
          />
          <p v-if="errors.mobile" class="text-micro text-red-500 mt-1 px-1">{{ errors.mobile }}</p>
        </div>

        <!-- อีเมล — optional, validate format เฉพาะเมื่อมีค่า -->
        <div v-if="show('contact_email')">
          <label class="flex items-center gap-1 text-body text-slate-600 mb-1.5 font-medium">
            <span>อีเมล</span>
            <FieldAlert v-if="commentMap.has('contact_email')" :reason="commentMap.get('contact_email')!" />
          </label>
          <input
            v-model="email"
            type="email"
            inputmode="email"
            maxlength="255"
            placeholder="example@email.com"
            @blur="touched.email = true"
            class="w-full border rounded-xl px-3 py-2.5 text-body placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors"
            :class="errors.email
              ? 'border-red-300 focus:ring-red-200'
              : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'"
          />
          <p v-if="errors.email" class="text-micro text-red-500 mt-1 px-1">{{ errors.email }}</p>
        </div>

      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════
         Section 3: สถานภาพ
         ════════════════════════════════════════════════════════ -->
    <div v-if="show('marital_status')" class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="flex items-center gap-3 bg-blue-50 px-4 py-3 border-b border-blue-100">
        <div class="w-8 h-8 rounded-full bg-[#1A56DB] flex items-center justify-center flex-shrink-0">
          <span class="text-white text-body-xs font-bold">3</span>
        </div>
        <p class="text-h2-section font-bold text-[#1A56DB]">สถานภาพ</p>
      </div>
      <div class="p-4">
        <div class="flex items-center gap-2 mb-3">
          <span class="bg-blue-100 text-[#1A56DB] text-micro font-bold px-2 py-0.5 rounded-md">3.1</span>
          <span class="text-h3-legend font-medium text-slate-600">
            สถานภาพสมรส <span class="text-red-500">*</span>
          </span>
          <FieldAlert v-if="commentMap.has('marital_status')" :reason="commentMap.get('marital_status')!" />
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
            <span class="text-body transition-colors" :class="maritalStatus === opt.value ? 'text-[#1A56DB] font-medium' : 'text-slate-700'">
              {{ opt.label }}
            </span>
          </label>
        </div>
        <p v-if="errors.maritalStatus" class="text-micro text-red-500 mt-2 px-1">{{ errors.maritalStatus }}</p>
      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════
         Section 4: สภาพที่อยู่อาศัย
         ════════════════════════════════════════════════════════ -->
    <div v-if="show('housing_type') || show('housing_rent')" class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="flex items-center gap-3 bg-blue-50 px-4 py-3 border-b border-blue-100">
        <div class="w-8 h-8 rounded-full bg-[#1A56DB] flex items-center justify-center flex-shrink-0">
          <span class="text-white text-body-xs font-bold">4</span>
        </div>
        <p class="text-h2-section font-bold text-[#1A56DB]">สภาพที่อยู่อาศัย</p>
      </div>
      <div class="p-4">
        <div class="flex items-center gap-2 mb-3">
          <span class="bg-blue-100 text-[#1A56DB] text-micro font-bold px-2 py-0.5 rounded-md">4.1</span>
          <span class="text-h3-legend font-medium text-slate-600">
            ลักษณะที่อยู่อาศัย <span class="text-red-500">*</span>
          </span>
          <FieldAlert v-if="commentMap.has('housing_type')" :reason="commentMap.get('housing_type')!" />
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
            <span class="text-body transition-colors" :class="housingType === opt.value ? 'text-[#1A56DB] font-medium' : 'text-slate-700'">
              {{ opt.label }}
            </span>
          </label>
        </div>
        <p v-if="errors.housingType" class="text-micro text-red-500 mt-2 px-1">{{ errors.housingType }}</p>

        <!-- 4.2 ค่าเช่าต่อเดือน (แสดงเฉพาะเมื่อเลือก "บ้านเช่า") -->
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          enter-from-class="opacity-0 -translate-y-1"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition-all duration-150 ease-in"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 -translate-y-1"
        >
          <div v-if="isRentSelected" class="mt-4 pt-4 border-t border-slate-100">
            <div class="flex items-center gap-2 mb-3">
              <span class="bg-blue-100 text-[#1A56DB] text-micro font-bold px-2 py-0.5 rounded-md">4.2</span>
              <span class="text-h3-legend font-medium text-slate-600">ค่าเช่าต่อเดือน</span>
            </div>
            <label class="flex items-center gap-1 text-body text-slate-600 mb-1.5 font-medium">
              <span>ค่าเช่าต่อเดือน (บาท) <span class="text-red-500">*</span></span>
              <FieldAlert v-if="commentMap.has('housing_rent')" :reason="commentMap.get('housing_rent')!" />
            </label>
            <div class="relative">
              <input
                :value="displayRent"
                @input="handleRentInput"
                @focus="handleRentFocus"
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                class="w-full border rounded-xl px-3 py-2.5 pr-20 text-body placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors"
                :class="errors.rentPerMonth
                  ? 'border-red-300 focus:ring-red-200'
                  : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'"
              />
              <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-body-xs text-slate-400">บาท/เดือน</span>
            </div>
            <p v-if="errors.rentPerMonth" class="text-micro text-red-500 mt-1 px-1">{{ errors.rentPerMonth }}</p>
          </div>
        </Transition>
      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════
         Section 5: สมาชิกในครัวเรือน
         ════════════════════════════════════════════════════════ -->
    <div v-if="show('household_members') || show('family_members_count')" class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="flex items-center gap-3 bg-blue-50 px-4 py-3 border-b border-blue-100">
        <div class="w-8 h-8 rounded-full bg-[#1A56DB] flex items-center justify-center flex-shrink-0">
          <span class="text-white text-body-xs font-bold">5</span>
        </div>
        <p class="text-h2-section font-bold text-[#1A56DB]">สมาชิกในครัวเรือน</p>
      </div>
      <div class="p-4">
        <div class="flex items-center gap-2 mb-3">
          <span class="bg-blue-100 text-[#1A56DB] text-micro font-bold px-2 py-0.5 rounded-md">5.1</span>
          <span class="text-h3-legend font-medium text-slate-600">รายชื่อสมาชิกในครัวเรือน</span>
          <FieldAlert
            v-if="commentMap.has('household_members') || commentMap.has('family_members_count')"
            :reason="commentMap.get('household_members') ?? commentMap.get('family_members_count')!"
          />
        </div>
        <div class="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl p-3 mb-3">
          <svg class="w-4 h-4 text-blue-500 flex-shrink-0 mt-[1px]" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clip-rule="evenodd" />
          </svg>
          <p class="text-hint text-blue-700 leading-relaxed">
            ระบุสมาชิกในครัวเรือน (ไม่รวมผู้ประสบปัญหาทางสังคม)
          </p>
        </div>

        <!-- จำนวนสมาชิกในครัวเรือน -->
        <div class="mb-4">
          <label class="text-hint text-slate-600 mb-1.5 font-medium block">
            จำนวนสมาชิกในครัวเรือน <span class="text-red-500">*</span>
          </label>
          <div class="relative max-w-[200px]">
            <input
              :value="householdMemberCount"
              @input="handleHouseholdCountInput"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              placeholder="0"
              class="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 pr-12 text-body-xs focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
            />
            <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-hint text-slate-400">คน</span>
          </div>
          <p v-if="householdMembersTouched && !isHouseholdSectionValid() && householdMembers.length > 0"
            class="text-micro text-red-500 mt-1">
            กรุณากรอกข้อมูลสมาชิกให้ครบทุกคนตามจำนวนที่ระบุ
          </p>
        </div>

        <!-- ฟอร์มกรอกข้อมูลสมาชิก (แสดงอัตโนมัติตามจำนวนที่ระบุ) -->
        <div v-if="householdMembers.length > 0" class="space-y-4">
          <div v-for="(m, idx) in householdMembers" :key="m.seq"
            class="border border-slate-200 rounded-xl p-4 bg-white shadow-sm">
            <div class="flex items-center gap-2 mb-4">
              <div class="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <span class="text-micro font-bold text-[#1A56DB]">{{ m.seq }}</span>
              </div>
              <p class="text-body-md font-semibold text-slate-700">สมาชิกในครัวเรือน คนที่ {{ m.seq }}</p>
            </div>
            <div class="space-y-3">
              <!-- คำนำหน้า + ชื่อ -->
              <div class="flex gap-3">
                <div class="w-[35%]">
                  <label class="text-hint text-slate-600 mb-1.5 font-medium block">คำนำหน้า <span class="text-red-500">*</span></label>
                  <select v-model="m.prefixId"
                    class="w-full bg-white border rounded-xl px-3 py-2 text-body-xs focus:outline-none focus:ring-2 transition-colors"
                    :class="householdMembersTouched && memberErrorsList[idx]?.prefixId ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'">
                    <option value="" disabled>เลือกคำนำหน้า</option>
                    <option v-for="opt in prefixOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                    <option value="none">อื่นๆ / ไม่ระบุ</option>
                  </select>
                  <p v-if="householdMembersTouched && memberErrorsList[idx]?.prefixId" class="text-micro text-red-500 mt-0.5">{{ memberErrorsList[idx].prefixId }}</p>
                  <input v-if="m.prefixId === 'none'"
                    v-model="m.prefixOther" type="text" maxlength="50"
                    placeholder="ระบุคำนำหน้า"
                    class="mt-1.5 w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-body-xs focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]" />
                </div>
                <div class="flex-1">
                  <label class="text-hint text-slate-600 mb-1.5 font-medium block">ชื่อ <span class="text-red-500">*</span></label>
                  <input
                    :value="m.firstName"
                    @input="(e) => handleMemberNameInput(e, idx, 'firstName')"
                    type="text"
                    class="w-full bg-white border rounded-xl px-3 py-2 text-body-xs focus:outline-none focus:ring-2 transition-colors"
                    :class="householdMembersTouched && memberErrorsList[idx]?.firstName ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'" />
                  <p v-if="householdMembersTouched && memberErrorsList[idx]?.firstName" class="text-micro text-red-500 mt-0.5">{{ memberErrorsList[idx].firstName }}</p>
                </div>
              </div>
              <!-- นามสกุล -->
              <div>
                <label class="text-hint text-slate-600 mb-1.5 font-medium block">นามสกุล <span class="text-red-500">*</span></label>
                <input
                  :value="m.lastName"
                  @input="(e) => handleMemberNameInput(e, idx, 'lastName')"
                  type="text"
                  class="w-full bg-white border rounded-xl px-3 py-2 text-body-xs focus:outline-none focus:ring-2 transition-colors"
                  :class="householdMembersTouched && memberErrorsList[idx]?.lastName ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'" />
                <p v-if="householdMembersTouched && memberErrorsList[idx]?.lastName" class="text-micro text-red-500 mt-0.5">{{ memberErrorsList[idx].lastName }}</p>
              </div>
              <!-- เลขบัตรประชาชน -->
              <div>
                <label class="text-hint text-slate-600 mb-1.5 font-medium block">เลขบัตรประชาชน</label>
                <input
                  :value="formatPIDInput(m.nationalId)"
                  @input="(e) => handleMemberDigitsInput(e, idx, 'nationalId')"
                  @blur="handleNationalIdBlur(idx)"
                  maxlength="17" type="text" inputmode="numeric"
                  placeholder="ระบุ 13 หลัก (ถ้ามี)"
                  class="w-full bg-white border rounded-xl px-3 py-2 text-body-xs focus:outline-none focus:ring-2 transition-colors"
                  :class="householdMembersTouched && memberErrorsList[idx]?.nationalId ? 'border-red-300 focus:ring-red-200' : nationalIdSuccessList[idx] ? 'border-green-400 focus:ring-green-200' : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'" />
                <p v-if="householdMembersTouched && memberErrorsList[idx]?.nationalId" class="text-micro text-red-500 mt-0.5">{{ memberErrorsList[idx].nationalId }}</p>
                <p v-else-if="nationalIdSuccessList[idx]" class="text-micro text-green-600 mt-0.5 flex items-center gap-1">
                  <svg class="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
                  </svg>
                  {{ nationalIdSuccessList[idx] }}
                </p>
              </div>
              <!-- วันเกิด -->
              <div>
                <label class="text-hint text-slate-600 mb-1.5 font-medium block">วัน/เดือน/ปีเกิด <span class="text-red-500">*</span></label>
                <div class="flex gap-2">
                  <select
                    v-model="memberDobPartsList[idx].day"
                    @change="handleDobPartChange(idx)"
                    class="w-[62px] shrink-0 bg-white border rounded-xl px-2 py-2.5 text-body-xs focus:outline-none focus:ring-2 transition-colors"
                    :class="householdMembersTouched && memberErrorsList[idx]?.dateOfBirth ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'">
                    <option value="">วัน</option>
                    <option v-for="d in dobDayOptionsFor(idx)" :key="d" :value="String(d)">{{ d }}</option>
                  </select>
                  <select
                    v-model="memberDobPartsList[idx].month"
                    @change="handleDobPartChange(idx)"
                    class="flex-1 min-w-0 bg-white border rounded-xl px-3 py-2.5 text-body-xs focus:outline-none focus:ring-2 transition-colors"
                    :class="householdMembersTouched && memberErrorsList[idx]?.dateOfBirth ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'">
                    <option value="">เดือน</option>
                    <option v-for="(name, monthIdx) in THAI_MONTHS" :key="monthIdx + 1" :value="String(monthIdx + 1)">{{ name }}</option>
                  </select>
                  <select
                    v-model="memberDobPartsList[idx].year"
                    @change="handleDobPartChange(idx)"
                    class="w-[88px] shrink-0 bg-white border rounded-xl px-2 py-2.5 text-body-xs focus:outline-none focus:ring-2 transition-colors"
                    :class="householdMembersTouched && memberErrorsList[idx]?.dateOfBirth ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'">
                    <option value="">ปี พ.ศ.</option>
                    <option v-for="y in dobYearOptions" :key="y" :value="String(y)">{{ y }}</option>
                  </select>
                </div>
                <p v-if="householdMembersTouched && memberErrorsList[idx]?.dateOfBirth" class="text-micro text-red-500 mt-1">{{ memberErrorsList[idx].dateOfBirth }}</p>
                <p v-else-if="m.dateOfBirth" class="text-micro text-slate-500 mt-1">
                  {{ formatThaiDate(m.dateOfBirth) }} · อายุ {{ calcMemberAge(m.dateOfBirth) }} ปี
                </p>
              </div>
              <!-- ความสัมพันธ์ + อาชีพ + รายได้ + สภาพร่างกาย -->
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-hint text-slate-600 mb-1.5 font-medium block">ความสัมพันธ์กับผู้ประสบปัญหา <span class="text-red-500">*</span></label>
                  <select
                    v-model="m.relationToApplicantId"
                    class="w-full bg-white border rounded-xl px-3 py-2 text-body-xs focus:outline-none focus:ring-2 transition-colors appearance-none"
                    :class="householdMembersTouched && memberErrorsList[idx]?.relationToApplicantId ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'">
                    <option :value="null" disabled>เลือกความสัมพันธ์</option>
                    <option v-for="opt in relationTypeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                  <p v-if="householdMembersTouched && memberErrorsList[idx]?.relationToApplicantId" class="text-micro text-red-500 mt-0.5">{{ memberErrorsList[idx].relationToApplicantId }}</p>
                </div>
                <div>
                  <label class="text-hint text-slate-600 mb-1.5 font-medium block">อาชีพ <span class="text-red-500">*</span></label>
                  <input v-model="m.occupation" type="text" maxlength="255"
                    class="w-full bg-white border rounded-xl px-3 py-2 text-body-xs focus:outline-none focus:ring-2 transition-colors"
                    :class="householdMembersTouched && memberErrorsList[idx]?.occupation ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'" />
                  <p v-if="householdMembersTouched && memberErrorsList[idx]?.occupation" class="text-micro text-red-500 mt-0.5">{{ memberErrorsList[idx].occupation }}</p>
                </div>
                <div>
                  <label class="text-hint text-slate-600 mb-1.5 font-medium block">รายได้ต่อเดือน (บาท) <span class="text-red-500">*</span></label>
                  <div class="relative">
                    <input
                      :value="displayIncomeList[idx]"
                      @input="(e) => handleMemberIncomeInput(e, idx)"
                      type="text" inputmode="numeric" pattern="[0-9]*"
                      placeholder="0"
                      class="w-full bg-white border rounded-xl px-3 py-2 pr-14 text-body-xs focus:outline-none focus:ring-2 transition-colors"
                      :class="householdMembersTouched && memberErrorsList[idx]?.monthlyIncome ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'" />
                    <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-micro text-slate-400">บาท</span>
                  </div>
                  <p v-if="householdMembersTouched && memberErrorsList[idx]?.monthlyIncome" class="text-micro text-red-500 mt-0.5">{{ memberErrorsList[idx].monthlyIncome }}</p>
                </div>
                <div>
                  <label class="text-hint text-slate-600 mb-1.5 font-medium block">สภาพทางร่างกาย <span class="text-red-500">*</span></label>
                  <select v-model="m.physicalCondition"
                    class="w-full bg-white border rounded-xl px-3 py-2 text-body-xs focus:outline-none focus:ring-2 transition-colors"
                    :class="householdMembersTouched && memberErrorsList[idx]?.physicalCondition ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'">
                    <option value="" disabled>เลือกสภาพทางร่างกาย</option>
                    <option v-for="opt in physicalConditionOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                  <p v-if="householdMembersTouched && memberErrorsList[idx]?.physicalCondition" class="text-micro text-red-500 mt-0.5">{{ memberErrorsList[idx].physicalCondition }}</p>
                </div>
              </div>
              <!-- การช่วยเหลือตนเอง -->
              <div>
                <label class="text-hint text-slate-600 mb-1.5 font-medium block">การช่วยเหลือตนเอง <span class="text-red-500">*</span></label>
                <div class="grid grid-cols-2 gap-2">
                  <label
                    class="flex items-center gap-2 border rounded-xl px-3 py-2.5 cursor-pointer transition-colors"
                    :class="m.selfCare === true ? 'border-[#1A56DB] bg-blue-50' : 'border-slate-200 hover:bg-slate-50'">
                    <input type="radio" :value="true" v-model="m.selfCare" class="w-4 h-4 accent-[#1A56DB]" />
                    <span class="text-body-xs text-slate-700">ช่วยเหลือตนเองได้</span>
                  </label>
                  <label
                    class="flex items-center gap-2 border rounded-xl px-3 py-2.5 cursor-pointer transition-colors"
                    :class="m.selfCare === false ? 'border-[#1A56DB] bg-blue-50' : 'border-slate-200 hover:bg-slate-50'">
                    <input type="radio" :value="false" v-model="m.selfCare" class="w-4 h-4 accent-[#1A56DB]" />
                    <span class="text-body-xs text-slate-700">ช่วยเหลือตนเองไม่ได้</span>
                  </label>
                </div>
                <p v-if="householdMembersTouched && memberErrorsList[idx]?.selfCare" class="text-micro text-red-500 mt-0.5">{{ memberErrorsList[idx].selfCare }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>
