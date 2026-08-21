<script setup lang="ts">
// Step 6: ยืนยันตัวตนด้วยใบหน้า (Liveness)
//
// ⚠️ ตอนนี้เป็น "mock" — เปิดกล้องหน้าจริง แสดงกรอบสแกน แล้วนับความคืบหน้าด้วย timer
//    จนครบ ถือว่าผ่านทันที ยังไม่มีการส่งภาพหรือเรียก API ตรวจสอบใบหน้าใดๆ
//    เมื่อมี service จริงแล้ว ให้แทนที่เฉพาะ runMockScan() ด้วยการ capture เฟรม + เรียก API
//    ส่วน UI/state machine (idle → requesting → scanning → success | error) ใช้ต่อได้เลย

import { ref, computed, onMounted, onBeforeUnmount, useTemplateRef } from 'vue'

const emit = defineEmits<{ 'update:ready': [boolean] }>()

type Phase = 'requesting' | 'scanning' | 'success' | 'error'

// เริ่มที่ 'requesting' ตั้งแต่ render แรก (onMounted จะขอกล้องทันที)
// ถ้าเริ่มที่สถานะว่าง จะเห็นแผง error แวบหนึ่งก่อนกล้องจะเปิด
const phase    = ref<Phase>('requesting')
const progress = ref(0)      // 0–100 ความคืบหน้าการสแกน (mock)
const errorMsg = ref('')

const videoRef = useTemplateRef<HTMLVideoElement>('videoEl')
let stream: MediaStream | null = null
let rafId = 0

// ระยะเวลาสแกนจำลอง — ยาวพอให้ผู้ใช้จัดใบหน้าเข้ากรอบและอ่านคำแนะนำทัน
const SCAN_DURATION_MS = 4000

// คำแนะนำเปลี่ยนไปตามความคืบหน้า ทำให้รู้สึกเหมือนระบบกำลังตรวจจริง
const hint = computed(() => {
  if (phase.value === 'requesting') return 'กำลังเปิดกล้องหน้า...'
  if (phase.value === 'success')    return 'ยืนยันตัวตนสำเร็จ'
  if (phase.value === 'error')      return 'ไม่สามารถเปิดกล้องได้'
  if (progress.value < 35)  return 'จัดใบหน้าให้อยู่ในกรอบ'
  if (progress.value < 70)  return 'กะพริบตาช้าๆ 1 ครั้ง'
  return 'กำลังตรวจสอบใบหน้า...'
})

function stopCamera() {
  stream?.getTracks().forEach(t => t.stop())
  stream = null
}

function cancelScan() {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
}

/** mock: เดินความคืบหน้าจาก 0 → 100 ตามเวลา แล้วถือว่าผ่าน */
function runMockScan() {
  phase.value    = 'scanning'
  progress.value = 0
  const startedAt = performance.now()

  const tick = (now: number) => {
    const pct = Math.min(100, ((now - startedAt) / SCAN_DURATION_MS) * 100)
    progress.value = pct
    if (pct < 100) {
      rafId = requestAnimationFrame(tick)
      return
    }
    rafId = 0
    // ผ่านแล้ว → ปิดกล้องทันที (ไม่เก็บภาพ ไม่ถือ stream ค้างไว้)
    stopCamera()
    phase.value = 'success'
    emit('update:ready', true)
  }
  rafId = requestAnimationFrame(tick)
}

async function startCamera() {
  emit('update:ready', false)
  errorMsg.value = ''
  phase.value    = 'requesting'

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
    if (!videoRef.value) {
      stopCamera()
      return
    }
    videoRef.value.srcObject = stream
    await videoRef.value.play().catch(() => { /* iOS อาจ reject ถ้ายังไม่พร้อม — playsinline+muted ครอบคลุมแล้ว */ })
    runMockScan()
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
  cancelScan()
  stopCamera()
  startCamera()
}

onMounted(startCamera)
onBeforeUnmount(() => {
  cancelScan()
  stopCamera()
})

defineExpose({
  getData: () => ({
    livenessVerified: phase.value === 'success',
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
        กรุณาถ่ายใบหน้าของท่านเพื่อยืนยันว่าเป็นผู้ยื่นคำขอตัวจริง ก่อนส่งข้อมูลเข้าระบบ
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

        <!-- overlay: มืดรอบนอก เจาะรูวงรีตรงกลาง + วงแหวนความคืบหน้า -->
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

          <!-- กรอบวงรี (เส้นบาง) -->
          <ellipse
            cx="150" cy="185" rx="100" ry="130"
            fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="2" stroke-dasharray="6 8"
          />

          <!-- วงแหวนความคืบหน้าทับกรอบเดิม -->
          <ellipse
            cx="150" cy="185" rx="100" ry="130"
            fill="none" stroke="#22C55E" stroke-width="4" stroke-linecap="round"
            pathLength="100"
            :stroke-dasharray="`${progress} 100`"
            transform="rotate(-90 150 185)"
            class="transition-[stroke-dasharray] duration-75 ease-linear"
          />
        </svg>

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
          v-else
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
      <div class="mt-4 flex items-center justify-center gap-2 min-h-[1.75rem]" aria-live="polite">
        <svg
          v-if="phase === 'requesting' || phase === 'scanning'"
          class="w-4 h-4 animate-spin text-[#1A56DB]" fill="none" viewBox="0 0 24 24" aria-hidden="true"
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
        ภาพใบหน้าถูกใช้เพื่อยืนยันตัวตนขณะยื่นคำขอเท่านั้น ระบบจะปิดกล้องทันทีเมื่อยืนยันสำเร็จ
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
