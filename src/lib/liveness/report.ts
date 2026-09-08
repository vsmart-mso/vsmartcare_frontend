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
import type { LivenessFrameConfig } from './messages'
import { formatLivenessPayload } from './redact'

export interface LivenessReportInput {
  /** จาก onReady — ค่าที่ AINU ใช้ค้นเคสฝั่งเขา */
  transactionId: string
  /** จาก POST /v1/liveness/session — ใช้ผูกกับเคสฝั่งเรา */
  referenceId?: string
  /**
   * config ที่ backend จ่ายมารอบนี้ — เดิมอ่านจาก .env แต่ credential
   * ย้ายไปอยู่ฝั่ง backend หมดแล้ว จึงต้องรับเข้ามาแทน
   */
  config?: Pick<LivenessFrameConfig, 'accountId' | 'flowId' | 'language'>
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
  config,
  result,
}: LivenessReportInput): string {
  const failure = describeLivenessFailure(result)
  const { sdk, engine } = readSdkVersions(result)

  const lines = [
    '--- AINU liveness — ข้อมูลสำหรับแจ้งปัญหา ---',
    `เวลา            : ${new Date().toISOString()}`,
    `transactionId   : ${transactionId || '(ไม่มี — ปิดก่อน onReady)'}`,
    `referenceId     : ${referenceId || '(ไม่มี)'}`,
    `flowId          : ${config?.flowId || '(ไม่มี)'}`,
    `accountId       : ${config?.accountId || '(ไม่มี)'}`,
    `language        : ${config?.language || 'TH'}`,
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
