<script setup lang="ts">
import { ref, computed, reactive, watch, onMounted } from 'vue'
import { useApplicationStore } from '@/stores/application'
import { lookupsApi } from '@/api/lookups'
import FieldAlert from '@/components/ui/FieldAlert.vue'

const app = useApplicationStore()

const commentMap = computed(() => {
  const m = new Map<string, string>()
  for (const c of app.reviewComments) m.set(c.name, c.reason)
  return m
})

// โครงสร้างตัวเลือก dropdown ที่ใช้ใน template
interface Option { value: string; label: string }

// ─── 6.1 อาชีพและรายได้ ───────────────────────────────────────────────────────
// occupation เก็บไว้ที่ PDPA แล้ว — step นี้เก็บเฉพาะ familyOccupation และ monthlyIncome
const familyOccupation = ref('')   // economic_infos.family_occupation
const monthlyIncome = ref('')

// ─── 6.2 ที่มาของรายได้ ───────────────────────────────────────────────────────
const incomeSources     = ref<string[]>([])
const incomeSourceOther = ref('')
const incomeSourceOptions = ref<Option[]>([])
// ID ของตัวเลือก "อื่น ๆ" — หาจาก API หลัง fetch เสร็จ
const incomeOtherVal = computed(() =>
  incomeSourceOptions.value.find(o => o.label.includes('อื่น'))?.value ?? ''
)

// ─── 7.1 ภาระการอุปการะ ───────────────────────────────────────────────────────
const caregiverRoles = ref<string[]>([])
const caregiverOther = ref('')
const caregiverRoleOptions = ref<Option[]>([])
const caregiverOtherVal = computed(() =>
  caregiverRoleOptions.value.find(o => o.label.includes('อื่น'))?.value ?? ''
)

// ─── 8.1 ประวัติการได้รับความช่วยเหลือจากรัฐ ─────────────────────────────────
const govAidHistory = ref<'none' | 'received'>('none')

// ─── 8.2 มูลค่าความช่วยเหลือเดิม (แสดงเมื่อ "เคย") ───────────────────────────
const timesThisYear = ref('')
const totalAmount   = ref('')

// ─── 8.3 ประเภทความช่วยเหลือที่เคยได้รับ ─────────────────────────────────────
const aidTypes = ref<string[]>([])
const aidTypeOptions = ref<Option[]>([])

// หา id ของตัวเลือกที่ต้องระบุรายละเอียด (ค้นจาก label ที่ได้จาก API)
const aidTypeRepairId   = computed(() => aidTypeOptions.value.find(o => o.label.includes('ซ่อม'))?.value ?? '')
const aidTypeGovId      = computed(() => aidTypeOptions.value.find(o => o.label.includes('ภาครัฐ'))?.value ?? '')
const aidTypePrivateId  = computed(() => aidTypeOptions.value.find(o => o.label.includes('ภาคเอกชน'))?.value ?? '')
const aidTypeLoanId     = computed(() => aidTypeOptions.value.find(o => o.label.includes('เงินกู้'))?.value ?? '')
// "อื่น ๆ" คือ option ที่มีคำว่า "อื่น" แต่ไม่ใช่ "ภาครัฐ" หรือ "ภาคเอกชน"
const aidTypeOtherId    = computed(() =>
  aidTypeOptions.value.find(o => o.label.includes('อื่น') && !o.label.includes('ภาค'))?.value ?? ''
)

// ชุด id ที่ต้องมีช่องระบุรายละเอียด — ใช้ใน template และ isReady
const aidTypeDetailIds  = computed(() =>
  [aidTypeRepairId.value, aidTypeGovId.value, aidTypePrivateId.value, aidTypeLoanId.value, aidTypeOtherId.value]
    .filter(Boolean)
)

// เก็บข้อความระบุรายละเอียดต่อ option id — key = id, value = ข้อความ
const aidTypeDetails = reactive<Record<string, string>>({})

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toggleItem(arr: string[], value: string) {
  const idx = arr.indexOf(value)
  if (idx === -1) arr.push(value)
  else arr.splice(idx, 1)
}

function handleNumericInput(e: Event, setter: (v: string) => void) {
  const el = e.target as HTMLInputElement
  const digits = el.value.replace(/[^0-9]/g, '')
  setter(digits)
  el.value = digits
}

// แปลงตัวเลขให้มีลูกน้ำ เช่น "1000" → "1,000"
function formatMoney(val: string): string {
  if (!val) return ''
  return Number(val).toLocaleString('th-TH')
}

// รับ input จากช่องเงิน — เก็บแค่ตัวเลข แต่แสดงพร้อมลูกน้ำ
function handleMoneyInput(e: Event, setter: (v: string) => void) {
  const el = e.target as HTMLInputElement
  const digits = el.value.replace(/[^0-9]/g, '')
  setter(digits)
  el.value = digits ? Number(digits).toLocaleString('th-TH') : ''
}

// กรองอาชีพ — รับเฉพาะตัวอักษรไทย/อังกฤษ และช่องว่าง ห้ามตัวเลข/อักขระพิเศษ
function handleFamilyOccupationInput(e: Event) {
  const input = e.target as HTMLInputElement
  const filtered = input.value.replace(/[^ก-๙฀-๿a-zA-Z\s]/g, '')
  familyOccupation.value = filtered
  input.value = filtered
}

const familyOccupationError = computed(() => {
  const val = familyOccupation.value.trim()
  if (!val) return ''
  return /[^ก-๙฀-๿a-zA-Z\s]/.test(val)
    ? 'กรอกได้เฉพาะตัวอักษรไทยหรืออังกฤษเท่านั้น'
    : ''
})

// ─── Validation ───────────────────────────────────────────────────────────────
const isReady = computed(() => {
  if (!familyOccupation.value.trim()) return false
  if (!monthlyIncome.value) return false
  if (incomeSources.value.length === 0) return false
  // ถ้าเลือกตัวเลือก "อื่น ๆ" ต้องกรอกรายละเอียด
  if (incomeOtherVal.value && incomeSources.value.includes(incomeOtherVal.value) && !incomeSourceOther.value.trim()) return false
  if (caregiverOtherVal.value && caregiverRoles.value.includes(caregiverOtherVal.value) && !caregiverOther.value.trim()) return false
  if (govAidHistory.value === 'received') {
    if (!timesThisYear.value) return false
    if (!totalAmount.value) return false
    if (aidTypes.value.length === 0) return false
    // ตัวเลือกที่ต้องระบุรายละเอียด — ต้องกรอกก่อนจึงจะ ready
    for (const id of aidTypeDetailIds.value) {
      if (aidTypes.value.includes(id) && !(aidTypeDetails[id] ?? '').trim()) return false
    }
  }
  return true
})

const emit = defineEmits<{ 'update:ready': [boolean] }>()
watch(isReady, (val) => emit('update:ready', val), { immediate: true })

// ─── Pre-fill จาก store + ดึง lookup options จาก API ─────────────────────────
onMounted(async () => {
  // ดึง options ทั้งหมดพร้อมกัน — ถ้า API ล้มเหลวจะได้ [] และหน้าจอยังแสดงได้
  const [incomeSrcData, dependencyData, receivedWelfareData] = await Promise.all([
    lookupsApi.fetchIncomeSourceTypes().catch(() => []),
    lookupsApi.fetchDependencyTypes().catch(() => []),
    lookupsApi.fetchReceivedWelfareTypes().catch(() => []),
  ])
  incomeSourceOptions.value  = incomeSrcData.map(d => ({ value: String(d.id), label: d.name }))
  caregiverRoleOptions.value = dependencyData.map(d => ({ value: String(d.id), label: d.name }))
  aidTypeOptions.value       = receivedWelfareData.map(d => ({ value: String(d.id), label: d.name }))

  // Pre-fill จาก store เมื่อ user ย้อนกลับมาจาก step ถัดไป
  const s = app.step2
  if (s) {
    familyOccupation.value  = s.familyOccupation ?? ''
    monthlyIncome.value     = s.monthlyIncome    ?? ''
    incomeSources.value     = [...(s.incomeSources  ?? [])]
    incomeSourceOther.value = s.incomeSourceOther ?? ''
    caregiverRoles.value    = [...(s.caregiverRoles ?? [])]
    caregiverOther.value    = s.caregiverOther   ?? ''
    govAidHistory.value     = s.govAidHistory    ?? 'none'
    timesThisYear.value     = s.timesThisYear    ?? ''
    totalAmount.value       = s.totalAmount      ?? ''
    aidTypes.value = [...(s.aidTypes ?? [])]
    // restore รายละเอียดของแต่ละตัวเลือก
    Object.assign(aidTypeDetails, s.aidTypeDetails ?? {})
  }
})

defineExpose({
  getData: () => ({
    familyOccupation:      familyOccupation.value,
    familyOccupationOther: '',
    monthlyIncome:         monthlyIncome.value,
    incomeSources:      incomeSources.value,
    incomeSourceOther:  incomeSourceOther.value,
    caregiverRoles:     caregiverRoles.value,
    caregiverOther:     caregiverOther.value,
    govAidHistory:      govAidHistory.value,
    timesThisYear:      timesThisYear.value,
    totalAmount:        totalAmount.value,
    aidTypes:        aidTypes.value,
    aidTypeDetails:  { ...aidTypeDetails },
  }),
})
</script>

<template>
  <div class="space-y-4">

    <!-- ════════════════════════════════════════════════════════
         Section 6: เศรษฐกิจครอบครัว
         ════════════════════════════════════════════════════════ -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="flex items-center gap-3 bg-blue-50 px-4 py-3 border-b border-blue-100">
        <div class="w-8 h-8 rounded-full bg-[#1A56DB] flex items-center justify-center flex-shrink-0">
          <span class="text-white text-[13px] font-bold">6</span>
        </div>
        <p class="text-[14px] font-bold text-[#1A56DB]">เศรษฐกิจครอบครัว</p>
      </div>
      <div class="p-4">

        <!-- 6.1 อาชีพและรายได้ -->
        <div class="flex items-center gap-2 mb-3">
          <span class="bg-blue-100 text-[#1A56DB] text-[11px] font-bold px-2 py-0.5 rounded-md">6.1</span>
          <span class="text-[13px] font-medium text-slate-600">อาชีพและรายได้</span>
        </div>

        <!-- อาชีพหลักของครอบครัว -->
        <div class="mb-4">
          <label class="flex items-center gap-1 text-[13px] text-slate-600 mb-1.5 font-medium">
            <span>อาชีพหลักของครอบครัว <span class="text-red-500">*</span></span>
            <FieldAlert v-if="commentMap.has('family_occupation')" :reason="commentMap.get('family_occupation')!" />
          </label>
          <input
            :value="familyOccupation"
            @input="handleFamilyOccupationInput"
            type="text"
            placeholder="เช่น เกษตรกร, รับจ้างทั่วไป, ค้าขาย"
            class="w-full border rounded-xl px-4 py-3 text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
            :class="familyOccupationError ? 'border-red-300' : 'border-slate-200'"
          />
          <p v-if="familyOccupationError" class="text-[12px] text-red-500 mt-1 px-1">{{ familyOccupationError }}</p>
        </div>

        <div>
          <label class="flex items-center gap-1 text-[13px] text-slate-600 mb-1.5 font-medium">
            <span>รายได้เฉลี่ยต่อเดือนของครอบครัว (บาท) <span class="text-red-500">*</span></span>
            <FieldAlert v-if="commentMap.has('family_income')" :reason="commentMap.get('family_income')!" />
          </label>
          <div class="relative">
            <input
              :value="formatMoney(monthlyIncome)"
              @input="handleMoneyInput($event, (v) => (monthlyIncome = v))"
              type="text"
              inputmode="numeric"
              placeholder="0"
              class="w-full border border-slate-200 rounded-xl px-4 py-3 pr-16 text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
            />
            <span class="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[13px] text-slate-400">บาท</span>
          </div>
        </div>

        <div class="h-px bg-slate-100 my-4" />

        <!-- 6.2 ที่มาของรายได้ -->
        <div class="flex items-center gap-2 mb-1.5">
          <span class="bg-blue-100 text-[#1A56DB] text-[11px] font-bold px-2 py-0.5 rounded-md">6.2</span>
          <span class="text-[13px] font-medium text-slate-600">ที่มาของรายได้</span>
          <FieldAlert v-if="commentMap.has('income_sources')" :reason="commentMap.get('income_sources')!" />
        </div>
        <p class="text-[12px] text-slate-500 mb-3">เลือกได้หลายข้อ <span class="text-red-500">*</span></p>

        <div class="space-y-2">
          <label
            v-for="opt in incomeSourceOptions"
            :key="opt.value"
            class="flex items-center gap-3 border rounded-xl px-4 py-3 cursor-pointer transition-all duration-150"
            :class="incomeSources.includes(opt.value) ? 'border-[#1A56DB] bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'"
            @click.prevent="toggleItem(incomeSources, opt.value)"
          >
            <div
              class="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all duration-150"
              :class="incomeSources.includes(opt.value) ? 'bg-[#1A56DB] border-[#1A56DB]' : 'bg-white border-slate-300'"
            >
              <svg v-if="incomeSources.includes(opt.value)" class="w-[11px] h-[11px] text-white" viewBox="0 0 12 10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="1,5 4.5,9 11,1" />
              </svg>
            </div>
            <span class="text-[14px] transition-colors" :class="incomeSources.includes(opt.value) ? 'text-[#1A56DB] font-medium' : 'text-slate-700'">
              {{ opt.label }}
            </span>
          </label>
        </div>

        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          enter-from-class="opacity-0 -translate-y-1"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition-all duration-150 ease-in"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 -translate-y-1"
        >
          <div v-if="incomeOtherVal && incomeSources.includes(incomeOtherVal)" class="mt-3">
            <label class="flex items-center gap-1 text-[13px] text-slate-600 mb-1.5 font-medium">
              <span>ระบุที่มาของรายได้อื่น ๆ <span class="text-red-500">*</span></span>
              <FieldAlert v-if="commentMap.has('income_source_other')" :reason="commentMap.get('income_source_other')!" />
            </label>
            <input
              v-model="incomeSourceOther"
              type="text"
              placeholder="ระบุรายละเอียด"
              class="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
            />
          </div>
        </Transition>

      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════
         Section 7: การอุปการะ
         ════════════════════════════════════════════════════════ -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="flex items-center gap-3 bg-blue-50 px-4 py-3 border-b border-blue-100">
        <div class="w-8 h-8 rounded-full bg-[#1A56DB] flex items-center justify-center flex-shrink-0">
          <span class="text-white text-[13px] font-bold">7</span>
        </div>
        <p class="text-[14px] font-bold text-[#1A56DB]">การอุปการะ</p>
      </div>
      <div class="p-4">

        <!-- 7.1 ภาระการอุปการะ -->
        <div class="flex items-center gap-2 mb-1.5">
          <span class="bg-blue-100 text-[#1A56DB] text-[11px] font-bold px-2 py-0.5 rounded-md">7.1</span>
          <span class="text-[13px] font-medium text-slate-600">ภาระการอุปการะ</span>
          <FieldAlert v-if="commentMap.has('dependents')" :reason="commentMap.get('dependents')!" />
        </div>
        <p class="text-[12px] text-slate-500 mb-3">เลือกได้หลายข้อ</p>

        <div class="space-y-2">
          <label
            v-for="opt in caregiverRoleOptions"
            :key="opt.value"
            class="flex items-center gap-3 border rounded-xl px-4 py-3 cursor-pointer transition-all duration-150"
            :class="caregiverRoles.includes(opt.value) ? 'border-[#1A56DB] bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'"
            @click.prevent="toggleItem(caregiverRoles, opt.value)"
          >
            <div
              class="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all duration-150"
              :class="caregiverRoles.includes(opt.value) ? 'bg-[#1A56DB] border-[#1A56DB]' : 'bg-white border-slate-300'"
            >
              <svg v-if="caregiverRoles.includes(opt.value)" class="w-[11px] h-[11px] text-white" viewBox="0 0 12 10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="1,5 4.5,9 11,1" />
              </svg>
            </div>
            <span class="text-[14px] transition-colors" :class="caregiverRoles.includes(opt.value) ? 'text-[#1A56DB] font-medium' : 'text-slate-700'">
              {{ opt.label }}
            </span>
          </label>
        </div>

        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          enter-from-class="opacity-0 -translate-y-1"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition-all duration-150 ease-in"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 -translate-y-1"
        >
          <div v-if="caregiverOtherVal && caregiverRoles.includes(caregiverOtherVal)" class="mt-3">
            <label class="flex items-center gap-1 text-[13px] text-slate-600 mb-1.5 font-medium">
              <span>ระบุการอุปการะอื่น ๆ <span class="text-red-500">*</span></span>
              <FieldAlert v-if="commentMap.has('dependents_other')" :reason="commentMap.get('dependents_other')!" />
            </label>
            <input
              v-model="caregiverOther"
              type="text"
              placeholder="ระบุรายละเอียด"
              class="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
            />
          </div>
        </Transition>

      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════
         Section 8: การได้รับความช่วยเหลือจากรัฐ/ราชการ
         ════════════════════════════════════════════════════════ -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="flex items-center gap-3 bg-blue-50 px-4 py-3 border-b border-blue-100">
        <div class="w-8 h-8 rounded-full bg-[#1A56DB] flex items-center justify-center flex-shrink-0">
          <span class="text-white text-[13px] font-bold">8</span>
        </div>
        <p class="text-[14px] font-bold text-[#1A56DB]">การได้รับความช่วยเหลือจากรัฐ/ราชการ</p>
      </div>
      <div class="p-4">

        <!-- 8.1 ประวัติการได้รับ -->
        <div class="flex items-center gap-2 mb-3">
          <span class="bg-blue-100 text-[#1A56DB] text-[11px] font-bold px-2 py-0.5 rounded-md">8.1</span>
          <span class="text-[13px] font-medium text-slate-600">ประวัติการได้รับ</span>
          <FieldAlert v-if="commentMap.has('gov_aid_received')" :reason="commentMap.get('gov_aid_received')!" />
        </div>

        <div class="flex gap-3">
          <button
            v-for="opt in [{ value: 'none', label: 'ไม่เคย' }, { value: 'received', label: 'เคย' }]"
            :key="opt.value"
            type="button"
            @click="govAidHistory = opt.value as 'none' | 'received'"
            class="flex-1 py-3 rounded-xl border-2 text-[14px] font-semibold transition-all duration-150 active:scale-[0.98]"
            :class="govAidHistory === opt.value
              ? 'border-[#1A56DB] bg-blue-50 text-[#1A56DB]'
              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'"
          >
            {{ opt.label }}
          </button>
        </div>

        <!-- 8.2 + 8.3 แสดงเฉพาะเมื่อเลือก "เคย" -->
        <Transition
          enter-active-class="transition-all duration-300 ease-out"
          enter-from-class="opacity-0 -translate-y-2"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition-all duration-200 ease-in"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 -translate-y-2"
        >
          <div v-if="govAidHistory === 'received'" class="mt-4 pt-4 border-t border-slate-100 space-y-4">

            <!-- 8.2 มูลค่าความช่วยเหลือเดิม -->
            <div>
              <div class="flex items-center gap-2 mb-3">
                <span class="bg-blue-100 text-[#1A56DB] text-[11px] font-bold px-2 py-0.5 rounded-md">8.2</span>
                <span class="text-[13px] font-medium text-slate-600">มูลค่าความช่วยเหลือเดิม</span>
              </div>

              <div class="flex gap-3">
                <div class="flex-1">
                  <label class="flex items-center gap-1 text-[12px] text-slate-600 mb-1.5 font-medium">
                    <span>จำนวนครั้งในปีงบประมาณนี้ <span class="text-red-500">*</span></span>
                    <FieldAlert v-if="commentMap.has('gov_aid_count')" :reason="commentMap.get('gov_aid_count')!" />
                  </label>
                  <div class="relative">
                    <input
                      :value="timesThisYear"
                      @input="handleNumericInput($event, (v) => (timesThisYear = v))"
                      type="text"
                      inputmode="numeric"
                      pattern="[0-9]*"
                      placeholder="0"
                      class="w-full border border-slate-200 rounded-xl px-3 py-2.5 pr-10 text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
                    />
                    <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-slate-400">ครั้ง</span>
                  </div>
                </div>
                <div class="flex-1">
                  <label class="flex items-center gap-1 text-[12px] text-slate-600 mb-1.5 font-medium">
                    <span>รวมเป็นเงิน (บาท) <span class="text-red-500">*</span></span>
                    <FieldAlert v-if="commentMap.has('gov_aid_amount')" :reason="commentMap.get('gov_aid_amount')!" />
                  </label>
                  <div class="relative">
                    <input
                      :value="formatMoney(totalAmount)"
                      @input="handleMoneyInput($event, (v) => (totalAmount = v))"
                      type="text"
                      inputmode="numeric"
                      placeholder="0"
                      class="w-full border border-slate-200 rounded-xl px-3 py-2.5 pr-10 text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
                    />
                    <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-slate-400">บาท</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 8.3 ประเภทความช่วยเหลือที่เคยได้รับ -->
            <div>
              <div class="flex items-center gap-2 mb-1.5">
                <span class="bg-blue-100 text-[#1A56DB] text-[11px] font-bold px-2 py-0.5 rounded-md">8.3</span>
                <span class="text-[13px] font-medium text-slate-600">ประเภทความช่วยเหลือที่เคยได้รับ</span>
                <FieldAlert v-if="commentMap.has('gov_aid_types')" :reason="commentMap.get('gov_aid_types')!" />
              </div>
              <p class="text-[12px] text-slate-500 mb-3">เลือกได้หลายข้อ <span class="text-red-500">*</span></p>

              <div class="space-y-2">
                <!-- แต่ละตัวเลือก — ถ้าเป็นตัวที่ต้องระบุรายละเอียดและถูกเลือก จะแสดงช่อง input ใต้นั้นเลย -->
                <div v-for="opt in aidTypeOptions" :key="opt.value">
                  <label
                    class="flex items-center gap-3 border rounded-xl px-4 py-3 cursor-pointer transition-all duration-150"
                    :class="aidTypes.includes(opt.value) ? 'border-[#1A56DB] bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'"
                    @click.prevent="toggleItem(aidTypes, opt.value)"
                  >
                    <div
                      class="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all duration-150"
                      :class="aidTypes.includes(opt.value) ? 'bg-[#1A56DB] border-[#1A56DB]' : 'bg-white border-slate-300'"
                    >
                      <svg v-if="aidTypes.includes(opt.value)" class="w-[11px] h-[11px] text-white" viewBox="0 0 12 10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <polyline points="1,5 4.5,9 11,1" />
                      </svg>
                    </div>
                    <span class="text-[14px] leading-snug transition-colors" :class="aidTypes.includes(opt.value) ? 'text-[#1A56DB] font-medium' : 'text-slate-700'">
                      {{ opt.label }}
                    </span>
                  </label>

                  <!-- ช่องระบุรายละเอียด — แสดงใต้ตัวเลือกนั้นๆ ทันทีเมื่อถูกเลือก -->
                  <Transition
                    enter-active-class="transition-all duration-200 ease-out"
                    enter-from-class="opacity-0 -translate-y-1"
                    enter-to-class="opacity-100 translate-y-0"
                    leave-active-class="transition-all duration-150 ease-in"
                    leave-from-class="opacity-100 translate-y-0"
                    leave-to-class="opacity-0 -translate-y-1"
                  >
                    <div
                      v-if="aidTypeDetailIds.includes(opt.value) && aidTypes.includes(opt.value)"
                      class="mt-2 pl-2"
                    >
                      <label class="flex items-center gap-1 text-[13px] text-slate-600 mb-1.5 font-medium">
                        <span>ระบุรายละเอียด <span class="text-red-500">*</span></span>
                        <FieldAlert v-if="commentMap.has('gov_aid_type_detail')" :reason="commentMap.get('gov_aid_type_detail')!" />
                      </label>
                      <input
                        :value="aidTypeDetails[opt.value] ?? ''"
                        @input="aidTypeDetails[opt.value] = ($event.target as HTMLInputElement).value"
                        type="text"
                        placeholder="ระบุรายละเอียด"
                        class="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
                      />
                    </div>
                  </Transition>
                </div>
              </div>

            </div>

          </div>
        </Transition>

      </div>
    </div>

  </div>
</template>
