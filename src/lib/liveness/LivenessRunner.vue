<script setup lang="ts">
/**
 * LivenessRunner — ฝังหน้า frame.html เป็น iframe เต็มจอ
 *
 * ทำไมต้องเป็น iframe ไม่เรียก SDK ตรง ๆ ในคอมโพเนนต์นี้:
 * AINU SDK เรนเดอร์ UI ด้วยคลาส Tailwind ของตัวเอง พอหน้ามี Tailwind v4 ของ
 * โปรเจกต์อยู่ด้วย layout จะพัง — spinner ตกจอแล้วจอขาว SDK ไม่เดินต่อ
 * รายละเอียดเต็ม + ผล bisect อยู่ใน README.md ของโฟลเดอร์นี้
 *
 * โค้ดที่แตะ window.AinuEkyc อยู่ที่ frame.ts ที่เดียว
 *
 * คอมโพเนนต์นี้เป็น "ตัวกลาง" ล้วน ๆ — ไม่เรียก API เอง หน้าแม่เป็นคนคุยกับ backend
 */
import { onMounted, onUnmounted, ref } from 'vue'
import {
  LIVENESS_FRAME_SOURCE,
  LIVENESS_FRAME_URL,
  LIVENESS_HOST_SOURCE,
  type LivenessFrameConfig,
  type LivenessFrameMessage,
  type LivenessFrameSkipCode,
} from './messages'
import { readTransactionStatus } from './failureMessages'

const props = defineProps<{
  /**
   * config จาก `POST /v1/liveness/session` — backend เป็นคนจ่าย ไม่ได้อยู่ใน .env แล้ว
   * ส่งเข้าเฟรมทาง postMessage เท่านั้น (accountSecret ห้ามอยู่ใน URL)
   */
  config: LivenessFrameConfig
  /** โควตาต่อ 1 รอบ — เฟรมใช้ประกอบข้อความบนจอเริ่มเท่านั้น หน้าแม่คุมโควตาจริง */
  maxAttempts: number
}>()

const emit = defineEmits<{
  /** UI ของ AINU ขึ้นแล้ว — หน้าแม่ต้องยิง POST /{ref}/transaction ทันที */
  started: [transactionId: string]
  passed: [result: unknown]
  failed: [result: unknown]
  /** SDK โหลดไม่ขึ้น / config ไม่ครบ — คนละเรื่องกับผู้ใช้ทำไม่ผ่าน */
  error: [message: string, code?: LivenessFrameSkipCode]
  /** เฟรมดักได้ว่าฝั่ง AINU ตอบผิดปกติ — flow อาจยังไม่จบ แค่จำรหัสไว้ก่อน */
  providerError: [code: LivenessFrameSkipCode]
  closed: []
}>()

const frameEl = ref<HTMLIFrameElement | null>(null)

/**
 * ตอบ config กลับเข้าเฟรม — จำกัด targetOrigin เป็น origin ตัวเองเสมอ
 *
 * ⚠️ ต้องแตกฟิลด์ออกมาเป็น object ธรรมดาก่อนส่ง **ห้ามส่ง props.config ตรง ๆ**
 * `ref()` ห่อ object ให้เป็น reactive proxy อัตโนมัติ และ postMessage ใช้ structured clone
 * ซึ่งโคลน Proxy ไม่ได้ → DataCloneError ทุกครั้ง (เจอมาแล้ว)
 * เขียนแบบแตกฟิลด์ยังได้ผลพลอยได้: เห็นชัดว่ามีอะไรข้ามเข้าเฟรมไปบ้าง
 */
function sendConfig() {
  const { accountId, accountSecret, flowId, language, referenceId } = props.config
  frameEl.value?.contentWindow?.postMessage(
    {
      source: LIVENESS_HOST_SOURCE,
      type: 'config',
      config: { accountId, accountSecret, flowId, language, referenceId },
      maxAttempts: props.maxAttempts,
    },
    window.location.origin,
  )
}

function onMessage(event: MessageEvent) {
  // รับเฉพาะข้อความจาก origin ตัวเอง และที่ติดป้ายว่ามาจาก frame ของเรา
  // (หน้ามี iframe ของ AINU ซ้อนอยู่อีกชั้น ซึ่งยิง postMessage ของมันเองด้วย)
  if (event.origin !== window.location.origin) return
  const data = event.data as Partial<LivenessFrameMessage> | null | undefined
  if (data?.source !== LIVENESS_FRAME_SOURCE) return

  // เฟรมยิงซ้ำเป็นระยะจนกว่าจะได้ config — ตอบทุกครั้ง ฝั่งนั้นกันซ้ำเอง
  if (data.type === 'need-config') {
    sendConfig()
    return
  }

  if (data.type === 'started') {
    emit('started', data.transactionId ?? '')
    return
  }

  if (data.type === 'result') {
    const status = readTransactionStatus(data.payload)
    if (status === 'completed') emit('passed', data.payload)
    else emit('failed', data.payload)
    return
  }

  if (data.type === 'provider-error' && data.code) {
    emit('providerError', data.code)
    return
  }

  if (data.type === 'closed') emit('closed')
  if (data.type === 'error') {
    // ต้อง emit ออกไปเสมอ — หน้าแม่เป็นคนเด้ง modal ให้ผู้ใช้เลือกทางไป
    // ถ้าเงียบไว้ ผู้ใช้จะค้างอยู่บนจอดำที่ออกได้ทางปุ่ม "ยกเลิก" อย่างเดียว
    emit('error', data.message ?? '', data.code)
  }
}

onMounted(() => window.addEventListener('message', onMessage))
onUnmounted(() => window.removeEventListener('message', onMessage))
</script>

<template>
  <!-- allow="camera" จำเป็น: กล้องถูกใช้ใน iframe ของ AINU ซึ่งซ้อนอยู่ในนี้อีกชั้น
       ถ้าไม่ delegate สิทธิ์ลงไป ชั้นในจะขอกล้องไม่ได้ -->
  <iframe
    ref="frameEl"
    class="liveness-frame"
    :src="LIVENESS_FRAME_URL"
    title="ยืนยันตัวตนด้วยใบหน้า"
    allow="camera; microphone; fullscreen"
  />
</template>

<style scoped>
/* fixed เพื่อให้หลุดออกจาก .app-shell ที่ห่อทุกหน้าอยู่ (มี padding ของ safe-area) */
.liveness-frame {
  position: fixed;
  inset: 0;
  z-index: 100;
  width: 100%;
  height: 100%;
  border: 0;
  /* ขาวให้ตรงกับพื้นของ frame.html — ดำจะเห็นแวบตอน iframe ยังโหลดไม่เสร็จ */
  background: #fff;
}
</style>
