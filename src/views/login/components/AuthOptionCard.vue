<template>
  <button
    type="button"
    class="w-full text-left transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/50"
    @click="emit('select')"
  >
    <div
      class="flex items-center gap-3 rounded-xl border p-4 shadow-sm hover:shadow-md sm:gap-4 sm:rounded-xl sm:p-4"
      :class="[variantClasses.containerBorder, variantClasses.containerBg]"
    >
      <div
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg sm:h-11 sm:w-11"
        :class="variantClasses.iconBg"
        aria-hidden="true"
      >
        <component :is="icon" class="h-6 w-6 text-white sm:h-7 sm:w-7" />
      </div>

      <div class="min-w-0 flex-1">
        <div class="text-sm font-semibold text-slate-900 sm:text-base">
          {{ title }}
        </div>
        <div class="mt-0.5 text-xs leading-4 text-slate-600 sm:text-sm sm:leading-5">
          {{ subtitle }}
        </div>
      </div>

      <svg
        viewBox="0 0 24 24"
        class="h-5 w-5 shrink-0 text-slate-400 sm:h-5 sm:w-5"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 18l6-6-6-6" />
      </svg>
    </div>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'

type Variant = 'blue' | 'green'

const props = defineProps<{
  title: string
  subtitle: string
  icon: any
  variant: Variant
}>()

const emit = defineEmits<{
  (e: 'select'): void
}>()

const variantClasses = computed(() => {
  if (props.variant === 'green') {
    return {
      containerBorder: 'border-green-400',
      containerBg: 'bg-green-50',
      iconBg: 'bg-green-600'
    }
  }

  return {
    containerBorder: 'border-blue-400',
    containerBg: 'bg-blue-50',
    iconBg: 'bg-blue-700'
  }
})
</script>

