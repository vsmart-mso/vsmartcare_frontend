<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useApplicationStore } from '@/stores/application'

const app = useApplicationStore()

// ─── 6.1 อาชีพและรายได้ ───────────────────────────────────────────────────────
const occupation = ref('')
const occupationOther = ref('')       // ระบุเพิ่มเติมเมื่อเลือก "อื่น ๆ" (อาชีพหลัก)
const familyOccupation = ref('')      // economic_infos.family_occupation
const familyOccupationOther = ref('') // ระบุเพิ่มเติมเมื่อเลือก "อื่น ๆ" (อาชีพในครอบครัว)
const occupationOptions = [
  { value: 'general_labor',  label: 'รับจ้างทั่วไป' },
  { value: 'farmer',         label: 'เกษตรกร' },
  { value: 'merchant',       label: 'ค้าขาย' },
  { value: 'private_employee', label: 'พนักงานบริษัท' },
  { value: 'government',     label: 'ข้าราชการ/รัฐวิสาหกิจ' },
  { value: 'unemployed',     label: 'ว่างงาน' },
  { value: 'other',          label: 'อื่น ๆ' },
]
const monthlyIncome = ref('')

// ─── 6.2 ที่มาของรายได้ ───────────────────────────────────────────────────────
const incomeSources   = ref<string[]>([])
const incomeSourceOther = ref('')
const incomeSourceOptions = [
  { value: 'employment',        label: 'การประกอบอาชีพ' },
  { value: 'family_support',    label: 'บุตร / ผู้อุปการะ' },
  { value: 'government_welfare', label: 'สวัสดิการของรัฐ' },
  { value: 'other',             label: 'อื่น ๆ ระบุ' },
]

// ─── 7.1 ภาระการอุปการะ ───────────────────────────────────────────────────────
const caregiverRoles = ref<string[]>([])
const caregiverOther = ref('')
const caregiverRoleOptions = [
  { value: 'parents',   label: 'อุปการะเลี้ยงดูบิดามารดา' },
  { value: 'children',  label: 'อุปการะเลี้ยงดูบุตร' },
  { value: 'elderly',   label: 'อุปการะเลี้ยงดูผู้สูงอายุ' },
  { value: 'disabled',  label: 'อุปการะเลี้ยงดูคนพิการหรือคนทุพพลภาพ' },
  { value: 'other',     label: 'อื่น ๆ ระบุ' },
]

// ─── 8.1 ประวัติการได้รับความช่วยเหลือจากรัฐ ─────────────────────────────────
const govAidHistory = ref<'none' | 'received'>('none')

// ─── 8.2 มูลค่าความช่วยเหลือเดิม (แสดงเมื่อ "เคย") ───────────────────────────
const timesThisYear = ref('')
const totalAmount   = ref('')

// ─── 8.3 ประเภทความช่วยเหลือที่เคยได้รับ ─────────────────────────────────────
const aidTypes = ref<string[]>([])
const aidTypeOther = ref('')
const aidTypeOptions = [
  { value: 'relief_money',         label: 'เงินสงเคราะห์' },
  { value: 'occupation_fund',      label: 'เงินทุนประกอบอาชีพ' },
  { value: 'elderly_allowance',    label: 'เบี้ยผู้สูงอายุ (เบี้ยยังชีพผู้สูงอายุ)' },
  { value: 'disability_allowance', label: 'เบี้ยคนพิการ (เบี้ยความพิการ)' },
  { value: 'newborn_support',      label: 'เงินเด็กแรกเกิด (เงินอุดหนุนเพื่อการเลี้ยงดูเด็กแรกเกิด)' },
  { value: 'welfare_card',         label: 'บัตรคนจน (สวัสดิการที่ได้จากการลงทะเบียนโครงการเพื่อสวัสดิการแห่งรัฐ)' },
  { value: 'house_repair',         label: 'เงินซ่อมบ้าน (เงินซ่อมแซมบ้าน)' },
  { value: 'other_govt',           label: 'ความช่วยเหลืออื่นจากภาครัฐ' },
  { value: 'other_private',        label: 'ความช่วยเหลืออื่นจากภาคเอกชน' },
  { value: 'loan',                 label: 'เงินกู้' },
  { value: 'disability_equipment', label: 'เครื่องช่วยความพิการ' },
  { value: 'other',                label: 'อื่น ๆ' },
]

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

// ─── Validation ───────────────────────────────────────────────────────────────
const isReady = computed(() => {
  if (!occupation.value) return false
  if (occupation.value === 'other' && !occupationOther.value.trim()) return false
  if (!monthlyIncome.value) return false
  if (incomeSources.value.length === 0) return false
  if (incomeSources.value.includes('other') && !incomeSourceOther.value.trim()) return false
  if (caregiverRoles.value.includes('other') && !caregiverOther.value.trim()) return false
  if (govAidHistory.value === 'received') {
    if (!timesThisYear.value) return false
    if (!totalAmount.value) return false
    if (aidTypes.value.length === 0) return false
    if (aidTypes.value.includes('other') && !aidTypeOther.value.trim()) return false
  }
  return true
})

const emit = defineEmits<{ 'update:ready': [boolean] }>()
watch(isReady, (val) => emit('update:ready', val), { immediate: true })

// ─── Pre-fill จาก store เมื่อ user ย้อนกลับมาจาก step ถัดไป ─────────────────
onMounted(() => {
  const s = app.step2
  if (s) {
    occupation.value            = s.occupation            ?? ''
    occupationOther.value       = s.occupationOther       ?? ''
    familyOccupation.value      = s.familyOccupation      ?? ''
    familyOccupationOther.value = s.familyOccupationOther ?? ''
    monthlyIncome.value         = s.monthlyIncome         ?? ''
    incomeSources.value         = [...(s.incomeSources    ?? [])]
    incomeSourceOther.value     = s.incomeSourceOther     ?? ''
    caregiverRoles.value        = [...(s.caregiverRoles   ?? [])]
    caregiverOther.value        = s.caregiverOther        ?? ''
    govAidHistory.value         = s.govAidHistory         ?? 'none'
    timesThisYear.value         = s.timesThisYear         ?? ''
    totalAmount.value           = s.totalAmount           ?? ''
    aidTypes.value              = [...(s.aidTypes         ?? [])]
    aidTypeOther.value          = s.aidTypeOther          ?? ''
  } else if (app.checkSelf?.occupation) {
    // ถ้ายังไม่มี step2 แต่มี checkSelf ให้ pre-fill occupation จาก checkSelf
    occupation.value = app.checkSelf.occupation
  }
})

defineExpose({
  getData: () => ({
    occupation:             occupation.value,
    occupationOther:        occupationOther.value,
    familyOccupation:       familyOccupation.value,
    familyOccupationOther:  familyOccupationOther.value,
    monthlyIncome:      monthlyIncome.value,
    incomeSources:      incomeSources.value,
    incomeSourceOther:  incomeSourceOther.value,
    caregiverRoles:     caregiverRoles.value,
    caregiverOther:     caregiverOther.value,
    govAidHistory:      govAidHistory.value,
    timesThisYear:      timesThisYear.value,
    totalAmount:        totalAmount.value,
    aidTypes:           aidTypes.value,
    aidTypeOther:       aidTypeOther.value,
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

        <div class="mb-4">
          <label class="block text-[13px] text-slate-600 mb-1.5 font-medium">
            อาชีพหลักของครอบครัว <span class="text-red-500">*</span>
          </label>
          <div class="relative">
            <select
              v-model="occupation"
              class="w-full appearance-none bg-white border border-slate-200 rounded-xl px-4 py-3 text-[14px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB] transition-colors"
              :class="occupation ? 'border-slate-300' : 'border-slate-200'"
            >
              <option value="" disabled>— กรุณาเลือกอาชีพ —</option>
              <option v-for="opt in occupationOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
            <div class="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
              <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          <!-- ช่องพิมพ์ระบุเพิ่มเติม เมื่อเลือก "อื่น ๆ" -->
          <Transition
            enter-active-class="transition-all duration-200 ease-out"
            enter-from-class="opacity-0 -translate-y-1"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition-all duration-150 ease-in"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 -translate-y-1"
          >
            <div v-if="occupation === 'other'" class="mt-3">
              <label class="block text-[13px] text-slate-600 mb-1.5 font-medium">
                ระบุอาชีพหลักของครอบครัว <span class="text-red-500">*</span>
              </label>
              <input
                v-model="occupationOther"
                type="text"
                placeholder="ระบุรายละเอียด"
                class="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
              />
            </div>
          </Transition>
        </div>

        <!-- 6.1.2 อาชีพของคนในครอบครัว (family_occupation) -->
        <div class="mb-4">
          <label class="block text-[13px] text-slate-600 mb-1.5 font-medium">
            อาชีพของคนในครอบครัว
          </label>
          <!-- dropdown เหมือนกับ "อาชีพหลักของครอบครัว" -->
          <div class="relative">
            <select
              v-model="familyOccupation"
              class="w-full appearance-none bg-white border border-slate-200 rounded-xl px-4 py-3 text-[14px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB] transition-colors"
              :class="familyOccupation ? 'border-slate-300' : 'border-slate-200'"
            >
              <option value="" disabled>— กรุณาเลือกอาชีพ —</option>
              <option v-for="opt in occupationOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
            <div class="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
              <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          <!-- ช่องพิมพ์ระบุเพิ่มเติม เมื่อเลือก "อื่น ๆ" -->
          <Transition
            enter-active-class="transition-all duration-200 ease-out"
            enter-from-class="opacity-0 -translate-y-1"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition-all duration-150 ease-in"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 -translate-y-1"
          >
            <div v-if="familyOccupation === 'other'" class="mt-3">
              <label class="block text-[13px] text-slate-600 mb-1.5 font-medium">
                ระบุอาชีพของคนในครอบครัว
              </label>
              <input
                v-model="familyOccupationOther"
                type="text"
                placeholder="ระบุรายละเอียด"
                class="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
              />
            </div>
          </Transition>
        </div>

        <div>
          <label class="block text-[13px] text-slate-600 mb-1.5 font-medium">
            รายได้เฉลี่ยต่อเดือนของครอบครัว (บาท) <span class="text-red-500">*</span>
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
          <div v-if="incomeSources.includes('other')" class="mt-3">
            <label class="block text-[13px] text-slate-600 mb-1.5 font-medium">
              ระบุที่มาของรายได้อื่น ๆ <span class="text-red-500">*</span>
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
          <div v-if="caregiverRoles.includes('other')" class="mt-3">
            <label class="block text-[13px] text-slate-600 mb-1.5 font-medium">
              ระบุการอุปการะอื่น ๆ <span class="text-red-500">*</span>
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
                  <label class="block text-[12px] text-slate-600 mb-1.5 font-medium">
                    จำนวนครั้งในปีงบประมาณนี้ <span class="text-red-500">*</span>
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
                  <label class="block text-[12px] text-slate-600 mb-1.5 font-medium">
                    รวมเป็นเงิน (บาท) <span class="text-red-500">*</span>
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
              </div>
              <p class="text-[12px] text-slate-500 mb-3">เลือกได้หลายข้อ <span class="text-red-500">*</span></p>

              <div class="space-y-2">
                <label
                  v-for="opt in aidTypeOptions"
                  :key="opt.value"
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
              </div>

              <!-- ช่องระบุรายละเอียด เมื่อเลือก "อื่น ๆ" -->
              <Transition
                enter-active-class="transition-all duration-200 ease-out"
                enter-from-class="opacity-0 -translate-y-1"
                enter-to-class="opacity-100 translate-y-0"
                leave-active-class="transition-all duration-150 ease-in"
                leave-from-class="opacity-100 translate-y-0"
                leave-to-class="opacity-0 -translate-y-1"
              >
                <div v-if="aidTypes.includes('other')" class="mt-3">
                  <label class="block text-[13px] text-slate-600 mb-1.5 font-medium">
                    ระบุความช่วยเหลืออื่น ๆ <span class="text-red-500">*</span>
                  </label>
                  <input
                    v-model="aidTypeOther"
                    type="text"
                    placeholder="ระบุรายละเอียด"
                    class="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]"
                  />
                </div>
              </Transition>

            </div>

          </div>
        </Transition>

      </div>
    </div>

  </div>
</template>
