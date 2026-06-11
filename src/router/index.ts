// ไฟล์นี้กำหนดเส้นทาง (routes) ทั้งหมดของแอป
// Vue Router เปรียบเหมือน "ป้ายบอกทาง" — URL ไหน แสดง component ไหน

import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { authApi } from '@/api/auth'
import { welfareApi } from '@/api/welfare'
import type { ThaiDUser } from '@/types/auth'

const routes: RouteRecordRaw[] = [
  {
    path: '/',              // URL: https://example.com/
    name: 'login',         // ชื่อ route (ใช้ router.push({ name: 'login' }) แทนการพิมพ์ path)
    component: () => import('@/views/login/LoginPage.vue'),
    meta: { requiresGuest: true }, // หน้านี้สำหรับคนที่ยังไม่ได้ Login เท่านั้น
  },
  {
    path: '/login/thaid/return',
    name: 'login-thaid-return',
    component: () => import('@/views/login/LoginThaIDReturnPage.vue'),
    meta: { public: true },
  },
  // หน้านี้มีเฉพาะตอน dev (vite dev server) — ใน production build จะไม่มี route นี้
  // ป้องกันไม่ให้ผู้ใช้จริงเข้าหน้าจำลองได้
  ...(import.meta.env.DEV
    ? [{
        path: '/login/thaid/dev-mock',
        name: 'login-thaid-dev-mock',
        component: () => import('@/views/login/LoginThaIDDevMockPage.vue'),
        meta: { public: true },
      }]
    : []),
  {
    path: '/pdpa',
    name: 'pdpa',
    component: () => import('@/views/pdpa/PDPAPage.vue'),
    meta: { requiresAuth: true }, // ต้อง Login ก่อนจึงจะเข้าหน้านี้ได้
  },
  {
    path: '/check-self',
    name: 'check-self',
    component: () => import('@/views/check-self/CheckSelfPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/submit-request',
    name: 'submit-request',
    component: () => import('@/views/submit-request/SubmitRequestPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/submit-request/success',
    name: 'submit-success',
    component: () => import('@/views/submit-request/SubmitSuccessPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/case-tracking',
    name: 'case-tracking',
    component: () => import('@/views/case-tracking/CaseTrackingPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/edit-request',
    name: 'edit-request',
    component: () => import('@/views/edit-request/EditRequestPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    // catch-all: ถ้าพิมพ์ URL ที่ไม่มีในระบบ ให้พากลับหน้าแรกเสมอ
    // :pathMatch(.*)*  คือ regex ที่จับ path ทุกแบบ
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

const router = createRouter({
  history: createWebHistory(), // ใช้ URL แบบปกติ (/check-self) ไม่ใช่แบบ hash (#/check-self)
  routes,
  scrollBehavior: () => ({ top: 0 }), // เมื่อเปลี่ยนหน้า ให้ scroll กลับขึ้นบนสุดเสมอ
})

// ─── Helper: หาหน้า "home" ที่เหมาะสมตามสถานะของผู้ใช้ ─────────────────────────
// ใช้ร่วมกันระหว่าง guard (กรณี login แล้วเข้าหน้า login) และ LoginThaIDReturnPage
async function resolveHomeRoute(personId: number): Promise<string> {
  if (!personId) return 'pdpa'
  try {
    const eligibility = await welfareApi.getSubmissionEligibility(personId)
    if (eligibility.reason === 'active_case' || eligibility.reason === 'cooldown') {
      return 'case-tracking'
    }
    if (eligibility.can_submit && eligibility.last_applicant_id != null) return 'check-self'
    if (eligibility.can_submit) return 'pdpa'
  } catch {
    // API ล้มเหลว → ไป pdpa เป็น fallback ปลอดภัย
  }
  return 'pdpa'
}

// ─── Export ให้ LoginThaIDReturnPage ใช้ได้ด้วย ────────────────────────────────
export { resolveHomeRoute }

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  // --- Session Restoration ---
  // ปัญหา: Pinia ถูก reset ทุกครั้งที่กด refresh แต่ sessionStorage ยังอยู่
  // ถ้ามี token ใน sessionStorage แต่ user ยังไม่ถูกโหลด → ดึงข้อมูล user จาก API
  //
  // ข้ามหน้าที่มี meta.public เพราะเป็นหน้ากลาง OAuth flow (เช่น /login/thaid/return)
  // ซึ่งจัดการ auth เอง — ไม่ควรให้ guard แทรกแซง
  if (!to.meta.public && auth.token && !auth.user) {
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
      // auth.method ถูก restore จาก sessionStorage แล้วตอนสร้าง store — ใช้ค่าเดิมได้เลย
      auth.setAuth(u, auth.token, auth.method ?? 'thaid')
    } catch {
      // token หมดอายุหรือไม่ถูกต้อง → ล้างออก แล้วปล่อยให้ guard ด้านล่างจัดการ
      auth.clearAuth()
    }
  }

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login' }
  }

  // ถ้า login แล้วพยายามเข้าหน้า login → พาไปหน้า home ที่เหมาะสมตามสถานะ
  if (to.meta.requiresGuest && auth.isAuthenticated) {
    const user = auth.user as ThaiDUser | null
    const personId = user?.person_id ?? 0
    const home = await resolveHomeRoute(personId)
    return { name: home }
  }

  return true
})

export default router
