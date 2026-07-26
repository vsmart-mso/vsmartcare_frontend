<script setup lang="ts">
import { computed, inject } from 'vue'
import { EDIT_FIELD_CONFIRM_KEY } from '@/composables/useEditFieldConfirm'

const props = defineProps<{
  /** ชื่อ field จาก reviewComments — รองรับหลายชื่อเมื่อ field เดียวกันมี alias */
  field: string | string[]
  /** block = แถวเต็มใต้หัวข้อ; inline = คู่กับชื่อฟิลด์ */
  variant?: 'inline' | 'block'
}>()

const ctx = inject(EDIT_FIELD_CONFIRM_KEY, null)

const fieldNames = computed(() =>
  Array.isArray(props.field) ? props.field : [props.field],
)

/** ทุก review_field_id ที่ต้องยืนยันในกลุ่มนี้ (รองรับ type+detail พร้อมกัน) */
const fieldIds = computed((): number[] => {
  if (!ctx) return []
  const map = ctx.fieldIdByName.value
  const ids: number[] = []
  const seen = new Set<number>()
  for (const name of fieldNames.value) {
    const id = map[name]
    if (id == null || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
})

const primaryId = computed((): number | null => fieldIds.value[0] ?? null)

const confirmed = computed(() => {
  if (!ctx || fieldIds.value.length === 0) return false
  return fieldIds.value.every(id => !!ctx.confirmations.value[id])
})

const typeLabel = computed(() => {
  if (primaryId.value == null || !ctx) return ''
  // ถ้ามีฟิลด์ใดถูกแก้ แสดง "ได้แก้ไขแล้ว"
  const anyEdited = fieldIds.value.some(
    id => ctx.confirmationTypes.value[id] === 'edited',
  )
  return anyEdited ? 'ได้แก้ไขแล้ว' : 'ข้อมูลถูกต้องแล้ว'
})

const isEdited = computed(() => {
  if (!ctx || fieldIds.value.length === 0) return false
  return fieldIds.value.some(id => ctx.confirmationTypes.value[id] === 'edited')
})

const isBlock = computed(() => (props.variant ?? 'inline') === 'block')

function toggle() {
  if (!ctx || fieldIds.value.length === 0) return
  ctx.toggleMany(fieldIds.value, !confirmed.value)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault()
    toggle()
  }
}
</script>

<template>
  <span
    v-if="fieldIds.length > 0"
    role="checkbox"
    :aria-checked="confirmed"
    :aria-label="'ตรวจสอบแล้ว: ' + typeLabel"
    tabindex="0"
    class="select-none"
    :class="isBlock
      ? 'mt-2 mb-2 flex items-start gap-2 rounded-lg border px-2.5 py-2 cursor-pointer transition-colors ' +
        (confirmed ? 'border-emerald-200 bg-emerald-50/70' : 'border-slate-200 bg-slate-50/80')
      : 'ml-1 inline-flex items-center gap-1.5 align-middle rounded-md border px-1.5 py-0.5 cursor-pointer transition-colors ' +
        (confirmed ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white')"
    @click.stop="toggle"
    @keydown="onKeydown"
  >
    <input
      type="checkbox"
      class="rounded border-slate-300 text-[#1A56DB] flex-shrink-0 pointer-events-none"
      :class="isBlock ? 'mt-0.5 w-4 h-4' : 'w-3.5 h-3.5'"
      :checked="confirmed"
      tabindex="-1"
      aria-hidden="true"
    />
    <span class="min-w-0 inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <span
        class="font-semibold whitespace-nowrap"
        :class="[
          isBlock ? 'text-hint' : 'text-micro',
          confirmed ? 'text-emerald-800' : 'text-slate-700',
        ]"
      >
        ตรวจสอบแล้ว
      </span>
      <span
        class="text-micro px-1 py-px rounded font-medium whitespace-nowrap"
        :class="isEdited ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'"
      >
        {{ typeLabel }}
      </span>
    </span>
  </span>
</template>
