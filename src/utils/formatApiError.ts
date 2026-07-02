/** แปลง error จาก ofetch / fetch เป็นข้อความอ่านได้ (สำหรับ debug บนหน้า login). */

function stringifyDetail(detail: unknown): string {
  if (detail == null) return ''
  if (typeof detail === 'string') return detail
  try {
    return JSON.stringify(detail, null, 2)
  } catch {
    return String(detail)
  }
}

export function formatApiError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as {
      status?: number
      statusCode?: number
      statusText?: string
      data?: unknown
      message?: string
    }
    const status = e.status ?? e.statusCode
    const detail =
      e.data != null
        ? stringifyDetail(
            typeof e.data === 'object' && e.data !== null && 'detail' in e.data
              ? (e.data as { detail: unknown }).detail
              : e.data,
          )
        : ''
    const parts: string[] = []
    if (status != null) parts.push(`HTTP ${status}`)
    if (e.statusText) parts.push(e.statusText)
    if (detail) parts.push(detail)
    if (parts.length) return parts.join(' — ')
    if (e.message) return e.message
  }
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return String(err)
}
