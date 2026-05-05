<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import type { ThaiDUser } from '@/types/auth'

const router = useRouter()
const authStore = useAuthStore()

const message = ref('กำลังเข้าสู่ระบบ…')
const isError = ref(false)

onMounted(async () => {
  const params = new URLSearchParams(window.location.search)
  const accessToken = params.get('access_token')?.trim()
  if (!accessToken) {
    isError.value = true
    message.value = 'ไม่พบ access_token จาก ThaiD — กรุณาลองเข้าสู่ระบบใหม่'
    return
  }

  localStorage.setItem('auth_token', accessToken)

  try {
    const me = await authApi.fetchMe()
    const u: ThaiDUser = {
      pid: me.pid,
      title: me.title_th,
      fname: me.given_name,
      lname: me.family_name,
      dob: '',
    }
    authStore.setAuth(u, accessToken, 'thaid')
    await router.replace({ name: 'chang-service' })
  } catch (e: unknown) {
    localStorage.removeItem('auth_token')
    isError.value = true
    message.value = 'ดึงข้อมูลผู้ใช้ไม่สำเร็จ — กรุณาลองเข้าสู่ระบบใหม่'
  }
})

function goLogin() {
  void router.replace({ name: 'login' })
}
</script>

<template>
  <div class="min-h-dvh flex flex-col items-center justify-center bg-[#F8FAFC] px-5">
    <p
      class="text-center text-[15px] leading-relaxed max-w-sm"
      :class="isError ? 'text-red-800' : 'text-slate-600'"
    >
      {{ message }}
    </p>
    <button
      v-if="isError"
      type="button"
      class="mt-6 rounded-lg bg-blue-600 px-5 py-2.5 text-[14px] font-medium text-white hover:bg-blue-700"
      @click="goLogin"
    >
      กลับหน้าเข้าสู่ระบบ
    </button>
  </div>
</template>
