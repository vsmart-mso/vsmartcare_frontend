<!-- <script setup lang="ts">
defineProps<{
  title?: string
  description: string
}>()
</script> -->

<template>
  <aside class="mt-5 rounded-lg bg-blue-50 p-4 text-slate-700 sm:mt-6 sm:p-5">
    <div class="flex items-start gap-3">
      <div class="mt-0.5 text-blue-700" aria-hidden="true">
        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 2a10 10 0 100 20 10 10 0 000-20z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 10v7" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 7h.01" />
        </svg>
      </div>
      <p class="text-left text-xs leading-5 sm:text-sm sm:leading-6">
        ระบบจะตรวจสอบว่าท่านมีคำขอค้างอยู่หรือไม่ และนำท่านไปยังหน้าที่เหมาะสมโดยอัตโนมัติ
      </p>
    </div>
  </aside>
</template>

<!-- <template>
  <section class="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
    <div class="flex items-start gap-3">
      <div class="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white" aria-hidden="true">
        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 16v-4m0-4h.01M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10Z" />
        </svg>
      </div>

      <div class="min-w-0">
        <div v-if="title" class="text-sm font-semibold text-slate-900">
          {{ title }}
        </div>
        <p class="mt-0.5 text-sm leading-5 text-slate-700">
          {{ description }}
        </p>
      </div>
    </div>
  </section>
</template> -->

