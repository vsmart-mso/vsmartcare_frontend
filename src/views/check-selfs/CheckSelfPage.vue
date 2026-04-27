<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import ActionHeader from '@/components/ui/ActionHeader.vue'
import StickyFooter from '@/components/ui/StickyFooter.vue'
import AgeDisplay from './components/AgeDisplay.vue'
import FormField from './components/FormField.vue'
import InfoAlert from './components/InfoAlert.vue'
import Userdata from './components/Userdata.vue'
import PrimaryButton from './components/PrimaryButton.vue'

const router = useRouter()

const birthdate = ref('') // YYYY-MM-DD (readonly style for now)
const occupation = ref('')
const monthlyIncome = ref<string>('')

const age = computed(() => {
  if (!birthdate.value) return null
  const d = new Date(birthdate.value)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let years = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) years--
  return years >= 0 && years < 150 ? years : null
})

const incomeError = computed(() => {
  if (!monthlyIncome.value) return undefined
  const n = Number(monthlyIncome.value)
  if (!Number.isFinite(n)) return 'กรุณากรอกเป็นตัวเลข'
  if (n < 0) return 'รายได้ต้องไม่ติดลบ'
  const yearly = n * 12
  if (yearly > 100000) return 'รายได้ต้องน้อยกว่า 100,000 บาท/ปี'
  return undefined
})

function handleBack() {
  if (window.history.length > 1) router.back()
  else router.push('/')
}

function onSubmit() {
  // Hook API/navigation when flow is ready
  router.push('/')
}
</script>

<template>
  <div lang="th">
    <div class="app-container app-header">
      <ActionHeader title="ตรวจสอบสิทธิ์เบื้องต้น" :onBack="handleBack" />
    </div>

    <main class="app-container app-main">
      <Userdata prefix="นาย" firstname="สมชาย" lastname="ใจดี" />
      <InfoAlert />

      <section class="app-card mt-4 p-4">
        <div class="space-y-5">
          <FormField
            id="birthdate"
            label="วันเดือนปีเกิด"
            :modelValue="birthdate"
            placeholder="เลือกวันเดือนปีเกิด"
            helperText="ฟิลด์นี้แสดงแบบอ่านอย่างเดียว (เชื่อม date picker ภายหลัง)"
            readonly
            @update:modelValue="birthdate = $event"
          />

          <AgeDisplay :age="age" :valid="age !== null" />

          <FormField
            id="occupation"
            label="อาชีพ"
            :modelValue="occupation"
            placeholder="เช่น เกษตรกร / รับจ้าง / พนักงานบริษัท"
            helperText="ระบุอาชีพปัจจุบัน"
            autocomplete="organization-title"
            @update:modelValue="occupation = $event"
          />

          <FormField
            id="monthly-income"
            label="รายได้ต่อเดือน (บาท)"
            type="number"
            inputmode="decimal"
            :modelValue="monthlyIncome"
            placeholder="0"
            helperText="ระบบจะคำนวณเป็นรายได้ต่อปี"
            :errorText="incomeError"
            @update:modelValue="monthlyIncome = $event"
          />
        </div>
      </section>

    </main>

    <StickyFooter>
      <PrimaryButton label="ดำเนินการตรวจสอบสิทธิ์" type="button" @click="onSubmit" />
      <template #helper>
        <p class="mt-2 text-center text-xs text-gray-500">
          
        </p>
      </template>
    </StickyFooter>
  </div>
</template>

