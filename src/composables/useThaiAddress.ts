// composable สำหรับ cascade dropdown จังหวัด → อำเภอ → ตำบล → รหัสไปรษณีย์
// ดึงข้อมูลจาก BFF API แทนไฟล์ JSON เพื่อให้ข้อมูลตรงกับฐานข้อมูลหลังบ้าน
// ข้อมูลทุกระดับถูก cache ไว้ใน geoApi — ไม่เรียก API ซ้ำเมื่อ component re-mount

import { ref, computed, watch } from 'vue'
import { geoApi, type Province, type District, type SubDistrict } from '@/api/geo'

// ─── composable หลัก ──────────────────────────────────────────────────────────
export function useThaiAddress() {
  const isLoading  = ref(true)
  const loadError  = ref(false)

  // ข้อมูลดิบจาก API (reactive — ใช้ใน computed ด้านล่าง)
  const provinces    = ref<Province[]>([])
  const districts    = ref<District[]>([])
  const subDistricts = ref<SubDistrict[]>([])

  // ค่าที่ผู้ใช้เลือก (เก็บเป็นชื่อเพื่อแสดงผล)
  const province    = ref('')
  const district    = ref('')
  const subdistrict = ref('')
  const zipcode     = ref('')   // auto-fill เมื่อเลือกตำบล (read-only)

  // ID ที่ได้จากการเลือก — ใช้ตอนส่ง API
  const provinceId            = ref<number | null>(null)
  const districtId            = ref<number | null>(null)
  // bridge ID สำหรับ sub_district_postcode_id ที่ต้องส่งไปหลังบ้าน
  const subDistrictPostcodeId = ref<number | null>(null)

  // โหลดจังหวัดทันทีที่ composable ถูกใช้ (ได้จาก cache ถ้ามีแล้ว)
  geoApi.fetchProvinces()
    .then(data => { provinces.value = data; isLoading.value = false })
    .catch(() => { loadError.value = true; isLoading.value = false })

  // ─── รายการสำหรับ dropdown แต่ละระดับ ──────────────────────────────────────
  const provinceList    = computed(() => provinces.value)
  const districtList    = computed(() => districts.value)
  const subdistrictList = computed(() =>
    subDistricts.value
      .map(sd => ({
        name:     sd.name,
        zip:      sd.sub_districts_postcode[0]?.postcode.name ?? '',
        bridgeId: sd.sub_districts_postcode[0]?.id ?? null,
      }))
      // กรองตำบลที่ไม่มีรหัสไปรษณีย์ออก (record เก่าที่ถูกย้ายอำเภอ เช่น "บึงสามัคคี*")
      .filter(s => s.bridgeId !== null)
  )

  // ─── Cascade watchers (ใช้เมื่อผู้ใช้เลือกเอง) ──────────────────────────────
  // เมื่อเปลี่ยนจังหวัด → fetch อำเภอใหม่ + reset ระดับล่าง
  watch(province, async (name) => {
    district.value              = ''
    subdistrict.value           = ''
    zipcode.value               = ''
    districtId.value            = null
    subDistrictPostcodeId.value = null
    districts.value             = []
    subDistricts.value          = []

    if (!name) { provinceId.value = null; return }

    const found = provinces.value.find(p => p.name === name)
    if (!found) { provinceId.value = null; return }
    provinceId.value = found.id

    try {
      districts.value = await geoApi.fetchDistricts(found.id)
    } catch {
      districts.value = []
    }
  })

  // เมื่อเปลี่ยนอำเภอ → fetch ตำบลใหม่ + reset ระดับล่าง
  watch(district, async (name) => {
    subdistrict.value           = ''
    zipcode.value               = ''
    subDistrictPostcodeId.value = null
    subDistricts.value          = []

    if (!name) { districtId.value = null; return }

    const found = districts.value.find(d => d.name === name)
    if (!found) { districtId.value = null; return }
    districtId.value = found.id

    try {
      subDistricts.value = await geoApi.fetchSubDistricts(found.id)
    } catch {
      subDistricts.value = []
    }
  })

  // เมื่อเลือกตำบล → auto-fill รหัสไปรษณีย์ และ bridge ID
  watch(subdistrict, (name) => {
    if (!name) {
      zipcode.value               = ''
      subDistrictPostcodeId.value = null
      return
    }
    const found = subdistrictList.value.find(s => s.name === name)
    zipcode.value               = found?.zip      ?? ''
    subDistrictPostcodeId.value = found?.bridgeId ?? null
  })

  // ─── restore() ────────────────────────────────────────────────────────────────
  // ใช้ตอน onMounted เพื่อกรอกข้อมูลกลับเมื่อ user ย้อนกลับมา
  // ต้อง await เพราะ API fetch เป็น async — nextTick() ไม่เพียงพอ
  async function restore(
    savedProvince: string,
    savedDistrict: string,
    savedSubdistrict: string,
  ) {
    if (!savedProvince) return

    // รอจังหวัดโหลดเสร็จก่อน (อาจยังอยู่ระหว่าง fetch ครั้งแรก)
    if (provinces.value.length === 0) {
      try { provinces.value = await geoApi.fetchProvinces() } catch { return }
    }

    // หา province ID แล้ว fetch อำเภอ (จาก cache)
    const prov = provinces.value.find(p => p.name === savedProvince)
    if (!prov) return
    provinceId.value = prov.id
    province.value   = savedProvince   // ตั้ง province โดยไม่ให้ watcher reset ระดับล่าง

    try {
      districts.value = await geoApi.fetchDistricts(prov.id)
    } catch { return }

    if (!savedDistrict) return

    // หา district ID แล้ว fetch ตำบล (จาก cache)
    const dist = districts.value.find(d => d.name === savedDistrict)
    if (!dist) return
    districtId.value = dist.id
    district.value   = savedDistrict   // ตั้ง district โดยไม่ให้ watcher reset ระดับล่าง

    try {
      subDistricts.value = await geoApi.fetchSubDistricts(dist.id)
    } catch { return }

    if (!savedSubdistrict) return

    // ตั้ง subdistrict และ auto-fill zipcode + bridge ID
    subdistrict.value = savedSubdistrict
    const sub = subdistrictList.value.find(s => s.name === savedSubdistrict)
    zipcode.value               = sub?.zip      ?? ''
    subDistrictPostcodeId.value = sub?.bridgeId ?? null
  }

  return {
    isLoading,
    loadError,
    province,
    district,
    subdistrict,
    zipcode,
    provinceId,
    districtId,
    subDistrictPostcodeId,
    provinceList,
    districtList,
    subdistrictList,
    restore,
  }
}
