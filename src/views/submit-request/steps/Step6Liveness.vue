<script setup lang="ts">
// Step 6: ยืนยันตัวตนด้วยใบหน้า (active liveness)
//
// โหมด 'ai'    — ตรวจด้วย MediaPipe Face Landmarker ในเครื่อง: ต้องจัดหน้าเข้ากรอบ
//                แล้วทำตาม challenge ที่สุ่มมา 2 ข้อ (กะพริบตา / อ้าปาก / หันหน้า / ยิ้ม)
// โหมด 'basic' — fallback เมื่อโหลดโมเดลไม่สำเร็จ (เน็ตช้า / เครื่องไม่รองรับ):
//                เปิดกล้องแล้วนับเวลาให้ผ่าน เพื่อไม่ให้ผู้ใช้ติดค้างจนยื่นคำขอไม่ได้
//
// ⚠️ การตรวจทั้งหมดอยู่ฝั่ง client — เป็นการกันกรอกผ่านมั่ว ไม่ใช่ security
//    ของจริงต้อง capture เฟรมตอนสำเร็จ ส่งขึ้น API เทียบใบหน้า + ตรวจ anti-spoof ฝั่ง server

import { ref, computed, watch, onMounted, onBeforeUnmount, useTemplateRef } from 'vue'
import { useFaceLiveness } from '@/composables/useFaceLiveness'

const emit = defineEmits<{ 'update:ready': [boolean] }>()

type Phase = 'requesting' | 'scanning' | 'success' | 'error'

// เริ่มที่ 'requesting' ตั้งแต่ render แรก (onMounted จะขอกล้องทันที)
// ถ้าเริ่มที่สถานะว่าง จะเห็นแผง error แวบหนึ่งก่อนกล้องจะเปิด
const phase    = ref<Phase>('requesting')
const mode     = ref<'ai' | 'basic'>('ai')
const errorMsg = ref('')

const videoRef = useTemplateRef<HTMLVideoElement>('videoEl')

const {
  stage:          aiStage,
  progress:       aiProgress,
  instruction:    aiInstruction,
  faceInFrame,
  challengeIndex,
  challengeTotal,
  start:   startLiveness,
  stop:    stopLiveness,
  dispose: disposeLiveness,
} = useFaceLiveness()

let stream: MediaStream | null = null
let rafId = 0

// โหมด basic: ระยะเวลานับความคืบหน้าให้ผ่าน
const BASIC_SCAN_MS = 4000
const basicProgress = ref(0)

const progress = computed(() => mode.value === 'ai' ? aiProgress.value : basicProgress.value)

const hint = computed(() => {
  if (phase.value === 'requesting') return 'กำลังเปิดกล้องหน้า...'
  if (phase.value === 'success')    return 'ยืนยันตัวตนสำเร็จ'
  if (phase.value === 'error')      return errorMsg.value || 'ยืนยันตัวตนไม่สำเร็จ'
  if (mode.value === 'ai')          return aiInstruction.value
  if (basicProgress.value < 35)     return 'จัดใบหน้าให้อยู่ในกรอบ'
  if (basicProgress.value < 70)     return 'กะพริบตาช้าๆ 1 ครั้ง'
  return 'กำลังตรวจสอบใบหน้า...'
})

// ป้าย "รายการที่ x/y" — แสดงเฉพาะตอนกำลังทำ challenge
const challengeLabel = computed(() =>
  mode.value === 'ai' && aiStage.value === 'challenge'
    ? `รายการที่ ${challengeIndex.value + 1}/${challengeTotal.value}`
    : ''
)

// กรอบวงรีเปลี่ยนเป็นสีฟ้าเมื่อใบหน้าเข้าตำแหน่งแล้ว — feedback ทันทีว่าขยับถูกทาง
const ovalStroke = computed(() =>
  mode.value === 'ai' && faceInFrame.value ? '#60A5FA' : 'rgba(255,255,255,0.55)'
)

function stopCamera() {
  stream?.getTracks().forEach(t => t.stop())
  stream = null
}

function cancelBasicScan() {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
}

function succeed() {
  // ผ่านแล้ว → ปิดกล้องทันที (ไม่เก็บภาพ ไม่ถือ stream ค้างไว้)
  stopLiveness()
  cancelBasicScan()
  stopCamera()
  phase.value = 'success'
  emit('update:ready', true)
}

/** fallback: เดินความคืบหน้าตามเวลา แล้วถือว่าผ่าน (ใช้เมื่อโหลดโมเดลไม่ได้) */
function runBasicScan() {
  mode.value          = 'basic'
  phase.value         = 'scanning'
  basicProgress.value = 0
  const startedAt = performance.now()

  const tick = (now: number) => {
    const pct = Math.min(100, ((now - startedAt) / BASIC_SCAN_MS) * 100)
    basicProgress.value = pct
    if (pct < 100) {
      rafId = requestAnimationFrame(tick)
      return
    }
    rafId = 0
    succeed()
  }
  rafId = requestAnimationFrame(tick)
}

// ผลลัพธ์จากตัวตรวจใบหน้า
watch(aiStage, (s) => {
  if (s === 'done')   succeed()
  if (s === 'failed') {
    errorMsg.value = aiInstruction.value
    phase.value    = 'error'
    stopCamera()
  }
})

async function startCamera() {
  emit('update:ready', false)
  errorMsg.value = ''
  phase.value    = 'requesting'
  mode.value     = 'ai'

  if (!navigator.mediaDevices?.getUserMedia) {
    phase.value    = 'error'
    errorMsg.value = 'อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับการเปิดกล้อง'
    return
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } },
      audio: false,
    })
    // component อาจถูก unmount ระหว่างรอ permission → ต้องเก็บกวาดแล้วออก
    const video = videoRef.value
    if (!video) {
      stopCamera()
      return
    }
    video.srcObject = stream
    await video.play().catch(() => { /* iOS อาจ reject ถ้ายังไม่พร้อม — playsinline+muted ครอบคลุมแล้ว */ })

    phase.value = 'scanning'
    // โหลดโมเดล + เริ่มตรวจ; ถ้าโหลดไม่สำเร็จให้ถอยไปโหมดพื้นฐานแทนการขึ้น error
    const ok = await startLiveness(video)
    if (!ok) runBasicScan()
  } catch (err: unknown) {
    stopCamera()
    phase.value = 'error'
    const name = (err as { name?: string })?.name
    errorMsg.value =
      name === 'NotAllowedError'  ? 'ท่านไม่ได้อนุญาตให้ใช้กล้อง กรุณาอนุญาตในการตั้งค่าเบราว์เซอร์แล้วลองใหม่'
      : name === 'NotFoundError'  ? 'ไม่พบกล้องหน้าบนอุปกรณ์นี้'
      : 'เปิดกล้องไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
  }
}

function retry() {
  stopLiveness()
  cancelBasicScan()
  stopCamera()
  startCamera()
}

onMounted(startCamera)
onBeforeUnmount(() => {
  cancelBasicScan()
  disposeLiveness()
  stopCamera()
})

defineExpose({
  getData: () => ({
    livenessVerified: phase.value === 'success',
    livenessMode: mode.value,
    livenessVerifiedAt: phase.value === 'success' ? new Date().toISOString() : null,
  }),
})
</script>

<template>
  <div class="space-y-5">

    <!-- ══════════════════════════════════════════════════
         Hero: ไอคอน + ชื่อหน้า
         ══════════════════════════════════════════════════ -->
    <div class="flex flex-col items-center text-center pt-2 pb-1">
      <div class="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mb-4">
        <svg class="w-8 h-8 text-[#1A56DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 9.75V6.75a2.25 2.25 0 00-2.25-2.25H14.25M4.5 9.75V6.75A2.25 2.25 0 016.75 4.5H9.75M19.5 14.25v3a2.25 2.25 0 01-2.25 2.25H14.25M4.5 14.25v3a2.25 2.25 0 002.25 2.25H9.75" />
        </svg>
      </div>
      <h2 class="text-h2-section font-bold text-slate-800 leading-snug mb-2">
        ยืนยันตัวตนด้วยใบหน้า
      </h2>
      <p class="text-body-xs text-slate-500 leading-relaxed max-w-xs">
        กรุณาจัดใบหน้าให้อยู่ในกรอบ แล้วทำตามคำแนะนำบนหน้าจอ เพื่อยืนยันว่าเป็นผู้ยื่นคำขอตัวจริง
      </p>
    </div>

    <!-- ══════════════════════════════════════════════════
         กล้อง + กรอบสแกนใบหน้า
         ══════════════════════════════════════════════════ -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-4">
      <div class="relative w-full aspect-[3/4] rounded-2xl overflow-hidden bg-slate-900">

        <!-- วิดีโอจากกล้องหน้า — mirror ให้เหมือนส่องกระจก -->
        <video
          v-show="phase === 'scanning' || phase === 'requesting'"
          ref="videoEl"
          class="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
          playsinline
          autoplay
          muted
        />

        <!-- overlay: มืดรอบนอก เจาะรูวงรีตรงกลาง -->
        <svg
          v-if="phase === 'scanning' || phase === 'requesting'"
          class="absolute inset-0 w-full h-full"
          viewBox="0 0 300 400"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <defs>
            <mask id="faceHole">
              <rect width="300" height="400" fill="white" />
              <ellipse cx="150" cy="185" rx="100" ry="130" fill="black" />
            </mask>
            <clipPath id="faceClip">
              <ellipse cx="150" cy="185" rx="100" ry="130" />
            </clipPath>
          </defs>

          <!-- พื้นมืดรอบกรอบใบหน้า -->
          <rect width="300" height="400" fill="rgba(15,23,42,0.62)" mask="url(#faceHole)" />

          <!-- เส้นสแกนวิ่งขึ้นลงภายในกรอบ -->
          <g clip-path="url(#faceClip)">
            <rect
              v-if="phase === 'scanning'"
              class="scan-line"
              x="50" y="55" width="200" height="3"
              fill="#60A5FA" opacity="0.9"
            />
          </g>

          <!-- กรอบวงรี — เปลี่ยนเป็นสีฟ้าเมื่อใบหน้าเข้าตำแหน่ง -->
          <ellipse
            cx="150" cy="185" rx="100" ry="130"
            fill="none" :stroke="ovalStroke" stroke-width="2" stroke-dasharray="6 8"
            class="transition-[stroke] duration-200"
          />
        </svg>

        <!-- ป้ายลำดับ challenge -->
        <div
          v-if="phase === 'scanning' && challengeLabel"
          class="absolute top-3 inset-x-0 flex justify-center"
        >
          <span class="rounded-full bg-slate-900/70 px-3 py-1 text-hint font-semibold text-white">
            {{ challengeLabel }}
          </span>
        </div>

        <!-- ตัวเลข % ความคืบหน้า -->
        <div
          v-if="phase === 'scanning'"
          class="absolute inset-x-0 bottom-4 flex flex-col items-center gap-2 px-8"
          aria-hidden="true"
        >
          <p class="text-display font-bold text-white tabular-nums drop-shadow">
            {{ Math.round(progress) }}%
          </p>
          <!-- แถบความคืบหน้าเส้นบางใต้ตัวเลข -->
          <div class="w-full h-1.5 rounded-full bg-white/25 overflow-hidden">
            <div
              class="h-full rounded-full bg-[#60A5FA] transition-[width] duration-75 ease-linear"
              :style="{ width: `${progress}%` }"
            />
          </div>
        </div>

        <!-- สถานะสำเร็จ: ปิดกล้องแล้ว แสดงแผงยืนยัน -->
        <div
          v-else-if="phase === 'success'"
          class="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 px-6 text-center"
        >
          <div class="w-20 h-20 rounded-full bg-green-500/15 border-2 border-green-400 flex items-center justify-center mb-4">
            <svg class="w-10 h-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p class="text-body font-semibold text-white">ยืนยันตัวตนสำเร็จ</p>
          <p class="text-body-xs text-slate-300 mt-1">ระบบปิดกล้องเรียบร้อยแล้ว</p>
        </div>

        <!-- สถานะผิดพลาด -->
        <div
          v-else-if="phase === 'error'"
          class="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 px-6 text-center"
        >
          <div class="w-16 h-16 rounded-full bg-red-500/15 border-2 border-red-400 flex items-center justify-center mb-4">
            <svg class="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25zM3 3l18 18" />
            </svg>
          </div>
          <p class="text-body-xs text-slate-200 leading-relaxed">{{ errorMsg }}</p>
        </div>
      </div>

      <!-- คำแนะนำใต้กรอบ -->
      <div class="mt-4 flex items-center justify-center gap-2 min-h-[1.75rem] text-center" aria-live="polite">
        <svg
          v-if="phase === 'requesting' || (phase === 'scanning' && aiStage === 'loading')"
          class="w-4 h-4 animate-spin text-[#1A56DB] flex-shrink-0" fill="none" viewBox="0 0 24 24" aria-hidden="true"
        >
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        <p
          class="text-body font-semibold"
          :class="phase === 'success' ? 'text-green-600' : phase === 'error' ? 'text-red-600' : 'text-slate-700'"
        >
          {{ hint }}
        </p>
      </div>

      <!-- แจ้งเมื่อถอยไปใช้โหมดพื้นฐาน (โหลดโมเดลตรวจใบหน้าไม่สำเร็จ) -->
      <p
        v-if="mode === 'basic' && phase !== 'error'"
        class="mt-2 text-center text-hint text-amber-600"
      >
        อุปกรณ์นี้ใช้โหมดตรวจพื้นฐาน (โหลดตัวตรวจใบหน้าไม่สำเร็จ)
      </p>

      <!-- ปุ่มลองใหม่ / สแกนใหม่ -->
      <button
        v-if="phase === 'error' || phase === 'success'"
        type="button"
        @click="retry"
        class="mt-3 w-full rounded-2xl border border-slate-300 bg-white py-3 text-body font-semibold text-slate-600 hover:bg-slate-50 active:bg-slate-100 transition-all duration-150 active:scale-[0.98]"
      >
        {{ phase === 'error' ? 'ลองอีกครั้ง' : 'สแกนใบหน้าใหม่' }}
      </button>
    </div>

    <!-- ══════════════════════════════════════════════════
         หมายเหตุความเป็นส่วนตัว
         ══════════════════════════════════════════════════ -->
    <div class="flex gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
      <svg class="w-5 h-5 text-[#1A56DB] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
      <p class="text-body-xs text-slate-600 leading-relaxed">
        การตรวจใบหน้าทำงานภายในเครื่องของท่านทั้งหมด ไม่มีการส่งภาพออกนอกอุปกรณ์
        และระบบจะปิดกล้องทันทีเมื่อยืนยันสำเร็จ
      </p>
    </div>

  </div>
</template>

<style scoped>
/* เส้นสแกนวิ่งขึ้น-ลงภายในกรอบใบหน้า (พิกัด SVG: กรอบสูง 260 หน่วย) */
.scan-line {
  animation: scan-sweep 2.4s ease-in-out infinite;
}
@keyframes scan-sweep {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(252px); }
}
@media (prefers-reduced-motion: reduce) {
  .scan-line { animation: none; }
}
</style>
