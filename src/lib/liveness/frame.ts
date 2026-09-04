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
  createLivenessReferenceId,
  FRAME_ELEMENT_IDS,
  LIVENESS_FRAME_SOURCE,
  LIVENESS_REF_PARAM,
  type LivenessFrameMessage,
} from './messages'

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

/**
 * referenceId ของรอบนี้ — หน้าแม่เป็นคนสร้างแล้วส่งมาทาง query
 * เพื่อให้ฝั่งนั้นถือค่าไว้ผูกกับเคสได้ (เฟรมถูก unmount ทิ้งทุกครั้งที่ปิด)
 *
 * ถ้าเปิด frame.html ตรง ๆ (เช่นตอนเทส) จะไม่มี query มา — สร้างเองเพื่อให้ start() ทำงานได้
 * แต่ค่านั้นจะไม่มีใครเก็บ ซึ่งยอมรับได้เพราะเป็นการเปิดนอก flow ปกติ
 */
const referenceId =
  new URLSearchParams(window.location.search).get(LIVENESS_REF_PARAM)?.trim()
  || createLivenessReferenceId()

/** ส่งผลออกไปหาหน้าแม่ — พอส่งแล้ว iframe จะถูก unmount ทิ้งทันที */
function sendResult(result: unknown) {
  post({ source: LIVENESS_FRAME_SOURCE, type: 'result', payload: result })
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
      // ส่งต่อให้หน้าแม่เก็บ — ใช้อ้างอิงตอนแจ้งปัญหากับ AINU
      // (เฟรมไม่ต้องถือเอง เพราะรายงานถูกประกอบที่หน้าแม่)
      post({ source: LIVENESS_FRAME_SOURCE, type: 'started', transactionId })
    },
    onEkycResult: (result) => {
      console.log('[liveness-frame] onEkycResult:', result)
      // ส่งออกทันที ไม่มีจอของเราคั่นเลย — ปล่อยให้เห็นจอสำเร็จของ AINU แล้วเด้งกลับฟอร์ม
      //
      // เคยลองมาแล้วสามแบบและถอยออกทั้งหมด: จอ log, ปุ่มค้าง, จอสำเร็จของเราเอง
      // ทุกแบบขึ้นหลังจาก AINU เก็บ UI ไปแล้ว จึงกลายเป็นจอเปล่าหรือจอซ้ำที่ต้องกดเพิ่ม
      // ถ้าจะทำจอคั่นจริง ๆ ต้องขอให้ AINU เปิดทางให้ข้ามจอสำเร็จของเขาก่อน
      sendResult(result)
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
    void Promise.resolve(window.AinuEkyc.start(referenceId)).catch((e: unknown) => {
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
