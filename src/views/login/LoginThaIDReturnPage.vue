<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { authApi, type ThaIDLoginStatusResponse, THAID_LAST_LOGIN_START_KEY } from '@/api/auth'
import { setThaidDevMockActive } from '@/dev/mock/constants'
import { useAuthStore } from '@/stores/auth'
import { resolveHomeRoute } from '@/router'
import { normalizeThaiDBirthdateForApp } from '@/utils/birthdate'
import type { ThaiDUser } from '@/types/auth'

const router = useRouter()
const authStore = useAuthStore()

const message = ref('กำลังเข้าสู่ระบบ…')
const errorDetail = ref<string | null>(null)
const isError = ref(false)
const isProvinceBlocked = ref(false)

const LOGIN_FAIL_SUMMARY = 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'

function showLoginFailure(detail: string) {
  message.value = LOGIN_FAIL_SUMMARY
  errorDetail.value = detail
  isError.value = true
}

function formatPollStatus(status: ThaIDLoginStatusResponse): string {
  const parts = [`poll status=${status.status}`]
  if (status.error) parts.push(`error=${status.error}`)
  return parts.join(', ')
}

function formatOAuthError(code: string, description?: string | null): string {
  const parts = [`OAuth error=${code}`]
  if (description) parts.push(`description=${description}`)
  return parts.join(', ')
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

    const desc = params.get('error_description')?.trim() || null
    showLoginFailure(formatOAuthError(errorCode, desc))
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
        showLoginFailure(formatPollStatus(status))
        return
      }
      if (status.status !== 'complete' || !status.access_token) {
        showLoginFailure(formatPollStatus(status))
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
      showLoginFailure(formatApiError(err))
    }
    return
  }

  const accessToken = params.get('access_token')?.trim()
  const expiresIn = Number(params.get('expires_in') ?? '0') || 0

  if (!accessToken) {
    showLoginFailure('ไม่มี login_state หรือ access_token ใน URL หลัง redirect')
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
    showLoginFailure(formatApiError(err))
  }
})

function goLogin() {
  const query = errorDetail.value
    ? { auth_error: `${LOGIN_FAIL_SUMMARY}\n${errorDetail.value}` }
    : undefined
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
        <pre
          v-if="errorDetail"
          class="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-left text-body-xs text-red-900 whitespace-pre-wrap break-all overflow-x-auto"
          role="alert"
        >{{ errorDetail }}</pre>
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
