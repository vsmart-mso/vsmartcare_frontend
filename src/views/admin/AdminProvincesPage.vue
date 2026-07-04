<script setup lang="ts">
// หน้าจัดการเปิด/ปิดบริการรายจังหวัด + สร้างเคสสุ่ม (TASK-v-care-12062026-01)
// - กดเปิด/ปิดรายจังหวัด → มี modal ยืนยันก่อน
// - ปุ่ม "เปิดทั้งหมด" / "ปิดทั้งหมด" → มี modal ยืนยันก่อน (เรียก bulk endpoint)
// - สร้างเคสสุ่ม (dev/staging) — person + คำร้องพร้อมตารางย่อย

import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { adminApi, type ProvinceAccess } from '@/api/admin'
import { useAdminAuthStore } from '@/stores/adminAuth'

const router = useRouter()
const adminAuth = useAdminAuthStore()

type AdminTab = 'provinces' | 'random-cases'
const activeTab = ref<AdminTab>('provinces')

const provinces = ref<ProvinceAccess[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
const search = ref('')
const toast = ref<string | null>(null)

// ─── สร้างเคสสุ่ม ─────────────────────────────────────────────────────
const randomCount = ref(1)
const randomProvinceId = ref<number | ''>('')
const randomCreating = ref(false)
const randomError = ref<string | null>(null)

// ─── สถานะ modal ยืนยัน ───────────────────────────────────────────────
type ConfirmState =
  | { kind: 'single'; province: ProvinceAccess; target: boolean }
  | { kind: 'all'; target: boolean }
  | { kind: 'random' }
  | null
const confirm = ref<ConfirmState>(null)
const confirmSaving = ref(false)

const filtered = computed(() => {
  const q = search.value.trim()
  if (!q) return provinces.value
  return provinces.value.filter((p) => p.province_name.includes(q))
})

const enabledCount = computed(
  () => provinces.value.filter((p) => p.is_enabled).length,
)

const randomProvinceLabel = computed(() => {
  if (randomProvinceId.value === '') return 'ทุกจังหวัด (สุ่ม)'
  const p = provinces.value.find((x) => x.province_id === randomProvinceId.value)
  return p ? p.province_name : 'จังหวัดที่เลือก'
})

/** ข้อความใน modal ยืนยัน ตามชนิดและทิศทาง */
const confirmText = computed(() => {
  const c = confirm.value
  if (!c) return { title: '', detail: '', actionLabel: '', danger: false }
  if (c.kind === 'random') {
    return {
      title: `สร้างเคสสุ่ม ${randomCount.value} รายการ?`,
      detail:
        `จะสร้าง person + คำร้องจำลองในจังหวัด: ${randomProvinceLabel.value}` +
        ' (เลขบัตรขึ้นต้น 99 — ใช้ทดสอบเท่านั้น)',
      actionLabel: 'ยืนยันสร้าง',
      danger: false,
    }
  }
  if (c.kind === 'single') {
    return c.target
      ? {
          title: `เปิดให้บริการจังหวัด${c.province.province_name}?`,
          detail: 'ประชาชนในจังหวัดนี้จะสามารถเข้าสู่ระบบและบันทึกข้อมูลได้',
          actionLabel: 'ยืนยันเปิด',
          danger: false,
        }
      : {
          title: `ปิดให้บริการจังหวัด${c.province.province_name}?`,
          detail:
            'ประชาชนในจังหวัดนี้จะเข้าสู่ระบบและบันทึกข้อมูลไม่ได้ ' +
            'ผู้ที่กำลังกรอกฟอร์มอยู่จะถูกออกจากระบบเมื่อกดบันทึก',
          actionLabel: 'ยืนยันปิด',
          danger: true,
        }
  }
  // kind === 'all'
  return c.target
    ? {
        title: `เปิดให้บริการทุกจังหวัด (${provinces.value.length} จังหวัด)?`,
        detail: 'ทุกจังหวัดจะสามารถเข้าใช้งานและบันทึกข้อมูลได้ทันที',
        actionLabel: 'ยืนยันเปิดทั้งหมด',
        danger: false,
      }
    : {
        title: `ปิดให้บริการทุกจังหวัด (${provinces.value.length} จังหวัด)?`,
        detail:
          'ทุกจังหวัดจะถูกปิด — ประชาชนทั้งหมดจะเข้าสู่ระบบและบันทึกข้อมูลไม่ได้',
        actionLabel: 'ยืนยันปิดทั้งหมด',
        danger: true,
      }
})

function errorStatus(e: unknown): number | undefined {
  const err = e as {
    statusCode?: number
    status?: number
    response?: { status?: number }
  }
  return err.statusCode ?? err.status ?? err.response?.status
}

function errorDetail(e: unknown): string | undefined {
  const detail = (e as { data?: { detail?: unknown } })?.data?.detail
  return typeof detail === 'string' ? detail : undefined
}

/** จัดการ error ที่เป็น 401/403 → ออกจากระบบ admin */
function handleAuthError(e: unknown): boolean {
  const status = errorStatus(e)
  const detail = errorDetail(e)
  // 403 จาก disabled_in_production ไม่ใช่ auth error
  if (status === 403 && detail === 'disabled_in_production') return false
  if (status === 401 || status === 403) {
    adminAuth.clearAuth()
    void router.replace({ name: 'admin-login' })
    return true
  }
  return false
}

function showToast(msg: string) {
  toast.value = msg
  window.setTimeout(() => {
    if (toast.value === msg) toast.value = null
  }, 2500)
}

async function loadProvinces() {
  loading.value = true
  loadError.value = null
  try {
    provinces.value = await adminApi.getProvinces()
  } catch (e: unknown) {
    if (handleAuthError(e)) return
    loadError.value = 'โหลดข้อมูลจังหวัดไม่สำเร็จ กรุณาลองใหม่'
  } finally {
    loading.value = false
  }
}

// ─── เปิด modal (ยังไม่เรียก API จนกว่าจะยืนยัน) ────────────────────────
function requestToggle(p: ProvinceAccess) {
  confirm.value = { kind: 'single', province: p, target: !p.is_enabled }
}
function requestAll(target: boolean) {
  confirm.value = { kind: 'all', target }
}
function requestRandomCreate() {
  const n = Number(randomCount.value)
  if (!Number.isFinite(n) || n < 1 || n > 50) {
    randomError.value = 'จำนวนต้องอยู่ระหว่าง 1–50'
    return
  }
  randomError.value = null
  confirm.value = { kind: 'random' }
}
function cancelConfirm() {
  if (confirmSaving.value) return
  confirm.value = null
}

// ─── ยืนยัน → เรียก API ────────────────────────────────────────────────
async function executeConfirm() {
  const c = confirm.value
  if (!c || confirmSaving.value) return
  confirmSaving.value = true
  try {
    if (c.kind === 'random') {
      randomCreating.value = true
      randomError.value = null
      const provinceId =
        randomProvinceId.value === '' ? null : Number(randomProvinceId.value)
      const res = await adminApi.createRandomCases(Number(randomCount.value), provinceId)
      showToast(`สร้างเคสสุ่มแล้ว ${res.created} รายการ`)
      confirm.value = null
      return
    }
    if (c.kind === 'single') {
      const updated = await adminApi.updateProvince(c.province.province_id, c.target)
      c.province.is_enabled = updated.is_enabled
      c.province.updated_at = updated.updated_at
      showToast(
        `${c.province.province_name}: ${c.target ? 'เปิด' : 'ปิด'}ให้บริการแล้ว`,
      )
    } else {
      const res = await adminApi.updateAllProvinces(c.target)
      await loadProvinces()
      showToast(
        `${c.target ? 'เปิด' : 'ปิด'}ให้บริการแล้ว ${res.updated} จังหวัด`,
      )
    }
    confirm.value = null
  } catch (e: unknown) {
    if (handleAuthError(e)) return
    if (c.kind === 'random') {
      randomError.value =
        errorDetail(e) === 'disabled_in_production'
          ? 'ฟีเจอร์นี้ปิดใช้งานบน production'
          : 'สร้างเคสไม่สำเร็จ กรุณาลองใหม่'
      confirm.value = null
      return
    }
    showToast('บันทึกไม่สำเร็จ กรุณาลองใหม่')
  } finally {
    confirmSaving.value = false
    randomCreating.value = false
  }
}

function logout() {
  adminAuth.clearAuth()
  void router.replace({ name: 'admin-login' })
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('th-TH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

onMounted(loadProvinces)
</script>

<template>
  <div class="min-h-dvh bg-[#F8FAFC]">
    <!-- Header -->
    <header class="bg-white border-b border-slate-200 sticky top-0 z-10">
      <div class="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
        <div>
          <p class="text-body font-bold text-slate-900">ระบบจัดการ (Admin)</p>
          <p class="text-hint text-slate-500">
            {{ adminAuth.username ? `ผู้ดูแล: ${adminAuth.username}` : 'พม. CARE Admin' }}
          </p>
        </div>
        <button
          type="button"
          class="text-body-xs font-medium text-slate-600 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50"
          @click="logout"
        >
          ออกจากระบบ
        </button>
      </div>

      <!-- Tabs -->
      <div class="max-w-3xl mx-auto px-4 flex gap-1">
        <button
          type="button"
          class="px-3 py-2 text-body-xs font-medium border-b-2 transition-colors"
          :class="
            activeTab === 'provinces'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          "
          @click="activeTab = 'provinces'"
        >
          บริการรายจังหวัด
        </button>
        <button
          type="button"
          class="px-3 py-2 text-body-xs font-medium border-b-2 transition-colors"
          :class="
            activeTab === 'random-cases'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          "
          @click="activeTab = 'random-cases'"
        >
          สร้างเคสสุ่ม
        </button>
      </div>
    </header>

    <main class="max-w-3xl mx-auto px-4 py-5">
      <!-- ═══════════ Tab: จังหวัด ═══════════ -->
      <template v-if="activeTab === 'provinces'">
        <!-- สรุป + ปุ่มเปิด/ปิดทั้งหมด -->
        <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
          <p class="text-body-xs text-slate-600">
            เปิดให้บริการ
            <span class="font-semibold text-green-700">{{ enabledCount }}</span>
            /
            {{ provinces.length }} จังหวัด
          </p>
          <div class="flex items-center gap-2">
            <button
              type="button"
              :disabled="loading || provinces.length === 0"
              class="text-body-xs font-medium text-green-700 border border-green-300 rounded-lg px-3 py-1.5 bg-white hover:bg-green-50 disabled:opacity-50 disabled:pointer-events-none"
              @click="requestAll(true)"
            >
              เปิดทั้งหมด
            </button>
            <button
              type="button"
              :disabled="loading || provinces.length === 0"
              class="text-body-xs font-medium text-red-700 border border-red-300 rounded-lg px-3 py-1.5 bg-white hover:bg-red-50 disabled:opacity-50 disabled:pointer-events-none"
              @click="requestAll(false)"
            >
              ปิดทั้งหมด
            </button>
          </div>
        </div>

        <!-- ค้นหา -->
        <div class="mb-4">
          <input
            v-model="search"
            type="search"
            placeholder="ค้นหาจังหวัด…"
            class="w-full sm:w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-body-md focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <!-- Loading -->
        <div v-if="loading" class="py-16 text-center text-body-md text-slate-500">
          กำลังโหลดข้อมูล…
        </div>

        <!-- Error -->
        <div
          v-else-if="loadError"
          class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-body-md text-red-800"
        >
          {{ loadError }}
          <button class="ml-2 underline" @click="loadProvinces">ลองใหม่</button>
        </div>

        <!-- ตารางจังหวัด -->
        <div
          v-else
          class="bg-white rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100"
        >
          <div
            v-for="p in filtered"
            :key="p.province_id"
            class="flex items-center justify-between gap-3 px-4 py-3"
          >
            <div class="min-w-0">
              <p class="text-body text-slate-900 truncate">{{ p.province_name }}</p>
              <p class="text-hint text-slate-400">
                อัปเดต: {{ formatDate(p.updated_at) }}
              </p>
            </div>

            <div class="flex items-center gap-3 flex-shrink-0">
              <span
                class="text-hint font-medium w-9 text-right"
                :class="p.is_enabled ? 'text-green-700' : 'text-slate-400'"
              >
                {{ p.is_enabled ? 'เปิด' : 'ปิด' }}
              </span>
              <!-- Toggle switch → เปิด modal ยืนยัน -->
              <button
                type="button"
                role="switch"
                :aria-checked="p.is_enabled"
                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                :class="p.is_enabled ? 'bg-green-500' : 'bg-slate-300'"
                @click="requestToggle(p)"
              >
                <span
                  class="inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform"
                  :class="p.is_enabled ? 'translate-x-5' : 'translate-x-1'"
                />
              </button>
            </div>
          </div>

          <div
            v-if="filtered.length === 0"
            class="px-4 py-10 text-center text-body-md text-slate-400"
          >
            ไม่พบจังหวัดที่ค้นหา
          </div>
        </div>
      </template>

      <!-- ═══════════ Tab: สร้างเคสสุ่ม ═══════════ -->
      <template v-else>
        <div class="bg-white rounded-xl border border-slate-200 p-5 mb-4">
          <p class="text-body font-semibold text-slate-900 mb-1">สร้างเคสสุ่ม</p>
          <p class="text-body-md text-slate-500 mb-4 leading-relaxed">
            สร้าง person และคำร้องจำลองพร้อมข้อมูลสุ่ม (ที่อยู่ เศรษฐกิจ ประเภทคำร้อง)
            และรูปหลักฐานจำลอง (เยี่ยมบ้าน สมุดบัญชี ทะเบียนบ้าน — ไม่รวม KTB / อื่น ๆ)
            เลขบัตรขึ้นต้น
            <span class="font-mono text-slate-700">99</span>
            — ใช้ทดสอบเท่านั้น ไม่ทำงานบน production
          </p>

          <div class="flex flex-col sm:flex-row gap-3 mb-4">
            <label class="flex flex-col gap-1 min-w-0 sm:w-28">
              <span class="text-hint text-slate-500">จำนวน</span>
              <input
                v-model.number="randomCount"
                type="number"
                min="1"
                max="50"
                class="rounded-lg border border-slate-300 px-3 py-1.5 text-body-md focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>
            <label class="flex flex-col gap-1 min-w-0 flex-1">
              <span class="text-hint text-slate-500">จังหวัด</span>
              <select
                v-model="randomProvinceId"
                class="rounded-lg border border-slate-300 px-3 py-1.5 text-body-md bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">ทุกจังหวัด (สุ่ม)</option>
                <option
                  v-for="p in provinces"
                  :key="p.province_id"
                  :value="p.province_id"
                >
                  {{ p.province_name }}
                </option>
              </select>
            </label>
          </div>

          <div
            v-if="randomError"
            class="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-body-md text-red-800"
          >
            {{ randomError }}
          </div>

          <button
            type="button"
            :disabled="randomCreating || loading"
            class="w-full sm:w-auto rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-body-md font-semibold px-5 py-2.5 disabled:opacity-60"
            @click="requestRandomCreate"
          >
            {{ randomCreating ? 'กำลังสร้าง…' : 'สร้างเคสสุ่ม' }}
          </button>
        </div>
      </template>
    </main>

    <!-- ═══════════ Modal ยืนยัน ═══════════ -->
    <div
      v-if="confirm"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5"
      @click.self="cancelConfirm"
    >
      <div class="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        <p class="text-body font-semibold text-slate-900 mb-2">
          {{ confirmText.title }}
        </p>
        <p class="text-body-md text-slate-500 leading-relaxed mb-6">
          {{ confirmText.detail }}
        </p>
        <div class="flex gap-3">
          <button
            type="button"
            :disabled="confirmSaving"
            class="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-body-md font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            @click="cancelConfirm"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            :disabled="confirmSaving"
            class="flex-1 rounded-lg px-4 py-2.5 text-body-md font-semibold text-white transition-colors disabled:opacity-60"
            :class="confirmText.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'"
            @click="executeConfirm"
          >
            {{ confirmSaving ? 'กำลังบันทึก…' : confirmText.actionLabel }}
          </button>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <div
      v-if="toast"
      class="fixed bottom-5 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-body-xs px-4 py-2 rounded-full shadow-lg z-[60]"
    >
      {{ toast }}
    </div>
  </div>
</template>
