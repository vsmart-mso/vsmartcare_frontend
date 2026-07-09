/** แปลงค่า env เป็น boolean — รองรับ true/false, 1/0, yes/no, on/off */
function parseEnvBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim() === '') return defaultValue

  const normalized = value.trim().toLowerCase()
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true
  if (['false', '0', 'no', 'off'].includes(normalized)) return false

  return defaultValue
}

/** Pop-up แจ้งเตือนระบบทดสอบบนหน้า login — ควบคุมด้วย VITE_LOGIN_BETA_NOTICE */
export function isLoginBetaNoticeEnabled(): boolean {
  return parseEnvBoolean(import.meta.env.VITE_LOGIN_BETA_NOTICE, true)
}

/** เปิด ThaiD dev mock ได้แม้ไม่ใช่ Vite dev server — default ปิดไว้ */
export function isThaIDDevMockEnabled(): boolean {
  return parseEnvBoolean(import.meta.env.VITE_ENABLE_THAID_DEV_MOCK, false)
}
