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
 */
import { computed, onMounted, onUnmounted } from 'vue'
import {
  buildLivenessFrameUrl,
  LIVENESS_FRAME_SOURCE,
  type LivenessFrameMessage,
} from './messages'
import { readTransactionStatus } from './failureMessages'

const props = defineProps<{
  /**
   * ค่าที่หน้าแม่สร้างและถือไว้ เพื่อผูก transaction ฝั่ง AINU กับเคสฝั่งเรา
   * ต้องมาจากหน้าแม่ ไม่ใช่สร้างในเฟรม เพราะเฟรมถูก unmount ทิ้งทุกครั้งที่ปิด
   */
  referenceId: string
}>()

const frameUrl = computed(() => buildLivenessFrameUrl(props.referenceId))

const emit = defineEmits<{
  /** UI ของ AINU ขึ้นแล้ว — transactionId ใช้อ้างอิงตอนแจ้งปัญหากับ AINU */
  started: [transactionId: string]
  passed: [result: unknown]
  failed: [result: unknown]
  /** SDK โหลดไม่ขึ้น / env ไม่ครบ — คนละเรื่องกับผู้ใช้ทำไม่ผ่าน */
  error: [message: string]
  closed: []
}>()

function onMessage(event: MessageEvent) {
  // รับเฉพาะข้อความจาก origin ตัวเอง และที่ติดป้ายว่ามาจาก frame ของเรา
  // (หน้ามี iframe ของ AINU ซ้อนอยู่อีกชั้น ซึ่งยิง postMessage ของมันเองด้วย)
  if (event.origin !== window.location.origin) return
  const data = event.data as Partial<LivenessFrameMessage> | null | undefined
  if (data?.source !== LIVENESS_FRAME_SOURCE) return

  if (data.type === 'started') {
    emit('started', data.transactionId ?? '')
    return
  }

  if (data.type === 'result') {
    const status = readTransactionStatus(data.payload)
    console.log('[liveness] transactionStatus =', status || '(อ่านไม่ออก)')
    if (status === 'completed') emit('passed', data.payload)
    else emit('failed', data.payload)
    return
  }

  if (data.type === 'closed') emit('closed')
  if (data.type === 'error') {
    // เดิมแค่ console.error — ผู้ใช้เลยเจอจอดำที่ออกได้ทางปุ่ม "ยกเลิก" อย่างเดียว
    console.error('[liveness] frame error:', data.message)
    emit('error', data.message ?? '')
  }
}

onMounted(() => window.addEventListener('message', onMessage))
onUnmounted(() => window.removeEventListener('message', onMessage))
</script>

<template>
  <!-- allow="camera" จำเป็น: กล้องถูกใช้ใน iframe ของ AINU ซึ่งซ้อนอยู่ในนี้อีกชั้น
       ถ้าไม่ delegate สิทธิ์ลงไป ชั้นในจะขอกล้องไม่ได้ -->
  <iframe
    class="liveness-frame"
    :src="frameUrl"
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
