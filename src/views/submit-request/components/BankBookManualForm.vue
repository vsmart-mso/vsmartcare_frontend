<script setup lang="ts">
/**
 * BankBookManualForm — ฟอร์มกรอกข้อมูลบัญชีเอง (ใช้เมื่อ OCR ไม่ผ่าน)
 *
 * ผู้ใช้เลือก "กรอกข้อมูลเอง" จาก Modal ตัดสินใจ → แสดงฟอร์มนี้
 * เขียนค่าลง store โดยตรง (setBankInfo) + แจ้งความครบถ้วนผ่าน setBankManualValid
 * ชื่อบัญชีต้อง match ชื่อ ThaiD (validate ฝั่ง frontend — ดู utils/thaiName)
 */
import { ref, computed, watch } from 'vue'
import SearchableSelect from '@/components/SearchableSelect.vue'
import { useApplicationStore } from '@/stores/application'
import { bankNameMatchesThaiD } from '@/utils/thaiName'

const app = useApplicationStore()

const props = defineProps<{
  bankOptions: { value: string; label: string }[]
  accountTypeOptions: { value: string; label: string }[]
  thaiD: { title?: string; fname?: string; lname?: string } | null
}>()

// ─── Field state ──────────────────────────────────────────────────────────────
// hydrate จาก store ตอน setup (ก่อน watch ยิง) — กันข้อมูลหายเมื่อกด Next/Prev กลับมา
// ค่า OCR เก่าถูกล้างที่ Step4.chooseManual() ตอนเข้าโหมดครั้งแรกแล้ว จึง hydrate ได้ปลอดภัย
const s0 = app.step3
const bankNameId    = ref(s0?.bankNameId ?? '')
const accountNumber = ref(s0?.bankAccount ?? '')
const accountTypeId = ref(s0?.bankAccountTypeId ?? '')
const branchName    = ref(s0?.bankBranchName ?? '')
// ชื่อบัญชีไม่เก็บใน store (validate frontend เท่านั้น) — prefill จาก ThaiD ทุกครั้ง (ต้อง match)
const accountName   = ref(
  props.thaiD?.fname && props.thaiD?.lname ? `${props.thaiD.fname} ${props.thaiD.lname}` : '',
)

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
// เลขบัญชีธนาคารไทย 10-15 หลัก — สั้นกว่านี้ถือว่ากรอกไม่ครบ
const ACCOUNT_MIN_LEN = 10

const nameMatches = computed(() => bankNameMatchesThaiD(accountName.value, props.thaiD))
const accountNumberDigits = computed(() => accountNumber.value.replace(/\D/g, ''))

// strip อักขระที่ไม่ใช่ตัวเลขทันทีที่พิมพ์ (กันตัวอักษร/ช่องว่าง/ขีด)
function onAccountInput() {
  const digits = accountNumber.value.replace(/\D/g, '')
  if (digits !== accountNumber.value) accountNumber.value = digits
  markTouched()
}

const errors = computed(() => ({
  bank:        !bankNameId.value,
  account:     accountNumberDigits.value.length < ACCOUNT_MIN_LEN,
  name:        !accountName.value.trim() || !nameMatches.value,
  accountType: !accountTypeId.value,
  branch:      !branchName.value.trim(),
}))

const isComplete = computed(() => !Object.values(errors.value).some(Boolean))

// ─── Sync ลง store ────────────────────────────────────────────────────────────
// immediate: true → เขียนค่าที่ hydrate มากลับลง store ทันที (normalize เลขบัญชีเป็น digit)
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
        @input="onAccountInput"
        @blur="markTouched"
      />
      <p v-if="touched && errors.account && accountNumberDigits.length > 0" class="text-micro text-red-500 mt-1">
        เลขที่บัญชีต้องมีอย่างน้อย {{ ACCOUNT_MIN_LEN }} หลัก
      </p>
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
