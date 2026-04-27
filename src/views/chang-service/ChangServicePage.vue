<template>
  <div class="flex flex-col">
    <div class="app-container app-header flex flex-1 flex-col justify-start py-4 sm:justify-center sm:py-8">
      <ActionHeader title="เลือกบริการ" :onBack="handleBack" />

      <main class="app-main pb-0">
        <div class="app-card sm:rounded-3xl sm:shadow-md">
          <TitleSection />

          <section class="px-4 pb-6 pt-5 sm:px-5 sm:pb-7 sm:pt-6">
            <ServiceOptionCard
              title="ลงทะเบียน"
              subtitle="ยื่นคำขอใหม่"
              :icon="RegisterIcon"
              variant="blue"
              @select="selectOption('register')"
            />

            <Divider />

            <ServiceOptionCard
              title="ติดตามผล"
              subtitle="ตรวจสอบสถานะคำขอ"
              :icon="TrackIcon"
              variant="green"
              @select="selectOption('track')"
            />

            <InfoAlert />
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
import ServiceOptionCard from './components/ServiceOptionCard.vue'
import Divider from './components/Divider.vue'
import InfoAlert from './components/InfoAlert.vue'

type ServiceOption = 'register' | 'track'

const router = useRouter()

const RegisterIcon = defineComponent({
  name: 'RegisterIcon',
  setup() {
    return () =>
      h(
        'span',
        {
          class:
            'flex h-full w-full items-center justify-center text-[8px] font-bold leading-none tracking-tight text-white sm:text-xs'
        },
        'สมัคร'
      )
  }
})

const TrackIcon = defineComponent({
  name: 'TrackIcon',
  setup() {
    return () =>
      h(
        'span',
        {
          class:
            'flex h-full w-full items-center justify-center whitespace-nowrap text-[8px] font-bold leading-none text-white sm:text-xs'
        },
        'ผล'
      )
  }
})

function handleBack() {
  if (window.history.length > 1) router.back()
  else router.push('/')
}

function selectOption(option: ServiceOption) {
  if (option === 'register') router.push('/check-self')
  else router.push('/')
}
</script>

