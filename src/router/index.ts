// ไฟล์นี้กำหนดเส้นทาง (routes) ทั้งหมดของแอป
// Vue Router เปรียบเหมือน "ป้ายบอกทาง" — URL ไหน แสดง component ไหน

import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',              // URL: https://example.com/
    name: 'login',         // ชื่อ route (ใช้ router.push({ name: 'login' }) แทนการพิมพ์ path)
    component: () => import('@/views/Login.vue'), // lazy load — โหลดไฟล์เมื่อต้องการจริงๆ
    meta: { requiresGuest: true }, // หน้านี้สำหรับคนที่ยังไม่ได้ Login เท่านั้น
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

// Navigation Guards จะเพิ่มที่นี่เมื่อ Auth พร้อม
// ตัวอย่าง: ถ้า route มี requiresAuth: true และยังไม่ Login → redirect ไป '/'

export default router
