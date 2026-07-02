import { thaidDevMockActive } from './constants'

const BANK_BOOK_FIXTURE_PATH = '/dev-fixtures/bank-book-ocr-sample.jpg'
const BANK_BOOK_FIXTURE_FILENAME = 'bank-book-ocr-sample.jpg'

/** True when the current session logged in via dev mock ThaiD. */
export function isDevMockSession(): boolean {
  return import.meta.env.DEV && thaidDevMockActive()
}

/** Fetch the dev bank-book sample image as a File for upload/OCR. */
export async function loadBankBookFixture(): Promise<File> {
  const res = await fetch(BANK_BOOK_FIXTURE_PATH)
  if (!res.ok) {
    throw new Error(`โหลดรูปตัวอย่างไม่สำเร็จ (${res.status})`)
  }
  const blob = await res.blob()
  const type = blob.type || 'image/jpeg'
  return new File([blob], BANK_BOOK_FIXTURE_FILENAME, { type })
}

export { BANK_BOOK_FIXTURE_PATH, BANK_BOOK_FIXTURE_FILENAME }
