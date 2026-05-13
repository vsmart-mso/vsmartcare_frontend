<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import type { Map as LeafletMap, Marker, TileLayer } from 'leaflet'

// ─── Props & Emits ────────────────────────────────────────────────────────────
// รับค่าเริ่มต้นจาก parent และ emit กลับเมื่อผู้ใช้ยืนยันพิกัด
const props = withDefaults(defineProps<{
  lat?: string
  lng?: string
}>(), {
  lat: '',
  lng: '',
})

const emit = defineEmits<{
  'update:lat': [string]
  'update:lng': [string]
}>()

// ─── State ────────────────────────────────────────────────────────────────────
const searchQuery     = ref('')
const searchResults   = ref<NominatimResult[]>([])
const isSearching     = ref(false)
const mapContainerEl  = ref<HTMLDivElement | null>(null)
const mapMode         = ref<'street' | 'satellite'>('street') // โหมดแผนที่ปัจจุบัน

const pendingLat   = ref('')
const pendingLng   = ref('')
const selectedName = ref('')
const isConfirmed  = ref(false) // true หลังกด "ใช้พิกัดจากหมุดนี้"

let map: LeafletMap | null = null
let marker: Marker | null = null
let currentTile: TileLayer | null = null  // tile layer ที่ใช้อยู่ (เพื่อ swap ได้)
let L: typeof import('leaflet') | null = null

// config ของแต่ละโหมด
const TILES = {
  street: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
  // Esri World Imagery — ฟรี ไม่ต้อง API key เห็นหลังคาบ้านจริง
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    maxZoom: 18,
  },
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface NominatimResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
}

// ─── Map Initialization ───────────────────────────────────────────────────────
// โหลด Leaflet แบบ dynamic เพื่อหลีกเลี่ยงปัญหา SSR
async function initMap() {
  // import leaflet และ CSS ตอน mount เท่านั้น (ไม่ใช่ SSR)
  L = await import('leaflet')
  await import('leaflet/dist/leaflet.css')

  if (!mapContainerEl.value || !L) return

  // ศูนย์กลาง default: จังหวัดพิษณุโลก
  const defaultLat = props.lat ? parseFloat(props.lat) : 16.8211
  const defaultLng = props.lng ? parseFloat(props.lng) : 100.2659

  map = L.map(mapContainerEl.value, { zoomControl: true }).setView([defaultLat, defaultLng], 13)

  // โหลด tile layer เริ่มต้นตาม mapMode
  const t = TILES[mapMode.value]
  currentTile = L.tileLayer(t.url, { attribution: t.attribution, maxZoom: t.maxZoom }).addTo(map)

  // แก้ bug icon ของ Leaflet ใน Vite/webpack (icon path เพี้ยน)
  const iconUrl        = new URL('leaflet/dist/images/marker-icon.png',    import.meta.url).href
  const iconRetinaUrl  = new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href
  const shadowUrl      = new URL('leaflet/dist/images/marker-shadow.png',  import.meta.url).href

  const defaultIcon = L.icon({ iconUrl, iconRetinaUrl, shadowUrl, iconSize: [25, 41], iconAnchor: [12, 41] })
  L.Marker.prototype.options.icon = defaultIcon

  // ถ้ามีพิกัดเดิมให้ปักหมุดทันที
  if (props.lat && props.lng) {
    placeMarker(defaultLat, defaultLng, '')
    pendingLat.value = props.lat
    pendingLng.value = props.lng
  }

  // คลิกบนแผนที่ = ปักหมุดใหม่
  map.on('click', (e) => {
    placeMarker(e.latlng.lat, e.latlng.lng, '')
    selectedName.value = ''
  })
}

// วางหมุดที่พิกัดที่ระบุ
function placeMarker(lat: number, lng: number, name: string) {
  if (!map || !L) return
  if (marker) {
    marker.setLatLng([lat, lng])
  } else {
    marker = L.marker([lat, lng]).addTo(map)
  }
  map.setView([lat, lng], 15)
  pendingLat.value  = lat.toFixed(6)
  pendingLng.value  = lng.toFixed(6)
  selectedName.value = name
  isConfirmed.value  = false // ย้ายหมุดใหม่ = ยังไม่ได้ยืนยัน
}

// ─── Nominatim Search ─────────────────────────────────────────────────────────
// ใช้ Nominatim (OpenStreetMap geocoding) — ฟรี ไม่ต้อง API key
// Policy: max 1 req/sec, ต้องมี User-Agent

let searchDebounce: ReturnType<typeof setTimeout> | null = null

function handleSearchInput() {
  // debounce 600ms เพื่อลด request และเป็นไปตาม Nominatim usage policy
  if (searchDebounce) clearTimeout(searchDebounce)
  if (!searchQuery.value.trim()) {
    searchResults.value = []
    return
  }
  searchDebounce = setTimeout(doSearch, 600)
}

async function doSearch() {
  if (!searchQuery.value.trim()) return
  isSearching.value = true
  try {
    // countrycodes=th จำกัดผลลัพธ์เฉพาะไทย
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery.value)}&format=json&limit=5&countrycodes=th&accept-language=th`
    const res  = await fetch(url, {
      headers: { 'User-Agent': 'vsmartcare-frontend/1.0' },
    })
    const data = await res.json() as NominatimResult[]
    searchResults.value = data
  } catch {
    searchResults.value = []
  } finally {
    isSearching.value = false
  }
}

// เลือกสถานที่จากรายการค้นหา
function handleSelectResult(result: NominatimResult) {
  placeMarker(parseFloat(result.lat), parseFloat(result.lon), result.display_name)
  searchResults.value = []
  searchQuery.value   = ''
}

// ─── Toggle Map Mode ──────────────────────────────────────────────────────────
function toggleMapMode() {
  if (!map || !L) return
  mapMode.value = mapMode.value === 'street' ? 'satellite' : 'street'
  // ลบ tile เดิมออก แล้วเพิ่ม tile ใหม่
  if (currentTile) map.removeLayer(currentTile)
  const t = TILES[mapMode.value]
  currentTile = L.tileLayer(t.url, { attribution: t.attribution, maxZoom: t.maxZoom }).addTo(map)
}

// ─── Confirm ──────────────────────────────────────────────────────────────────
// ผู้ใช้กด "ใช้พิกัดจากหมุดนี้" → emit ค่าออกไปยัง parent
function handleConfirm() {
  if (!pendingLat.value || !pendingLng.value) return
  emit('update:lat', pendingLat.value)
  emit('update:lng', pendingLng.value)
  isConfirmed.value = true
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(() => {
  initMap()
})

onBeforeUnmount(() => {
  if (map) {
    map.remove()
    map = null
    marker = null
  }
  if (searchDebounce) clearTimeout(searchDebounce)
})

// ถ้า parent เปลี่ยน props (เช่น restore จาก store) ให้ขยับหมุด
// แต่ถ้า props ตรงกับ pending อยู่แล้ว = เป็น echo จากการ confirm → ข้ามเพื่อไม่ reset isConfirmed
watch(() => [props.lat, props.lng], ([lat, lng]) => {
  if (lat && lng && map && !(lat === pendingLat.value && lng === pendingLng.value)) {
    placeMarker(parseFloat(lat), parseFloat(lng), selectedName.value)
  }
})
</script>

<template>
  <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">

    <!-- Header -->
    <div class="px-4 pt-4 pb-3">
      <p class="text-[14px] font-semibold text-slate-700">พิกัด GPS (ที่อยู่ปัจจุบัน)</p>
      <p class="text-[12px] text-slate-400 mt-0.5">ค้นหาที่อยู่หรือเลือกจุดบนแผนที่ เพื่อบันทึกพิกัดที่อยู่ปัจจุบัน</p>
    </div>

    <!-- Search Box -->
    <div class="px-4 pb-3 relative">
      <div class="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus-within:ring-2 focus-within:ring-[#1A56DB]/30 focus-within:border-[#1A56DB]">
        <!-- ไอคอนแว่น -->
        <svg class="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          v-model="searchQuery"
          @input="handleSearchInput"
          type="text"
          placeholder="ค้นหาสถานที่ เช่น โรงพยาบาล, ตำบล, สถานีรถไฟ"
          class="flex-1 bg-transparent text-[13px] text-slate-700 placeholder:text-slate-400 focus:outline-none"
        />
        <!-- Spinner ขณะค้นหา -->
        <svg v-if="isSearching" class="w-4 h-4 text-[#1A56DB] animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>

      <!-- รายการผลค้นหา (dropdown) -->
      <div
        v-if="searchResults.length > 0"
        class="absolute left-4 right-4 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-[9999] overflow-hidden"
      >
        <button
          v-for="result in searchResults"
          :key="result.place_id"
          type="button"
          @click="handleSelectResult(result)"
          class="w-full text-left px-4 py-3 hover:bg-blue-50 active:bg-blue-100 transition-colors border-b border-slate-100 last:border-b-0"
        >
          <!-- ไอคอน pin -->
          <div class="flex items-start gap-2.5">
            <svg class="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.273 1.765 11.842 11.842 0 00.976.544l.062.029.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" clip-rule="evenodd" />
            </svg>
            <div class="min-w-0">
              <!-- ชื่อสถานที่ (ตัดเฉพาะส่วนแรกก่อนเครื่องหมาย ,) -->
              <p class="text-[13px] font-medium text-slate-700 truncate">
                {{ result.display_name.split(',')[0] }}
              </p>
              <!-- พิกัด -->
              <p class="text-[11px] text-slate-400 mt-0.5">{{ parseFloat(result.lat).toFixed(4) }}, {{ parseFloat(result.lon).toFixed(4) }}</p>
            </div>
          </div>
        </button>
      </div>
    </div>

    <!-- Leaflet Map + ปุ่มสลับโหมดลอยอยู่มุมบนขวา -->
    <div class="relative">
      <div ref="mapContainerEl" style="height: 220px; width: 100%;" class="z-0" />

      <!-- ปุ่มสลับ แผนที่ / ดาวเทียม -->
      <div class="absolute top-2 right-2 z-[1000] flex rounded-lg overflow-hidden shadow border border-white/30">
        <button
          type="button"
          @click="toggleMapMode"
          :class="mapMode === 'street'
            ? 'bg-[#1A56DB] text-white'
            : 'bg-white/80 text-slate-600 hover:bg-white'"
          class="px-2.5 py-1 text-[11px] font-semibold transition-colors"
        >แผนที่</button>
        <button
          type="button"
          @click="toggleMapMode"
          :class="mapMode === 'satellite'
            ? 'bg-[#1A56DB] text-white'
            : 'bg-white/80 text-slate-600 hover:bg-white'"
          class="px-2.5 py-1 text-[11px] font-semibold transition-colors"
        >ดาวเทียม</button>
      </div>
    </div>

    <!-- แสดงพิกัดที่เลือก + ชื่อสถานที่ + ปุ่มยืนยัน -->
    <div
      class="px-4 py-3 border-t transition-colors duration-300"
      :class="isConfirmed ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-100'"
    >
      <!-- Lat / Lng -->
      <div class="flex gap-4 mb-2">
        <div class="flex-1">
          <p class="text-[11px] text-slate-500 mb-0.5">Latitude</p>
          <p class="text-[14px] font-semibold transition-colors duration-300"
            :class="isConfirmed ? 'text-green-700' : 'text-slate-700'">
            {{ pendingLat || '—' }}
          </p>
        </div>
        <div class="flex-1">
          <p class="text-[11px] text-slate-500 mb-0.5">Longitude</p>
          <p class="text-[14px] font-semibold transition-colors duration-300"
            :class="isConfirmed ? 'text-green-700' : 'text-slate-700'">
            {{ pendingLng || '—' }}
          </p>
        </div>
        <!-- badge "บันทึกแล้ว" ปรากฏเมื่อ confirmed -->
        <div v-if="isConfirmed" class="flex items-center gap-1 self-end pb-0.5">
          <svg class="w-4 h-4 text-green-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
          </svg>
          <span class="text-[11px] font-semibold text-green-700 whitespace-nowrap">บันทึกแล้ว</span>
        </div>
      </div>

      <!-- ชื่อสถานที่ที่เลือก (ถ้ามี) -->
      <div v-if="selectedName" class="flex items-center gap-1.5 mb-3">
        <svg class="w-3.5 h-3.5 flex-shrink-0 transition-colors duration-300"
          :class="isConfirmed ? 'text-green-600' : 'text-rose-500'"
          viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.273 1.765 11.842 11.842 0 00.976.544l.062.029.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" clip-rule="evenodd" />
        </svg>
        <p class="text-[12px] text-slate-600 truncate">{{ selectedName.split(',')[0] }}</p>
      </div>

      <!-- ปุ่มยืนยัน — เปลี่ยนสีและข้อความตาม state -->
      <button
        type="button"
        @click="handleConfirm"
        :disabled="!pendingLat || !pendingLng"
        class="w-full flex items-center justify-center gap-2 text-white text-[13px] font-semibold py-2.5 rounded-xl active:scale-[0.98] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
        :class="isConfirmed
          ? 'bg-green-600 hover:bg-green-700'
          : 'bg-[#1A56DB] hover:bg-[#1648C4]'"
      >
        <!-- ไอคอนเปลี่ยนตาม state -->
        <svg v-if="isConfirmed" class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
        </svg>
        <svg v-else class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.273 1.765 11.842 11.842 0 00.976.544l.062.029.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" clip-rule="evenodd" />
        </svg>
        {{ isConfirmed ? 'ใช้พิกัดนี้อยู่' : 'ใช้พิกัดจากหมุดนี้' }}
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
