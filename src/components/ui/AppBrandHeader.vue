<script setup lang="ts">
import logoVcare from '@/assets/logo-vcare.jpg'
import { BRAND_LOGO_ALT, BRAND_TAGLINE } from '@/constants/brand'

withDefaults(
  defineProps<{
    showLogo?: boolean
    tagline?: string
    showTagline?: boolean
  }>(),
  {
    showLogo: true,
    tagline: BRAND_TAGLINE,
    showTagline: true,
  },
)
</script>

<template>
  <div class="brand-header">
    <div v-if="showLogo" class="brand-logo">
      <img :src="logoVcare" :alt="BRAND_LOGO_ALT" />
    </div>

    <p v-if="showTagline && tagline" class="brand-tagline">
      {{ tagline }}
    </p>

    <slot />
  </div>
</template>
