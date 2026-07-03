<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { authApi, THAID_LAST_LOGIN_START_KEY } from '@/api/auth'
import { setThaidDevMockActive } from '@/dev/mock/constants'
import { useAuthStore } from '@/stores/auth'
import { resolveHomeRoute } from '@/router'
import { normalizeThaiDBirthdateForApp } from '@/utils/birthdate'
import {
  DEFAULT_AUTH_LOGIN_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
  userMessageForAuthApiError,
  userMessageForAuthErrorCode,
} from '@/utils/authUserMessages'
import type { ThaiDUser } from '@/types/auth'

const router = useRouter()
const authStore = useAuthStore()

const message = ref('กำลังเข้าสู่ระบบ…')
const isError = ref(false)
const isProvinceBlocked = ref(false)

function showLoginFailure(userMessage: string = DEFAULT_AUTH_LOGIN_MESSAGE) {
  message.value = userMessage
  isError.value = true
}

function markDevMockSessionIfApplicable() {
  try {
    const raw = sessionStorage.getItem(THAID_LAST_LOGIN_START_KEY)
    if (!raw) return
    const start = JSON.parse(raw) as { flow?: string; authorization_url?: string }
    if (start.flow === 'dev_mock' || start.authorization_url?.includes('/mock/continue')) {
      setThaidDevMockActive()
    }
  } catch {
    // ignore
  }
}

onMounted(async () => {
  const params = new URLSearchParams(window.location.search)

  const errorCode = params.get('error')?.trim()
  if (errorCode) {
    history.replaceState(null, '', window.location.pathname)

    if (errorCode === 'province_not_enabled') {
      isProvinceBlocked.value = true
      isError.value = true
      return
    }

    showLoginFailure(userMessageForAuthErrorCode(errorCode))
    return
  }

  const loginState = params.get('login_state')?.trim()
  history.replaceState(null, '', window.location.pathname)

  if (loginState) {
    try {
      const status = await authApi.pollThaIDLoginStatus(loginState)
      if (status.status === 'error') {
        if (status.error === 'province_not_enabled') {
          isProvinceBlocked.value = true
          isError.value = true
          return
        }
        showLoginFailure(userMessageForAuthErrorCode(status.error ?? 'auth_error'))
        return
      }
      if (status.status !== 'complete' || !status.access_token) {
        showLoginFailure(DEFAULT_AUTH_LOGIN_MESSAGE)
        return
      }
      sessionStorage.setItem('auth_token', status.access_token)
      const me = await authApi.fetchMe()
      const u: ThaiDUser = {
        pid:       me.pid,
        title:     me.title_th,
        fname:     me.given_name,
        lname:     me.family_name,
        dob:       normalizeThaiDBirthdateForApp(me.birthdate ?? ''),
        gender:    me.gender     ?? '',
        person_id: me.person_id  ?? 0,
      }
      authStore.setAuth(u, status.access_token, 'thaid', status.expires_in || undefined)
      markDevMockSessionIfApplicable()
      message.value = 'กำลังตรวจสอบข้อมูล...'
      await router.replace({ name: await resolveHomeRoute(u.person_id) })
    } catch (err) {
      sessionStorage.removeItem('auth_token')
      showLoginFailure(userMessageForAuthApiError(err))
    }
    return
  }

  const accessToken = params.get('access_token')?.trim()
  const expiresIn = Number(params.get('expires_in') ?? '0') || 0

  if (!accessToken) {
    showLoginFailure(SESSION_EXPIRED_MESSAGE)
    return
  }

  sessionStorage.setItem('auth_token', accessToken)

  try {
    const me = await authApi.fetchMe()
    const u: ThaiDUser = {
      pid:       me.pid,
      title:     me.title_th,
      fname:     me.given_name,
      lname:     me.family_name,
      dob:       normalizeThaiDBirthdateForApp(me.birthdate ?? ''),
      gender:    me.gender     ?? '',
      person_id: me.person_id  ?? 0,
    }
    authStore.setAuth(u, accessToken, 'thaid', expiresIn || undefined)
    markDevMockSessionIfApplicable()
    message.value = 'กำลังตรวจสอบข้อมูล...'
    await router.replace({ name: await resolveHomeRoute(u.person_id) })
  } catch (err) {
    sessionStorage.removeItem('auth_token')
    showLoginFailure(userMessageForAuthApiError(err))
  }
})

function goLogin() {
  const query = isError.value ? { auth_error: message.value } : undefined
  void router.replace({ name: 'login', query })
}
</script>

<template>
  <div class="min-h-dvh flex flex-col items-center justify-center bg-[#F8FAFC] px-5">
    <template v-if="isProvinceBlocked">
      <div class="text-center max-w-sm">
        <p class="text-h1-page font-semibold text-slate-800 mb-2">
          ยังไม่เปิดให้บริการในพื้นที่ของท่าน
        </p>
        <p class="text-body-md text-slate-500 leading-relaxed">
          ขออภัยในความไม่สะดวก ขณะนี้ระบบ พม. CARE
          ยังไม่เปิดให้บริการบันทึกข้อมูลสำหรับจังหวัดของท่าน
        </p>
      </div>
      <button
        type="button"
        class="mt-6 rounded-lg bg-blue-600 px-5 py-2.5 text-body-md font-medium text-white hover:bg-blue-700"
        @click="goLogin"
      >
        กลับหน้าเข้าสู่ระบบ
      </button>
    </template>

    <template v-else>
      <div class="w-full max-w-md text-center">
        <p
          class="text-body leading-relaxed"
          :class="isError ? 'text-red-800 font-medium' : 'text-slate-600'"
        >
          {{ message }}
        </p>
      </div>
      <button
        v-if="isError"
        type="button"
        class="mt-6 rounded-lg bg-blue-600 px-5 py-2.5 text-body-md font-medium text-white hover:bg-blue-700"
        @click="goLogin"
      >
        กลับหน้าเข้าสู่ระบบ
      </button>
    </template>
  </div>
</template>
