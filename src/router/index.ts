import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'login',
    component: () => import('@/views/Login.vue')
  },
  {
    path: '/check-self',
    name: 'check-self',
    component: () => import('@/views/CheckSelf.vue')
  },
  {
    path: '/chang-service',
    name: 'chang-service',
    component: () => import('@/views/ChangService.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router

