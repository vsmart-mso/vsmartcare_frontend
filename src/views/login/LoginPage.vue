<template>
  <div class="flex flex-col">
    <div class="app-container app-header flex flex-1 flex-col justify-start py-4 sm:justify-center sm:py-8">
      <ActionHeader title="เข้าสู่ระบบ" :onBack="handleBack" />

      <main class="app-main pb-0">
        <div class="app-card sm:rounded-3xl sm:shadow-md">
          <TitleSection />

          <section class="px-4 pb-6 pt-5 sm:px-5 sm:pb-7 sm:pt-6">
            <AuthOptionCard
              title="เข้าสู่ระบบด้วย ThaID"
              subtitle="ยืนยันตัวตนด้วย ThaID"
              :icon="IdCardIcon"
              variant="blue"
              @select="selectMethod('thaid')"
            />

            <Divider />

            <AuthOptionCard
              title="เข้าสู่ระบบด้วย ทางรัฐ"
              subtitle="ยืนยันตัวตนด้วย Face Recognition"
              :icon="FaceIcon"
              variant="green"
              @select="selectMethod('face')"
            />

            <InfoBox />
          </section>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineComponent, h } from 'vue'
import { useRouter } from 'vue-router'
import ActionHeader from '@/components/ui/ActionHeader.vue'
import TitleSection from './components/TitleSection.vue'
import AuthOptionCard from './components/AuthOptionCard.vue'
import Divider from './components/Divider.vue'
import InfoBox from './components/InfoBox.vue'

type Method = 'thaid' | 'face'

const router = useRouter()

//set icon thaid
const IdCardIcon = defineComponent({
  name: 'IdCardIcon',
  setup() {
    return () =>
      h(
        'span',
        {
          class:
            'flex h-full w-full items-center justify-center text-[8px] font-bold leading-none tracking-tight text-white sm:text-xs'
        },
        'ThaID'
      )
  }
})

//set icon face
const FaceIcon = defineComponent({
  name: 'FaceIcon',
  setup() {
    return () =>
      h(
        'span',
        {
          class:
            'flex h-full w-full items-center justify-center whitespace-nowrap text-[8px] font-bold leading-none text-white sm:text-xs'
        },
        'ทางรัฐ'
      )
  }
})

function handleBack() {
  if (window.history.length > 1) router.back()
  else router.push('/')
}

function selectMethod(method: Method) {
  // Hook this up to your actual auth flow when ready.
  // For now, we just navigate to a safe default route.
  if (method === 'thaid') router.push('/')
  else router.push('/')
}
</script>
