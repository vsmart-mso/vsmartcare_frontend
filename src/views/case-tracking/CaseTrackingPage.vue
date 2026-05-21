<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import type { ThaiDUser } from '@/types/auth'
import { welfareApi } from '@/api/welfare'
import type { CaseDisplayRead, StatusLogItem, ReviewComment } from '@/api/welfare'
import { useApplicationStore } from '@/stores/application'
import CaseTrackingSkeleton from './components/CaseTrackingSkeleton.vue'

const route  = useRoute()
const router = useRouter()
const auth   = useAuthStore()
const app    = useApplicationStore()

// ─── State ─────────────────────────────────────────────────────────────────────
const isLoading  = ref(true)
const loadError  = ref('')
const caseData   = ref<CaseDisplayRead | null>(null)
const statusLogs = ref<StatusLogItem[]>([])
const count037   = ref(0)  // จำนวนฟอร์ม 037 ที่เบิกจ่ายแล้ว

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
// แสดงเลขบัตรประชาชนแบบ mask ตามมาตรฐานสากล: แสดงตัวแรกและ 4 ตัวสุดท้าย
// ตัวอย่าง: 1234567890123 → 1-XXXX-XXXXX-XX-3
function formatNationalId(pid: string): string {
  const d = pid.replace(/\D/g, '')
  if (d.length !== 13) return pid
  return `${d[0]}-${d.slice(1,5)}-${d.slice(5,10)}-${d.slice(10,12)}-${d[12]}`
}
function maskNationalId(pid: string): string {
  const d = pid.replace(/\D/g, '')
  if (d.length !== 13) return pid
  return `${d[0]}-XXXX-XXXXX-XX-${d[12]}`
}
const showFullId = ref(false)
const nationalId = computed(() => {
  const pid = thaiDUser.value?.pid
  if (!pid) return '—'
  return showFullId.value ? formatNationalId(pid) : maskNationalId(pid)
})

// ─── Query param: รับทั้ง applicantId และ caseId (fallback) ────────────────────
const applicantIdParam = computed(() => {
  const v = route.query.applicantId ?? route.query.caseId
  return v ? Number(v) : null
})

// ─── สถานะที่แสดงบน timeline ────────────────────────────────────────────────────
const TIMELINE_STEPS = [
  { id: 1, label: 'รอรับเรื่อง' },
  { id: 2, label: 'รับเรื่องเรียบร้อย' },
  { id: 3, label: 'อยู่ระหว่างการเบิก' },
  { id: 4, label: 'เบิกจ่ายสำเร็จ' },
]

// map DB current_status.id → ตำแหน่ง step บน timeline (1–4)
// DB id=10 ("อยู่ระหว่างการเบิก") แสดงเป็น step 4 "เบิกจ่ายสำเร็จ" บน UI
const DB_STATUS_TO_STEP: Record<number, number> = { 1: 1, 2: 2, 3: 3, 10: 4, 4: 4 }

const REJECTED_STATUS_ID    = 5
const EDIT_DATA_STATUS_ID   = 8
const DISBURSED_STATUS_ID   = 10  // DB id ที่ trigger การประเมินความพึงพอใจ

const currentStatusId = computed(() => caseData.value?.current_status?.id ?? 0)

// กรณีพิเศษ: สถานะ id=4 (เบิกจ่ายสำเร็จ) แต่ยังไม่มีข้อมูลฟอร์ม 037 → ยังอยู่ระหว่างการเบิก
const isPendingDisbursement = computed(() =>
  currentStatusId.value === 4 && count037.value === 0,
)

// ตำแหน่ง timeline ของสถานะปัจจุบัน (0 ถ้าไม่อยู่ใน map)
// ถ้า isPendingDisbursement → บังคับให้อยู่ที่ step 3 (อยู่ระหว่างการเบิก)
const currentTimelineStep = computed(() => {
  if (isPendingDisbursement.value) return 3
  return DB_STATUS_TO_STEP[currentStatusId.value] ?? 0
})

const isRejected   = computed(() => currentStatusId.value === REJECTED_STATUS_ID)
const isEditData   = computed(() => currentStatusId.value === EDIT_DATA_STATUS_ID)
// แสดงแบบสอบถามเมื่อ: สถานะ id=10 หรือ id=4 ที่มี count_037 > 0 (เบิกจ่ายสำเร็จจริง)
const isDisbursed  = computed(() =>
  (currentStatusId.value === DISBURSED_STATUS_ID || currentStatusId.value === 4) &&
  !isPendingDisbursement.value,
)

const commentsByStep = computed<Record<number, ReviewComment[]>>(() => {
  const groups: Record<number, ReviewComment[]> = { 1: [], 2: [], 3: [], 4: [] }
  for (const c of app.reviewComments) {
    if (c.name === 'remarks') continue
    if (c.step >= 1 && c.step <= 4) groups[c.step].push(c)
  }
  return groups
})

const remarksComment = computed<ReviewComment | null>(() =>
  app.reviewComments.find(c => c.name === 'remarks') ?? null
)

// ─── ข้อมูลแสดงบนหน้า ──────────────────────────────────────────────────────────
const caseNumber = computed(() =>
  caseData.value?.case_number ?? (caseData.value ? `#${caseData.value.applicant_id}` : '—')
)

const currentStatusLabel = computed(() => {
  if (isPendingDisbursement.value) return 'อยู่ระหว่างการเบิก'
  return caseData.value?.current_status?.description_public ?? '—'
})

const currentStatusColor = computed(() => {
  if (isPendingDisbursement.value) return '#ff0000'
  const s = caseData.value?.current_status
  if (!s) return '#64748b'
  return s.color
})

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

    // 2. ดึงประวัติการเปลี่ยนสถานะและ count_037 (ถ้าล้มเหลว แสดงข้อมูลหลักได้ปกติ)
    try {
      const detail = await welfareApi.getCase(caseData.value.applicant_id)
      statusLogs.value = [...detail.welfare_request_status_logs].reverse()
      count037.value = detail.count_037 ?? 0
    } catch {
      // ใช้ข้อมูลจาก display แทน
    }

    // 3. ถ้าสถานะ=8 (แก้ไขข้อมูล) ดึง review comments จากเจ้าหน้าที่
    if (caseData.value.current_status?.id === EDIT_DATA_STATUS_ID) {
      try {
        app.reviewComments = await welfareApi.getEditRequestComments(caseData.value.applicant_id)
      } catch {
        // comments ไม่ใช่ข้อมูลหลัก — ไม่ block การแสดงผล
      }
    }

    // 4. ถ้าสถานะ id=10 หรือ id=4 ที่มี count_037 > 0 เช็กว่าเคยประเมิน aid_received แล้วหรือยัง
    if (
      caseData.value.current_status?.id === DISBURSED_STATUS_ID ||
      (caseData.value.current_status?.id === 4 && count037.value !== 0)
    ) {
      try {
        const surveys = await welfareApi.getSatisfactionSurveys(caseData.value.applicant_id)
        const alreadyRated = surveys.some(s => s.survey_type === 'aid_received')
        if (alreadyRated) surveyState.value = 'done'
      } catch {
        // ถ้าโหลดไม่ได้ แสดง form ให้ประเมินได้เลย (ไม่ block)
      }
    }
  } catch {
    loadError.value = 'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง'
  } finally {
    isLoading.value = false
  }
})

// ─── Timeline helpers ──────────────────────────────────────────────────────────
function stepState(stepId: number): 'done' | 'active' | 'pending' {
  if (isRejected.value || isEditData.value) return 'pending'
  const pos = currentTimelineStep.value
  if (stepId < pos) return 'done'
  if (stepId === pos) {
    // step 2 (รับเรื่องเรียบร้อย) เป็น milestone สำเร็จ → green checkmark
    // step 4 (เบิกจ่ายสำเร็จ) เป็น milestone สำเร็จ เฉพาะเมื่อไม่ใช่ isPendingDisbursement
    if (stepId === 2) return 'done'
    if (stepId === 4 && !isPendingDisbursement.value) return 'done'
    return 'active'
  }
  return 'pending'
}

// ─── ประวัติสถานะ: filter เหลือแค่ 4 ขั้นตอน timeline, dedup และ reset เมื่อ regression ─
// เช่น [1→2→8→1] จะเหลือแค่ [1 (ล่าสุด)] เพราะ 1 < maxStep(2) → regression
const filteredStatusLogs = computed(() => {
  const stepMap = new Map<number, typeof statusLogs.value[0]>()
  let maxStep = 0

  for (const log of statusLogs.value) {
    const step = DB_STATUS_TO_STEP[log.current_status.id]
    if (!step) continue  // ข้ามสถานะพิเศษ (rejected=5, edit=8 ฯลฯ)
    if (log.current_status.id === 4) continue  // id=4 ตามหลัง id=10 เสมอ ไม่แสดงในประวัติ

    if (step < maxStep) {
      // regression: ลบ step ที่สูงกว่าออกทั้งหมด
      for (const k of stepMap.keys()) {
        if (k > step) stepMap.delete(k)
      }
    }
    stepMap.set(step, log)
    maxStep = stepMap.size > 0 ? Math.max(...stepMap.keys()) : 0
  }

  return Array.from(stepMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([, log]) => log)
})

// ─── Edit Mode ─────────────────────────────────────────────────────────────────
const editLoading = ref(false)

async function handleEdit() {
  if (!caseData.value || editLoading.value) return
  editLoading.value = true
  try {
    app.clearAll()
    const fullData = await welfareApi.getCase(caseData.value.applicant_id)
    app.populateFromCase(fullData)
    router.push({ name: 'edit-request' })
  } finally {
    editLoading.value = false
  }
}

// ─── Satisfaction Survey (aid_received) ───────────────────────────────────────
const surveyState    = ref<'pending' | 'submitting' | 'done'>('pending')
const selectedRating = ref(0)
const hoverRating    = ref(0)
const surveyComment  = ref('')
const surveyError    = ref('')
const starLabels     = ['', 'ปรับปรุง', 'พอใช้', 'ดี', 'ดีมาก', 'ดีเยี่ยม']
const activeRating   = computed(() => hoverRating.value || selectedRating.value)

async function submitAidSurvey() {
  if (!selectedRating.value || surveyState.value !== 'pending' || !caseData.value) return
  surveyState.value = 'submitting'
  surveyError.value = ''
  try {
    await welfareApi.submitSatisfaction({
      applicant_id: caseData.value.applicant_id,
      survey_type:  'aid_received',
      rating:       selectedRating.value,
      comment:      surveyComment.value.trim() || null,
    })
    surveyState.value = 'done'
  } catch {
    surveyState.value = 'pending'
    surveyError.value = 'ส่งผลประเมินไม่สำเร็จ กรุณาลองใหม่'
  }
}

function skipAidSurvey() {
  surveyState.value = 'done'
}

// ─── ป้องกันกด back กลับไปหน้ากรอกฟอร์มหรือ check-self หลังจาก submit แล้ว ─────
onBeforeRouteLeave((to) => {
  if (to.name === 'submit-request' || to.name === 'check-self') {
    return false  // ยกเลิก navigation — user อยู่ที่ case-tracking ต่อ
  }
})

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

      <!-- Loading — โชว์โครงหน้าจอจำลอง (skeleton) แทน spinner เปล่า ๆ -->
      <CaseTrackingSkeleton v-if="isLoading" />

      <!-- Error -->
      <div v-else-if="loadError" class="flex flex-col items-center justify-center py-20 gap-3 text-center px-4">
        <svg class="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
        </svg>
        <p class="text-[15px] font-semibold text-slate-700">{{ loadError }}</p>
        <button
          @click="router.back()"
          class="mt-1 px-4 py-2 text-[14px] text-[#1A56DB] border border-[#1A56DB] rounded-lg"
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
            <p class="text-[15px] font-semibold text-slate-800 truncate">{{ fullName }}</p>
            <div class="flex items-center gap-1.5">
              <p class="text-[13px] text-slate-500 font-mono">{{ nationalId }}</p>
              <button
                v-if="thaiDUser?.pid"
                type="button"
                @click="showFullId = !showFullId"
                class="text-slate-400 hover:text-slate-600 active:scale-90 transition-all flex-shrink-0"
                :aria-label="showFullId ? 'ซ่อนเลขบัตรประชาชน' : 'แสดงเลขบัตรประชาชน'"
              >
                <!-- ไอคอนตา (เปิด) — แสดงเมื่อกำลัง mask อยู่ -->
                <svg v-if="!showFullId" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                <!-- ไอคอนตาขีดทับ (ปิด) — แสดงเมื่อกำลังแสดงครบอยู่ -->
                <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- ── Case Info ── -->
        <div class="px-1">
          <p class="text-[15px] text-slate-700">
            หมายเลขคำขอ: <span class="font-bold text-slate-900">{{ caseNumber }}</span>
          </p>
          <p class="text-[14px] text-slate-500 mt-0.5">วันที่ยื่น: {{ submittedDate }}</p>
        </div>

        <!-- ── สถานะปัจจุบัน ── -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-4">
          <p class="text-[13px] font-semibold text-slate-400 mb-3">สถานะปัจจุบัน</p>
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
                    <p class="text-[12px] text-center leading-tight max-w-[80px] text-red-600 font-semibold" style="margin-top: 10px">
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
                    <p class="text-[12px] text-center leading-tight max-w-[80px] text-amber-600 font-semibold" style="margin-top: 10px">
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
                          'text-white shadow-md':                                stepState(step.id) === 'done',
                          'bg-amber-500 text-white shadow-md shadow-amber-200': stepState(step.id) === 'active',
                          'bg-slate-100 text-slate-400':                         stepState(step.id) === 'pending',
                        }"
                        :style="stepState(step.id) === 'done' ? { backgroundColor: '#009f75', boxShadow: '0 4px 6px -1px #009f7533' } : {}"
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
                        class="text-[12px] text-center leading-tight max-w-[64px]"
                        style="margin-top: 10px"
                        :class="{
                          'font-semibold': stepState(step.id) === 'done',
                          'text-amber-600 font-semibold': stepState(step.id) === 'active',
                          'text-slate-400':               stepState(step.id) === 'pending',
                        }"
                        :style="stepState(step.id) === 'done' ? { color: '#009f75' } : {}"
                      >{{ step.label }}</p>
                    </div>
                    <div
                      v-if="i < TIMELINE_STEPS.length - 1"
                      class="h-px w-4 mt-[18px] flex-shrink-0"
                      :class="{
                        'bg-amber-300': stepState(step.id) === 'active',
                        'bg-slate-200': stepState(step.id) === 'pending',
                      }"
                      :style="stepState(step.id) === 'done' ? { backgroundColor: '#009f7566' } : {}"
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

        <!-- ── ประเมินความพึงพอใจการได้รับความช่วยเหลือ (แสดงเฉพาะเมื่อสถานะ = เบิกจ่ายสำเร็จ) ── -->
        <div v-if="isDisbursed" class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

          <!-- ส่งแล้ว: ขอบคุณ -->
          <div v-if="surveyState === 'done'" class="flex flex-col items-center px-5 py-6 gap-2">
            <div class="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center mb-1">
              <svg class="w-7 h-7 text-yellow-400" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </div>
            <p class="text-[15px] font-bold text-slate-800">ขอบคุณสำหรับการประเมิน</p>
            <p class="text-[13px] text-slate-500 text-center">ความคิดเห็นของท่านมีคุณค่าต่อการพัฒนาการให้บริการ</p>
          </div>

          <!-- ยังไม่ประเมิน / กำลังส่ง -->
          <template v-else>
            <!-- หัว -->
            <div class="flex gap-3 px-4 pt-4 pb-3">
              <div class="w-9 h-9 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                <svg class="w-5 h-5 text-yellow-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </div>
              <div>
                <p class="text-[12px] font-semibold text-yellow-600 uppercase tracking-wider mb-0.5">แบบสอบถาม</p>
                <p class="text-[15px] font-bold text-slate-900">ประเมินความพึงพอใจการช่วยเหลือ</p>
              </div>
            </div>

            <div class="px-4 pb-4 space-y-4">
              <p class="text-[13px] text-slate-600">ท่านพึงพอใจกับการได้รับความช่วยเหลือครั้งนี้มากน้อยเพียงใด?</p>

              <!-- ดาว 1-5 -->
              <div class="flex justify-center gap-3">
                <button
                  v-for="star in 5"
                  :key="star"
                  type="button"
                  @click="selectedRating = star"
                  @mouseenter="hoverRating = star"
                  @mouseleave="hoverRating = 0"
                  :aria-label="`${star} ดาว — ${starLabels[star]}`"
                  class="flex flex-col items-center gap-1 focus:outline-none active:scale-95 transition-transform"
                >
                  <svg
                    class="w-9 h-9 transition-colors duration-150"
                    :class="star <= activeRating ? 'text-yellow-400' : 'text-slate-200'"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                  <span class="text-[12px] text-slate-400 leading-none">{{ starLabels[star] }}</span>
                </button>
              </div>

              <!-- ช่องความคิดเห็น (ไม่บังคับ) -->
              <textarea
                v-model="surveyComment"
                rows="2"
                placeholder="ความคิดเห็นเพิ่มเติม (ไม่บังคับ)"
                maxlength="500"
                class="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB] resize-none"
              />

              <!-- error -->
              <p v-if="surveyError" class="text-[13px] text-red-500 text-center">{{ surveyError }}</p>

              <!-- ปุ่ม -->
              <div class="flex gap-2">
                <button
                  type="button"
                  @click="skipAidSurvey"
                  class="flex-1 border border-slate-200 rounded-xl py-2.5 text-[14px] font-medium text-slate-500 hover:bg-slate-50 active:scale-[0.98] transition-all"
                >
                  ข้ามขั้นตอนนี้
                </button>
                <button
                  type="button"
                  @click="submitAidSurvey"
                  :disabled="!selectedRating || surveyState === 'submitting'"
                  class="flex-1 rounded-xl py-2.5 text-[14px] font-semibold transition-all active:scale-[0.98]"
                  :class="selectedRating && surveyState !== 'submitting'
                    ? 'bg-[#1A56DB] text-white hover:bg-[#1648C4]'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'"
                >
                  {{ surveyState === 'submitting' ? 'กำลังส่ง...' : 'ส่งผลประเมิน' }}
                </button>
              </div>
            </div>
          </template>
        </div>

       <!-- ── ตรวจสอบข้อมูลและยืนยัน (แสดงเฉพาะเมื่อสถานะ = แก้ไขข้อมูล) ── -->
        <div v-if="isEditData" class="bg-white rounded-2xl border-2 border-red-300 shadow-md shadow-red-100 overflow-hidden warn-card">

          <!-- Header การ์ด -->
          <div class="flex items-center gap-3 bg-red-50 px-4 py-3.5 border-b border-red-200">
            <!-- ไอคอนดินสอ มี shake animation -->
            <div class="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 warn-icon-shake">
              <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/>
              </svg>
            </div>
            <div>
              <p class="text-[16px] font-bold text-red-700">กรุณาแก้ไขข้อมูล</p>
              <p class="text-[13px] text-red-600 mt-0.5">เลือกหัวข้อที่ต้องการแก้ไขด้านล่าง</p>
            </div>
          </div>

          <div class="p-4 space-y-2">

            <!-- คำเตือน — มี ping ring รอบไอคอน -->
            <div class="flex items-start gap-3 bg-red-50 border border-red-300 rounded-xl px-3 py-3 mb-3">
              <div class="relative flex-shrink-0 mt-0.5">
                <!-- วงกลม ping ขยายออก ทำให้รู้สึกเป็น alert -->
                <span class="absolute inset-0 rounded-full bg-red-400 warn-pulse-ring"></span>
                <svg class="relative w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
                </svg>
              </div>
              <div>
                <p class="text-[15px] font-semibold text-red-700">โปรดตรวจสอบและแก้ไขข้อมูล</p>
                <p class="text-[13px] text-red-600 mt-0.5">เจ้าหน้าที่ขอให้แก้ไขข้อมูลก่อนดำเนินการต่อ</p>
              </div>
            </div>

            <!-- Step 1: ข้อมูลส่วนตัว — แสดงเฉพาะเมื่อมี comment -->
            <div
              v-if="commentsByStep[1].length"
              class="border border-red-300 bg-red-50/40 rounded-xl px-3 py-3"
            >
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <svg class="w-5 h-5 text-[#1A56DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                  </svg>
                </div>
                <p class="flex-1 min-w-0 text-[15px] font-semibold text-slate-800">ตัวตน + ที่อยู่ + ครอบครัว</p>
                <button
                  type="button"
                  :disabled="editLoading"
                  @click="handleEdit()"
                  class="text-[14px] font-medium text-[#1A56DB] hover:underline active:opacity-70 flex-shrink-0 disabled:opacity-40"
                >{{ editLoading ? '...' : 'แก้ไข' }}</button>
              </div>
              <ul class="mt-2.5 space-y-1.5">
                <li
                  v-for="c in commentsByStep[1]"
                  :key="c.review_field_id"
                  class="text-[13px] text-red-800 bg-white border border-red-200 rounded-lg px-2.5 py-1.5 leading-snug"
                >
                  <span class="font-semibold">{{ c.label }}:</span> {{ c.reason }}
                </li>
              </ul>
            </div>

            <!-- Step 2: เศรษฐกิจ — แสดงเฉพาะเมื่อมี comment -->
            <div
              v-if="commentsByStep[2].length"
              class="border border-red-300 bg-red-50/40 rounded-xl px-3 py-3"
            >
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <svg class="w-5 h-5 text-[#1A56DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 10h18M3 6h18M3 14h18M3 18h18"/>
                  </svg>
                </div>
                <p class="flex-1 min-w-0 text-[15px] font-semibold text-slate-800">เศรษฐกิจ + สวัสดิการ</p>
                <button
                  type="button"
                  :disabled="editLoading"
                  @click="handleEdit()"
                  class="text-[14px] font-medium text-[#1A56DB] hover:underline active:opacity-70 flex-shrink-0 disabled:opacity-40"
                >{{ editLoading ? '...' : 'แก้ไข' }}</button>
              </div>
              <ul class="mt-2.5 space-y-1.5">
                <li
                  v-for="c in commentsByStep[2]"
                  :key="c.review_field_id"
                  class="text-[13px] text-red-800 bg-white border border-red-200 rounded-lg px-2.5 py-1.5 leading-snug"
                >
                  <span class="font-semibold">{{ c.label }}:</span> {{ c.reason }}
                </li>
              </ul>
            </div>

            <!-- Step 3: ปัญหา — แสดงเฉพาะเมื่อมี comment -->
            <div
              v-if="commentsByStep[3].length"
              class="border border-red-300 bg-red-50/40 rounded-xl px-3 py-3"
            >
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <svg class="w-5 h-5 text-[#1A56DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                </div>
                <p class="flex-1 min-w-0 text-[15px] font-semibold text-slate-800">ปัญหา + ความช่วยเหลือ</p>
                <button
                  type="button"
                  :disabled="editLoading"
                  @click="handleEdit()"
                  class="text-[14px] font-medium text-[#1A56DB] hover:underline active:opacity-70 flex-shrink-0 disabled:opacity-40"
                >{{ editLoading ? '...' : 'แก้ไข' }}</button>
              </div>
              <ul class="mt-2.5 space-y-1.5">
                <li
                  v-for="c in commentsByStep[3]"
                  :key="c.review_field_id"
                  class="text-[13px] text-red-800 bg-white border border-red-200 rounded-lg px-2.5 py-1.5 leading-snug"
                >
                  <span class="font-semibold">{{ c.label }}:</span> {{ c.reason }}
                </li>
              </ul>
            </div>

            <!-- Step 4: เอกสาร — แสดงเฉพาะเมื่อมี comment -->
            <div
              v-if="commentsByStep[4].length"
              class="border border-red-300 bg-red-50/40 rounded-xl px-3 py-3"
            >
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <svg class="w-5 h-5 text-[#1A56DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                  </svg>
                </div>
                <p class="flex-1 min-w-0 text-[15px] font-semibold text-slate-800">เอกสารและรูปประกอบ</p>
                <button
                  type="button"
                  :disabled="editLoading"
                  @click="handleEdit()"
                  class="text-[14px] font-medium text-[#1A56DB] hover:underline active:opacity-70 flex-shrink-0 disabled:opacity-40"
                >{{ editLoading ? '...' : 'แก้ไข' }}</button>
              </div>
              <ul class="mt-2.5 space-y-1.5">
                <li
                  v-for="c in commentsByStep[4]"
                  :key="c.review_field_id"
                  class="text-[13px] text-red-800 bg-white border border-red-200 rounded-lg px-2.5 py-1.5 leading-snug"
                >
                  <span class="font-semibold">{{ c.label }}:</span> {{ c.reason }}
                </li>
              </ul>
            </div>

            <!-- หมายเหตุเพิ่มเติมจากเจ้าหน้าที่ -->
            <div
              v-if="remarksComment"
              class="flex items-start gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5"
            >
              <svg class="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"/>
              </svg>
              <div>
                <p class="text-[13px] font-semibold text-slate-600">หมายเหตุเพิ่มเติมจากเจ้าหน้าที่</p>
                <p class="text-[13px] text-slate-700 mt-0.5 whitespace-pre-wrap">{{ remarksComment.reason }}</p>
              </div>
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
            <span class="text-[15px] font-semibold text-slate-800">
              ประวัติการเปลี่ยนสถานะ
              <span class="text-[13px] text-slate-400 font-normal ml-1">
                ({{ filteredStatusLogs.length || 1 }})
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

              <!-- แสดงจาก status logs จริง (filtered เหลือแค่ 4 ขั้น timeline) -->
              <template v-if="filteredStatusLogs.length > 0">
                <div
                  v-for="(log, index) in filteredStatusLogs"
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
                      v-if="index < filteredStatusLogs.length - 1"
                      class="w-0.5 flex-1 mt-1.5 rounded-full"
                      :style="{ backgroundColor: log.current_status.color + '55' }"
                    ></span>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-[13px] text-slate-400 mb-1.5">
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
                    <p class="text-[13px] text-slate-400 mb-1.5">{{ submittedDate }}</p>
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

<style scoped>
/* Card border pulse — ดึงดูดสายตาให้รู้ว่าต้องดำเนินการ */
@keyframes warn-border-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.45); }
  50%       { box-shadow: 0 0 0 7px rgba(239, 68, 68, 0); }
}
.warn-card {
  animation: warn-border-pulse 2.2s ease-in-out infinite;
}

/* Icon shake — ไอคอนดินสอเขย่าสม่ำเสมอทุก 3 วินาที */
@keyframes warn-shake {
  0%, 70%, 100% { transform: rotate(0deg); }
  75%  { transform: rotate(-14deg); }
  82%  { transform: rotate(14deg); }
  88%  { transform: rotate(-7deg); }
  94%  { transform: rotate(7deg); }
}
.warn-icon-shake {
  animation: warn-shake 3s ease-in-out infinite;
  transform-origin: center;
}

/* Ping ring รอบไอคอน warning triangle */
@keyframes warn-ping {
  0%   { transform: scale(1); opacity: 0.45; }
  100% { transform: scale(2.4); opacity: 0; }
}
.warn-pulse-ring {
  animation: warn-ping 1.6s cubic-bezier(0, 0, 0.2, 1) infinite;
}
</style>
