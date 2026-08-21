// useFaceLiveness — ตรวจ liveness ด้วย MediaPipe Face Landmarker (ทำงานในเครื่องทั้งหมด)
//
// หลักการ (active liveness / challenge-response แบบเดียวกับระบบจริง):
//   1. gate "จัดหน้าเข้ากรอบ" — ใบหน้าต้องอยู่ในวงรี ขนาดพอดี และนิ่งครบ HOLD_MS
//   2. สุ่ม challenge 2 ข้อจากชุด (กะพริบตา / อ้าปาก / หันหน้า / ยิ้ม) ให้ทำตามทีละข้อ
//   3. ผ่านครบ = liveness สำเร็จ
//
// ⚠️ ข้อจำกัด: นี่คือการตรวจฝั่ง client ล้วน กัน "กดผ่านมั่ว" และรูปถ่ายนิ่งได้
//    แต่ไม่ใช่ security — กัน deepfake / วิดีโอ replay ไม่ได้ ต้องมี PAD ฝั่ง server
//    เมื่อจะต่อของจริง: capture เฟรมตอน stage 'done' แล้วส่งขึ้น API ตรวจซ้ำ

import { ref, shallowRef } from 'vue'
import {
  FilesetResolver,
  FaceLandmarker,
  type FaceLandmarkerResult,
} from '@mediapipe/tasks-vision'

const BASE = import.meta.env.BASE_URL

// ─── พารามิเตอร์การตรวจ (ปรับจูนได้) ────────────────────────────────────────
const HOLD_MS            = 700    // ต้องอยู่ในกรอบนิ่งๆ นานเท่านี้ก่อนเริ่ม challenge
const CHALLENGE_TIMEOUT  = 15000  // เวลาต่อ 1 challenge — เกินนี้ถือว่าไม่ผ่าน
const CHALLENGE_COUNT    = 2      // จำนวน challenge ที่สุ่มมาใช้ต่อ 1 ครั้ง

// กรอบวงรีบนหน้าจอ (พิกัด normalize 0–1 เทียบกล่องวิดีโอ) — ต้องตรงกับ SVG ใน Step6Liveness
const OVAL = { cx: 0.5, cy: 0.4625, rx: 1 / 3, ry: 0.325 }
const FACE_MIN_H = 0.28   // ใบหน้าเล็กกว่านี้ = อยู่ไกลเกินไป
const FACE_MAX_H = 0.92   // ใหญ่กว่านี้ = ใกล้เกินไป

// threshold ของ blendshape / ท่าทาง
const EYE_CLOSED = 0.45
const EYE_OPEN   = 0.22
const JAW_OPEN   = 0.40
const SMILE      = 0.45
const YAW_TURNED = 0.13   // สัดส่วนที่ปลายจมูกเบนจากกึ่งกลางใบหน้า

export type LivenessStage = 'loading' | 'align' | 'challenge' | 'done' | 'failed'

/** สาเหตุที่ทำให้ยังผ่าน gate "จัดหน้าเข้ากรอบ" ไม่ได้ — ใช้เลือกข้อความบอกผู้ใช้ */
type AlignIssue = 'none' | 'no-face' | 'too-far' | 'too-close' | 'off-center'

interface FaceSignals {
  blink: number      // 0–1 ค่าเฉลี่ยการหลับตาสองข้าง
  jawOpen: number
  smile: number
  yaw: number        // -0.3…0.3 ปลายจมูกเบนซ้าย/ขวาเทียบกึ่งกลางใบหน้า
}

interface Challenge {
  id: string
  instruction: string
  /** คืน true เมื่อทำท่านี้สำเร็จ — ถูกเรียกทุกเฟรม จึงเก็บ state ภายใน closure ได้ */
  update: (s: FaceSignals) => boolean
}

// ─── ชุด challenge ───────────────────────────────────────────────────────────
// หมายเหตุ: ไม่ใช้คำสั่ง "หันซ้าย" / "หันขวา" เจาะจงข้าง เพราะภาพจากกล้องหน้า
// ถูก mirror บนจอ — ผู้ใช้จะสับสนทิศ จึงยอมรับการหันไปด้านใดด้านหนึ่งก็ได้
const CHALLENGE_POOL: (() => Challenge)[] = [
  () => {
    // กะพริบตา 2 ครั้ง — นับเฉพาะจังหวะ "หลับแล้วลืม" กัน false positive จากตาหรี่
    let closed = false
    let count  = 0
    return {
      id: 'blink',
      instruction: 'กะพริบตาช้าๆ 2 ครั้ง',
      update: (s) => {
        if (!closed && s.blink > EYE_CLOSED) closed = true
        else if (closed && s.blink < EYE_OPEN) { closed = false; count++ }
        return count >= 2
      },
    }
  },
  () => {
    let opened = false
    return {
      id: 'jaw',
      instruction: 'อ้าปากค้างไว้ 1 วินาที',
      update: (s) => {
        if (s.jawOpen > JAW_OPEN) opened = true
        // ต้องอ้าแล้วหุบ — กันภาพนิ่งที่อ้าปากอยู่แล้ว
        return opened && s.jawOpen < JAW_OPEN * 0.5
      },
    }
  },
  () => {
    let turned = false
    return {
      id: 'turn',
      instruction: 'หันหน้าไปด้านข้างช้าๆ แล้วหันกลับ',
      update: (s) => {
        if (Math.abs(s.yaw) > YAW_TURNED) turned = true
        return turned && Math.abs(s.yaw) < YAW_TURNED * 0.45
      },
    }
  },
  () => {
    let smiled = false
    return {
      id: 'smile',
      instruction: 'ยิ้มให้กล้อง',
      update: (s) => {
        if (s.smile > SMILE) smiled = true
        return smiled
      },
    }
  },
]

function pickChallenges(): Challenge[] {
  const pool = [...CHALLENGE_POOL]
  const out: Challenge[] = []
  while (out.length < CHALLENGE_COUNT && pool.length > 0) {
    const [factory] = pool.splice(Math.floor(Math.random() * pool.length), 1)
    out.push(factory())
  }
  return out
}

// ─── helper ──────────────────────────────────────────────────────────────────

function blendshape(result: FaceLandmarkerResult, name: string): number {
  const cats = result.faceBlendshapes?.[0]?.categories
  return cats?.find(c => c.categoryName === name)?.score ?? 0
}

/**
 * แปลงพิกัด landmark (อิงเฟรมวิดีโอ) → พิกัดในกล่องบนหน้าจอ
 * วิดีโอแสดงแบบ object-cover จึงอาจถูก crop ด้านกว้างหรือด้านสูง ต้องชดเชยก่อน
 * ไม่งั้นตอนกล้องเป็น 4:3 (เดสก์ท็อป) การเช็ค "หน้าอยู่ในวงรี" จะเพี้ยน
 */
function coverMapper(videoAspect: number, boxAspect: number) {
  if (!Number.isFinite(videoAspect) || videoAspect <= 0) return (x: number, y: number) => ({ x, y })
  if (videoAspect > boxAspect) {
    const visible = boxAspect / videoAspect          // สัดส่วนความกว้างที่ยังเห็น
    const offset  = (1 - visible) / 2
    return (x: number, y: number) => ({ x: (x - offset) / visible, y })
  }
  const visible = videoAspect / boxAspect            // สัดส่วนความสูงที่ยังเห็น
  const offset  = (1 - visible) / 2
  return (x: number, y: number) => ({ x, y: (y - offset) / visible })
}

// ─── composable ──────────────────────────────────────────────────────────────

export function useFaceLiveness() {
  const stage       = ref<LivenessStage>('loading')
  const progress    = ref(0)          // 0–100 สำหรับแสดงผล
  const instruction = ref('กำลังเตรียมระบบตรวจใบหน้า...')
  const faceInFrame = ref(false)
  const challengeIndex = ref(0)
  const challengeTotal = ref(CHALLENGE_COUNT)
  const error       = ref('')

  const landmarker = shallowRef<FaceLandmarker | null>(null)
  let rafId = 0
  let lastVideoTime = -1
  let challenges: Challenge[] = []
  let alignedSince = 0
  let challengeStartedAt = 0
  let running = false

  /** โหลดโมเดล — ลอง GPU ก่อน ถ้าไม่ได้ค่อยถอยไป CPU (เครื่องเก่า / ไม่มี WebGL) */
  async function load(): Promise<boolean> {
    if (landmarker.value) return true
    try {
      const fileset = await FilesetResolver.forVisionTasks(`${BASE}mediapipe/wasm`)
      const options = {
        baseOptions: { modelAssetPath: `${BASE}mediapipe/models/face_landmarker.task` },
        runningMode: 'VIDEO' as const,
        numFaces: 1,
        outputFaceBlendshapes: true,
      }
      try {
        landmarker.value = await FaceLandmarker.createFromOptions(fileset, {
          ...options,
          baseOptions: { ...options.baseOptions, delegate: 'GPU' },
        })
      } catch {
        landmarker.value = await FaceLandmarker.createFromOptions(fileset, {
          ...options,
          baseOptions: { ...options.baseOptions, delegate: 'CPU' },
        })
      }
      return true
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : 'โหลดโมเดลตรวจใบหน้าไม่สำเร็จ'
      return false
    }
  }

  function fail(message: string) {
    running = false
    if (rafId) cancelAnimationFrame(rafId)
    rafId = 0
    stage.value       = 'failed'
    instruction.value = message
  }

  function evaluate(video: HTMLVideoElement, now: number) {
    const lm = landmarker.value
    if (!lm) return

    // detectForVideo ต้องได้ timestamp ที่เพิ่มขึ้นเสมอ และไม่ควรรันซ้ำเฟรมเดิม
    if (video.currentTime === lastVideoTime) return
    lastVideoTime = video.currentTime

    let result: FaceLandmarkerResult
    try {
      result = lm.detectForVideo(video, now)
    } catch {
      return // เฟรมเสีย/ขนาดยังเป็น 0 — ข้ามไปเฟรมถัดไป
    }

    const points = result.faceLandmarks?.[0]
    if (!points || points.length === 0) {
      faceInFrame.value = false
      alignedSince = 0
      if (stage.value === 'align') instruction.value = 'ไม่พบใบหน้า — จัดใบหน้าให้อยู่ในกรอบ'
      return
    }

    // ── กล่องใบหน้า + ตำแหน่งเทียบวงรีบนจอ ────────────────────────────────
    const map = coverMapper(video.videoWidth / video.videoHeight, 3 / 4)
    let minX = 1, maxX = 0, minY = 1, maxY = 0
    for (const p of points) {
      const { x, y } = map(p.x, p.y)
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    const faceH = maxY - minY
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const dx = (cx - OVAL.cx) / OVAL.rx
    const dy = (cy - OVAL.cy) / OVAL.ry

    let issue: AlignIssue = 'none'
    if (faceH < FACE_MIN_H)              issue = 'too-far'
    else if (faceH > FACE_MAX_H)         issue = 'too-close'
    else if (dx * dx + dy * dy > 0.55)   issue = 'off-center'
    faceInFrame.value = issue === 'none'

    // ── สัญญาณท่าทาง ───────────────────────────────────────────────────────
    const noseTip = map(points[1].x, points[1].y)
    const signals: FaceSignals = {
      blink:   (blendshape(result, 'eyeBlinkLeft') + blendshape(result, 'eyeBlinkRight')) / 2,
      jawOpen: blendshape(result, 'jawOpen'),
      smile:   (blendshape(result, 'mouthSmileLeft') + blendshape(result, 'mouthSmileRight')) / 2,
      yaw:     maxX > minX ? (noseTip.x - cx) / (maxX - minX) : 0,
    }

    // ── stage: จัดหน้าเข้ากรอบ ──────────────────────────────────────────────
    if (stage.value === 'align') {
      if (!faceInFrame.value) {
        alignedSince = 0
        instruction.value =
          issue === 'too-far'    ? 'ขยับเข้าใกล้กล้องอีกนิด'
          : issue === 'too-close' ? 'ถอยห่างจากกล้องเล็กน้อย'
          :                         'จัดใบหน้าให้อยู่กลางกรอบ'
        progress.value = 0
        return
      }
      if (!alignedSince) alignedSince = now
      const held = now - alignedSince
      instruction.value = 'อยู่นิ่งๆ สักครู่'
      progress.value    = Math.min(20, (held / HOLD_MS) * 20)
      if (held >= HOLD_MS) {
        stage.value        = 'challenge'
        challengeIndex.value = 0
        challengeStartedAt = now
        instruction.value  = challenges[0].instruction
      }
      return
    }

    // ── stage: ทำ challenge ทีละข้อ ────────────────────────────────────────
    if (stage.value !== 'challenge') return

    const current = challenges[challengeIndex.value]
    if (!current) return

    // หน้าหลุดกรอบระหว่างทำ → เตือน แต่ยังนับเวลาต่อ (ไม่รีเซ็ตความคืบหน้าของท่า)
    if (!faceInFrame.value) {
      instruction.value = 'จัดใบหน้าให้อยู่ในกรอบ แล้วทำต่อ'
    } else if (instruction.value !== current.instruction) {
      instruction.value = current.instruction
    }

    if (now - challengeStartedAt > CHALLENGE_TIMEOUT) {
      fail('หมดเวลาทำรายการ กรุณาลองใหม่อีกครั้ง')
      return
    }

    // ความคืบหน้า: 20% จาก gate + ส่วนที่เหลือแบ่งเท่ากันตามจำนวน challenge
    const span = 80 / challengeTotal.value
    const elapsedRatio = Math.min(1, (now - challengeStartedAt) / CHALLENGE_TIMEOUT)
    progress.value = 20 + challengeIndex.value * span + elapsedRatio * span * 0.35

    if (!faceInFrame.value || !current.update(signals)) return

    // ผ่านข้อนี้แล้ว
    challengeIndex.value++
    challengeStartedAt = now
    progress.value = 20 + challengeIndex.value * span
    if (challengeIndex.value >= challenges.length) {
      running = false
      if (rafId) cancelAnimationFrame(rafId)
      rafId = 0
      progress.value    = 100
      stage.value       = 'done'
      instruction.value = 'ยืนยันตัวตนสำเร็จ'
      return
    }
    instruction.value = challenges[challengeIndex.value].instruction
  }

  /** เริ่มตรวจ — ต้องเรียกหลัง video เล่นแล้ว คืน false ถ้าโหลดโมเดลไม่ได้ (ให้ caller ไปใช้ fallback) */
  async function start(video: HTMLVideoElement): Promise<boolean> {
    stop()
    stage.value       = 'loading'
    progress.value    = 0
    error.value       = ''
    instruction.value = 'กำลังเตรียมระบบตรวจใบหน้า...'

    if (!(await load())) return false

    challenges           = pickChallenges()
    challengeTotal.value = challenges.length
    challengeIndex.value = 0
    alignedSince         = 0
    lastVideoTime        = -1
    stage.value          = 'align'
    instruction.value    = 'จัดใบหน้าให้อยู่ในกรอบ'
    running              = true

    const loop = () => {
      if (!running) return
      evaluate(video, performance.now())
      if (running) rafId = requestAnimationFrame(loop)
    }
    rafId = requestAnimationFrame(loop)
    return true
  }

  function stop() {
    running = false
    if (rafId) cancelAnimationFrame(rafId)
    rafId = 0
  }

  /** ปิด landmarker คืนหน่วยความจำ WASM — เรียกตอน unmount */
  function dispose() {
    stop()
    landmarker.value?.close()
    landmarker.value = null
  }

  return { stage, progress, instruction, faceInFrame, challengeIndex, challengeTotal, error, start, stop, dispose }
}
