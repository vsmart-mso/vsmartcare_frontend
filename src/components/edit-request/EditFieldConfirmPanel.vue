<script setup lang="ts">
import { computed } from 'vue'
import type { ReviewComment } from '@/api/welfare'

const props = defineProps<{
  fields: ReviewComment[]
  /** review_field_id → confirmed */
  modelValue: Record<number, boolean>
}>()

const confirmedCount = computed(() =>
  props.fields.filter(f => props.modelValue[f.review_field_id]).length,
)

const allDone = computed(() =>
  props.fields.length > 0 && confirmedCount.value === props.fields.length,
)
</script>

<template>
  <section
    class="bg-white border rounded-xl px-4 py-3 flex items-start justify-between gap-3"
    :class="allDone ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200'"
    aria-labelledby="confirm-panel-title"
  >
    <div class="min-w-0">
      <h2 id="confirm-panel-title" class="text-body-md font-bold text-slate-800">
        ยืนยันการตรวจสอบข้อมูล
      </h2>
      <p class="text-hint text-slate-500 mt-0.5 leading-relaxed">
        ติ๊ก “ตรวจสอบแล้ว” ใต้แต่ละหัวข้อที่เจ้าหน้าที่ระบุ
        — ไม่จำเป็นต้องเปลี่ยนค่าหากข้อมูลเดิมถูกต้อง
      </p>
    </div>
    <p
      class="text-hint font-semibold whitespace-nowrap flex-shrink-0"
      :class="allDone ? 'text-emerald-700' : 'text-[#1A56DB]'"
    >
      ยืนยันแล้ว {{ confirmedCount }}/{{ fields.length }} หัวข้อ
    </p>
  </section>
</template>
