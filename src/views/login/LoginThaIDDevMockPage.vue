<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { THAID_DEV_MOCK_STORAGE_KEY, setThaidDevMockActive } from '@/dev/mock/constants'
import type { MockProfilePreview, StoredDevMockLogin } from '@/dev/mock/types'

type MockProfile = MockProfilePreview
type StoredMock = StoredDevMockLogin

const router = useRouter()
const stored = ref<StoredMock | null>(null)
const parseError = ref(false)

onMounted(() => {
  try {
    const raw = sessionStorage.getItem(THAID_DEV_MOCK_STORAGE_KEY)
    if (!raw) {
      parseError.value = true
      return
    }
    stored.value = JSON.parse(raw) as StoredMock
    if (!stored.value?.authorization_url?.trim()) {
      parseError.value = true
    }
  } catch {
    parseError.value = true
  }
})

function confirmMockLogin() {
  const u = stored.value?.authorization_url
  if (!u) return
  sessionStorage.removeItem(THAID_DEV_MOCK_STORAGE_KEY)
  setThaidDevMockActive()
  window.location.assign(u)
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

      <template v-if="parseError || !stored">
        <p class="text-body-md text-red-800">
          ไม่พบข้อมูลการจำลองล็อกอิน — กรุณากลับไปกดเข้าสู่ระบบด้วย ThaID อีกครั้ง
        </p>
      </template>

      <template v-else>
        <h1 class="text-h2-section font-bold text-slate-900 mb-1">จำลองเข้าสู่ระบบ ThaiD</h1>
        <p class="text-body-md text-slate-500 mb-4 leading-relaxed">
          สแกน QR เพื่อเปิดขั้นตอนจำลอง หรือกดปุ่มด้านล่างเพื่อยืนยันแทนการสแกน (สะดวกตอนพัฒนา)
        </p>

        <div
          v-if="stored.mock_profile"
          class="mb-5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-body-xs text-slate-700 shadow-sm"
        >
          <p class="font-semibold text-slate-900 mb-2">ข้อมูลที่จะได้หลังล็อกอินสำเร็จ (เหมือน response จาก ThaiD)</p>
          <ul class="space-y-1 font-mono text-hint">
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
