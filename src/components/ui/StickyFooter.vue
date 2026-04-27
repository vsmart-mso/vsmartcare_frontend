<template>
  <div class="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-200 bg-white/90 backdrop-blur">
    <div class="app-container pb-[env(safe-area-inset-bottom)] pt-3">
      <slot />
      <p v-if="helperText" class="mt-2 text-center text-xs text-gray-500">
        {{ helperText }}
      </p>
      <slot v-else name="helper" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  helperText?: string
}>()
</script>

