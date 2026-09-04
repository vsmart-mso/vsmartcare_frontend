/**
 * สคริปต์ของ frame.html — หน้าที่ถูกฝังเป็น iframe จากแอปหลัก
 *
 * ที่เดียวในโปรเจกต์ที่แตะ window.AinuEkyc
 * คุยกับแอปหลักด้วย postMessage ตาม contract ใน messages.ts — ดู LivenessRunner.vue
 *
 * ⚠️ ห้าม import อะไรที่ลาก style.css / Tailwind เข้ามาในไฟล์นี้ (เหตุผลใน README.md)
 * ⚠️ ไฟล์นี้มี side effect ทันทีที่ถูก import (เรียก setup()) — ห้าม export จาก index.ts
 */
// frame.css โหลดด้วย <link> ใน frame.html โดยตั้งใจ — ห้าม import ที่นี่
// เพราะ Vite จะฉีด CSS ผ่าน JS ทำให้จอรอกระพริบตอนยังไม่มีสไตล์ (ดูคอมเมนต์ใน frame.html)
import type { AinuEkycConfigs } from './ainu-ekyc'
import {
  FRAME_ELEMENT_IDS,
  LIVENESS_FRAME_SOURCE,
  type LivenessFrameMessage,
} from './messages'
import { buildLivenessReport } from './report'

const startButton = document.getElementById(FRAME_ELEMENT_IDS.startButton) as HTMLButtonElement | null
const closeButton = document.getElementById(FRAME_ELEMENT_IDS.closeButton) as HTMLButtonElement | null
const errorBox = document.getElementById(FRAME_ELEMENT_IDS.errorBox)
const loading = document.getElementById(FRAME_ELEMENT_IDS.loading)
const loadingText = document.getElementById(FRAME_ELEMENT_IDS.loadingText)

/**
 * เปิด/ปิดจอรอ
 *
 * ไม่หน่วงเวลาโดยตั้งใจ — เคยลองหน่วง 300ms เพื่อกัน spinner แวบตอนโหลดเร็ว
 * แต่ระหว่างหน่วงผู้ใช้เห็นจอเปล่า ๆ ทันทีที่กด "ถัดไป" ซึ่งแย่กว่ามาก
 * จอรอต้องขึ้นเป็นสิ่งแรกเสมอ
 */
function setLoading(visible: boolean, text?: string) {
  if (loadingText && text) loadingText.textContent = text
  if (loading) loading.hidden = !visible
}

/** โชว์ปุ่มเริ่มแบบ manual — ใช้เมื่อ auto-start ไม่สำเร็จเท่านั้น */
function offerManualStart(text = 'เริ่ม') {
  if (!startButton) return
  startButton.hidden = false
  startButton.textContent = text
}

/** ส่งข้อความกลับไปหาแอปหลัก — จำกัด targetOrigin เป็น origin ตัวเองเสมอ */
function post(message: LivenessFrameMessage) {
  window.parent.postMessage(message, window.location.origin)
}

/** เก็บไว้ประกอบรายงาน — มาจาก onReady ซึ่งมาก่อนผลลัพธ์เสมอ */
let currentTransactionId = ''

/**
 * จอสรุปผลตอน dev — ขึ้นทับทันทีที่ SDK คืนผล ก่อนส่งต่อให้หน้าแม่
 * มีปุ่มก๊อปเพราะบนมือถือเปิด console ไม่ได้ และปุ่มไปต่อเพื่อคืน flow ปกติ
 */
function showResultPanel(result: unknown) {
  const report = buildLivenessReport({ transactionId: currentTransactionId, result })

  const panel = document.createElement('div')
  panel.id = 'frame-result'

  const pre = document.createElement('pre')
  pre.textContent = report

  const copyButton = document.createElement('button')
  copyButton.type = 'button'
  copyButton.textContent = 'ก๊อปรายงาน'
  copyButton.addEventListener('click', () => {
    navigator.clipboard.writeText(report).then(
      () => { copyButton.textContent = 'ก๊อปแล้ว' },
      (e: unknown) => {
        console.error('[liveness-frame] ก๊อปไม่สำเร็จ:', e)
        copyButton.textContent = 'ก๊อปไม่ได้ — เลือกข้อความเอา'
      },
    )
  })

  const continueButton = document.createElement('button')
  continueButton.type = 'button'
  continueButton.className = 'primary'
  continueButton.textContent = 'ไปต่อ'
  continueButton.addEventListener('click', () => {
    post({ source: LIVENESS_FRAME_SOURCE, type: 'result', payload: result })
  })

  const actions = document.createElement('div')
  actions.className = 'frame-result-actions'
  actions.append(copyButton, continueButton)

  panel.append(pre, actions)
  setLoading(false)
  document.body.appendChild(panel)
}

function showError(message: string) {
  if (errorBox) {
    errorBox.textContent = message
    errorBox.hidden = false
  }
  // เอา spinner ออก ไม่งั้นดูเหมือนยังโหลดอยู่ทั้งที่ตายแล้ว
  setLoading(false)
  console.error('[liveness-frame]', message)
  post({ source: LIVENESS_FRAME_SOURCE, type: 'error', message })
}

const sdkConfigs: AinuEkycConfigs = {
  containerId: FRAME_ELEMENT_IDS.container,
  credential: {
    accountId: import.meta.env.VITE_ACCOUNT_ID ?? '',
    accountSecret: import.meta.env.VITE_ACCOUNT_SECRET ?? '',
  },
  flowId: import.meta.env.VITE_FLOW_ID ?? '',
  language: import.meta.env.VITE_LANGUAGE || 'TH',
  delegate: {
    onLoaded: () => {
      // ต้องรอ onLoaded ก่อนเสมอ — เรียก start() ก่อนหน้านี้ SDK จะ throw
      // "The SDK is not yet ready for start." แล้วเงียบ ไล่สาเหตุยาก
      console.log('[liveness-frame] SDK พร้อมแล้ว — เริ่มอัตโนมัติ')
      post({ source: LIVENESS_FRAME_SOURCE, type: 'ready' })
      start()
    },
    onReady(transactionId) {
      // ถึงตรงนี้ UI ของ AINU ขึ้นแล้ว เอาจอรอออกได้
      setLoading(false)
      console.log('[liveness-frame] transactionId =', transactionId)
      currentTransactionId = transactionId
      // ส่งต่อให้หน้าแม่เก็บ — ใช้อ้างอิงตอนแจ้งปัญหากับ AINU
      post({ source: LIVENESS_FRAME_SOURCE, type: 'started', transactionId })
    },
    onEkycResult: (result) => {
      console.log('[liveness-frame] onEkycResult:', result)
      // ตอน dev หยุดโชว์ผลไว้ก่อน — พอส่งออกไปหน้าแม่จะ unmount iframe ทันที
      // ผลที่เพิ่งได้จะหายไปก่อนอ่านทัน โดยเฉพาะบนมือถือที่เปิด console ไม่ได้
      if (import.meta.env.DEV) showResultPanel(result)
      else post({ source: LIVENESS_FRAME_SOURCE, type: 'result', payload: result })
    },
  },
}

/**
 * เริ่ม flow — เรียกอัตโนมัติหลัง onLoaded ผู้ใช้กด "ถัดไป" มาแล้วจากหน้าคำร้อง
 * ไม่ควรต้องกดซ้ำอีกรอบ
 *
 * ถ้าพลาด (เช่น browser ต้องการ user gesture ในหน้านี้เองถึงจะเปิดกล้องได้)
 * ค่อยโชว์ปุ่มให้กดเองแทนที่จะค้างจอดำ
 *
 * จอรอระหว่างนี้บัง spinner "Verifying authentication" ของ AINU ที่เป็นอังกฤษและไม่มีแบรนด์
 * พอ onReady มา จอรอหายพอดีกับที่ Face Scan Guidelines ของ AINU ขึ้นมาแทน
 */
function start() {
  setLoading(true, 'กำลังเตรียมการยืนยันตัวตน...')
  if (startButton) startButton.hidden = true

  try {
    // referenceId ต้องไม่ซ้ำต่อการเริ่ม 1 ครั้งตามที่ AINU กำหนด
    void Promise.resolve(window.AinuEkyc.start(crypto.randomUUID())).catch((e: unknown) => {
      console.error('[liveness-frame] start ไม่สำเร็จ:', e)
      setLoading(true, 'กดปุ่ม "เริ่ม" เพื่อเปิดกล้อง')
      offerManualStart()
    })
  } catch (e) {
    console.error('[liveness-frame] start ไม่สำเร็จ:', e)
    setLoading(true, 'กดปุ่ม "เริ่ม" เพื่อเปิดกล้อง')
    offerManualStart()
  }
}

startButton?.addEventListener('click', start)

closeButton?.addEventListener('click', () => {
  try {
    window.AinuEkyc?.close()
  } catch (e) {
    console.error('[liveness-frame] close error:', e)
  }
  post({ source: LIVENESS_FRAME_SOURCE, type: 'closed' })
})

/**
 * เบราว์เซอร์ยอมให้ใช้กล้องเฉพาะ secure context (https หรือ localhost)
 * LAN IP แบบ http://192.168.x.x ใช้ไม่ได้ — navigator.mediaDevices จะเป็น undefined
 *
 * ต้องดักเองตรงนี้ เพราะถ้าปล่อยให้ SDK ไปเจอเอง มันคืนแค่ INIT_ERROR
 * ซึ่งอ่านไม่ออกว่าเกิดจากอะไร (เสียเวลาไล่หาสาเหตุไปแล้วหนึ่งรอบ)
 */
function cameraUnavailableReason(): string {
  if (!window.isSecureContext) {
    return `หน้านี้ไม่ใช่ secure context (${window.location.protocol}//${window.location.host}) `
      + 'เบราว์เซอร์จึงไม่ให้ใช้กล้อง — ต้องเปิดผ่าน https หรือ localhost เท่านั้น'
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return 'เบราว์เซอร์นี้ไม่รองรับการเรียกใช้กล้อง (navigator.mediaDevices ไม่มี)'
  }
  return ''
}

const cameraProblem = cameraUnavailableReason()

if (cameraProblem) {
  showError(cameraProblem)
} else if (!window.AinuEkyc) {
  showError('โหลด eKYC SDK ไม่สำเร็จ — ตรวจไฟล์ใน public/ และ <script src> ใน frame.html')
} else if (!sdkConfigs.credential.accountId || !sdkConfigs.credential.accountSecret || !sdkConfigs.flowId) {
  showError('ยังไม่ได้ตั้ง VITE_ACCOUNT_ID / VITE_ACCOUNT_SECRET / VITE_FLOW_ID ใน .env (ตั้งแล้วต้อง restart dev server)')
} else {
  try {
    window.AinuEkyc.setup(sdkConfigs)
  } catch (e) {
    showError(e instanceof Error ? e.message : String(e))
  }
}
