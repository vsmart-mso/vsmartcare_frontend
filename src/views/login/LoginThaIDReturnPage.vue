<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { resolveHomeRoute } from '@/router'
import type { ThaiDUser } from '@/types/auth'

const router = useRouter()
const authStore = useAuthStore()

const message = ref('กำลังเข้าสู่ระบบ…')
const isError = ref(false)
// จังหวัดยังไม่เปิดบริการ (TASK-v-care-12062026-01) — แสดงข้อความเฉพาะบนหน้านี้
const isProvinceBlocked = ref(false)

function resolveThaiDErrorMessage(_error: string, _description?: string | null): string {
  return 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
}

onMounted(async () => {
  const params = new URLSearchParams(window.location.search)

  // ThaiD ส่ง error กลับมา (เช่น ผู้ใช้กดปฏิเสธในแอป) → พากลับหน้า login พร้อม error message
  const errorCode = params.get('error')?.trim()
  if (errorCode) {
    history.replaceState(null, '', window.location.pathname)

    // จังหวัดยังไม่เปิดบริการ — แสดงข้อความมาตรฐานบนหน้านี้ (ไม่เด้งกลับ login)
    if (errorCode === 'province_not_enabled') {
      isProvinceBlocked.value = true
      isError.value = true
      return
    }

    const desc = params.get('error_description')?.trim() || null
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
    await router.replace({ name: await resolveHomeRoute(u.person_id) })
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
    <!-- จังหวัดยังไม่เปิดบริการ — ข้อความมาตรฐาน -->
    <template v-if="isProvinceBlocked">
      <div class="text-center max-w-sm">
        <p class="text-[17px] font-semibold text-slate-800 mb-2">
          ยังไม่เปิดให้บริการในพื้นที่ของท่าน
        </p>
        <p class="text-[14px] text-slate-500 leading-relaxed">
          ขออภัยในความไม่สะดวก ขณะนี้ระบบ พม. CARE
          ยังไม่เปิดให้บริการบันทึกข้อมูลสำหรับจังหวัดของท่าน
        </p>
      </div>
      <button
        type="button"
        class="mt-6 rounded-lg bg-blue-600 px-5 py-2.5 text-[14px] font-medium text-white hover:bg-blue-700"
        @click="goLogin"
      >
        กลับหน้าเข้าสู่ระบบ
      </button>
    </template>

    <!-- สถานะปกติ / error อื่น ๆ -->
    <template v-else>
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
    </template>
  </div>
</template>
