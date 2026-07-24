<script setup lang="ts">
/**
 * BankBookManualForm — ฟอร์มกรอกข้อมูลบัญชีเอง (ใช้เมื่อ OCR ไม่ผ่าน)
 *
 * ผู้ใช้เลือก "กรอกข้อมูลเอง" จาก Modal ตัดสินใจ → แสดงฟอร์มนี้
 * เขียนค่าลง store โดยตรง (setBankInfo) + แจ้งความครบถ้วนผ่าน setBankManualValid
 * ชื่อบัญชีต้อง match ชื่อ ThaiD (validate ฝั่ง frontend — ดู utils/thaiName)
 */
import { ref, computed, watch, onMounted } from 'vue'
import SearchableSelect from '@/components/SearchableSelect.vue'
import { useApplicationStore } from '@/stores/application'
import { bankNameMatchesThaiD } from '@/utils/thaiName'

const app = useApplicationStore()

const props = defineProps<{
  bankOptions: { value: string; label: string }[]
  accountTypeOptions: { value: string; label: string }[]
  thaiD: { title?: string; fname?: string; lname?: string } | null
}>()

// ─── Field state — เริ่มว่างทุกช่อง (ไม่ prefill ค่า OCR เพราะ OCR อ่านผิด/ไม่ครบ)
// ยกเว้นชื่อบัญชีที่ prefill จาก ThaiD ตอน onMounted (ยังไงก็ต้อง match ThaiD)
const bankNameId    = ref('')
const accountNumber = ref('')
const accountName   = ref('')
const accountTypeId = ref('')
const branchName    = ref('')

const touched = ref(false)

const bankOptionsWithHint = computed(() => [
  { value: '', label: '-- เลือกธนาคาร --' },
  ...props.bankOptions,
])
const accountTypeOptionsWithHint = computed(() => [
  { value: '', label: '-- เลือกประเภทเงินฝาก --' },
  ...props.accountTypeOptions,
])

// ─── Validation ───────────────────────────────────────────────────────────────
const nameMatches = computed(() => bankNameMatchesThaiD(accountName.value, props.thaiD))
const accountNumberDigits = computed(() => accountNumber.value.replace(/\D/g, ''))

const errors = computed(() => ({
  bank:        !bankNameId.value,
  account:     !accountNumberDigits.value,
  name:        !accountName.value.trim() || !nameMatches.value,
  accountType: !accountTypeId.value,
  branch:      !branchName.value.trim(),
}))

const isComplete = computed(() => !Object.values(errors.value).some(Boolean))

// ─── Sync ลง store ────────────────────────────────────────────────────────────
// immediate: true → ล้างค่า OCR เก่าใน store ทันทีที่เข้าโหมดกรอกเอง (กันส่งค่าที่ OCR อ่านผิด)
watch(
  [bankNameId, accountNumberDigits, accountTypeId, branchName],
  () => {
    app.setBankInfo(
      bankNameId.value,
      accountNumberDigits.value,
      accountTypeId.value,
      branchName.value.trim(),
    )
  },
  { immediate: true },
)

watch(isComplete, (v) => app.setBankManualValid(v), { immediate: true })

// prefill ชื่อบัญชีจาก ThaiD (ผู้ใช้แก้ได้ แต่ต้อง match)
onMounted(() => {
  if (props.thaiD?.fname && props.thaiD?.lname) {
    accountName.value = `${props.thaiD.fname} ${props.thaiD.lname}`
  }
  app.setBankManualValid(isComplete.value)
})

function markTouched() { touched.value = true }
defineExpose({ touchAll: () => { touched.value = true } })
</script>

<template>
  <div class="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-3 space-y-3">
    <div class="flex items-center gap-2">
      <svg class="w-4 h-4 text-[#1A56DB] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
      <p class="text-body-xs font-semibold text-slate-700">กรอกข้อมูลบัญชีด้วยตนเอง</p>
    </div>

    <!-- ธนาคาร -->
    <div>
      <label class="block text-body-xs font-medium text-slate-600 mb-1">
        ธนาคาร <span class="text-red-500">*</span>
      </label>
      <SearchableSelect
        v-model="bankNameId"
        :options="bankOptionsWithHint"
        placeholder="เลือกธนาคาร"
        :disabled="bankOptions.length === 0"
        :has-error="touched && errors.bank"
        @change="markTouched"
      />
    </div>

    <!-- เลขที่บัญชี -->
    <div>
      <label class="block text-body-xs font-medium text-slate-600 mb-1">
        เลขที่บัญชี <span class="text-red-500">*</span>
      </label>
      <input
        v-model="accountNumber"
        type="text"
        inputmode="numeric"
        maxlength="15"
        placeholder="กรอกเลขที่บัญชี (ตัวเลขเท่านั้น)"
        class="w-full rounded-lg border px-3 py-2 text-body-xs focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30"
        :class="touched && errors.account ? 'border-red-300' : 'border-slate-200'"
        @blur="markTouched"
      />
    </div>

    <!-- ชื่อบัญชี -->
    <div>
      <label class="block text-body-xs font-medium text-slate-600 mb-1">
        ชื่อบัญชี <span class="text-red-500">*</span>
      </label>
      <input
        v-model="accountName"
        type="text"
        placeholder="ชื่อ-นามสกุลเจ้าของบัญชี"
        class="w-full rounded-lg border px-3 py-2 text-body-xs focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30"
        :class="(touched || accountName.trim()) && errors.name ? 'border-red-300' : 'border-slate-200'"
        @input="markTouched"
        @blur="markTouched"
      />
      <p v-if="accountName.trim() && !nameMatches" class="text-micro text-red-500 mt-1">
        ชื่อบัญชีต้องตรงกับชื่อผู้ยื่นคำขอ (ตามข้อมูล ThaiD)
      </p>
    </div>

    <!-- ประเภทเงินฝาก -->
    <div>
      <label class="block text-body-xs font-medium text-slate-600 mb-1">
        ประเภทเงินฝาก <span class="text-red-500">*</span>
      </label>
      <SearchableSelect
        v-model="accountTypeId"
        :options="accountTypeOptionsWithHint"
        placeholder="เลือกประเภทเงินฝาก"
        :disabled="accountTypeOptions.length === 0"
        :has-error="touched && errors.accountType"
        @change="markTouched"
      />
    </div>

    <!-- สาขา -->
    <div>
      <label class="block text-body-xs font-medium text-slate-600 mb-1">
        สาขา <span class="text-red-500">*</span>
      </label>
      <input
        v-model="branchName"
        type="text"
        placeholder="ชื่อสาขา"
        class="w-full rounded-lg border px-3 py-2 text-body-xs focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30"
        :class="touched && errors.branch ? 'border-red-300' : 'border-slate-200'"
        @blur="markTouched"
      />
    </div>
  </div>
</template>
