/**
 * สคริปต์ของ liveness.html — หน้าที่ถูกฝังเป็น iframe จากแอปหลัก
 *
 * ทำไมต้องแยกหน้า: AINU SDK เรนเดอร์ UI ด้วยคลาส Tailwind ของตัวเอง พอเจอ
 * Tailwind v4 ของโปรเจกต์ layout จะพัง (spinner ตกจอ แล้วหน้าขาว) — bisect แล้ว
 * ยืนยันว่า sample + Tailwind = พัง, sample + brand.css = ผ่าน
 * การแยกเป็นเอกสารต่างหากทำให้ CSS ของแอปเข้าไม่ถึง SDK เลย
 *
 * คุยกับแอปหลักด้วย postMessage — ดู src/components/liveness/LivenessRunner.vue
 *
 * ⚠️ ห้าม import อะไรที่ลาก style.css / Tailwind เข้ามาในไฟล์นี้
 */
import type { AinuEkycConfigs } from '@/types/ainu-ekyc'

export type LivenessFrameMessage =
  | { source: 'liveness-frame'; type: 'ready' }
  | { source: 'liveness-frame'; type: 'result'; payload: unknown }
  | { source: 'liveness-frame'; type: 'closed' }
  | { source: 'liveness-frame'; type: 'error'; message: string }

const startButton = document.getElementById('liveness-start') as HTMLButtonElement | null
const closeButton = document.getElementById('liveness-close') as HTMLButtonElement | null
const errorBox = document.getElementById('frame-error')
const loading = document.getElementById('loading')
const loadingText = document.getElementById('loading-text')

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
  post({ source: 'liveness-frame', type: 'error', message })
}

const sdkConfigs: AinuEkycConfigs = {
  containerId: 'ekyc-container',
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
      post({ source: 'liveness-frame', type: 'ready' })
      start()
    },
    onReady(transactionId) {
      // ถึงตรงนี้ UI ของ AINU ขึ้นแล้ว เอาจอรอออกได้
      setLoading(false)
      console.log('[liveness-frame] transactionId =', transactionId)
    },
    onEkycResult: (result) => {
      console.log('[liveness-frame] onEkycResult:', result)
      post({ source: 'liveness-frame', type: 'result', payload: result })
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
  post({ source: 'liveness-frame', type: 'closed' })
})

if (!window.AinuEkyc) {
  showError('โหลด eKYC SDK ไม่สำเร็จ — ตรวจไฟล์ใน public/ และ <script src> ใน liveness.html')
} else if (!sdkConfigs.credential.accountId || !sdkConfigs.credential.accountSecret || !sdkConfigs.flowId) {
  showError('ยังไม่ได้ตั้ง VITE_ACCOUNT_ID / VITE_ACCOUNT_SECRET / VITE_FLOW_ID ใน .env (ตั้งแล้วต้อง restart dev server)')
} else {
  try {
    window.AinuEkyc.setup(sdkConfigs)
  } catch (e) {
    showError(e instanceof Error ? e.message : String(e))
  }
}
