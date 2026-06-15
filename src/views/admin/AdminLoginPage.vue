<script setup lang="ts">
// หน้า Login สำหรับ Admin (TASK-v-care-12062026-01)
// แยกจากหน้าประชาชน — ใช้ username/password ไม่ใช่ ThaID

import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { adminApi } from '@/api/admin'
import { useAdminAuthStore } from '@/stores/adminAuth'
import AppBrandHeader from '@/components/ui/AppBrandHeader.vue'

const router = useRouter()
const adminAuth = useAdminAuthStore()

const username = ref('')
const password = ref('')
const error = ref<string | null>(null)
const loading = ref(false)

async function handleSubmit() {
  if (loading.value) return
  error.value = null

  if (!username.value.trim() || !password.value) {
    error.value = 'กรุณากรอกชื่อผู้ใช้งานและรหัสผ่าน'
    return
  }

  loading.value = true
  try {
    const res = await adminApi.login(username.value.trim(), password.value)
    adminAuth.setAuth(res.access_token, username.value.trim(), res.expires_in)
    await router.replace({ name: 'admin-provinces' })
  } catch (e: unknown) {
    // 401 = invalid_credentials, อื่น ๆ = ข้อความทั่วไป
    const status = (e as { response?: { status?: number } })?.response?.status
    error.value =
      status === 401
        ? 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง'
        : 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-dvh flex flex-col items-center justify-center bg-[#F8FAFC] px-5">
    <div class="w-full max-w-sm">
      <AppBrandHeader :show-tagline="false" class="mb-8">
        <h1 class="text-h3-legend font-bold text-slate-900 mt-3">ระบบจัดการ (Admin)</h1>
        <p class="text-body-xs text-slate-500 mt-1">เข้าสู่ระบบสำหรับผู้ดูแลระบบ</p>
      </AppBrandHeader>

      <!-- ฟอร์ม -->
      <form
        class="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4"
        @submit.prevent="handleSubmit"
      >
        <div>
          <label class="block text-body-md font-medium text-slate-700 mb-1.5">
            ชื่อผู้ใช้งาน
          </label>
          <input
            v-model="username"
            type="text"
            autocomplete="username"
            :disabled="loading"
            class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-body text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
            placeholder="username"
          />
        </div>

        <div>
          <label class="block text-body-md font-medium text-slate-700 mb-1.5">
            รหัสผ่าน
          </label>
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            :disabled="loading"
            class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-body text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
            placeholder="••••••••"
          />
        </div>

        <p
          v-if="error"
          class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-body-xs text-red-800"
          role="alert"
        >
          {{ error }}
        </p>

        <button
          type="submit"
          :disabled="loading"
          class="w-full rounded-lg bg-[#1A56DB] px-4 py-2.5 text-body font-semibold text-white transition-colors hover:bg-blue-700 active:scale-[0.99] disabled:opacity-60 disabled:pointer-events-none"
        >
          {{ loading ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ' }}
        </button>
      </form>
    </div>
  </div>
</template>
