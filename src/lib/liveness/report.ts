/**
 * ประกอบรายงานสำหรับแจ้งปัญหากับ AINU
 *
 * เวลาแจ้งว่า "สแกนไม่ผ่าน" ลอย ๆ AINU ตามให้ไม่ได้ ต้องมีอย่างน้อย:
 * transactionId (ใช้ค้นเคสฝั่งเขา) · เวลา · เวอร์ชัน SDK ทั้งสองชั้น · reason
 * ทั้งหมดนี้กระจายอยู่คนละที่ ฟังก์ชันนี้รวบให้ก๊อปทีเดียวจบ
 *
 * base64 ถูกตัดออกด้วย redactLivenessPayload ก่อนเสมอ
 */
import { describeLivenessFailure } from './failureMessages'
import { formatLivenessPayload } from './redact'

export interface LivenessReportInput {
  /** จาก onReady — ค่าที่ AINU ใช้ค้นเคสฝั่งเขา */
  transactionId: string
  /** ค่าที่เราเป็นคนสร้างและส่งเข้า start() — ใช้ผูกกับเคสฝั่งเรา */
  referenceId?: string
  /** ผลดิบจาก onEkycResult ('' / null ถ้าผู้ใช้ปิดก่อนได้ผล) */
  result: unknown
}

function readNested(result: unknown, path: string[]): string {
  let cur: unknown = result
  for (const key of path) {
    if (!cur || typeof cur !== 'object') return ''
    cur = (cur as Record<string, unknown>)[key]
  }
  return typeof cur === 'string' ? cur : ''
}

/** เวอร์ชัน SDK 2 ชั้น — ตัวที่เราฝัง กับ engine ที่ AINU โหลดจากเซิร์ฟเวอร์เขาเอง */
function readSdkVersions(result: unknown): { sdk: string; engine: string } {
  return {
    sdk: readNested(result, ['sdkVersion']) || readNested(result, ['data', 'sdkVersion']),
    engine:
      readNested(result, ['liveness', 'sdkVersion'])
      || readNested(result, ['data', 'liveness', 'sdkVersion']),
  }
}

export function buildLivenessReport({
  transactionId,
  referenceId,
  result,
}: LivenessReportInput): string {
  const failure = describeLivenessFailure(result)
  const { sdk, engine } = readSdkVersions(result)

  const lines = [
    '--- AINU liveness — ข้อมูลสำหรับแจ้งปัญหา ---',
    `เวลา            : ${new Date().toISOString()}`,
    `transactionId   : ${transactionId || '(ไม่มี — ปิดก่อน onReady)'}`,
    `referenceId     : ${referenceId || '(ไม่มี)'}`,
    `flowId          : ${import.meta.env.VITE_FLOW_ID ?? ''}`,
    `accountId       : ${import.meta.env.VITE_ACCOUNT_ID ?? ''}`,
    `language        : ${import.meta.env.VITE_LANGUAGE || 'TH'}`,
    `status          : ${failure.status || '(อ่านไม่ออก)'}`,
    `reason / code   : ${failure.code || '(ไม่มี)'}`,
    `description     : ${failure.description || '(ไม่มี)'}`,
    `sdkVersion      : ${sdk || '(ไม่พบ)'}`,
    `liveness engine : ${engine || '(ไม่พบ)'}`,
    `origin          : ${window.location.origin}`,
    `userAgent       : ${navigator.userAgent}`,
    '',
    'payload (ตัด base64 ออกแล้ว):',
    formatLivenessPayload(result),
  ]

  return lines.join('\n')
}
