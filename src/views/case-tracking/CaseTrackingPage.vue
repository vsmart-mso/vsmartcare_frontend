<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import type { ThaiDUser } from '@/types/auth'
import { welfareApi } from '@/api/welfare'
import type { CaseDisplayRead, StatusLogItem } from '@/api/welfare'
import { useApplicationStore } from '@/stores/application'

const route  = useRoute()
const router = useRouter()
const auth   = useAuthStore()
const app    = useApplicationStore()

// ─── State ─────────────────────────────────────────────────────────────────────
const isLoading  = ref(true)
const loadError  = ref('')
const caseData   = ref<CaseDisplayRead | null>(null)
const statusLogs = ref<StatusLogItem[]>([])

// ─── Auth ───────────────────────────────────────────────────────────────────────
function isThaiDUser(u: unknown): u is ThaiDUser {
  return u != null && typeof (u as ThaiDUser).fname === 'string'
}
const thaiDUser = computed(() => isThaiDUser(auth.user) ? auth.user : null)
const fullName  = computed(() => {
  const u = thaiDUser.value
  if (!u?.fname) return 'ผู้ใช้งาน'
  return `${u.title} ${u.fname} ${u.lname}`.trim()
})
const avatarLetter = computed(() => thaiDUser.value?.fname?.charAt(0) ?? fullName.value.charAt(0))
const nationalId   = computed(() => thaiDUser.value?.pid ?? '—')

// ─── Query param: รับทั้ง applicantId และ caseId (fallback) ────────────────────
const applicantIdParam = computed(() => {
  const v = route.query.applicantId ?? route.query.caseId
  return v ? Number(v) : null
})

// ─── สถานะที่แสดงบน timeline (ตาม DB current_status id 1–4 เป็น progress, 5 = ปฏิเสธ) ─────
const TIMELINE_STEPS = [
  { id: 1, label: 'รอรับเรื่อง' },
  { id: 2, label: 'รับเรื่องเรียบร้อย' },
  { id: 3, label: 'อยู่ระหว่างการเบิก' },
  { id: 4, label: 'เบิกจ่ายสำเร็จ' },
]
const REJECTED_STATUS_ID  = 5
const EDIT_DATA_STATUS_ID = 8

const currentStatusId = computed(() => caseData.value?.current_status?.id ?? 0)
const isRejected  = computed(() => currentStatusId.value === REJECTED_STATUS_ID)
const isEditData  = computed(() => currentStatusId.value === EDIT_DATA_STATUS_ID)

// ─── ข้อมูลแสดงบนหน้า ──────────────────────────────────────────────────────────
const caseNumber = computed(() =>
  caseData.value?.case_number ?? (caseData.value ? `#${caseData.value.applicant_id}` : '—')
)

const currentStatusLabel = computed(() =>
  caseData.value?.current_status?.description_public ?? '—'
)

const currentStatusColor = computed(() =>
  caseData.value?.current_status?.color ?? '#64748b'
)

// ─── ฟอร์แมตวันที่เป็นภาษาไทย (พ.ศ.) ──────────────────────────────────────────
function toThaiDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('th-TH', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const submittedDate = computed(() =>
  caseData.value ? toThaiDateTime(caseData.value.datetime_create) : '—'
)

// ─── Fetch ─────────────────────────────────────────────────────────────────────
onMounted(async () => {
  if (!auth.isAuthenticated || !thaiDUser.value) {
    router.replace({ name: 'login' })
    return
  }

  const personId = thaiDUser.value.person_id
  if (!personId) {
    loadError.value = 'ไม่พบข้อมูลผู้ใช้'
    isLoading.value = false
    return
  }

  try {
    // 1. ดึงรายการคำร้องทั้งหมดของ person แล้วเลือก case ที่ต้องการ
    const cases = await welfareApi.getCasesDisplay(personId)

    if (applicantIdParam.value) {
      caseData.value = cases.find(c => c.applicant_id === applicantIdParam.value) ?? null
    }
    // ถ้าไม่ระบุ applicantId → แสดง case ล่าสุด (applicant_id สูงสุด)
    if (!caseData.value) {
      caseData.value = cases.sort((a, b) => b.applicant_id - a.applicant_id)[0] ?? null
    }
    if (!caseData.value) {
      loadError.value = 'ไม่พบข้อมูลคำขอ'
      isLoading.value = false
      return
    }

    // 2. ดึงประวัติการเปลี่ยนสถานะ (ถ้าล้มเหลว แสดงข้อมูลหลักได้ปกติ)
    try {
      const detail = await welfareApi.getCase(caseData.value.applicant_id)
      statusLogs.value = [...detail.welfare_request_status_logs].reverse()
    } catch {
      // ใช้ข้อมูลจาก display แทน
    }
  } catch {
    loadError.value = 'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง'
  } finally {
    isLoading.value = false
  }
})

// ─── Timeline helpers ──────────────────────────────────────────────────────────
function stepState(stepId: number): 'done' | 'active' | 'pending' {
  const cur = currentStatusId.value
  // สถานะพิเศษที่ไม่อยู่ใน progress 1–4 → ทุก step เป็น pending
  if (isRejected.value || isEditData.value) return 'pending'
  if (stepId < cur)  return 'done'
  if (stepId === cur) return 'active'
  return 'pending'
}

// ─── Edit Mode ─────────────────────────────────────────────────────────────────
const editLoading = ref(false)

async function handleEdit(step: number) {
  if (!caseData.value || editLoading.value) return
  editLoading.value = true
  try {
    app.clearAll()
    const fullData = await welfareApi.getCase(caseData.value.applicant_id)
    app.populateFromCase(fullData)
    router.push({ name: 'submit-request', query: { step: String(step) } })
  } finally {
    editLoading.value = false
  }
}

// ─── History collapse ──────────────────────────────────────────────────────────
const historyOpen  = ref(true)
const timelineRef  = ref<HTMLElement | null>(null)
function scrollTimeline(dir: 'left' | 'right') {
  timelineRef.value?.scrollBy({ left: dir === 'right' ? 140 : -140, behavior: 'smooth' })
}
</script>

<template>
  <div class="min-h-dvh flex flex-col bg-slate-100">

    <!-- ══════════════════════════════════════════════════════════
         Header
         ══════════════════════════════════════════════════════════ -->
    <header
      class="fixed top-0 left-0 right-0 z-50 h-14 bg-[#1A56DB] text-white shadow-md"
      style="padding-top: env(safe-area-inset-top)"
    >
      <div class="relative mx-auto w-full max-w-md flex items-center justify-center px-4 h-full">
        <h1 class="text-white text-[16px] font-semibold">
          ติดตามสถานะคำขอ
        </h1>
      </div>
    </header>

    <!-- ══════════════════════════════════════════════════════════
         Loading / Error
         ══════════════════════════════════════════════════════════ -->
    <main class="flex-1 mx-auto w-full max-w-md px-4 pt-[4.5rem] pb-8 space-y-3">

      <!-- Loading -->
      <div v-if="isLoading" class="flex flex-col items-center justify-center py-20 gap-3">
        <svg class="w-8 h-8 text-[#1A56DB] animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        <p class="text-[14px] text-slate-500">กำลังโหลดข้อมูล...</p>
      </div>

      <!-- Error -->
      <div v-else-if="loadError" class="flex flex-col items-center justify-center py-20 gap-3 text-center px-4">
        <svg class="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
        </svg>
        <p class="text-[15px] font-semibold text-slate-700">{{ loadError }}</p>
        <button
          @click="router.back()"
          class="mt-1 px-4 py-2 text-[13px] text-[#1A56DB] border border-[#1A56DB] rounded-lg"
        >ย้อนกลับ</button>
      </div>

      <!-- Content -->
      <template v-else-if="caseData">

        <!-- ── User Card ── -->
        <div class="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-[#1A56DB] flex items-center justify-center flex-shrink-0">
            <span class="text-white text-[15px] font-bold">{{ avatarLetter }}</span>
          </div>
          <div class="min-w-0">
            <p class="text-[14px] font-semibold text-slate-800 truncate">{{ fullName }}</p>
            <p class="text-[12px] text-slate-500">{{ nationalId }}</p>
          </div>
        </div>

        <!-- ── Case Info ── -->
        <div class="px-1">
          <p class="text-[14px] text-slate-700">
            หมายเลขคำขอ: <span class="font-bold text-slate-900">{{ caseNumber }}</span>
          </p>
          <p class="text-[13px] text-slate-500 mt-0.5">วันที่ยื่น: {{ submittedDate }}</p>
        </div>

        <!-- ── สถานะปัจจุบัน ── -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-4">
          <p class="text-[12px] font-semibold text-slate-400 mb-3">สถานะปัจจุบัน</p>
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-start gap-3">
              <span
                class="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5"
                :style="{ backgroundColor: currentStatusColor }"
              ></span>
              <p
                class="text-[15px] font-bold"
                :style="{ color: currentStatusColor }"
              >{{ currentStatusLabel }}</p>
            </div>
            <!-- รายใหม่ / รายเดิม badge -->
            <span
              class="text-[12px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0"
              :class="caseData.is_existing_case
                ? 'bg-slate-100 text-slate-600'
                : 'bg-pink-100 text-pink-600'"
            >
              {{ caseData.is_existing_case ? 'รายเดิม' : 'รายใหม่' }}
            </span>
          </div>
        </div>

        <!-- ── Timeline (สถานะ 1–4) ── -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="relative flex items-center px-2 py-4">

            <!-- ลูกศรซ้าย -->
            <button
              type="button"
              @click="scrollTimeline('left')"
              class="flex-shrink-0 w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm z-10 active:scale-90 transition-all"
              aria-label="เลื่อนซ้าย"
            >
              <svg class="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <!-- Steps -->
            <div
              ref="timelineRef"
              class="flex-1 overflow-x-auto px-1"
              style="scrollbar-width: none; -ms-overflow-style: none;"
            >
              <div
                class="flex py-1"
                :class="(isRejected || isEditData) ? 'w-full justify-center' : 'items-start gap-0 min-w-max'"
              >

                <!-- ถ้า rejected แสดง step พิเศษ -->
                <template v-if="isRejected">
                  <div class="flex flex-col items-center w-[88px]">
                    <div class="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-red-500 shadow-md shadow-red-200">
                      <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </div>
                    <p class="text-[10px] text-center leading-tight max-w-[80px] text-red-600 font-semibold" style="margin-top: 10px">
                      คุณสมบัติไม่ตรงตามหลักเกณฑ์
                    </p>
                  </div>
                </template>

                <!-- ถ้า แก้ไขข้อมูล (status 8) แสดง step พิเศษ -->
                <template v-else-if="isEditData">
                  <div class="flex flex-col items-center w-[88px]">
                    <div class="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-amber-500 shadow-md shadow-amber-200">
                      <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"/>
                      </svg>
                    </div>
                    <p class="text-[10px] text-center leading-tight max-w-[80px] text-amber-600 font-semibold" style="margin-top: 10px">
                      แก้ไขข้อมูล
                    </p>
                  </div>
                </template>

                <!-- สถานะปกติ 1–4 -->
                <template v-else>
                  <template v-for="(step, i) in TIMELINE_STEPS" :key="step.id">
                    <div class="flex flex-col items-center w-[72px]">
                      <div
                        class="w-9 h-9 rounded-full flex items-center justify-center font-bold text-[13px] flex-shrink-0 transition-colors"
                        :class="{
                          'bg-green-500 text-white shadow-md shadow-green-200':  stepState(step.id) === 'done',
                          'bg-amber-500 text-white shadow-md shadow-amber-200': stepState(step.id) === 'active',
                          'bg-slate-100 text-slate-400':                         stepState(step.id) === 'pending',
                        }"
                      >
                        <svg v-if="stepState(step.id) === 'done'" class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                        </svg>
                        <svg v-else-if="stepState(step.id) === 'active'" class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        <span v-else>{{ step.id }}</span>
                      </div>
                      <p
                        class="text-[10px] text-center leading-tight max-w-[64px]"
                        style="margin-top: 10px"
                        :class="{
                          'text-green-600 font-semibold': stepState(step.id) === 'done',
                          'text-amber-600 font-semibold': stepState(step.id) === 'active',
                          'text-slate-400':               stepState(step.id) === 'pending',
                        }"
                      >{{ step.label }}</p>
                    </div>
                    <div
                      v-if="i < TIMELINE_STEPS.length - 1"
                      class="h-px w-4 mt-[18px] flex-shrink-0"
                      :class="{
                        'bg-green-300': stepState(step.id) === 'done',
                        'bg-amber-300': stepState(step.id) === 'active',
                        'bg-slate-200': stepState(step.id) === 'pending',
                      }"
                    />
                  </template>
                </template>

              </div>
            </div>

            <!-- ลูกศรขวา -->
            <button
              type="button"
              @click="scrollTimeline('right')"
              class="flex-shrink-0 w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm z-10 active:scale-90 transition-all"
              aria-label="เลื่อนขวา"
            >
              <svg class="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        <!-- ── ตรวจสอบข้อมูลและยืนยัน (แสดงเฉพาะเมื่อสถานะ = แก้ไขข้อมูล) ── -->
        <div v-if="isEditData" class="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">

          <!-- Header การ์ด -->
          <div class="flex items-center gap-3 bg-amber-50 px-4 py-3 border-b border-amber-100">
            <div class="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0">
              <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/>
              </svg>
            </div>
            <div>
              <p class="text-[14px] font-bold text-amber-700">กรุณาแก้ไขข้อมูล</p>
              <p class="text-[11px] text-amber-600 mt-0.5">เลือกหัวข้อที่ต้องการแก้ไขด้านล่าง</p>
            </div>
          </div>

          <div class="p-4 space-y-2">

            <!-- คำเตือน -->
            <div class="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-3">
              <svg class="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
              </svg>
              <div>
                <p class="text-[13px] font-semibold text-amber-700">โปรดตรวจสอบและแก้ไขข้อมูล</p>
                <p class="text-[12px] text-amber-600 mt-0.5">เจ้าหน้าที่ขอให้แก้ไขข้อมูลก่อนดำเนินการต่อ</p>
              </div>
            </div>

            <!-- Step 1: ข้อมูลส่วนตัว -->
            <div class="flex items-start gap-3 border border-slate-200 rounded-xl px-3 py-3">
              <div class="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg class="w-4 h-4 text-[#1A56DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                </svg>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-[13px] font-semibold text-slate-800">ตัวตน + ที่อยู่ + ครอบครัว</p>
                <p class="text-[12px] text-slate-500 mt-0.5">ยืนยันผ่าน ThaiID ✓</p>
              </div>
              <button
                type="button"
                :disabled="editLoading"
                @click="handleEdit(1)"
                class="text-[13px] font-medium text-[#1A56DB] hover:underline active:opacity-70 flex-shrink-0 disabled:opacity-40"
              >{{ editLoading ? '...' : 'แก้ไข' }}</button>
            </div>

            <!-- Step 2: เศรษฐกิจ -->
            <div class="flex items-start gap-3 border border-slate-200 rounded-xl px-3 py-3">
              <div class="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg class="w-4 h-4 text-[#1A56DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 10h18M3 6h18M3 14h18M3 18h18"/>
                </svg>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-[13px] font-semibold text-slate-800">เศรษฐกิจ + สวัสดิการ</p>
                <p class="text-[12px] text-slate-500 mt-0.5">ตามที่กรอกใน Step 2</p>
              </div>
              <button
                type="button"
                :disabled="editLoading"
                @click="handleEdit(2)"
                class="text-[13px] font-medium text-[#1A56DB] hover:underline active:opacity-70 flex-shrink-0 disabled:opacity-40"
              >{{ editLoading ? '...' : 'แก้ไข' }}</button>
            </div>

            <!-- Step 3: ปัญหา -->
            <div class="flex items-start gap-3 border border-slate-200 rounded-xl px-3 py-3">
              <div class="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg class="w-4 h-4 text-[#1A56DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-[13px] font-semibold text-slate-800">ปัญหา + ความช่วยเหลือ</p>
                <p class="text-[12px] text-slate-500 mt-0.5">ตามที่กรอกใน Step 3</p>
              </div>
              <button
                type="button"
                :disabled="editLoading"
                @click="handleEdit(3)"
                class="text-[13px] font-medium text-[#1A56DB] hover:underline active:opacity-70 flex-shrink-0 disabled:opacity-40"
              >{{ editLoading ? '...' : 'แก้ไข' }}</button>
            </div>

            <!-- Step 4: เอกสาร -->
            <div class="flex items-start gap-3 border border-slate-200 rounded-xl px-3 py-3">
              <div class="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg class="w-4 h-4 text-[#1A56DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-[13px] font-semibold text-slate-800">เอกสารและรูปประกอบ</p>
                <p class="text-[12px] text-slate-500 mt-0.5">หลักฐานและเอกสารแนบ</p>
              </div>
              <button
                type="button"
                :disabled="editLoading"
                @click="handleEdit(4)"
                class="text-[13px] font-medium text-[#1A56DB] hover:underline active:opacity-70 flex-shrink-0 disabled:opacity-40"
              >{{ editLoading ? '...' : 'แก้ไข' }}</button>
            </div>

          </div>
        </div>

        <!-- ── ประวัติการเปลี่ยนสถานะ ── -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

          <button
            type="button"
            class="w-full flex items-center justify-between px-4 py-3.5 hover:bg-slate-50 active:bg-slate-100 transition-colors"
            @click="historyOpen = !historyOpen"
          >
            <span class="text-[14px] font-semibold text-slate-800">
              ประวัติการเปลี่ยนสถานะ
              <span class="text-[13px] text-slate-400 font-normal ml-1">
                ({{ statusLogs.length || 1 }})
              </span>
            </span>
            <svg
              class="w-5 h-5 text-slate-400 flex-shrink-0 transition-transform duration-200"
              :class="historyOpen ? 'rotate-0' : '-rotate-180'"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </button>

          <Transition
            enter-active-class="transition-all duration-200 ease-out"
            enter-from-class="opacity-0 -translate-y-1"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition-all duration-150 ease-in"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 -translate-y-1"
          >
            <div v-if="historyOpen" class="border-t border-slate-100">

              <!-- แสดงจาก status logs จริง -->
              <template v-if="statusLogs.length > 0">
                <div
                  v-for="(log, index) in statusLogs"
                  :key="log.id"
                  class="px-4 pt-4 flex items-start gap-3 last:pb-4"
                >
                  <!-- คอลัมน์ซ้าย: จุด + เส้นเชื่อมแนวตั้ง -->
                  <div class="flex flex-col items-center self-stretch flex-shrink-0">
                    <span
                      class="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0"
                      :style="{ backgroundColor: log.current_status.color }"
                    ></span>
                    <!-- เส้นเชื่อมลงด้านล่าง แสดงทุกรายการยกเว้นรายการสุดท้าย -->
                    <span
                      v-if="index < statusLogs.length - 1"
                      class="w-0.5 flex-1 mt-1.5 rounded-full"
                      :style="{ backgroundColor: log.current_status.color + '55' }"
                    ></span>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-[11px] text-slate-400 mb-1.5">
                      {{ toThaiDateTime(log.updated_at) }}
                    </p>
                    <div
                      class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 mb-1 border"
                      :style="{
                        backgroundColor: log.current_status.color + '18',
                        borderColor: log.current_status.color + '44',
                      }"
                    >
                      <span
                        class="w-2 h-2 rounded-full flex-shrink-0"
                        :style="{ backgroundColor: log.current_status.color }"
                      ></span>
                      <p
                        class="text-[13px] font-bold leading-tight"
                        :style="{ color: log.current_status.color }"
                      >{{ log.current_status.description_public }}</p>
                    </div>
                  </div>
                </div>
              </template>

              <!-- fallback: แสดงวันที่ยื่นจาก display API -->
              <template v-else>
                <div class="px-4 py-4 flex items-start gap-3">
                  <span class="w-2.5 h-2.5 rounded-full bg-[#1A56DB] mt-1 flex-shrink-0"></span>
                  <div class="flex-1 min-w-0">
                    <p class="text-[11px] text-slate-400 mb-1.5">{{ submittedDate }}</p>
                    <div class="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5">
                      <span class="w-2 h-2 rounded-full bg-[#1A56DB] flex-shrink-0"></span>
                      <p class="text-[13px] font-bold text-[#1A56DB] leading-tight">ยื่นคำขอเข้าระบบ</p>
                    </div>
                  </div>
                </div>
              </template>

            </div>
          </Transition>
        </div>

      </template>

    </main>
  </div>
</template>
