<script setup lang="ts">
import { ref, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
import type { Map as LeafletMap, Marker, TileLayer } from 'leaflet'

// ─── Props & Emits ────────────────────────────────────────────────────────────
const props = withDefaults(defineProps<{
  lat?: string
  lng?: string
  addressHint?: string
}>(), {
  lat: '',
  lng: '',
  addressHint: '',
})

const emit = defineEmits<{
  'update:lat': [string]
  'update:lng': [string]
}>()

// ─── State ────────────────────────────────────────────────────────────────────
// เริ่มต้นที่โหมด 'manual' เพื่อให้ผู้ใช้กดรับพิกัด GPS ได้ทันที (สลับไปโหมดแผนที่ได้ภายหลัง)
const inputMode       = ref<'map' | 'manual'>('manual') // สลับระหว่างโหมดแผนที่กับกรอกพิกัด
const searchQuery     = ref('')
const searchResults   = ref<NominatimResult[]>([])
const isSearching     = ref(false)
const mapContainerEl  = ref<HTMLDivElement | null>(null)
const mapMode         = ref<'street' | 'satellite'>('street')

const pendingLat      = ref('')
const pendingLng      = ref('')
const selectedName    = ref('')
const isConfirmed     = ref(false)

const isGettingLocation = ref(false)
const geoError          = ref('')
const isMapLoading      = ref(true)  // แสดง loading overlay ขณะ Leaflet กำลังโหลด

let map: LeafletMap | null = null
let marker: Marker | null = null
let currentTile: TileLayer | null = null
let labelTile:   TileLayer | null = null
let L: typeof import('leaflet') | null = null

// AbortController สำหรับยกเลิก fetch ที่ค้างอยู่ ป้องกัน race condition และ hanging spinner
let searchController: AbortController | null = null
let hintController:   AbortController | null = null
let hintDebounce:     ReturnType<typeof setTimeout> | null = null

// OSM Standard — แสดงภาษาไทยทุก zoom level สำหรับไทย
const TILES = {
  street: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    maxZoom: 18,
  },
}

const LABEL_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'

// ─── Types ────────────────────────────────────────────────────────────────────
interface NominatimAddress {
  village?: string
  hamlet?: string
  suburb?: string
  subdistrict?: string
  quarter?: string
  neighbourhood?: string
  county?: string
  city_district?: string
  state?: string
}

interface NominatimResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
  address?: NominatimAddress
}

function formatAddressHint(result: NominatimResult): string {
  const a = result.address
  const parts: string[] = []
  if (a) {
    const sub = a.subdistrict || a.suburb || a.quarter || a.neighbourhood
    if (sub) parts.push(`ต.${sub.replace(/^(ตำบล|แขวง)\s*/, '')}`)
    const dist = a.county || a.city_district
    if (dist) parts.push(`อ.${dist.replace(/^(อำเภอ|เขต)\s*/, '')}`)
    if (a.state) parts.push(`จ.${a.state.replace(/^จังหวัด\s*/, '')}`)
  }
  if (!parts.some(p => p.startsWith('จ.'))) {
    const segs = result.display_name
      .split(',')
      .map(s => s.trim())
      .filter(s => s && s !== 'ประเทศไทย' && s !== 'Thailand' && !/^\d+$/.test(s))
    const last = segs[segs.length - 1]
    if (last) parts.push(`จ.${last.replace(/^จังหวัด\s*/, '')}`)
  }
  return parts.join('  ')
}

// ─── Map Initialization ───────────────────────────────────────────────────────
async function initMap() {
  isMapLoading.value = true
  try {
  L = await import('leaflet')
  await import('leaflet/dist/leaflet.css')
  if (!mapContainerEl.value || !L) return

  const defaultLat = props.lat ? parseFloat(props.lat) : 16.8211
  const defaultLng = props.lng ? parseFloat(props.lng) : 100.2659

  map = L.map(mapContainerEl.value, { zoomControl: true }).setView([defaultLat, defaultLng], 13)

  const t = TILES[mapMode.value]
  currentTile = L.tileLayer(t.url, { attribution: t.attribution, maxZoom: t.maxZoom }).addTo(map)
  if (mapMode.value === 'satellite') {
    labelTile = L.tileLayer(LABEL_URL, { maxZoom: 18 }).addTo(map)
  }

  const iconUrl       = new URL('leaflet/dist/images/marker-icon.png',    import.meta.url).href
  const iconRetinaUrl = new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href
  const shadowUrl     = new URL('leaflet/dist/images/marker-shadow.png',  import.meta.url).href
  const defaultIcon   = L.icon({ iconUrl, iconRetinaUrl, shadowUrl, iconSize: [25, 41], iconAnchor: [12, 41] })
  L.Marker.prototype.options.icon = defaultIcon

  if (props.lat && props.lng) {
    placeMarker(defaultLat, defaultLng, '')
    pendingLat.value = props.lat
    pendingLng.value = props.lng
  }

  map.on('click', (e) => {
    placeMarker(e.latlng.lat, e.latlng.lng, '')
    selectedName.value = ''
  })
  } finally {
    isMapLoading.value = false
  }
}

function placeMarker(lat: number, lng: number, name: string) {
  if (!map || !L) return
  if (marker) {
    marker.setLatLng([lat, lng])
  } else {
    marker = L.marker([lat, lng]).addTo(map)
  }
  map.setView([lat, lng], 15)
  pendingLat.value   = lat.toFixed(6)
  pendingLng.value   = lng.toFixed(6)
  selectedName.value = name
  isConfirmed.value  = false
}

// ─── Nominatim Search ─────────────────────────────────────────────────────────
let searchDebounce: ReturnType<typeof setTimeout> | null = null

function handleSearchInput() {
  if (searchDebounce) clearTimeout(searchDebounce)
  if (!searchQuery.value.trim()) { searchResults.value = []; return }
  searchDebounce = setTimeout(doSearch, 600)
}

async function doSearch() {
  if (!searchQuery.value.trim()) return
  // ยกเลิก request เดิมถ้ายังค้างอยู่ ป้องกัน race condition (ผลเก่ากลับมาทีหลังผลใหม่)
  if (searchController) searchController.abort()
  searchController = new AbortController()
  // timeout 8 วิ — ไม่ให้ spinner หมุนค้างนานเกินไปบนเน็ตช้า
  const timeoutId = setTimeout(() => searchController?.abort(), 8000)
  isSearching.value = true
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery.value)}&format=json&limit=50&countrycodes=th&accept-language=th&addressdetails=1`
    const res  = await fetch(url, {
      headers: { 'User-Agent': 'vsmartcare-frontend/1.0' },
      signal: searchController.signal,
    })
    searchResults.value = await res.json() as NominatimResult[]
  } catch (err) {
    // AbortError = ยกเลิกโดยตั้งใจ (request ใหม่มาแทน หรือ timeout) ไม่ต้องล้าง results
    if ((err as Error)?.name !== 'AbortError') searchResults.value = []
  } finally {
    clearTimeout(timeoutId)
    isSearching.value = false
  }
}

function handleSelectResult(result: NominatimResult) {
  placeMarker(parseFloat(result.lat), parseFloat(result.lon), result.display_name)
  searchResults.value = []
  searchQuery.value   = ''
}

// ─── Toggle Map Tile ──────────────────────────────────────────────────────────
function toggleMapMode() {
  if (!map || !L) return
  mapMode.value = mapMode.value === 'street' ? 'satellite' : 'street'
  if (currentTile) map.removeLayer(currentTile)
  if (labelTile)   { map.removeLayer(labelTile); labelTile = null }
  const t = TILES[mapMode.value]
  currentTile = L.tileLayer(t.url, { attribution: t.attribution, maxZoom: t.maxZoom }).addTo(map)
  if (mapMode.value === 'satellite') {
    labelTile = L.tileLayer(LABEL_URL, { maxZoom: 18 }).addTo(map)
  }
}

// ─── Manual GPS Input ─────────────────────────────────────────────────────────
// ดึงพิกัดจาก Geolocation API ของเบราว์เซอร์
function handleGetGPS() {
  if (!navigator.geolocation) {
    geoError.value = 'เบราว์เซอร์ไม่รองรับการดึงพิกัด GPS'
    return
  }
  isGettingLocation.value = true
  geoError.value = ''
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude.toFixed(6)
      const lng = pos.coords.longitude.toFixed(6)
      pendingLat.value    = lat
      pendingLng.value    = lng
      selectedName.value  = ''
      isConfirmed.value   = false
      isGettingLocation.value = false
      // ถ้าเปลี่ยนกลับไปโหมดแผนที่ ให้หมุดอยู่ถูกที่
      if (map) placeMarker(parseFloat(lat), parseFloat(lng), '')
    },
    (err) => {
      geoError.value =
        err.code === 1 ? 'กรุณาอนุญาตการเข้าถึงตำแหน่งในเบราว์เซอร์' :
        err.code === 3 ? 'GPS ใช้เวลานานเกินไป ลองออกไปที่โล่งแล้วกดใหม่' :
                         'ไม่สามารถดึงพิกัด GPS ได้ กรุณาลองใหม่'
      isGettingLocation.value = false
    },
    // enableHighAccuracy: true — ใช้ GPS chip จริง แม่นระดับเมตร (สำคัญสำหรับบันทึกที่อยู่)
    // timeout 20 วิ — ให้เวลา GPS lock สัญญาณบนมือถือช้าหรืออยู่ในอาคาร
    { enableHighAccuracy: true, timeout: 20000 },
  )
}

// รับ input ละติจูด/ลองติจูด — อนุญาตเฉพาะตัวเลข จุดทศนิยม และเครื่องหมายลบ
function handleCoordInput(e: Event, setter: (v: string) => void) {
  const el  = e.target as HTMLInputElement
  const val = el.value.replace(/[^0-9.\-]/g, '')
  setter(val)
  el.value = val
  isConfirmed.value = false
}

// ─── Confirm ──────────────────────────────────────────────────────────────────
function handleConfirm() {
  if (!pendingLat.value || !pendingLng.value) return
  emit('update:lat', pendingLat.value)
  emit('update:lng', pendingLng.value)
  isConfirmed.value = true
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(() => { initMap() })

onBeforeUnmount(() => {
  if (map) { map.remove(); map = null; marker = null }
  if (searchDebounce)  clearTimeout(searchDebounce)
  if (hintDebounce)    clearTimeout(hintDebounce)
  if (searchController) searchController.abort()
  if (hintController)   hintController.abort()
})

// เมื่อสลับกลับมาโหมดแผนที่ Leaflet ต้อง recalculate ขนาด เพราะถูก v-show ซ่อนอยู่ก่อน
watch(inputMode, async (mode) => {
  if (mode === 'map') {
    await nextTick()
    map?.invalidateSize()
  }
})

// addressHint: pan แผนที่ไปยังตำบลที่เลือกในฟอร์ม (เฉพาะเมื่อยังไม่มีหมุด)
// debounce 400ms + AbortController — เลือก จ.→อ.→ต. ติดกัน ยิงแค่ request เดียว
watch(() => props.addressHint, (hint) => {
  if (hintDebounce) clearTimeout(hintDebounce)
  if (hintController) { hintController.abort(); hintController = null }
  if (!hint.trim() || !map || pendingLat.value !== '') return
  hintDebounce = setTimeout(async () => {
    hintController = new AbortController()
    const timeoutId = setTimeout(() => hintController?.abort(), 5000)
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(hint)}&format=json&limit=1&countrycodes=th`
      const res  = await fetch(url, {
        headers: { 'User-Agent': 'vsmartcare-frontend/1.0' },
        signal: hintController.signal,
      })
      const data = await res.json() as { lat: string; lon: string }[]
      if (data.length > 0) map?.setView([parseFloat(data[0].lat), parseFloat(data[0].lon)], 14)
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') { /* silent */ }
    } finally {
      clearTimeout(timeoutId)
    }
  }, 400)
})

// restore จาก store: ขยับหมุดตาม props lat/lng
watch(() => [props.lat, props.lng], ([lat, lng]) => {
  if (lat && lng && map && !(lat === pendingLat.value && lng === pendingLng.value)) {
    placeMarker(parseFloat(lat), parseFloat(lng), selectedName.value)
  }
})
</script>

<template>
  <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">

    <!-- Header + Toggle -->
    <div class="px-4 pt-4 pb-3">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-body-md font-semibold text-slate-700">พิกัด GPS (ที่อยู่อาศัยปัจจุบัน)</p>
          <p class="text-hint text-slate-400 mt-0.5">
            {{ inputMode === 'map' ? 'ค้นหาที่อยู่หรือเลือกจุดบนแผนที่' : 'กดรับพิกัดอัตโนมัติหรือกรอกพิกัดด้วยตนเอง' }}
          </p>
        </div>
        <!-- Toggle กรอกพิกัด / แผนที่ — เรียง "กรอกพิกัด" ไว้ซ้ายให้ตรงกับโหมดเริ่มต้น -->
        <div class="flex rounded-lg overflow-hidden border border-slate-200 flex-shrink-0 text-hint font-semibold">
          <button
            type="button"
            @click="inputMode = 'manual'"
            class="px-3 py-1.5 transition-colors"
            :class="inputMode === 'manual' ? 'bg-[#1A56DB] text-white' : 'bg-white text-slate-500 hover:bg-slate-50'"
          >กรอกพิกัด</button>
          <button
            type="button"
            @click="inputMode = 'map'"
            class="px-3 py-1.5 transition-colors border-l border-slate-200"
            :class="inputMode === 'map' ? 'bg-[#1A56DB] text-white' : 'bg-white text-slate-500 hover:bg-slate-50'"
          >แผนที่</button>
        </div>
      </div>
    </div>

    <!-- ══ โหมดแผนที่ — ใช้ v-show ไม่ใช่ v-if เพื่อให้ DOM ของ Leaflet คงอยู่ตลอด ══ -->
    <div v-show="inputMode === 'map'">

      <!-- Search Box -->
      <div class="px-4 pb-3 relative">
        <div class="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus-within:ring-2 focus-within:ring-[#1A56DB]/30 focus-within:border-[#1A56DB]">
          <svg class="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            v-model="searchQuery"
            @input="handleSearchInput"
            type="text"
            placeholder="ค้นหาสถานที่ เช่น โรงพยาบาล, ตำบล, สถานีรถไฟ"
            class="flex-1 bg-transparent text-body-xs text-slate-700 placeholder:text-slate-400 focus:outline-none"
          />
          <svg v-if="isSearching" class="w-4 h-4 text-[#1A56DB] animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        </div>

        <!-- Dropdown ผลค้นหา -->
        <div
          v-if="searchResults.length > 0"
          class="absolute left-4 right-4 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-[9999] overflow-y-auto max-h-72"
        >
          <button
            v-for="result in searchResults"
            :key="result.place_id"
            type="button"
            @click="handleSelectResult(result)"
            class="w-full text-left px-4 py-3 hover:bg-blue-50 active:bg-blue-100 transition-colors border-b border-slate-100 last:border-b-0"
          >
            <div class="flex items-start gap-2.5">
              <svg class="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.273 1.765 11.842 11.842 0 00.976.544l.062.029.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" clip-rule="evenodd" />
              </svg>
              <div class="min-w-0">
                <p class="text-body-xs font-medium text-slate-700 truncate">
                  {{ result.display_name.split(',')[0] }}
                </p>
                <p v-if="formatAddressHint(result)" class="text-micro text-[#1A56DB] mt-0.5 truncate">
                  {{ formatAddressHint(result) }}
                </p>
                <p v-else class="text-micro text-slate-400 mt-0.5">
                  {{ parseFloat(result.lat).toFixed(4) }}, {{ parseFloat(result.lon).toFixed(4) }}
                </p>
              </div>
            </div>
          </button>
        </div>
      </div>

      <!-- Leaflet Map -->
      <div class="relative isolate">
        <div ref="mapContainerEl" style="height: 220px; width: 100%;" class="z-0" />
        <!-- loading overlay — แสดงขณะ Leaflet กำลัง import (เน็ตช้าอาจใช้เวลาหลายวิ) -->
        <div v-if="isMapLoading" class="absolute inset-0 bg-slate-100 flex flex-col items-center justify-center gap-2 z-10">
          <div class="w-6 h-6 rounded-full border-2 border-[#1A56DB] border-t-transparent animate-spin" />
          <p class="text-hint text-slate-400">กำลังโหลดแผนที่...</p>
        </div>
        <!-- ปุ่มสลับ แผนที่ / ดาวเทียม -->
        <div class="absolute top-2 right-2 z-[1000] flex rounded-lg overflow-hidden shadow border border-white/30">
          <button
            type="button"
            @click="toggleMapMode"
            class="px-2.5 py-1 text-micro font-semibold transition-colors"
            :class="mapMode === 'street' ? 'bg-[#1A56DB] text-white' : 'bg-white/80 text-slate-600 hover:bg-white'"
          >แผนที่</button>
          <button
            type="button"
            @click="toggleMapMode"
            class="px-2.5 py-1 text-micro font-semibold transition-colors"
            :class="mapMode === 'satellite' ? 'bg-[#1A56DB] text-white' : 'bg-white/80 text-slate-600 hover:bg-white'"
          >ดาวเทียม</button>
        </div>
      </div>

    </div>

    <!-- ══ โหมดกรอกพิกัด ══ -->
    <div v-show="inputMode === 'manual'" class="px-4 pb-4">

      <!-- ปุ่มรับพิกัด GPS จากเบราว์เซอร์ -->
      <button
        type="button"
        @click="handleGetGPS"
        :disabled="isGettingLocation"
        class="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-body-xs font-semibold transition-all active:scale-[0.98] disabled:opacity-60 mb-3"
        :class="isGettingLocation ? 'bg-slate-100 text-slate-400' : 'bg-rose-500 hover:bg-rose-600 text-white'"
      >
        <!-- spinner ขณะดึง GPS -->
        <svg v-if="isGettingLocation" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        <!-- ไอคอน pin -->
        <svg v-else class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.273 1.765 11.842 11.842 0 00.976.544l.062.029.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" clip-rule="evenodd" />
        </svg>
        {{ isGettingLocation ? 'กำลังดึงพิกัด...' : 'รับพิกัด GPS' }}
      </button>

      <!-- error จาก geolocation -->
      <p v-if="geoError" class="text-micro text-red-500 mb-3 px-1">{{ geoError }}</p>

      <!-- Input Latitude + Longitude -->
      <div class="flex gap-3">
        <div class="flex-1">
          <label class="block text-hint text-slate-500 mb-1.5">ละติจูด</label>
          <input
            :value="pendingLat"
            @input="(e) => handleCoordInput(e, v => pendingLat = v)"
            type="text"
            inputmode="decimal"
            placeholder="เช่น 16.8211"
            class="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-body-md placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
          />
        </div>
        <div class="flex-1">
          <label class="block text-hint text-slate-500 mb-1.5">ลองจิจูด</label>
          <input
            :value="pendingLng"
            @input="(e) => handleCoordInput(e, v => pendingLng = v)"
            type="text"
            inputmode="decimal"
            placeholder="เช่น 100.2659"
            class="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-body-md placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
          />
        </div>
      </div>
    </div>

    <!-- ══ ส่วนล่าง: แสดงพิกัด + ปุ่มยืนยัน (ใช้ร่วมกันทั้งสองโหมด) ══ -->
    <div
      class="px-4 py-3 border-t transition-colors duration-300"
      :class="isConfirmed ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-100'"
    >
      <div class="flex gap-4 mb-2">
        <div class="flex-1">
          <p class="text-micro text-slate-500 mb-0.5">ละติจูด</p>
          <p class="text-body-md font-semibold transition-colors duration-300"
            :class="isConfirmed ? 'text-green-700' : 'text-slate-700'">
            {{ pendingLat || '—' }}
          </p>
        </div>
        <div class="flex-1">
          <p class="text-micro text-slate-500 mb-0.5">ลองจิจูด</p>
          <p class="text-body-md font-semibold transition-colors duration-300"
            :class="isConfirmed ? 'text-green-700' : 'text-slate-700'">
            {{ pendingLng || '—' }}
          </p>
        </div>
        <div v-if="isConfirmed" class="flex items-center gap-1 self-end pb-0.5">
          <svg class="w-4 h-4 text-green-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
          </svg>
          <span class="text-micro font-semibold text-green-700 whitespace-nowrap">บันทึกแล้ว</span>
        </div>
      </div>

      <div v-if="selectedName && inputMode === 'map'" class="flex items-center gap-1.5 mb-3">
        <svg class="w-3.5 h-3.5 flex-shrink-0 transition-colors duration-300"
          :class="isConfirmed ? 'text-green-600' : 'text-rose-500'"
          viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.273 1.765 11.842 11.842 0 00.976.544l.062.029.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" clip-rule="evenodd" />
        </svg>
        <p class="text-hint text-slate-600 truncate">{{ selectedName.split(',')[0] }}</p>
      </div>

      <button
        type="button"
        @click="handleConfirm"
        :disabled="!pendingLat || !pendingLng"
        class="w-full flex items-center justify-center gap-2 text-white text-body-xs font-semibold py-2.5 rounded-xl active:scale-[0.98] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
        :class="isConfirmed ? 'bg-green-600 hover:bg-green-700' : 'bg-[#1A56DB] hover:bg-[#1648C4]'"
      >
        <svg v-if="isConfirmed" class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
        </svg>
        <svg v-else class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.273 1.765 11.842 11.842 0 00.976.544l.062.029.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" clip-rule="evenodd" />
        </svg>
        {{ isConfirmed ? 'ใช้พิกัดนี้อยู่' : 'บันทึกพิกัดนี้' }}
      </button>
    </div>

  </div>
</template>

<!-- scoped ไม่ได้เพราะ Leaflet render attribution นอก Vue's scope -->
<style>
.leaflet-control-attribution {
  font-size: 9px !important;
  opacity: 0.5;
  background: transparent !important;
  box-shadow: none !important;
}
</style>
