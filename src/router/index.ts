// ไฟล์นี้กำหนดเส้นทาง (routes) ทั้งหมดของแอป
// Vue Router เปรียบเหมือน "ป้ายบอกทาง" — URL ไหน แสดง component ไหน

import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes: RouteRecordRaw[] = [
  {
    path: '/',              // URL: https://example.com/
    name: 'login',         // ชื่อ route (ใช้ router.push({ name: 'login' }) แทนการพิมพ์ path)
    component: () => import('@/views/Login.vue'), // lazy load — โหลดไฟล์เมื่อต้องการจริงๆ
    meta: { requiresGuest: true }, // หน้านี้สำหรับคนที่ยังไม่ได้ Login เท่านั้น
  },
  {
    path: '/login/thaid/return',
    name: 'login-thaid-return',
    component: () => import('@/views/login/LoginThaIDReturnPage.vue'),
    meta: { public: true },
  },
  {
    path: '/login/thaid/dev-mock',
    name: 'login-thaid-dev-mock',
    component: () => import('@/views/login/LoginThaIDDevMockPage.vue'),
    meta: { public: true },
  },
  {
    path: '/pdpa',
    name: 'pdpa',
    component: () => import('@/views/PDPA.vue'),
    meta: { requiresAuth: true }, // ต้อง Login ก่อนจึงจะเข้าหน้านี้ได้
  },
  {
    path: '/check-self',
    name: 'check-self',
    component: () => import('@/views/CheckSelf.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/chang-service',
    name: 'chang-service',
    component: () => import('@/views/ChangService.vue'),
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

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login' }
  }
  if (to.meta.requiresGuest && auth.isAuthenticated) {
    return { name: 'pdpa' }
  }
  return true
})

export default router
