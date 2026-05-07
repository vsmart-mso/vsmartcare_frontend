// composable สำหรับ cascade dropdown จังหวัด → อำเภอ → ตำบล → รหัสไปรษณีย์
// ข้อมูลโหลดจาก /thai-address.json ครั้งเดียว แล้ว cache ไว้ใน module scope ตลอด session

import { ref, computed, watch } from 'vue'

// รูปแบบข้อมูลในไฟล์ public/thai-address.json
// p = จังหวัด, a = อำเภอ/เขต, d = ตำบล/แขวง, z = รหัสไปรษณีย์
interface AddressEntry {
  p: string
  a: string
  d: string
  z: string
}

// ─── Module-level cache ────────────────────────────────────────────────────────
// เก็บไว้นอก function เพื่อให้ทุก component ที่ใช้ composable นี้ share ข้อมูลชุดเดียวกัน
// ไม่ต้อง fetch ซ้ำเมื่อ component ถูก mount ใหม่
let _cache: AddressEntry[] | null = null
let _loadPromise: Promise<AddressEntry[]> | null = null

function loadAddressData(): Promise<AddressEntry[]> {
  if (_cache) return Promise.resolve(_cache)
  if (_loadPromise) return _loadPromise

  _loadPromise = fetch('/thai-address.json')
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json() as Promise<AddressEntry[]>
    })
    .then(data => {
      _cache = data
      return data
    })

  return _loadPromise
}

// ─── composable หลัก ──────────────────────────────────────────────────────────
export function useThaiAddress() {
  // ข้อมูลทั้งหมด (โหลดครั้งเดียว)
  const entries = ref<AddressEntry[]>([])
  const isLoading = ref(true)
  const loadError = ref(false)

  // ค่าที่ผู้ใช้เลือก
  const province    = ref('')
  const district    = ref('')
  const subdistrict = ref('')
  const zipcode     = ref('')   // auto-fill จากตำบลที่เลือก (read-only)

  // โหลดข้อมูลตอน composable ถูกใช้ครั้งแรก
  loadAddressData()
    .then(data => {
      entries.value = data
      isLoading.value = false
    })
    .catch(() => {
      loadError.value = true
      isLoading.value = false
    })

  // ─── รายการสำหรับ dropdown แต่ละระดับ ──────────────────────────────────────

  // รายชื่อจังหวัดทั้งหมด (unique, เรียงตัวอักษร)
  const provinceList = computed(() =>
    [...new Set(entries.value.map(e => e.p))].sort((a, b) =>
      a.localeCompare(b, 'th')
    )
  )

  // รายชื่ออำเภอ: กรองจากจังหวัดที่เลือก
  const districtList = computed(() => {
    if (!province.value) return []
    return [...new Set(
      entries.value
        .filter(e => e.p === province.value)
        .map(e => e.a)
    )].sort((a, b) => a.localeCompare(b, 'th'))
  })

  // รายชื่อตำบล: กรองจากจังหวัด + อำเภอที่เลือก
  const subdistrictList = computed(() => {
    if (!province.value || !district.value) return []
    return entries.value
      .filter(e => e.p === province.value && e.a === district.value)
      .map(e => ({ name: e.d, zip: e.z }))
      .sort((a, b) => a.name.localeCompare(b.name, 'th'))
  })

  // ─── Cascade watchers ────────────────────────────────────────────────────────
  // เมื่อเปลี่ยนจังหวัด → reset อำเภอ ตำบล รหัสไปรษณีย์
  watch(province, () => {
    district.value    = ''
    subdistrict.value = ''
    zipcode.value     = ''
  })

  // เมื่อเปลี่ยนอำเภอ → reset ตำบล รหัสไปรษณีย์
  watch(district, () => {
    subdistrict.value = ''
    zipcode.value     = ''
  })

  // เมื่อเลือกตำบล → auto-fill รหัสไปรษณีย์
  watch(subdistrict, val => {
    if (!val) { zipcode.value = ''; return }
    const found = subdistrictList.value.find(s => s.name === val)
    zipcode.value = found?.zip ?? ''
  })

  return {
    isLoading,
    loadError,
    province,
    district,
    subdistrict,
    zipcode,
    provinceList,
    districtList,
    subdistrictList,
  }
}
