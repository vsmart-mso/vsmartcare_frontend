<script setup lang="ts">
defineProps<{
  age: number | null
  valid?: boolean
}>()
</script>

<template>
  <section class="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
    <div class="flex items-center justify-between gap-3">
      <div class="min-w-0">
        <div class="text-sm font-medium text-slate-900">อายุปัจจุบัน</div>
        <div class="mt-0.5 text-xs text-gray-500">ระบบคำนวณจากวันเดือนปีเกิด</div>
      </div>

      <div class="flex items-center gap-2">
        <div class="text-lg font-semibold" :class="valid ? 'text-pink-500' : 'text-slate-900'">
          {{ age !== null ? `${age} ปี` : '-' }}
        </div>
        <svg
          v-if="valid"
          viewBox="0 0 24 24"
          class="h-5 w-5 text-emerald-600"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M20 6 9 17l-5-5" />
        </svg>
      </div>
    </div>
  </section>
</template>

