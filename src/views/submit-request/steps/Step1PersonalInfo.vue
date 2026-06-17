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

// ─── 4.2 ค่าเช่าต่อเดือน ──────────────────────────────────────────────────────
const rentPerMonth  = ref('')   // ตัวเลขล้วน ใช้คำนวณ
const displayRent   = ref('')   // แสดงใน input (มีลูกน้ำหลัง blur)

// ─── 5. สมาชิกในครัวเรือน (ปสค.๒) ────────────────────────────────────────────
const householdMembers = ref<HouseholdMemberForm[]>([])

// state สำหรับ add/edit form (null = ฟอร์มซ่อนอยู่)
const editingMember  = ref<HouseholdMemberForm | null>(null)
const editingIndex   = ref<number | null>(null)   // null=ไม่ได้แก้, -1=เพิ่มใหม่, N=แก้ index N
const editMemberErrors = reactive({
  prefixId:              '',
  firstName:             '',
  lastName:              '',
  dateOfBirth:           '',
  nationalId:            '',
  relationToApplicantId: '',
  occupation:            '',
  monthlyIncome:         '',
  physicalCondition:     '',
  selfCare:              '',
})
// display value ของรายได้ (มีลูกน้ำ) แยกจาก raw ที่เก็บใน editingMember.monthlyIncome
const displayIncome = ref('')

function _resetMemberErrors() {
  editMemberErrors.prefixId              = ''
  editMemberErrors.firstName             = ''
  editMemberErrors.lastName              = ''
  editMemberErrors.dateOfBirth           = ''
  editMemberErrors.nationalId            = ''
  editMemberErrors.relationToApplicantId = ''
  editMemberErrors.occupation            = ''
  editMemberErrors.monthlyIncome         = ''
  editMemberErrors.physicalCondition     = ''
  editMemberErrors.selfCare              = ''
  nationalIdSuccess.value                = ''
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

function openAddMember() {
  editingIndex.value  = -1
  editingMember.value = _blankMember(householdMembers.value.length + 1)
  displayIncome.value = ''
  _resetMemberErrors()
  syncDobPartsFromMember()
}

function openEditMember(idx: number) {
  editingIndex.value  = idx
  editingMember.value = { ...householdMembers.value[idx] }
  displayIncome.value = formatIncomeDisplay(householdMembers.value[idx].monthlyIncome)
  _resetMemberErrors()
  syncDobPartsFromMember()
}

function deleteMember(idx: number) {
  householdMembers.value.splice(idx, 1)
  householdMembers.value.forEach((m, i) => { m.seq = i + 1 })
}

// ข้อความ "ถูกต้อง" สีเขียว — แยกจาก editMemberErrors เพราะเป็นสถานะสำเร็จ ไม่ใช่ error
const nationalIdSuccess = ref('')

// ตรวจว่าเลขบัตรซ้ำกับสมาชิกคนอื่นในครัวเรือนหรือไม่ (ไม่นับตัวที่กำลังแก้ไขอยู่)
// editingIndex: -1 = เพิ่มใหม่ (idx !== -1 จริงเสมอ → เทียบทุกคน), N = แก้ไข (ข้าม index N)
function isDuplicateMemberId(val: string): boolean {
  return householdMembers.value.some((m, idx) => idx !== editingIndex.value && m.nationalId === val)
}

// ตรวจ nationalId แบบ stateful — เรียกได้ทั้งจาก input (real-time) และ blur
// fromBlur=true → แจ้ง "กรอกไม่ครบ" เมื่อออกจากช่องแต่ยังไม่ถึง 13 หลัก
function validateNationalId(val: string, fromBlur = false) {
  nationalIdSuccess.value = ''   // เคลียร์สถานะเขียวทุกครั้งก่อนตรวจใหม่
  if (!val) {
    editMemberErrors.nationalId = ''
  } else if (val.length === 13) {
    if (!isValidThaiNationalId(val)) {
      editMemberErrors.nationalId = 'เลขบัตรประชาชนไม่ถูกต้อง (ตรวจสอบอีกครั้ง)'
    } else if (authUser.value?.pid && val === authUser.value.pid) {
      editMemberErrors.nationalId = 'เลขบัตรนี้ซ้ำกับผู้ประสบปัญหาทางสังคม'
    } else if (isDuplicateMemberId(val)) {
      editMemberErrors.nationalId = 'เลขบัตรนี้ซ้ำกับสมาชิกคนอื่นในครัวเรือน'
    } else {
      editMemberErrors.nationalId = ''
      nationalIdSuccess.value = 'เลขบัตรประชาชนถูกต้อง'
    }
  } else if (fromBlur) {
    editMemberErrors.nationalId = `กรอกไม่ครบ (${val.length}/13 หลัก)`
  } else {
    editMemberErrors.nationalId = ''
  }
}

function handleNationalIdBlur() {
  if (editingMember.value) validateNationalId(editingMember.value.nationalId, true)
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

const memberDobParts = reactive({ day: '', month: '', year: '' })

const dobYearOptions = computed(() => {
  const currentBE = new Date().getFullYear() + 543
  const result: number[] = []
  for (let y = currentBE; y >= currentBE - 120; y--) result.push(y)
  return result
})

// จำนวนวันสูงสุดของเดือน/ปีที่เลือก (รองรับ leap year)
const dobDayOptions = computed(() => {
  const m = Number(memberDobParts.month)
  if (!m) return 31
  const ceYear = memberDobParts.year ? Number(memberDobParts.year) - 543 : 2000
  return new Date(ceYear, m, 0).getDate()  // day 0 ของเดือนถัดไป = วันสุดท้ายของเดือนนี้
})

function syncDobPartsFromMember() {
  const dob = editingMember.value?.dateOfBirth
  if (!dob) { memberDobParts.day = ''; memberDobParts.month = ''; memberDobParts.year = ''; return }
  const d = new Date(dob)
  if (isNaN(d.getTime())) return
  memberDobParts.day   = String(d.getDate())
  memberDobParts.month = String(d.getMonth() + 1)
  memberDobParts.year  = String(d.getFullYear() + 543)
}

function handleDobPartChange() {
  // clamp วันถ้าเกินจำนวนวันของเดือน/ปีที่เลือก (เช่น 31 ม.ค. → เปลี่ยนเดือนเป็น ก.พ. → reset วัน)
  if (memberDobParts.month) {
    const m = Number(memberDobParts.month)
    const ceYear = memberDobParts.year ? Number(memberDobParts.year) - 543 : 2000
    const maxDay = new Date(ceYear, m, 0).getDate()
    if (Number(memberDobParts.day) > maxDay) memberDobParts.day = ''
  }
  const { day, month, year } = memberDobParts
  if (!day || !month || !year) {
    if (editingMember.value) editingMember.value.dateOfBirth = ''
    return
  }
  const ceYear = Number(year) - 543
  const iso = `${String(ceYear).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const dt = new Date(iso)
  if (isNaN(dt.getTime())) return
  if (editingMember.value) editingMember.value.dateOfBirth = iso
}

// input handler: กรองให้รับเฉพาะตัวเลข แล้วแสดงแบบมี - (ใช้กับ nationalId)
// เก็บลง editingMember.nationalId เป็น "ตัวเลขล้วน" (ไม่มี -) ส่วน - ใช้แค่ตอนแสดง
function handleMemberDigitsInput(e: Event, field: 'nationalId') {
  const el     = e.target as HTMLInputElement
  const digits = el.value.replace(/[^0-9]/g, '').slice(0, 13)
  if (editingMember.value) editingMember.value[field] = digits
  el.value = formatPIDInput(digits)   // โชว์รูปแบบมี - ในช่อง
  validateNationalId(digits)
}

// input handler: รับเฉพาะอักษรไทย อักษรละติน ช่องว่าง และขีดกลาง (ใช้กับ firstName, lastName)
function handleMemberNameInput(e: Event, field: 'firstName' | 'lastName') {
  const el = e.target as HTMLInputElement
  const filtered = el.value.replace(/[^ก-๛a-zA-Z\s\-]/g, '')
  if (editingMember.value) editingMember.value[field] = filtered
  el.value = filtered
}

// input handler: รับตัวเลขเท่านั้น + แสดงลูกน้ำ (ใช้กับ monthlyIncome)
function handleMemberIncomeInput(e: Event) {
  const el = e.target as HTMLInputElement
  const digits = el.value.replace(/[^0-9]/g, '').slice(0, 10)
  if (editingMember.value) editingMember.value.monthlyIncome = digits
  const formatted = digits ? Number(digits).toLocaleString('th-TH') : ''
  displayIncome.value = formatted
  el.value = formatted
}

function saveMember() {
  const m = editingMember.value
  if (!m) return

  // คำนำหน้า: required
  editMemberErrors.prefixId = m.prefixId ? '' : 'กรุณาเลือกคำนำหน้า'

  // ชื่อ-นามสกุล: required
  editMemberErrors.firstName = m.firstName.trim() ? '' : 'กรุณากรอกชื่อ'
  editMemberErrors.lastName  = m.lastName.trim()  ? '' : 'กรุณากรอกนามสกุล'

  // ความสัมพันธ์กับผู้ประสบปัญหา: required
  editMemberErrors.relationToApplicantId = m.relationToApplicantId !== null ? '' : 'กรุณาเลือกความสัมพันธ์'

  // อาชีพ: required
  editMemberErrors.occupation = m.occupation.trim() ? '' : 'กรุณากรอกอาชีพ'

  // สภาพทางร่างกาย: required
  editMemberErrors.physicalCondition = m.physicalCondition ? '' : 'กรุณาเลือกสภาพทางร่างกาย'

  // การช่วยเหลือตนเอง: required (radio — ต้องเลือก ได้/ไม่ได้)
  editMemberErrors.selfCare = m.selfCare !== null ? '' : 'กรุณาเลือกการช่วยเหลือตนเอง'

  // วันเกิด: required และต้องไม่อยู่ในอนาคต
  if (!m.dateOfBirth) {
    editMemberErrors.dateOfBirth = 'กรุณากรอกวันเกิด'
  } else {
    const dob = new Date(m.dateOfBirth)
    if (isNaN(dob.getTime())) {
      editMemberErrors.dateOfBirth = 'วันเกิดไม่ถูกต้อง'
    } else if (dob > new Date()) {
      editMemberErrors.dateOfBirth = 'วันเกิดไม่สามารถเป็นวันในอนาคตได้'
    } else {
      editMemberErrors.dateOfBirth = ''
    }
  }

  // เลขบัตรประชาชน: optional — ใช้ validateNationalId (fromBlur=true ให้แจ้ง "ไม่ครบ")
  validateNationalId(m.nationalId, true)

  // รายได้: required — ต้องกรอก และเป็นตัวเลข ≥ 0
  if (!m.monthlyIncome) {
    editMemberErrors.monthlyIncome = 'กรุณากรอกรายได้ต่อเดือน'
  } else if (!/^\d+$/.test(m.monthlyIncome)) {
    editMemberErrors.monthlyIncome = 'รายได้ต้องเป็นตัวเลขเท่านั้น'
  } else {
    editMemberErrors.monthlyIncome = ''
  }

  if (Object.values(editMemberErrors).some(e => e)) return

  if (editingIndex.value === -1) {
    m.seq = householdMembers.value.length + 1
    householdMembers.value.push({ ...m })
  } else if (editingIndex.value !== null) {
    householdMembers.value[editingIndex.value] = { ...m }
  }
  editingMember.value = null
  editingIndex.value  = null
}

function cancelEditMember() {
  editingMember.value = null
  editingIndex.value  = null
  displayIncome.value = ''
  memberDobParts.day = ''; memberDobParts.month = ''; memberDobParts.year = ''
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
    if (show(fieldNameMap[k])) touched[k] = true
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
  // ถ้าฟอร์มเพิ่ม/แก้สมาชิกยังเปิดอยู่ → บล็อกปุ่มถัดไปเสมอ
  if (editingMember.value !== null) return false

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
    (!show('housing_type')                || housingType.value      !== '')
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
    rentPerMonth:      rentPerMonth.value,
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
          <span class="text-body-xs font-medium text-slate-600">ข้อมูลจาก ThaiD</span>
        </div>

        <!-- ไอคอนล็อค (ใช้ซ้ำในทุก read-only field) -->
        <!-- คำนำหน้า + ชื่อ -->
        <div class="flex gap-3 mb-3">
          <div class="w-[35%]">
            <label class="block text-hint text-slate-500 mb-1.5">คำนำหน้าชื่อ</label>
            <div class="flex items-center justify-between bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5">
              <span class="text-body-md text-slate-700">{{ authUser?.title ?? '—' }}</span>
              <svg class="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
          </div>
          <div class="flex-1">
            <label class="block text-hint text-slate-500 mb-1.5">ชื่อ</label>
            <div class="flex items-center justify-between bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5">
              <span class="text-body-md text-slate-700">{{ authUser?.fname ?? '—' }}</span>
              <svg class="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
          </div>
        </div>

        <!-- นามสกุล -->
        <div class="mb-3">
          <label class="block text-hint text-slate-500 mb-1.5">นามสกุล</label>
          <div class="flex items-center justify-between bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5">
            <span class="text-body-md text-slate-700">{{ authUser?.lname ?? '—' }}</span>
            <svg class="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
        </div>

        <!-- เลขบัตรประชาชน -->
        <div class="mb-3">
          <label class="block text-hint text-slate-500 mb-1.5">เลขประจำตัวประชาชน 13 หลัก</label>
          <div class="flex items-center justify-between bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5">
            <span class="text-body-md text-slate-700 tracking-wide">
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
            <label class="block text-hint text-slate-500 mb-1.5">วัน/เดือน/ปีเกิด</label>
            <div class="flex items-center justify-between bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5">
              <span class="text-body-md text-slate-700">
                {{ formatThaiDate(effectiveDob) }}
              </span>
              <svg class="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
          </div>
          <div class="w-[28%]">
            <label class="block text-hint text-slate-500 mb-1.5">อายุ</label>
            <div class="flex items-center justify-between bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5">
              <span class="text-body-md text-slate-700">{{ age !== null ? `${age} ปี` : '—' }}</span>
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
            <span class="text-body-xs font-medium text-slate-600">ความเกี่ยวข้อง</span>
          </div>
          <div>
            <label class="block text-body-xs text-slate-600 mb-1.5 font-medium">
              ความสัมพันธ์กับผู้ประสบปัญหา
            </label>
            <!-- ล็อคเป็น "ตนเอง" เสมอ เนื่องจากผู้ใช้ยื่นด้วยตนเองผ่าน ThaiD -->
            <div class="flex items-center justify-between bg-slate-100 border border-slate-200 rounded-xl px-4 py-3">
              <span class="text-body-md text-slate-700 font-medium">{{ RELATIONSHIP }}</span>
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
          <span class="text-body-xs font-medium text-slate-600">ที่อยู่ปัจจุบัน</span>
        </div>

        <!-- บ้านเลขที่ + หมู่ที่ -->
        <div v-if="show('current_address_house_no') || show('current_address_moo')" class="flex gap-3 mb-3">
          <div v-if="show('current_address_house_no')" class="flex-1">
            <label class="flex items-center gap-1 text-hint text-slate-600 mb-1.5 font-medium">
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
              class="w-full border rounded-xl px-3 py-2.5 text-body-md placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB] transition-colors"
              :class="errors.houseNo ? 'border-red-300' : 'border-slate-200'"
            />
            <p v-if="errors.houseNo" class="text-micro text-red-500 mt-1 px-1">{{ errors.houseNo }}</p>
          </div>
          <div v-if="show('current_address_moo')" class="w-[33%]">
            <label class="flex items-center gap-1 text-hint text-slate-600 mb-1.5 font-medium">
              <span>หมู่ที่</span>
              <FieldAlert v-if="commentMap.has('current_address_moo')" :reason="commentMap.get('current_address_moo')!" />
            </label>
            <input
              :value="mooNum"
              @input="(e) => handleDigitsInput(e, v => mooNum = v)"
              type="text"
              inputmode="numeric"
              maxlength="50"
              class="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-body-md placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
            />
          </div>
        </div>

        <!-- ชื่อหมู่บ้าน -->
        <div v-if="show('current_address_village')" class="mb-3">
          <label class="flex items-center gap-1 text-hint text-slate-600 mb-1.5 font-medium">
            <span>ชื่อหมู่บ้าน</span>
            <FieldAlert v-if="commentMap.has('current_address_village')" :reason="commentMap.get('current_address_village')!" />
          </label>
          <input
            v-model="villageName"
            type="text"
            maxlength="255"
            class="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-body-md placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
          />
        </div>

        <!-- ตรอก + ซอย -->
        <div v-if="show('current_address_alley') || show('current_address_soi')" class="flex gap-3 mb-3">
          <div v-if="show('current_address_alley')" class="flex-1">
            <label class="flex items-center gap-1 text-hint text-slate-600 mb-1.5 font-medium">
              <span>ตรอก</span>
              <FieldAlert v-if="commentMap.has('current_address_alley')" :reason="commentMap.get('current_address_alley')!" />
            </label>
            <input
              v-model="alley"
              type="text"
              maxlength="255"
              class="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-body-md placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
            />
          </div>
          <div v-if="show('current_address_soi')" class="flex-1">
            <label class="flex items-center gap-1 text-hint text-slate-600 mb-1.5 font-medium">
              <span>ซอย</span>
              <FieldAlert v-if="commentMap.has('current_address_soi')" :reason="commentMap.get('current_address_soi')!" />
            </label>
            <input
              v-model="soi"
              type="text"
              maxlength="255"
              class="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-body-md placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
            />
          </div>
        </div>

        <!-- ถนน -->
        <div v-if="show('current_address_road')" class="mb-3">
          <label class="flex items-center gap-1 text-hint text-slate-600 mb-1.5 font-medium">
            <span>ถนน</span>
            <FieldAlert v-if="commentMap.has('current_address_road')" :reason="commentMap.get('current_address_road')!" />
          </label>
          <input
            v-model="road"
            type="text"
            maxlength="255"
            class="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-body-md placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
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
            <label class="flex items-center gap-1 text-hint text-slate-600 mb-1.5 font-medium">
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
            <label class="flex items-center gap-1 text-hint text-slate-600 mb-1.5 font-medium">
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
            <label class="flex items-center gap-1 text-hint text-slate-600 mb-1.5 font-medium">
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
            <label class="block text-hint text-slate-600 mb-1.5 font-medium">รหัสไปรษณีย์</label>
            <div class="flex items-center justify-between bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5">
              <span class="text-body-md" :class="addr.zipcode.value ? 'text-slate-700' : 'text-slate-400'">
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
          <span class="text-hint text-slate-600 font-medium">ตำแหน่ง GPS</span>
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
          <span class="text-body-xs font-medium text-slate-600">ข้อมูลติดต่อ</span>
        </div>

        <!-- โทรศัพท์ (บ้าน/ที่ทำงาน) — optional, 9 หลัก -->
        <div v-if="show('contact_phone_home')" class="mb-3">
          <label class="flex items-center gap-1 text-hint text-slate-600 mb-1.5 font-medium">
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
            class="w-full border rounded-xl px-3 py-2.5 text-body-md placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors"
            :class="errors.phone
              ? 'border-red-300 focus:ring-red-200'
              : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'"
          />
          <p v-if="errors.phone" class="text-micro text-red-500 mt-1 px-1">{{ errors.phone }}</p>
        </div>

        <!-- โทรสาร — optional, 9 หลัก -->
        <div v-if="show('contact_fax')" class="mb-3">
          <label class="flex items-center gap-1 text-hint text-slate-600 mb-1.5 font-medium">
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
            class="w-full border rounded-xl px-3 py-2.5 text-body-md placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors"
            :class="errors.fax
              ? 'border-red-300 focus:ring-red-200'
              : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'"
          />
          <p v-if="errors.fax" class="text-micro text-red-500 mt-1 px-1">{{ errors.fax }}</p>
        </div>

        <!-- โทรศัพท์มือถือ — required, validate format -->
        <div v-if="show('contact_mobile')" class="mb-3">
          <label class="flex items-center gap-1 text-hint text-slate-600 mb-1.5 font-medium">
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
            class="w-full border rounded-xl px-3 py-2.5 text-body-md placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors"
            :class="errors.mobile
              ? 'border-red-300 focus:ring-red-200'
              : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'"
          />
          <p v-if="errors.mobile" class="text-micro text-red-500 mt-1 px-1">{{ errors.mobile }}</p>
        </div>

        <!-- อีเมล — optional, validate format เฉพาะเมื่อมีค่า -->
        <div v-if="show('contact_email')">
          <label class="flex items-center gap-1 text-hint text-slate-600 mb-1.5 font-medium">
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
            class="w-full border rounded-xl px-3 py-2.5 text-body-md placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors"
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
          <span class="text-body-xs font-medium text-slate-600">
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
            <span class="text-body-md transition-colors" :class="maritalStatus === opt.value ? 'text-[#1A56DB] font-medium' : 'text-slate-700'">
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
          <span class="text-body-xs font-medium text-slate-600">
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
            <span class="text-body-md transition-colors" :class="housingType === opt.value ? 'text-[#1A56DB] font-medium' : 'text-slate-700'">
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
              <span class="text-body-xs font-medium text-slate-600">ค่าเช่าต่อเดือน</span>
            </div>
            <label class="flex items-center gap-1 text-hint text-slate-600 mb-1.5 font-medium">
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
                class="w-full border rounded-xl px-3 py-2.5 pr-20 text-body-md placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors"
                :class="errors.rentPerMonth
                  ? 'border-red-300 focus:ring-red-200'
                  : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'"
              />
              <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-hint text-slate-400">บาท/เดือน</span>
            </div>
            <p v-if="errors.rentPerMonth" class="text-micro text-red-500 mt-1 px-1">{{ errors.rentPerMonth }}</p>
          </div>
        </Transition>
      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════
         Section 5: สมาชิกในครัวเรือน
         ════════════════════════════════════════════════════════ -->
    <div v-if="show('family_members_count')" class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="flex items-center gap-3 bg-blue-50 px-4 py-3 border-b border-blue-100">
        <div class="w-8 h-8 rounded-full bg-[#1A56DB] flex items-center justify-center flex-shrink-0">
          <span class="text-white text-body-xs font-bold">5</span>
        </div>
        <p class="text-h2-section font-bold text-[#1A56DB]">สมาชิกในครัวเรือน</p>
      </div>
      <div class="p-4">
        <div class="flex items-center gap-2 mb-3">
          <span class="bg-blue-100 text-[#1A56DB] text-micro font-bold px-2 py-0.5 rounded-md">5.1</span>
          <span class="text-body-xs font-medium text-slate-600">รายชื่อสมาชิกในครัวเรือน</span>
          <FieldAlert v-if="commentMap.has('family_members_count')" :reason="commentMap.get('family_members_count')!" />
        </div>
        <div class="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl p-3 mb-3">
          <svg class="w-4 h-4 text-blue-500 flex-shrink-0 mt-[1px]" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clip-rule="evenodd" />
          </svg>
          <p class="text-hint text-blue-700 leading-relaxed">
            ระบุสมาชิกในครัวเรือน (ไม่รวมผู้ประสบปัญหาทางสังคม)
          </p>
        </div>

        <!-- card list รายชื่อสมาชิก -->
        <div v-if="householdMembers.length > 0" class="space-y-2 mb-3">
          <div v-for="(m, idx) in householdMembers" :key="m.seq"
            class="relative bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <!-- แถบสีด้านซ้าย -->
            <div class="absolute inset-y-0 left-0 w-1 bg-[#1A56DB] rounded-l-2xl" />
            <div class="pl-4 pr-3 pt-3 pb-3">
              <!-- บรรทัดหัว: ลำดับ + ชื่อ + ปุ่มจัดการ -->
              <div class="flex items-start gap-2">
                <!-- ลำดับ -->
                <div class="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span class="text-micro font-bold text-[#1A56DB]">{{ m.seq }}</span>
                </div>
                <!-- ชื่อ + อายุ + ความสัมพันธ์ -->
                <div class="flex-1 min-w-0">
                  <p class="text-body-md font-semibold text-slate-800 leading-snug">
                    <span v-if="m.prefixId && m.prefixId !== 'none'">{{ prefixOptions.find(p => p.value === m.prefixId)?.label }}</span>
                    <span v-else-if="m.prefixOther">{{ m.prefixOther }}</span>
                    {{ m.firstName }} {{ m.lastName }}
                  </p>
                  <p class="text-hint text-slate-500 mt-0.5">
                    <span v-if="m.dateOfBirth">{{ formatThaiDate(m.dateOfBirth) }} · อายุ {{ calcMemberAge(m.dateOfBirth) }} ปี</span>
                    <span v-if="m.relationToApplicantId" class="before:content-['·'] before:mx-1.5">{{ relationTypeOptions.find(r => r.value === m.relationToApplicantId)?.label }}</span>
                  </p>
                </div>
                <!-- ปุ่ม แก้ไข / ลบ -->
                <div class="flex items-center gap-0.5 flex-shrink-0 -mt-0.5">
                  <button type="button" @click="openEditMember(idx)"
                    class="p-1.5 rounded-lg text-[#1A56DB] hover:bg-blue-50 active:bg-blue-100 transition-colors" title="แก้ไข">
                    <svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                    </svg>
                  </button>
                  <button type="button" @click="deleteMember(idx)"
                    class="p-1.5 rounded-lg text-red-500 hover:bg-red-50 active:bg-red-100 transition-colors" title="ลบ">
                    <svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clip-rule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
              <!-- chip ข้อมูลเพิ่มเติม -->
              <div v-if="m.occupation || m.monthlyIncome || m.physicalCondition !== 'normal' || !m.selfCare"
                class="flex flex-wrap gap-1.5 mt-2 ml-8">
                <span v-if="m.occupation"
                  class="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-micro px-2 py-0.5 rounded-full">
                  <svg class="w-3 h-3 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5zm1 5a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clip-rule="evenodd" />
                    <path d="M2 13.692V16a2 2 0 002 2h12a2 2 0 002-2v-2.308A24.974 24.974 0 0110 15c-2.796 0-5.487-.46-8-1.308z" />
                  </svg>
                  {{ m.occupation }}
                </span>
                <span v-if="m.monthlyIncome"
                  class="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-micro px-2 py-0.5 rounded-full">
                  <svg class="w-3 h-3 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clip-rule="evenodd" />
                  </svg>
                  {{ Number(m.monthlyIncome).toLocaleString('th-TH') }} บาท/เดือน
                </span>
                <span v-if="m.physicalCondition !== 'normal'"
                  class="inline-flex items-center gap-1 text-micro px-2 py-0.5 rounded-full"
                  :class="m.physicalCondition === 'disabled' ? 'bg-amber-50 text-amber-700' : 'bg-orange-50 text-orange-700'">
                  <svg class="w-3 h-3 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
                  </svg>
                  {{ physicalConditionOptions.find(o => o.value === m.physicalCondition)?.label }}
                </span>
                <span v-if="!m.selfCare"
                  class="inline-flex items-center gap-1 bg-red-50 text-red-600 text-micro px-2 py-0.5 rounded-full">
                  <svg class="w-3 h-3 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
                  </svg>
                  ดูแลตนเองไม่ได้
                </span>
              </div>
            </div>
          </div>
        </div>
        <!-- empty state -->
        <div v-else class="flex flex-col items-center gap-2 py-6 mb-3 text-center">
          <div class="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
            <svg class="w-6 h-6 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          </div>
          <p class="text-body-xs font-medium text-slate-500">ยังไม่มีข้อมูลสมาชิกในครัวเรือน</p>
          <p class="text-micro text-slate-400">กดปุ่ม "เพิ่มสมาชิกในครัวเรือน" เพื่อเพิ่มข้อมูล</p>
        </div>

        <!-- ปุ่มเพิ่มสมาชิกในครัวเรือน -->
        <button v-if="editingIndex === null" type="button" @click="openAddMember"
          class="flex items-center gap-2 px-4 py-2 bg-[#1A56DB] text-white text-body-xs font-semibold rounded-xl hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm mt-2 mx-auto">
          <svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v2.5h-2.5a.75.75 0 000 1.5h2.5v2.5a.75.75 0 001.5 0v-2.5h2.5a.75.75 0 000-1.5h-2.5v-2.5z" clip-rule="evenodd" />
          </svg>
          เพิ่มสมาชิกในครัวเรือน
        </button>

        <!-- ฟอร์ม add/edit สมาชิก -->
        <div v-if="editingMember !== null" class="mt-3 border border-slate-200 rounded-xl p-4 bg-white shadow-sm">
          <p class="text-body-md font-semibold text-slate-700 mb-5">
            {{ editingIndex === -1 ? 'เพิ่มสมาชิกในครัวเรือน' : 'แก้ไขข้อมูลสมาชิกในครัวเรือน' }}
          </p>
          <div class="space-y-3 mt-2">
            <!-- คำนำหน้า + ชื่อ (แถวเดียว — layout เดียวกับส่วนผู้ประสบปัญหาทางสังคม) -->
            <div class="flex gap-3">
              <!-- คำนำหน้า -->
              <div class="w-[35%]">
                <label class="text-hint text-slate-600 mb-1.5 font-medium block">คำนำหน้า <span class="text-red-500">*</span></label>
                <select v-model="editingMember.prefixId"
                  class="w-full bg-white border rounded-xl px-3 py-2 text-body-xs focus:outline-none focus:ring-2 transition-colors"
                  :class="editMemberErrors.prefixId ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'">
                  <!-- option แรกเป็น placeholder (disabled) บังคับให้ผู้ใช้เลือก -->
                  <option value="" disabled>เลือกคำนำหน้า</option>
                  <option v-for="opt in prefixOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  <!-- 'none' = อื่นๆ / ไม่ระบุ → ส่ง prefix_id เป็น null (ดู toPayload ใน store) -->
                  <option value="none">อื่นๆ / ไม่ระบุ</option>
                </select>
                <p v-if="editMemberErrors.prefixId" class="text-micro text-red-500 mt-0.5">{{ editMemberErrors.prefixId }}</p>
                <!-- เลือก 'อื่นๆ / ไม่ระบุ' → ให้กรอกคำนำหน้าเองได้ (เก็บลง prefix_other) -->
                <input v-if="editingMember.prefixId === 'none'"
                  v-model="editingMember.prefixOther" type="text" maxlength="50"
                  placeholder="ระบุคำนำหน้า"
                  class="mt-1.5 w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-body-xs focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]" />
              </div>
              <!-- ชื่อ -->
              <div class="flex-1">
                <label class="text-hint text-slate-600 mb-1.5 font-medium block">ชื่อ <span class="text-red-500">*</span></label>
                <input
                  :value="editingMember.firstName"
                  @input="(e) => handleMemberNameInput(e, 'firstName')"
                  type="text"
                  class="w-full bg-white border rounded-xl px-3 py-2 text-body-xs focus:outline-none focus:ring-2 transition-colors"
                  :class="editMemberErrors.firstName ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'" />
                <p v-if="editMemberErrors.firstName" class="text-micro text-red-500 mt-0.5">{{ editMemberErrors.firstName }}</p>
              </div>
            </div>
            <!-- นามสกุล -->
            <div>
              <label class="text-hint text-slate-600 mb-1.5 font-medium block">นามสกุล <span class="text-red-500">*</span></label>
              <input
                :value="editingMember.lastName"
                @input="(e) => handleMemberNameInput(e, 'lastName')"
                type="text"
                class="w-full bg-white border rounded-xl px-3 py-2 text-body-xs focus:outline-none focus:ring-2 transition-colors"
                :class="editMemberErrors.lastName ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'" />
              <p v-if="editMemberErrors.lastName" class="text-micro text-red-500 mt-0.5">{{ editMemberErrors.lastName }}</p>
            </div>
            <!-- เลขบัตรประชาชน -->
            <div>
              <label class="text-hint text-slate-600 mb-1.5 font-medium block">เลขบัตรประชาชน</label>
              <input
                :value="formatPIDInput(editingMember.nationalId)"
                @input="(e) => handleMemberDigitsInput(e, 'nationalId')"
                @blur="handleNationalIdBlur"
                maxlength="17" type="text" inputmode="numeric"
                placeholder="ระบุ 13 หลัก (ถ้ามี)"
                class="w-full bg-white border rounded-xl px-3 py-2 text-body-xs focus:outline-none focus:ring-2 transition-colors"
                :class="editMemberErrors.nationalId ? 'border-red-300 focus:ring-red-200' : nationalIdSuccess ? 'border-green-400 focus:ring-green-200' : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'" />
              <!-- error (แดง) มาก่อน ถ้าไม่มี error และเลขถูกต้องจึงโชว์ข้อความเขียว -->
              <p v-if="editMemberErrors.nationalId" class="text-micro text-red-500 mt-0.5">{{ editMemberErrors.nationalId }}</p>
              <p v-else-if="nationalIdSuccess" class="text-micro text-green-600 mt-0.5 flex items-center gap-1">
                <svg class="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
                </svg>
                {{ nationalIdSuccess }}
              </p>
            </div>
            <!-- วันเกิด + อายุอัตโนมัติ (เลือกแบบไทย) — เต็มแถว เพราะมี 3 select -->
            <div>
              <label class="text-hint text-slate-600 mb-1.5 font-medium block">วัน/เดือน/ปีเกิด <span class="text-red-500">*</span></label>
              <div class="flex gap-2">
                <!-- วัน: แคบ -->
                <select
                  v-model="memberDobParts.day"
                  @change="handleDobPartChange"
                  class="w-[62px] shrink-0 bg-white border rounded-xl px-2 py-2.5 text-body-xs focus:outline-none focus:ring-2 transition-colors"
                  :class="editMemberErrors.dateOfBirth ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'">
                  <option value="">วัน</option>
                  <option v-for="d in dobDayOptions" :key="d" :value="String(d)">{{ d }}</option>
                </select>
                <!-- เดือน: กว้างที่สุด (ชื่อไทย) -->
                <select
                  v-model="memberDobParts.month"
                  @change="handleDobPartChange"
                  class="flex-1 min-w-0 bg-white border rounded-xl px-3 py-2.5 text-body-xs focus:outline-none focus:ring-2 transition-colors"
                  :class="editMemberErrors.dateOfBirth ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'">
                  <option value="">เดือน</option>
                  <option v-for="(name, idx) in THAI_MONTHS" :key="idx + 1" :value="String(idx + 1)">{{ name }}</option>
                </select>
                <!-- ปี พ.ศ.: กลาง -->
                <select
                  v-model="memberDobParts.year"
                  @change="handleDobPartChange"
                  class="w-[88px] shrink-0 bg-white border rounded-xl px-2 py-2.5 text-body-xs focus:outline-none focus:ring-2 transition-colors"
                  :class="editMemberErrors.dateOfBirth ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'">
                  <option value="">ปี พ.ศ.</option>
                  <option v-for="y in dobYearOptions" :key="y" :value="String(y)">{{ y }}</option>
                </select>
              </div>
              <p v-if="editMemberErrors.dateOfBirth" class="text-micro text-red-500 mt-1">{{ editMemberErrors.dateOfBirth }}</p>
              <p v-else-if="editingMember.dateOfBirth" class="text-micro text-slate-500 mt-1">
                {{ formatThaiDate(editingMember.dateOfBirth) }} · อายุ {{ calcMemberAge(editingMember.dateOfBirth) }} ปี
              </p>
            </div>
            <!-- ความสัมพันธ์ + อาชีพ + รายได้ + สภาพร่างกาย (จัด 2 คอลัมน์ให้กระชับ) -->
            <div class="grid grid-cols-2 gap-3">
              <!-- ความสัมพันธ์ -->
              <div>
                <label class="text-hint text-slate-600 mb-1.5 font-medium block">ความสัมพันธ์กับผู้ประสบปัญหา <span class="text-red-500">*</span></label>
                <select
                  v-model="editingMember.relationToApplicantId"
                  class="w-full bg-white border rounded-xl px-3 py-2 text-body-xs focus:outline-none focus:ring-2 transition-colors appearance-none"
                  :class="editMemberErrors.relationToApplicantId ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'">
                  <option :value="null" disabled>เลือกความสัมพันธ์</option>
                  <option v-for="opt in relationTypeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
                <p v-if="editMemberErrors.relationToApplicantId" class="text-micro text-red-500 mt-0.5">{{ editMemberErrors.relationToApplicantId }}</p>
              </div>
              <!-- อาชีพ -->
              <div>
                <label class="text-hint text-slate-600 mb-1.5 font-medium block">อาชีพ <span class="text-red-500">*</span></label>
                <input v-model="editingMember.occupation" type="text" maxlength="255"
                  class="w-full bg-white border rounded-xl px-3 py-2 text-body-xs focus:outline-none focus:ring-2 transition-colors"
                  :class="editMemberErrors.occupation ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'" />
                <p v-if="editMemberErrors.occupation" class="text-micro text-red-500 mt-0.5">{{ editMemberErrors.occupation }}</p>
              </div>
              <!-- รายได้ต่อเดือน -->
              <div>
                <label class="text-hint text-slate-600 mb-1.5 font-medium block">รายได้ต่อเดือน (บาท) <span class="text-red-500">*</span></label>
                <div class="relative">
                  <input
                    :value="displayIncome"
                    @input="handleMemberIncomeInput"
                    type="text" inputmode="numeric" pattern="[0-9]*"
                    placeholder="0"
                    class="w-full bg-white border rounded-xl px-3 py-2 pr-14 text-body-xs focus:outline-none focus:ring-2 transition-colors"
                    :class="editMemberErrors.monthlyIncome ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'" />
                  <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-micro text-slate-400">บาท</span>
                </div>
                <p v-if="editMemberErrors.monthlyIncome" class="text-micro text-red-500 mt-0.5">{{ editMemberErrors.monthlyIncome }}</p>
              </div>
              <!-- สภาพร่างกาย -->
              <div>
                <label class="text-hint text-slate-600 mb-1.5 font-medium block">สภาพทางร่างกาย <span class="text-red-500">*</span></label>
                <select v-model="editingMember.physicalCondition"
                  class="w-full bg-white border rounded-xl px-3 py-2 text-body-xs focus:outline-none focus:ring-2 transition-colors"
                  :class="editMemberErrors.physicalCondition ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'">
                  <option value="" disabled>เลือกสภาพทางร่างกาย</option>
                  <option v-for="opt in physicalConditionOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
                <p v-if="editMemberErrors.physicalCondition" class="text-micro text-red-500 mt-0.5">{{ editMemberErrors.physicalCondition }}</p>
              </div>
            </div>
            <!-- การช่วยเหลือตนเอง (radio 2 ตัวเลือก) -->
            <div>
              <label class="text-hint text-slate-600 mb-1.5 font-medium block">การช่วยเหลือตนเอง <span class="text-red-500">*</span></label>
              <div class="grid grid-cols-2 gap-2">
                <!-- ช่วยเหลือตนเองได้ -->
                <label
                  class="flex items-center gap-2 border rounded-xl px-3 py-2.5 cursor-pointer transition-colors"
                  :class="editingMember.selfCare === true ? 'border-[#1A56DB] bg-blue-50' : 'border-slate-200 hover:bg-slate-50'">
                  <input type="radio" :value="true" v-model="editingMember.selfCare" class="w-4 h-4 accent-[#1A56DB]" />
                  <span class="text-body-xs text-slate-700">ช่วยเหลือตนเองได้</span>
                </label>
                <!-- ช่วยเหลือตนเองไม่ได้ -->
                <label
                  class="flex items-center gap-2 border rounded-xl px-3 py-2.5 cursor-pointer transition-colors"
                  :class="editingMember.selfCare === false ? 'border-[#1A56DB] bg-blue-50' : 'border-slate-200 hover:bg-slate-50'">
                  <input type="radio" :value="false" v-model="editingMember.selfCare" class="w-4 h-4 accent-[#1A56DB]" />
                  <span class="text-body-xs text-slate-700">ช่วยเหลือตนเองไม่ได้</span>
                </label>
              </div>
              <p v-if="editMemberErrors.selfCare" class="text-micro text-red-500 mt-0.5">{{ editMemberErrors.selfCare }}</p>
            </div>
          </div>
          <!-- ปุ่ม บันทึก / ยกเลิก -->
          <div class="flex gap-2 mt-4 justify-end">
            <button type="button" @click="cancelEditMember"
              class="px-4 py-1.5 text-body-xs border border-slate-300 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors">
              ยกเลิก
            </button>
            <button type="button" @click="saveMember"
              class="px-4 py-1.5 text-body-xs bg-[#1A56DB] text-white rounded-xl hover:bg-blue-700 transition-colors">
              บันทึก
            </button>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>
