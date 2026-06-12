<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useApplicationStore } from '@/stores/application'
import FieldAlert from '@/components/ui/FieldAlert.vue'
import StepFormSkeleton from '../components/StepFormSkeleton.vue'

const app = useApplicationStore()

// ─── สถานะการโหลด ──────────────────────────────────────────────────────────────
// Section 10 ใช้ static checkboxes (ไม่ fetch API) จึงเริ่มต้นที่ false เสมอ
const isLoading = ref(false)

// ─── filterFields prop ────────────────────────────────────────────────────────
const props = defineProps<{ filterFields?: string[] }>()
const show = (name: string): boolean => !props.filterFields || props.filterFields.includes(name)

const commentMap = computed(() => {
  const m = new Map<string, string>()
  for (const c of app.reviewComments) m.set(c.name, c.reason)
  return m
})

// ─── 9.1 รายละเอียดปัญหา ─────────────────────────────────────────────────────
const problemDescription = ref('')

// ─── 10.1 ประเภทความช่วยเหลือ ────────────────────────────────────────────────
const aidTypes     = ref<string[]>(['1'])   // ['1'] = ล็อก "ช่วยเหลือเป็นเงิน" ให้เลือกไว้เสมอ
const aidOtherText  = ref('')   // รายละเอียดเพิ่มเติมเมื่อเลือก "ช่วยเหลือเรื่องอื่นๆ" (id=3)
const aidInKindText = ref('')   // รายละเอียดเพิ่มเติมเมื่อเลือก "ช่วยเหลือเป็นสิ่งของ" (id=2)

// seed data: id=1 เงิน, id=2 สิ่งของ, id=3 อื่นๆ
const MONEY_AID_TYPE_ID   = '1'
const IN_KIND_AID_TYPE_ID = '2'
const OTHER_AID_TYPE_ID   = '3'

const isInKindAidSelected  = computed(() => aidTypes.value.includes(IN_KIND_AID_TYPE_ID))
const isOtherAidSelected   = computed(() => aidTypes.value.includes(OTHER_AID_TYPE_ID))

function toggleAidType(value: string) {
  // "ช่วยเหลือเป็นเงิน" ถูกล็อกไว้ — ห้ามถอดออก
  if (value === MONEY_AID_TYPE_ID) return
  const idx = aidTypes.value.indexOf(value)
  if (idx === -1) aidTypes.value.push(value)
  else aidTypes.value.splice(idx, 1)
}

// ─── 10.2 ข้อมูลบัญชีธนาคาร ─────────────────────────────────────────────────
// ซ่อนช่องธนาคาร/เลขที่บัญชีจาก UI ตามมติประชุม 2026-05-19
// คงตัวแปร bankNameId/bankAccount ไว้เพื่อให้ OCR ใน Step4 เขียนค่ากลับมาที่ store ได้
// (Step4 เรียก app.setBankInfo() ตอน OCR auto-fill → Step3.onMounted restore กลับมา)
const bankNameId  = ref('')   // applicants.bank_name_id
const bankAccount = ref('')   // applicants.bank_account_no
const bankAccountTypeId = ref('')  // applicants.bank_account_type_id (OCR map ประเภทเงินฝาก)
const bankBranchName    = ref('')  // applicants.bank_branch_name (OCR ชื่อสาขา)

// ─── หมายเหตุ: รูปสมุดบัญชี + OCR + เลขที่บัญชี ──────────────────────────────
// ย้ายไป Step4Documents.vue (ต่อจาก "รูปอื่น ๆ") แล้วตามมติประชุม 2026-05-19
// — bankNameId/bankAccount ยังคงอยู่ใน Step3Data เพื่อให้ OCR ใน Step4
//   เขียนค่ากลับมาที่ store ได้ (ผ่าน app.setBankInfo) และ Step3 ส่งต่อใน getData()

// ─── Validation ───────────────────────────────────────────────────────────────
const isReady = computed(() => {
  if (show('family_problems') && !problemDescription.value.trim()) return false
  if (show('requested_assistance_type') && aidTypes.value.length === 0) return false
  if (show('requested_assistance_type') && isOtherAidSelected.value && !aidOtherText.value.trim()) return false
  if (show('requested_assistance_type') && isInKindAidSelected.value && !aidInKindText.value.trim()) return false
  return true
})

const emit = defineEmits<{
  'update:ready': [boolean]
  'update:loading': [boolean]
}>()
watch(isReady, (val) => emit('update:ready', val), { immediate: true })
watch(isLoading, (val) => emit('update:loading', val), { immediate: true })

// ─── Pre-fill จาก store เมื่อ user ย้อนกลับ ─────────────────────────────────
onMounted(async () => {
  const s = app.step3
  if (s) {
    problemDescription.value = s.problemDescription
    // คง "ช่วยเหลือเป็นเงิน" (id=1) ไว้เสมอ แม้ข้อมูลเก่าจะไม่มี
    aidTypes.value           = s.aidTypes.includes(MONEY_AID_TYPE_ID)
                                 ? [...s.aidTypes]
                                 : [MONEY_AID_TYPE_ID, ...s.aidTypes]
    aidOtherText.value       = s.aidOtherText ?? ''
    aidInKindText.value      = s.aidInKindText ?? ''
    bankNameId.value         = s.bankNameId
    bankAccount.value        = s.bankAccount
    bankAccountTypeId.value  = s.bankAccountTypeId ?? ''
    bankBranchName.value     = s.bankBranchName ?? ''
    await nextTick()
  }
})

defineExpose({
  getData: () => ({
    problemDescription: problemDescription.value,
    aidTypes:           aidTypes.value,
    aidOtherText:       isOtherAidSelected.value   ? aidOtherText.value  : '',
    aidInKindText:      isInKindAidSelected.value  ? aidInKindText.value : '',
    bankNameId:         bankNameId.value,
    bankAccount:        bankAccount.value.replace(/-/g, ''),
    bankAccountTypeId:  bankAccountTypeId.value,
    bankBranchName:     bankBranchName.value,
  }),
})
</script>

<template>
  <!-- ระหว่างรอ API: โชว์โครงฟอร์มจำลอง (skeleton) — ผู้ใช้กดอะไรไม่ได้ -->
  <StepFormSkeleton v-if="isLoading" :cards="2" :rows-per-card="3" />

  <div v-else class="space-y-4">

    <!-- ════════════════════════════════════════════════════════
         Section 9: สภาพปัญหาความเดือดร้อนของครอบครัว
         ════════════════════════════════════════════════════════ -->
    <div v-if="show('family_problems')" class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="flex items-center gap-3 bg-blue-50 px-4 py-3 border-b border-blue-100">
        <div class="w-8 h-8 rounded-full bg-[#1A56DB] flex items-center justify-center flex-shrink-0">
          <span class="text-white text-[13px] font-bold">9</span>
        </div>
        <p class="text-[14px] font-bold text-[#1A56DB]">สภาพปัญหาความเดือดร้อนของครอบครัว</p>
      </div>
      <div class="p-4">

        <!-- 9.1 รายละเอียดปัญหา -->
        <div class="flex items-center gap-2 mb-3">
          <span class="bg-blue-100 text-[#1A56DB] text-[11px] font-bold px-2 py-0.5 rounded-md">9.1</span>
          <span class="text-[13px] font-medium text-slate-600">รายละเอียดปัญหา</span>
          <FieldAlert v-if="commentMap.has('family_problems')" :reason="commentMap.get('family_problems')!" />
        </div>

        <label class="block text-[13px] text-slate-600 mb-1.5 font-medium">
          สภาพปัญหาความเดือดร้อนของครอบครัว <span class="text-red-500">*</span>
        </label>
        <textarea
          v-model="problemDescription"
          rows="5"
          maxlength="500"
          placeholder="อธิบายสภาพปัญหาและความเดือดร้อนที่ประสบ..."
          class="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB] resize-none leading-relaxed"
        />
        <p class="text-right text-[11px] text-slate-400 mt-1">{{ problemDescription.length }}/500</p>

      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════
         Section 10: ความช่วยเหลือที่ต้องการ
         ════════════════════════════════════════════════════════ -->
    <div
      v-if="show('requested_assistance_type')"
      class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
    >
      <div class="flex items-center gap-3 bg-blue-50 px-4 py-3 border-b border-blue-100">
        <div class="w-8 h-8 rounded-full bg-[#1A56DB] flex items-center justify-center flex-shrink-0">
          <span class="text-white text-[13px] font-bold">10</span>
        </div>
        <p class="text-[14px] font-bold text-[#1A56DB]">ความช่วยเหลือที่ต้องการ</p>
      </div>
      <div class="p-4 space-y-4">

        <!-- 10.1 ประเภทความช่วยเหลือที่ต้องการ (checkbox 3 ตัวเลือก) -->
        <div>
          <div class="flex items-center gap-2 mb-3">
            <span class="bg-blue-100 text-[#1A56DB] text-[11px] font-bold px-2 py-0.5 rounded-md">10.1</span>
            <span class="text-[13px] font-medium text-slate-600">ประเภทความช่วยเหลือที่ต้องการ <span class="text-red-500">*</span></span>
            <FieldAlert v-if="commentMap.has('requested_assistance_type')" :reason="commentMap.get('requested_assistance_type')!" />
          </div>

          <div class="space-y-2">

            <!-- ช่วยเหลือเป็นเงิน (id=1) -->
            <div>
              <!-- ล็อกไว้เสมอ: เลือกอัตโนมัติ ถอดออกไม่ได้ (cursor-default, ไม่มี @click) -->
              <label class="flex items-center gap-3 border border-[#1A56DB] bg-blue-50 rounded-xl px-4 py-3 cursor-default">
                <div class="w-5 h-5 rounded border-2 bg-[#1A56DB] border-[#1A56DB] flex items-center justify-center flex-shrink-0">
                  <svg class="w-[11px] h-[11px] text-white" viewBox="0 0 12 10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polyline points="1,5 4.5,9 11,1" />
                  </svg>
                </div>
                <span class="text-[14px] text-[#1A56DB] font-medium">ช่วยเหลือเป็นเงิน</span>
              </label>
            </div>

            <!-- ช่วยเหลือเรื่องอื่นๆ (id=3) -->
            <div>
              <label
                class="flex items-center gap-3 border rounded-xl px-4 py-3 cursor-pointer transition-all duration-150"
                :class="isOtherAidSelected ? 'border-[#1A56DB] bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'"
                @click.prevent="toggleAidType(OTHER_AID_TYPE_ID)"
              >
                <div
                  class="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all duration-150"
                  :class="isOtherAidSelected ? 'bg-[#1A56DB] border-[#1A56DB]' : 'bg-white border-slate-300'"
                >
                  <svg v-if="isOtherAidSelected" class="w-[11px] h-[11px] text-white" viewBox="0 0 12 10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polyline points="1,5 4.5,9 11,1" />
                  </svg>
                </div>
                <span class="text-[14px] transition-colors" :class="isOtherAidSelected ? 'text-[#1A56DB] font-medium' : 'text-slate-700'">
                  ช่วยเหลือเรื่องอื่นๆ
                </span>
              </label>
              <div v-if="isOtherAidSelected" class="mt-2 ml-4">
                <label class="block text-[12px] text-slate-600 mb-1 font-medium">
                  โปรดระบุรายละเอียด <span class="text-red-500">*</span>
                </label>
                <textarea
                  v-model="aidOtherText"
                  rows="3"
                  maxlength="500"
                  placeholder="ระบุรายละเอียดความช่วยเหลือที่ต้องการ..."
                  class="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB] resize-none leading-relaxed"
                />
                <p class="text-right text-[11px] text-slate-400 mt-0.5">{{ aidOtherText.length }}/500</p>
              </div>
            </div>

            <!-- ช่วยเหลือเป็นสิ่งของ (id=2) -->
            <div>
              <label
                class="flex items-center gap-3 border rounded-xl px-4 py-3 cursor-pointer transition-all duration-150"
                :class="isInKindAidSelected ? 'border-[#1A56DB] bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'"
                @click.prevent="toggleAidType(IN_KIND_AID_TYPE_ID)"
              >
                <div
                  class="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all duration-150"
                  :class="isInKindAidSelected ? 'bg-[#1A56DB] border-[#1A56DB]' : 'bg-white border-slate-300'"
                >
                  <svg v-if="isInKindAidSelected" class="w-[11px] h-[11px] text-white" viewBox="0 0 12 10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polyline points="1,5 4.5,9 11,1" />
                  </svg>
                </div>
                <span class="text-[14px] transition-colors" :class="isInKindAidSelected ? 'text-[#1A56DB] font-medium' : 'text-slate-700'">
                  ช่วยเหลือเป็นสิ่งของ
                </span>
              </label>
              <div v-if="isInKindAidSelected" class="mt-2 ml-4">
                <label class="block text-[12px] text-slate-600 mb-1 font-medium">
                  โปรดระบุรายละเอียด <span class="text-red-500">*</span>
                </label>
                <textarea
                  v-model="aidInKindText"
                  rows="3"
                  maxlength="500"
                  placeholder="ระบุรายละเอียดสิ่งของที่ต้องการ..."
                  class="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB] resize-none leading-relaxed"
                />
                <p class="text-right text-[11px] text-slate-400 mt-0.5">{{ aidInKindText.length }}/500</p>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>

  </div>
</template>
