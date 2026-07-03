/** sessionStorage keys for dev mock ThaiD flow */
export const THAID_DEV_MOCK_STORAGE_KEY = 'thaid_dev_mock'

/** Set after successful mock login — enables Step 4 bank-book fixture button */
export const THAID_DEV_MOCK_ACTIVE_KEY = 'thaid_dev_mock_active'

export function thaidDevMockActive(): boolean {
  try {
    return sessionStorage.getItem(THAID_DEV_MOCK_ACTIVE_KEY) === '1'
  } catch {
    return false
  }
}

export function setThaidDevMockActive(): void {
  try {
    sessionStorage.setItem(THAID_DEV_MOCK_ACTIVE_KEY, '1')
  } catch {
    // ignore
  }
}

export function clearThaidDevMockActive(): void {
  try {
    sessionStorage.removeItem(THAID_DEV_MOCK_ACTIVE_KEY)
  } catch {
    // ignore
  }
}
