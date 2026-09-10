/**
 * สคริปต์ของ frame.html — หน้าที่ถูกฝังเป็น iframe จากแอปหลัก
 *
 * ที่เดียวในโปรเจกต์ที่แตะ window.AinuEkyc
 * คุยกับแอปหลักด้วย postMessage ตาม contract ใน messages.ts — ดู LivenessRunner.vue
 *
 * ⚠️ ห้าม import อะไรที่ลาก style.css / Tailwind เข้ามาในไฟล์นี้ (เหตุผลใน README.md)
 * ⚠️ ไฟล์นี้มี side effect ทันทีที่ถูก import — ห้าม export จาก index.ts
 *
 * ลำดับตอนนี้ต่างจากเดิม: credential ไม่ได้อยู่ใน .env แล้ว backend เป็นคนจ่าย
 * เฟรมจึงต้อง **ขอ config จากหน้าแม่ก่อน** แล้วค่อย setup()
 *   need-config → (หน้าแม่ตอบ config) → setup() → onLoaded → start(referenceId)
 * ผลคือเปิด frame.html ตรง ๆ นอกแอปไม่ได้อีกแล้ว (ไม่มีใครตอบ config ให้)
 */
// frame.css โหลดด้วย <link> ใน frame.html โดยตั้งใจ — ห้าม import ที่นี่
// เพราะ Vite จะฉีด CSS ผ่าน JS ทำให้จอรอกระพริบตอนยังไม่มีสไตล์ (ดูคอมเมนต์ใน frame.html)
import type { AinuEkycConfigs } from './ainu-ekyc'
import {
  FRAME_ELEMENT_IDS,
  LIVENESS_FRAME_SOURCE,
  LIVENESS_HOST_SOURCE,
  type LivenessFrameConfig,
  type LivenessFrameMessage,
  type LivenessFrameSkipCode,
  type LivenessHostMessage,
} from './messages'

const startButton = document.getElementById(FRAME_ELEMENT_IDS.startButton) as HTMLButtonElement | null
const closeButton = document.getElementById(FRAME_ELEMENT_IDS.closeButton) as HTMLButtonElement | null
const errorBox = document.getElementById(FRAME_ELEMENT_IDS.errorBox)
const loading = document.getElementById(FRAME_ELEMENT_IDS.loading)
const loadingStatus = document.getElementById(FRAME_ELEMENT_IDS.loadingStatus)
const loadingText = document.getElementById(FRAME_ELEMENT_IDS.loadingText)
const promptText = document.getElementById(FRAME_ELEMENT_IDS.promptText)

/**
 * เปิด/ปิดจอเริ่มต้นทั้งก้อน
 *
 * ไม่หน่วงเวลาโดยตั้งใจ — เคยลองหน่วง 300ms เพื่อกัน spinner แวบตอนโหลดเร็ว
 * แต่ระหว่างหน่วงผู้ใช้เห็นจอเปล่า ๆ ทันทีที่กด "ถัดไป" ซึ่งแย่กว่ามาก
 * จอนี้ต้องขึ้นเป็นสิ่งแรกเสมอ
 */
function setLoading(visible: boolean, text?: string) {
  if (loadingText && text) loadingText.textContent = text
  if (loading) loading.hidden = !visible
}

/** สลับจอเริ่มต้นระหว่าง "กำลังโหลด" (spinner) กับ "พร้อมแล้ว" (ปุ่มเริ่ม) */
function showStartButton(label = 'เริ่มสแกนใบหน้า') {
  if (loadingStatus) loadingStatus.hidden = true
  if (!startButton) return
  startButton.hidden = false
  startButton.textContent = label
}

function showSpinner(text: string) {
  if (loadingStatus) loadingStatus.hidden = false
  if (startButton) startButton.hidden = true
  if (loadingText) loadingText.textContent = text
}

/** ส่งข้อความกลับไปหาแอปหลัก — จำกัด targetOrigin เป็น origin ตัวเองเสมอ */
function post(message: LivenessFrameMessage) {
  window.parent.postMessage(message, window.location.origin)
}

/** ผลดิบจาก onEkycResult ส่งออกไปหาหน้าแม่ — พอส่งแล้ว iframe จะถูก unmount ทิ้งทันที */
function sendResult(result: unknown) {
  post({ source: LIVENESS_FRAME_SOURCE, type: 'result', payload: result })
}

function showError(message: string, code?: LivenessFrameSkipCode) {
  clearLoadedTimer()
  if (errorBox) {
    errorBox.textContent = message
    errorBox.hidden = false
  }
  // เอา spinner ออก ไม่งั้นดูเหมือนยังโหลดอยู่ทั้งที่ตายแล้ว
  setLoading(false)
  // ไม่ log ที่นี่ — ข้อความถูกส่งให้หน้าแม่ผ่าน post() แล้ว และผลลงไปถึง DB
  // (status / fail_reason / skip_reason / raw_payload) ซึ่งสืบย้อนหลังได้ดีกว่า console
  post({ source: LIVENESS_FRAME_SOURCE, type: 'error', message, code })
}

// ── ดักคำตอบผิดปกติจากฝั่ง AINU ────────────────────────────────────────────
// PROVIDER_UNAVAILABLE กับ AUTH_ERROR เป็น network call **ภายในของ SDK**
// ไม่มี callback ไหนบอกเรา วิธีเดียวที่เห็นได้คือดักที่ชั้น network ของหน้านี้
//
// ทำได้เพราะเฟรมนี้เป็นหน้าเปล่าของเราเอง — ไม่มี traffic อื่นปนนอกจากของ SDK
// (ห้ามย้ายไปทำที่แอปหลักเด็ดขาด จะไปดัก request ของทั้งระบบ)
//
// ต้องติดตั้ง **ก่อน** setup() เสมอ ไม่งั้น handshak
// .e รอบแรกหลุดไปแล้ว

/** ยิงได้ครั้งเดียว — request ที่พังมักพังซ้ำหลายรอบ ไม่ต้องรายงานทุกรอบ */
let providerErrorSent = false

/** รหัสล่าสุดที่ดักได้จากชั้น network — ใช้เป็นสาเหตุจริงแทน SDK_LOAD_ERROR ลอย ๆ */
let lastProviderCode: LivenessFrameSkipCode | undefined

function reportProviderError(code: LivenessFrameSkipCode) {
  lastProviderCode = code
  if (providerErrorSent) return
  providerErrorSent = true
  post({ source: LIVENESS_FRAME_SOURCE, type: 'provider-error', code })
}

/**
 * แปล (url, status) เป็น skip_reason ตามสเปก — คืน '' ถ้าเป็นคำตอบปกติ
 *
 * ⚠️ `POST /ekyc` ตอบ **403 คือปกติ** ห้ามรายงาน (สเปกย้ำไว้) มีแต่ 404 ที่แปลว่าใช้ไม่ได้
 * ส่วน 401/403 ที่นับเป็น AUTH_ERROR คือของ token handshake ซึ่งเป็นคนละ endpoint
 *
 * credential ผิดจริง handshake ตอบไม่เหมือนกันในแต่ละครั้งที่ทดสอบ —
 * เจอทั้ง **500** และ **401 `{code:'GAT-E007', message:'Unauthorized'}`** จึงดักทั้งสองแบบ
 *
 * สถานะการยืนยันกับ traffic จริง (DevTools › Network, 9 ก.ย.) — **ยืนยันครบทั้งสอง path แล้ว**
 * - `/ekyc` — URL จริง `https://uat.ainu.tech/ekyc` → pathname = `/ekyc` ตรงกับ regex
 *   และ 403 เกิดระหว่าง flow ปกติที่จบได้ จึงคอนเฟิร์มว่าห้ามถือ 403 เป็นความผิดปกติ
 * - token handshake **ยืนยันแล้ว** (9 ก.ย.) — URL จริงคือ
 *   `https://uat.nonprod-api.ainu.tech/v1/auth/websdk/token/handshake`
 *   path มีทั้ง `auth` และ `token` จึงเข้าเงื่อนไขเดิมอยู่แล้ว
 *   `handshake` ในนี้เป็นตาข่ายรับเผื่อ AINU เปลี่ยน path ทีหลัง ไม่ใช่การแก้บั๊ก
 *
 * ⚠️ สอง endpoint นี้อยู่ **คนละ host**: หน้า eKYC อยู่ที่ `uat.ainu.tech`
 * ส่วน API อยู่ที่ `uat.nonprod-api.ainu.tech` — ทั้งคู่จะเปลี่ยน host ตอนขึ้น production
 * แต่เราจับที่ `pathname` ไม่ใช่ host จึงไม่ต้องแก้อะไร
 *
 * ถ้าดักไม่ได้จะไม่พัง แค่เสียสัญญาณ — ตกไปเป็น USER_SKIPPED ตอนผู้ใช้กดยกเลิกแทน
 * และ request ที่เกิดใน iframe ซ้อนของ SDK เองอาจดักไม่ได้เลยตั้งแต่ต้น
 */
function classifyResponse(url: string, status: number): LivenessFrameSkipCode | '' {
  let path: string
  try {
    path = new URL(url, window.location.origin).pathname.toLowerCase()
  } catch {
    return ''
  }

  if (status === 404 && /\/ekyc\/?$/.test(path)) return 'PROVIDER_UNAVAILABLE'
  if ((status === 401 || status === 403) && /token|auth|handshake/.test(path)) return 'AUTH_ERROR'
  // credential ผิดจริง ๆ AINU ตอบ **500** ไม่ใช่ 403 (ทดสอบแล้ว 9 ก.ย.)
  // แต่ 500 แยกไม่ออกจาก "เซิร์ฟเวอร์เขาพังเอง" จึงถือเป็น PROVIDER_UNAVAILABLE
  // ไม่ใช่ AUTH_ERROR — เดาว่าเป็นความผิดฝั่งเราไม่ได้จาก status อย่างเดียว
  if (status >= 500 && /token|auth|handshake|\/ekyc\/?$/.test(path)) return 'PROVIDER_UNAVAILABLE'
  return ''
}

function watchResponse(url: string, status: number) {
  const code = classifyResponse(url, status)
  if (code) reportProviderError(code)
}

/**
 * SDK ใช้ fetch หรือ XHR ก็ได้ (คนละเวอร์ชันคนละแบบ) — ดักไว้ทั้งคู่
 *
 * ⚠️ **ข้อจำกัดที่รู้ตัว:** ดักได้เฉพาะ request ที่ออกจาก document นี้
 * SDK เรนเดอร์ iframe ของตัวเองซ้อนอีกชั้น ถ้ามันยิงจากในนั้นเราจะมองไม่เห็น
 * (คนละ window คนละ fetch) — handshake ตอนต้นน่าจะอยู่ชั้นนอกจึงดักได้
 * แต่ยังไม่ได้ยืนยันกับ traffic จริง
 */
function installNetworkWatcher() {
  // bind ไว้เลย — เรียกผ่านตัวแปรจะทำให้ this หลุดจาก window แล้ว Safari โยน Illegal invocation
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const response = await originalFetch(...args)
    // clone ไม่จำเป็น — อ่านแค่ status/url ไม่ได้แตะ body ซึ่งอ่านได้ครั้งเดียว
    try {
      watchResponse(response.url || String(args[0]), response.status)
    } catch {
      // การดักสถานะเป็นแค่สัญญาณเสริม พังแล้วต้องไม่กระทบ request จริง
    }
    return response
  }

  const originalOpen = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    this.addEventListener('load', () => {
      try {
        watchResponse(String(url), this.status)
      } catch {
        // เหตุผลเดียวกับฝั่ง fetch ข้างบน
      }
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (originalOpen as any).call(this, method, url, ...rest)
  } as typeof XMLHttpRequest.prototype.open
}

// ── ประกอบ config แล้วเริ่ม ─────────────────────────────────────────────────

/** referenceId ของรอบนี้ — มาจาก backend ผ่านหน้าแม่ ใช้ตอน start() */
let referenceId = ''

/**
 * เวลารอ `onLoaded()` หลังเรียก `setup()` — ทีมเคาะไว้ที่ 30 วินาที
 *
 * ต้องมีเพราะเคส "AINU รับ request แล้วไม่ตอบ" **ไม่โยน error ออกมาเลย**
 * axios ไม่ timeout, `onLoaded` ไม่ยิง, จอรอหมุนค้างไม่มีวันจบ
 * ผู้ใช้ทำได้อย่างเดียวคือกดยกเลิก ซึ่งจะถูกบันทึกเป็น USER_SKIPPED — โกหกสถิติ
 * ว่าผู้ใช้เลือกไม่สแกน ทั้งที่ระบบเขาค้าง
 *
 * เป็นอาการที่น่าจะเจอบ่อยสุดตอนฝั่งเขาโหลดหนัก และเป็นแบบเดียวที่ไม่มี error ให้จับ
 */
const LOADED_TIMEOUT_MS = 30_000

let loadedTimer: ReturnType<typeof setTimeout> | undefined

function clearLoadedTimer() {
  if (loadedTimer !== undefined) clearTimeout(loadedTimer)
  loadedTimer = undefined
}

function startLoadedTimer() {
  clearLoadedTimer()
  loadedTimer = setTimeout(() => {
    showError(
      'ระบบยืนยันตัวตนไม่ตอบสนอง (เกิน ' + LOADED_TIMEOUT_MS / 1000 + ' วินาที)',
      'PROVIDER_UNAVAILABLE',
    )
  }, LOADED_TIMEOUT_MS)
}

/**
 * backend คืน config มาแบน ๆ แต่ SDK ต้องการ `credential` ซ้อนอีกชั้น
 * (สเปกบอกว่า "ส่งเข้า setup() ได้ตรง ๆ" ซึ่งไม่จริง — ดู ainu-ekyc.d.ts)
 */
function toSdkConfigs(config: LivenessFrameConfig): AinuEkycConfigs {
  return {
    containerId: FRAME_ELEMENT_IDS.container,
    credential: {
      accountId: config.accountId,
      accountSecret: config.accountSecret,
    },
    flowId: config.flowId,
    language: config.language || 'TH',
    delegate: {
      onLoaded: () => {
        // ต้องรอ onLoaded ก่อนเสมอ — เรียก start() ก่อนหน้านี้ SDK จะ throw
        // "The SDK is not yet ready for start." แล้วเงียบ ไล่สาเหตุยาก
        //
        // ⚠️ ไม่เรียก start() เอง — รอผู้ใช้กดปุ่ม (เหตุผลใน frame.html)
        clearLoadedTimer()
        post({ source: LIVENESS_FRAME_SOURCE, type: 'ready' })
        showStartButton()
      },
      onReady(transactionId) {
        // ถึงตรงนี้ UI ของ AINU ขึ้นแล้ว เอาจอเริ่มของเราออกได้
        // ปุ่มยกเลิกอยู่ในจอนี้ จึงหายไปพร้อมกัน — ตั้งใจ (เหตุผลใน frame.html)
        setLoading(false)
        // ส่งต่อให้หน้าแม่ยิง POST /{ref}/transaction ทันที — ห้ามรอผลจบ
        // ผู้ใช้ที่เลิกกลางคันจะเหลือรหัสนี้ไว้เป็นทางเดียวที่ตามเรื่องกับ AINU ได้
        post({ source: LIVENESS_FRAME_SOURCE, type: 'started', transactionId })
      },
      onEkycResult: (result) => {
        // ไม่ log payload — มีข้อมูลของผู้ใช้อยู่ในนั้น และก้อนเต็มถูกเก็บลง
        // raw_payload ใน DB แล้ว (ตัดภาพ base64 ออกด้วย strip_images ฝั่ง backend)
        // ส่งออกทันที ไม่มีจอของเราคั่นเลย — ปล่อยให้เห็นจอสำเร็จของ AINU แล้วเด้งกลับฟอร์ม
        //
        // เคยลองมาแล้วสามแบบและถอยออกทั้งหมด: จอ log, ปุ่มค้าง, จอสำเร็จของเราเอง
        // ทุกแบบขึ้นหลังจาก AINU เก็บ UI ไปแล้ว จึงกลายเป็นจอเปล่าหรือจอซ้ำที่ต้องกดเพิ่ม
        // ถ้าจะทำจอคั่นจริง ๆ ต้องขอให้ AINU เปิดทางให้ข้ามจอสำเร็จของเขาก่อน
        sendResult(result)
      },
    },
  }
}

/**
 * เริ่ม flow — เรียกจากปุ่ม "เริ่มสแกนใบหน้า" เท่านั้น
 *
 * การกดปุ่มเป็น user gesture ในหน้านี้ ซึ่งเป็นเงื่อนไขที่บางเบราว์เซอร์ต้องการ
 * ถึงจะยอมเปิดกล้องให้ — เป็นเหตุผลหนึ่งที่เลิก auto-start (ดู frame.html)
 *
 * ระหว่างรอ onReady สลับกลับไปโชว์ spinner แล้วปิดปุ่ม กันกดซ้ำ
 * พอ onReady มา จอนี้หายทั้งก้อนพอดีกับที่ Face Scan Guidelines ของ AINU ขึ้นมาแทน
 */
function start() {
  showSpinner('กำลังเปิดกล้อง...')

  const onStartFailed = () => {
    showStartButton('ลองอีกครั้ง')
  }

  try {
    // referenceId ต้องไม่ซ้ำต่อการเริ่ม 1 ครั้งตามที่ AINU กำหนด
    // backend การันตีให้แล้วโดยออกใหม่ทุกครั้งที่เรียก POST /v1/liveness/session
    void Promise.resolve(window.AinuEkyc.start(referenceId)).catch(onStartFailed)
  } catch {
    onStartFailed()
  }
}

startButton?.addEventListener('click', start)

closeButton?.addEventListener('click', () => {
  try {
    window.AinuEkyc?.close()
  } catch {
    // ปิดไม่สำเร็จก็ยังต้องแจ้งหน้าแม่ว่าผู้ใช้ปิดเฟรมแล้ว
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

// ── handshake ขอ config จากหน้าแม่ ──────────────────────────────────────────

/** ยิงซ้ำทุก 150ms กันหน้าแม่ติด listener ไม่ทัน · ยอมแพ้ที่ 20 ครั้ง (~3 วิ) */
const CONFIG_RETRY_MS = 150
const CONFIG_MAX_TRIES = 20

let configReceived = false
let askTimer: ReturnType<typeof setInterval> | undefined
let tries = 0

function stopAsking() {
  if (askTimer !== undefined) clearInterval(askTimer)
  askTimer = undefined
}

function onHostMessage(event: MessageEvent) {
  // รับเฉพาะข้อความจาก origin ตัวเอง และที่ติดป้ายว่ามาจากหน้าแม่ของเรา
  // (หน้ามี iframe ของ AINU ซ้อนอยู่อีกชั้น ซึ่งยิง postMessage ของมันเองด้วย)
  if (event.origin !== window.location.origin) return
  const data = event.data as Partial<LivenessHostMessage> | null | undefined
  if (data?.source !== LIVENESS_HOST_SOURCE || data.type !== 'config') return
  if (configReceived) return

  const config = data.config
  if (!config?.accountId || !config.accountSecret || !config.flowId || !config.referenceId) {
    showError('backend ส่ง config การยืนยันตัวตนมาไม่ครบ กรุณาแจ้งผู้ดูแลระบบ')
    stopAsking()
    return
  }

  configReceived = true
  stopAsking()
  referenceId = config.referenceId

  // เติมข้อความบนจอเริ่ม — จำนวนครั้งมาจากหน้าแม่ ไม่ hardcode ที่นี่
  if (promptText) {
    const max = data.maxAttempts
    promptText.textContent =
      'กรุณาสแกนใบหน้าเพื่อยืนยันตัวตนก่อนส่งคำขอรับความช่วยเหลือ'
      + (max ? ` สามารถสแกนได้สูงสุด ${max} ครั้ง` : '')
  }

  try {
    installNetworkWatcher()
    startLoadedTimer()
    window.AinuEkyc.setup(toSdkConfigs(config))
  } catch (e) {
    clearLoadedTimer()
    // ถ้า interceptor ดักสาเหตุจาก AINU ไว้ได้ ใช้อันนั้นเพราะบอกอะไรได้มากกว่า
    // (เช่น handshake ตอบ 500 → PROVIDER_UNAVAILABLE ไม่ใช่ SDK_LOAD_ERROR ลอย ๆ)
    showError(e instanceof Error ? e.message : String(e), lastProviderCode ?? 'SDK_LOAD_ERROR')
  }
}

function askForConfig() {
  if (configReceived) return
  if (tries >= CONFIG_MAX_TRIES) {
    stopAsking()
    // ปกติแปลว่าเปิด frame.html ตรง ๆ นอกแอป (ไม่มีใครตอบ)
    // ถ้าเกิดในแอปจริงแปลว่า LivenessRunner ไม่ได้ตอบ ซึ่งเป็นบั๊กฝั่งเรา
    showError('ไม่ได้รับข้อมูลตั้งค่าจากระบบ — หน้านี้ต้องเปิดผ่านหน้ายื่นคำร้องเท่านั้น')
    return
  }
  tries++
  post({ source: LIVENESS_FRAME_SOURCE, type: 'need-config' })
}

const cameraProblem = cameraUnavailableReason()

if (cameraProblem) {
  showError(cameraProblem, 'NOT_SECURE_CONTEXT')
} else if (!window.AinuEkyc) {
  showError(
    'โหลด eKYC SDK ไม่สำเร็จ — ตรวจไฟล์ใน public/ และ <script src> ใน frame.html',
    'SDK_LOAD_ERROR',
  )
} else {
  window.addEventListener('message', onHostMessage)
  askForConfig()
  askTimer = setInterval(askForConfig, CONFIG_RETRY_MS)
}
