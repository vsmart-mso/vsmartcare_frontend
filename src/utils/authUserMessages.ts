/** ข้อความแจ้งผู้ใช้สำหรับ flow เข้าสู่ระบบ ThaiD — ไม่แสดงรหัส technical */

export const DEFAULT_AUTH_LOGIN_MESSAGE =
  'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'

const LOGIN_CANCELLED_MESSAGE =
  'คุณยกเลิกการเข้าสู่ระบบ หรือไม่ได้อนุมัติการยืนยันตัวตนในแอป ThaiD'

export const SESSION_EXPIRED_MESSAGE =
  'การเข้าสู่ระบบหมดอายุ กรุณาเริ่มใหม่จากหน้าเข้าสู่ระบบ'

const THAID_UNAVAILABLE_MESSAGE =
  'ไม่สามารถยืนยันตัวตนกับ ThaiD ได้ในขณะนี้ กรุณาลองเข้าสู่ระบบใหม่อีกครั้ง'

const CODE_MESSAGES: Record<string, string> = {
  thaid_token_or_userinfo_failed: THAID_UNAVAILABLE_MESSAGE,
  token_response_missing_access_token: THAID_UNAVAILABLE_MESSAGE,
  login_disapproved_or_missing_code: LOGIN_CANCELLED_MESSAGE,
  access_denied: LOGIN_CANCELLED_MESSAGE,
  user: LOGIN_CANCELLED_MESSAGE,
  disapproved: LOGIN_CANCELLED_MESSAGE,
  missing_pid_in_userinfo:
    'ไม่พบข้อมูลเลขบัตรประชาชนจาก ThaiD กรุณาติดต่อผู้ดูแลระบบ',
  invalid_state: SESSION_EXPIRED_MESSAGE,
  state_expired: SESSION_EXPIRED_MESSAGE,
  invalid_or_expired_state: SESSION_EXPIRED_MESSAGE,
  missing_state: SESSION_EXPIRED_MESSAGE,
  invalid_token: SESSION_EXPIRED_MESSAGE,
  missing_bearer_token: SESSION_EXPIRED_MESSAGE,
  thaid_auth_timeout: 'การเชื่อมต่อใช้เวลานานเกินไป กรุณาลองใหม่',
  thaid_auth_unreachable:
    'ไม่สามารถเชื่อมต่อระบบยืนยันตัวตนได้ กรุณาลองใหม่ภายหลัง',
  auth_error: DEFAULT_AUTH_LOGIN_MESSAGE,
}

function normalizeCode(code: string): string {
  return code.trim().toLowerCase()
}

export function userMessageForAuthErrorCode(code: string): string {
  const key = normalizeCode(code)
  if (CODE_MESSAGES[key]) return CODE_MESSAGES[key]
  if (key.includes('disapproved') || key.includes('access_denied')) {
    return LOGIN_CANCELLED_MESSAGE
  }
  return DEFAULT_AUTH_LOGIN_MESSAGE
}

function extractDetailCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined
  const e = err as { data?: unknown; status?: number; statusCode?: number }
  const data = e.data
  if (data == null) return undefined
  if (typeof data === 'string') return data
  if (typeof data === 'object') {
    const obj = data as { detail?: unknown; error?: unknown }
    if (typeof obj.detail === 'string') return obj.detail
    if (typeof obj.error === 'string') return obj.error
  }
  return undefined
}

export function userMessageForAuthApiError(err: unknown): string {
  const detail = extractDetailCode(err)
  if (detail) return userMessageForAuthErrorCode(detail)

  if (err && typeof err === 'object') {
    const status = (err as { status?: number; statusCode?: number }).status
      ?? (err as { statusCode?: number }).statusCode
    if (status === 502 || status === 503) {
      return 'ระบบยืนยันตัวตนไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่ภายหลัง'
    }
    if (status === 408 || status === 504) {
      return 'การเชื่อมต่อใช้เวลานานเกินไป กรุณาลองใหม่'
    }
  }

  return DEFAULT_AUTH_LOGIN_MESSAGE
}

/** แปลง query `auth_error` ที่อาจเป็นรูปแบบ technical เก่า */
export function normalizeAuthErrorQuery(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return DEFAULT_AUTH_LOGIN_MESSAGE

  const oauthMatch = trimmed.match(/OAuth error=([^\s,]+)/i)
  if (oauthMatch?.[1]) return userMessageForAuthErrorCode(oauthMatch[1])

  const errorMatch = trimmed.match(/error=([^\s,]+)/i)
  if (errorMatch?.[1]) return userMessageForAuthErrorCode(errorMatch[1])

  if (/HTTP \d|OAuth error|poll status|thaid_/i.test(trimmed)) {
    return DEFAULT_AUTH_LOGIN_MESSAGE
  }

  const firstLine = trimmed.split('\n')[0]?.trim()
  if (firstLine && !firstLine.includes('=')) return firstLine

  return DEFAULT_AUTH_LOGIN_MESSAGE
}
