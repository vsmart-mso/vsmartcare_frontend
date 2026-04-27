<template>
  <header class="w-full rounded-t-2xl bg-blue-700 text-white sm:rounded-t-3xl">
    <div class="flex w-full items-center gap-3 px-4 py-3 sm:px-5 sm:py-3">
      <button
        v-if="showBack"
        type="button"
        class="inline-flex h-10 w-10 items-center justify-center rounded-lg text-white/95 transition-colors duration-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        :aria-label="backAriaLabel"
        @click="handleBack"
      >
        <svg viewBox="0 0 24 24" class="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <div v-else class="h-10 w-10" aria-hidden="true" />

      <h1 class="flex-1 text-center text-base font-semibold tracking-wide sm:text-lg">
        {{ title }}
      </h1>

      <div class="h-10 w-10" aria-hidden="true" />
    </div>
  </header>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    title: string
    onBack?: () => void
    backAriaLabel?: string
    showBack?: boolean
  }>(),
  {
    backAriaLabel: 'Go back',
    showBack: true
  }
)

function handleBack() {
  props.onBack?.()
}
</script>

