<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    disabled?: boolean
    ariaLabel?: string
    type?: 'button' | 'submit'
  }>(),
  {
    disabled: false,
    ariaLabel: undefined,
    type: 'button'
  }
)
</script>

<template>
  <button
    :type="type"
    class="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/50 disabled:cursor-not-allowed disabled:bg-slate-300"
    :disabled="disabled"
    :aria-label="ariaLabel ?? label"
  >
    <span class="truncate">{{ label }}</span>
    <svg viewBox="0 0 24 24" class="h-5 w-5 shrink-0" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M9 18l6-6-6-6" />
    </svg>
  </button>
</template>

