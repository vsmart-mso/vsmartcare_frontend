<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { welfareApi } from '@/api/welfare'
import type { ThaiDUser } from '@/types/auth'

const router = useRouter()
const authStore = useAuthStore()

const message = ref('กำลังเข้าสู่ระบบ…')
const isError = ref(false)

// ตรวจสอบสถานะของผู้ใช้แล้วคืน route ที่เหมาะสม
async function resolvePostLoginRoute(personId: number): Promise<{ name: string; query?: Record<string, string> }> {
  if (!personId) return { name: 'pdpa' }
  try {
    // 1. มีคำขอที่ค้างอยู่ (สถานะ 1=รอรับเรื่อง, 2=รับเรื่องเรียบร้อย, 3=อยู่ระหว่างการเบิก) → ติดตามผล
    const cases = await welfareApi.getCasesDisplay(personId)
    const activeCase = cases.find(c => [1, 2, 3].includes(c.current_status?.id ?? -1))
    if (activeCase) {
      return { name: 'case-tracking', query: { applicantId: String(activeCase.applicant_id) } }
    }
    // 2. ผ่านการตรวจสอบสิทธิ์แล้ว → หน้าผลการตรวจสอบ
    const latestPassed = await welfareApi.getLatestPassedScreening(personId)
    if (latestPassed) {
      return { name: 'check-self', query: { result: 'passed' } }
    }
  } catch {
    // ถ้า API ล้มเหลวให้ไปหน้า pdpa ตามปกติ ไม่ block user
  }
  // 3. ยังไม่เคยทำอะไรในระบบ → เริ่มกรอก PDPA
  return { name: 'pdpa' }
}

function resolveThaiDErrorMessage(_error: string, _description?: string | null): string {
  return 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
}

onMounted(async () => {
  const params = new URLSearchParams(window.location.search)

  // ThaiD ส่ง error กลับมา (เช่น ผู้ใช้กดปฏิเสธในแอป) → พากลับหน้า login พร้อม error message
  const errorCode = params.get('error')?.trim()
  if (errorCode) {
    const desc = params.get('error_description')?.trim() || null
    history.replaceState(null, '', window.location.pathname)
    await router.replace({ name: 'login', query: { auth_error: resolveThaiDErrorMessage(errorCode, desc) } })
    return
  }

  const accessToken = params.get('access_token')?.trim()
  // อ่านอายุ token (หน่วย "วินาที") ที่ backend แนบมาพร้อม redirect
  const expiresIn = Number(params.get('expires_in') ?? '0') || 0

  // ลบ query string ออกจาก URL ทันที เพราะมี access_token อยู่
  // ถ้าไม่ลบ token จะค้างอยู่ใน browser history และอาจรั่วผ่าน Referer header
  history.replaceState(null, '', window.location.pathname)

  if (!accessToken) {
    // ไม่มี error และไม่มี access_token — backend ไม่ได้ส่งอะไรมา
    await router.replace({ name: 'login', query: { auth_error: 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' } })
    return
  }

  // เก็บ token ชั่วคราวใน sessionStorage เพื่อให้ apiClient แนบ Authorization header
  // ได้อัตโนมัติตอนเรียก fetchMe() ด้านล่าง
  // ใช้ sessionStorage (ไม่ใช่ localStorage) เพราะปลอดภัยกว่า — scoped ต่อ tab เดียว
  sessionStorage.setItem('auth_token', accessToken)

  try {
    const me = await authApi.fetchMe()
    const u: ThaiDUser = {
      pid:       me.pid,
      title:     me.title_th,
      fname:     me.given_name,
      lname:     me.family_name,
      dob:       me.birthdate  ?? '',
      gender:    me.gender     ?? '',
      person_id: me.person_id  ?? 0,
    }
    // setAuth จะเขียน token ลง sessionStorage อีกครั้ง (พร้อมข้อมูลหมดอายุ)
    authStore.setAuth(u, accessToken, 'thaid', expiresIn || undefined)

    // เลือกหน้าปลายทางอัตโนมัติตามสถานะของผู้ใช้
    message.value = 'กำลังตรวจสอบข้อมูล...'
    await router.replace(await resolvePostLoginRoute(u.person_id))
  } catch {
    // fetchMe ล้มเหลว — ลบ token ออกเพื่อไม่ให้ค้างอยู่ใน storage แล้วพากลับหน้า login
    sessionStorage.removeItem('auth_token')
    await router.replace({ name: 'login', query: { auth_error: 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' } })
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
