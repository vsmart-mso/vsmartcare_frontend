<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { THAID_DEV_MOCK_STORAGE_KEY, setThaidDevMockActive } from '@/dev/mock/constants'
import { authApi, startThaIDLoginFlow } from '@/api/auth'
import SearchableSelect from '@/components/SearchableSelect.vue'
import type { StoredDevMockLogin } from '@/dev/mock/types'

type StoredMock = StoredDevMockLogin

const router = useRouter()
const stored = ref<StoredMock | null>(null)
const mockProvinces = ref<string[]>([])
const selectedMockProvince = ref('')
const loadingProvinces = ref(false)
const startLoading = ref(false)
const screenError = ref<string | null>(null)

const mockProvinceOptions = computed(() => [
  { value: '', label: '(ค่าเริ่มต้น — สมุทรปราการ)' },
  ...mockProvinces.value.map((p) => ({ value: p, label: p })),
])

onMounted(() => {
  sessionStorage.removeItem(THAID_DEV_MOCK_STORAGE_KEY)
  loadingProvinces.value = true
  authApi
    .fetchMockProvinces()
    .then((res) => { mockProvinces.value = res.provinces })
    .catch(() => {
      mockProvinces.value = []
      screenError.value = 'โหลดรายชื่อจังหวัด mock ไม่สำเร็จ ระบบจะใช้ค่าเริ่มต้นหากดำเนินการต่อ'
    })
    .finally(() => {
      loadingProvinces.value = false
    })
})

function confirmMockLogin() {
  const u = stored.value?.authorization_url
  if (!u) return
  sessionStorage.removeItem(THAID_DEV_MOCK_STORAGE_KEY)
  setThaidDevMockActive()
  window.location.assign(u)
}

async function prepareMockLogin() {
  if (startLoading.value) return
  startLoading.value = true
  screenError.value = null

  try {
    const { start, flow } = await startThaIDLoginFlow({ mock_province: selectedMockProvince.value })

    if (flow !== 'dev_mock') {
      window.location.assign(start.authorization_url)
      return
    }

    stored.value = {
      authorization_url: start.authorization_url,
      state: start.state,
      mock_profile: start.mock_profile,
    }

    sessionStorage.setItem(THAID_DEV_MOCK_STORAGE_KEY, JSON.stringify(stored.value))
  } catch {
    screenError.value = 'เริ่ม mock login ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
  } finally {
    startLoading.value = false
  }
}

function goBack() {
  sessionStorage.removeItem(THAID_DEV_MOCK_STORAGE_KEY)
  void router.replace({ name: 'login' })
}
</script>

<template>
  <div class="min-h-dvh flex flex-col bg-[#F8FAFC]">
    <main class="flex-1 flex flex-col mx-auto w-full max-w-md px-5 pt-8 pb-10">
      <div
        class="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-body-xs text-amber-950"
        role="note"
      >
        <strong class="font-semibold">โหมดพัฒนา (mock ThaiD)</strong>
        — โปรไฟล์คงที่จาก fixture (ชื่อจับคู่กับรูปสมุดบัญชีตัวอย่างใน Step 4)
      </div>

      <button
        type="button"
        class="mb-6 self-start text-body-md font-medium text-blue-700 hover:text-blue-900"
        @click="goBack"
      >
        ← กลับ
      </button>

      <h1 class="text-h2-section font-bold text-slate-900 mb-1">จำลองเข้าสู่ระบบ ThaiD</h1>
      <p class="text-body-md text-slate-500 mb-4 leading-relaxed">
        เลือกจังหวัด mock เพื่อทดสอบ province gate แล้วค่อยยืนยันเข้าสู่ระบบในขั้นตอนถัดไป
      </p>

      <div class="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <label class="block text-body-xs font-semibold text-amber-950 mb-2">
          จังหวัด mock สำหรับทดสอบ
        </label>
        <SearchableSelect
          v-model="selectedMockProvince"
          :options="mockProvinceOptions"
          :disabled="loadingProvinces || startLoading"
          placeholder="(ค่าเริ่มต้น — สมุทรปราการ)"
        />
        <p class="mt-2 text-hint text-amber-900 leading-relaxed">
          ถ้าไม่เลือก ระบบจะใช้จังหวัดค่าเริ่มต้นของ mock profile
        </p>
      </div>

      <div
        v-if="screenError"
        class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-body-sm text-red-800"
        role="alert"
      >
        {{ screenError }}
      </div>

      <template v-if="!stored">
        <div class="flex flex-col items-center rounded-2xl border-2 border-dashed border-slate-300 bg-white p-6 shadow-sm">
          <button
            type="button"
            class="w-full rounded-xl bg-blue-600 px-4 py-3 text-body font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-[0.99] disabled:opacity-60"
            :disabled="startLoading"
            @click="prepareMockLogin"
          >
            {{ startLoading ? 'กำลังเตรียม mock login...' : 'เตรียม mock login' }}
          </button>

          <p class="mt-3 text-center text-hint text-slate-500 leading-relaxed">
            ระบบจะโหลดโปรไฟล์จำลองตามจังหวัดที่เลือก แล้วแสดงข้อมูลก่อนยืนยัน
          </p>
        </div>
      </template>

      <template v-else>
        <div
          class="mb-5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-body-xs text-slate-700 shadow-sm"
        >
          <p class="font-semibold text-slate-900 mb-2">ข้อมูลที่จะได้หลังล็อกอินสำเร็จ (เหมือน response จาก ThaiD)</p>
          <ul v-if="stored.mock_profile" class="space-y-1 font-mono text-hint">
            <li><span class="text-slate-500">pid</span> {{ stored.mock_profile.pid }}</li>
            <li><span class="text-slate-500">title_th</span> {{ stored.mock_profile.title_th }}</li>
            <li><span class="text-slate-500">given_name</span> {{ stored.mock_profile.given_name }}</li>
            <li><span class="text-slate-500">family_name</span> {{ stored.mock_profile.family_name }}</li>
            <li>
              <span class="text-slate-500">birthdate</span>
              <template v-if="stored.mock_profile.birthdate_label">
                {{ stored.mock_profile.birthdate_label }}
              </template>
              <template v-else-if="stored.mock_profile.birthdate">
                {{ stored.mock_profile.birthdate }}
              </template>
              <template v-else>
                (ไม่ส่งมา)
              </template>
            </li>
            <li v-if="stored.mock_profile.gender">
              <span class="text-slate-500">gender</span> {{ stored.mock_profile.gender }}
            </li>
            <li v-if="stored.mock_profile.address" class="break-words">
              <span class="text-slate-500">address</span> {{ stored.mock_profile.address }}
            </li>
          </ul>
          <p v-else class="text-body-sm text-slate-600">
            backend ไม่ได้ส่ง mock profile preview กลับมา แต่ยังสามารถยืนยัน flow ต่อได้
          </p>
        </div>

        <div class="flex flex-col items-center rounded-2xl border-2 border-dashed border-slate-300 bg-white p-6 shadow-sm">
          <button
            type="button"
            class="w-full rounded-xl bg-blue-600 px-4 py-3 text-body font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-[0.99]"
            @click="confirmMockLogin"
          >
            จำลองยืนยัน (เข้าสู่ระบบ mock)
          </button>

          <p class="mt-3 text-center text-hint text-slate-500 leading-relaxed">
            กดปุ่มเพื่อผ่าน callback จำลอง แล้วกลับแอปด้วย token เหมือน flow จริง
          </p>
        </div>
      </template>
    </main>
  </div>
</template>
