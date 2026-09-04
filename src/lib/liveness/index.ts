/**
 * Public API ของ lib liveness — ส่วนอื่นในแอป import จากไฟล์นี้เท่านั้น
 *
 * ⚠️ ห้าม export frame.ts ที่นี่ — มัน setup() ทันทีที่ถูก import
 *    และ frame.css จะถูกลากเข้าแอปหลักไปด้วย
 *
 * อ่าน README.md ก่อนแก้อะไรในโฟลเดอร์นี้
 */
export { default as LivenessRunner } from './LivenessRunner.vue'
export { describeLivenessFailure, readTransactionStatus } from './failureMessages'
export type { LivenessFailure } from './failureMessages'
export { formatLivenessPayload, redactLivenessPayload } from './redact'
export { buildLivenessReport } from './report'
export type { LivenessReportInput } from './report'
export {
  buildLivenessFrameUrl,
  createLivenessReferenceId,
  LIVENESS_FRAME_SOURCE,
  LIVENESS_FRAME_URL,
} from './messages'
export type { LivenessFrameMessage } from './messages'
export type { AinuEkycApi, AinuEkycConfigs, AinuEkycDelegate } from './ainu-ekyc'
