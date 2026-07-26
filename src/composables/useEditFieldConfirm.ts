import type { InjectionKey, Ref, ComputedRef } from 'vue'

export type EditFieldConfirmCtx = {
  /** review_field_id → ติ๊กยืนยันแล้ว */
  confirmations: Ref<Record<number, boolean>>
  /** review_field_id → edited | unchanged_ok */
  confirmationTypes: ComputedRef<Record<number, 'edited' | 'unchanged_ok'>>
  /** name → review_field_id (เฉพาะฟิลด์ที่ต้องยืนยัน) */
  fieldIdByName: ComputedRef<Record<string, number>>
  /** ตั้งค่ายืนยันทีละ id */
  toggle: (fieldId: number, checked: boolean) => void
  /** ตั้งค่ายืนยันหลาย id พร้อมกัน (alias / legacy fields) */
  toggleMany: (fieldIds: number[], checked: boolean) => void
}

export const EDIT_FIELD_CONFIRM_KEY: InjectionKey<EditFieldConfirmCtx> = Symbol('editFieldConfirm')
