/**
 * สคริปต์ของ frame.html — หน้าที่ถูกฝังเป็น iframe จากแอปหลัก
 *
 * ที่เดียวในโปรเจกต์ที่แตะ window.AinuEkyc
 * คุยกับแอปหลักด้วย postMessage ตาม contract ใน messages.ts — ดู LivenessRunner.vue
 *
 * ⚠️ ห้าม import อะไรที่ลาก style.css / Tailwind เข้ามาในไฟล์นี้ (เหตุผลใน README.md)
 * ⚠️ ไฟล์นี้มี side effect ทันทีที่ถูก import (เรียก setup()) — ห้าม export จาก index.ts
 */
import './frame.css'
import type { AinuEkycConfigs } from './ainu-ekyc'
import {
  FRAME_ELEMENT_IDS,
  LIVENESS_FRAME_SOURCE,
  type LivenessFrameMessage,
} from './messages'

const startButton = document.getElementById(FRAME_ELEMENT_IDS.startButton) as HTMLButtonElement | null
const closeButton = document.getElementById(FRAME_ELEMENT_IDS.closeButton) as HTMLButtonElement | null
const errorBox = document.getElementById(FRAME_ELEMENT_IDS.errorBox)
const loading = document.getElementById(FRAME_ELEMENT_IDS.loading)
const loadingText = document.getElementById(FRAME_ELEMENT_IDS.loadingText)

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
    },
    onEkycResult: (result) => {
      console.log('[liveness-frame] onEkycResult:', result)
      post({ source: LIVENESS_FRAME_SOURCE, type: 'result', payload: result })
    },
  },
}

/**
 * เริ่ม flow — เรียกอัตโนมัติหลัง onLoaded ผู้ใช้กด "ถัดไป" มาแล้วจากหน้าคำร้อง
 * ไม่ควรต้องกดซ้ำอีกรอบ
 *
 * ถ้าพลาด (เช่น browser ต้องการ user gesture ในหน้านี้เองถึงจะเปิดกล้องได้)
 * ค่อยโชว์ปุ่มให้กดเองแทนที่จะค้างจอดำ
 */
function start() {
  setLoading(true, 'กำลังเตรียมกล้อง...')
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

if (!window.AinuEkyc) {
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
