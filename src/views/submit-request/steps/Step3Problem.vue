<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useApplicationStore } from '@/stores/application'
import { lookupsApi } from '@/api/lookups'
import FieldAlert from '@/components/ui/FieldAlert.vue'
import StepFormSkeleton from '../components/StepFormSkeleton.vue'

const app = useApplicationStore()

// ─── สถานะการโหลด ──────────────────────────────────────────────────────────────
// isLoading = true ระหว่างรอ API ดึงตัวเลือกประเภทความช่วยเหลือ
// (รูปสมุดบัญชี + OCR ย้ายไป Step4 แล้ว — ดู Step4Documents.vue)
const isLoading = ref(true)

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
const aidTypes    = ref<string[]>([])
const aidOtherText = ref('')  // รายละเอียดเพิ่มเติมเมื่อเลือก "ช่วยเหลือเรื่องอื่นๆ"
const aidTypeOptions = ref<{ value: string; label: string }[]>([])

// id ของตัวเลือก "ช่วยเหลือเรื่องอื่นๆ" (backend กำหนด id=1 คงที่)
const OTHER_AID_TYPE_ID = '1'

// ตรวจว่าปัจจุบันเลือก "อื่นๆ" อยู่ไหม — ใช้ควบคุมการแสดงช่องกรอกรายละเอียด
const isOtherAidSelected = computed(() => aidTypes.value.includes(OTHER_AID_TYPE_ID))

// ซ่อน checkbox UI แล้ว — เก็บไว้เผื่อเปิดใช้อีกครั้ง
// function toggleAidType(value: string) {
//   const idx = aidTypes.value.indexOf(value)
//   if (idx === -1) aidTypes.value.push(value)
//   else aidTypes.value.splice(idx, 1)
// }

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
// field ที่ซ่อน (ไม่อยู่ใน filterFields) ถือว่า valid เสมอ
const isReady = computed(() => {
  if (show('family_problems') && !problemDescription.value.trim()) return false
  if (show('requested_assistance_detail') && aidTypes.value.length === 0) return false
  // ต้องกรอกรายละเอียดเมื่อเลือก "ช่วยเหลือเรื่องอื่นๆ"
  if (show('requested_assistance_detail') && isOtherAidSelected.value && !aidOtherText.value.trim()) return false
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
  // ดึงประเภทความช่วยเหลือจาก API
  const requestTypeData = await lookupsApi.fetchRequestTypes().catch(() => [])
  aidTypeOptions.value  = requestTypeData.map(d => ({ value: String(d.id), label: d.name }))

  const s = app.step3
  if (s) {
    problemDescription.value = s.problemDescription
    aidTypes.value           = [...s.aidTypes]
    aidOtherText.value       = s.aidOtherText ?? ''
    bankNameId.value         = s.bankNameId
    bankAccount.value        = s.bankAccount
    bankAccountTypeId.value  = s.bankAccountTypeId ?? ''
    bankBranchName.value     = s.bankBranchName ?? ''
    await nextTick()
  } else {
    // ตั้งค่าเริ่มต้น: เลือก "ช่วยเหลือเรื่องอื่นๆ" อัตโนมัติ
    aidTypes.value = [OTHER_AID_TYPE_ID]
  }

  // โหลดตัวเลือก + เติมข้อมูลเดิมเสร็จแล้ว → ปิด skeleton แสดงฟอร์มจริง
  isLoading.value = false
})

defineExpose({
  getData: () => ({
    problemDescription: problemDescription.value,
    aidTypes:           aidTypes.value,
    aidOtherText:       isOtherAidSelected.value ? aidOtherText.value : '',
    bankNameId:         bankNameId.value,
    bankAccount:        bankAccount.value.replace(/-/g, ''),
    bankAccountTypeId:  bankAccountTypeId.value,
    bankBranchName:     bankBranchName.value,
    // bankBookPhoto ส่งผ่าน store (key 'bank_book') — ไม่ส่งผ่าน getData()
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
      v-if="show('requested_assistance_detail')"
      class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
    >
      <div class="flex items-center gap-3 bg-blue-50 px-4 py-3 border-b border-blue-100">
        <div class="w-8 h-8 rounded-full bg-[#1A56DB] flex items-center justify-center flex-shrink-0">
          <span class="text-white text-[13px] font-bold">10</span>
        </div>
        <p class="text-[14px] font-bold text-[#1A56DB]">ความช่วยเหลือที่ต้องการ</p>
      </div>
      <div class="p-4 space-y-4">

        <!-- 10.1 ประเภทความช่วยเหลือ — ซ่อน checkbox จาก UI ตามที่ประชุมตกลง แต่ logic ยังทำงานอยู่ -->
        <!--
        <div v-if="show('requested_assistance_type')">
          <div class="flex items-center gap-2 mb-1.5">
            <span class="bg-blue-100 text-[#1A56DB] text-[11px] font-bold px-2 py-0.5 rounded-md">10.1</span>
            <span class="text-[13px] font-medium text-slate-600">ประเภทความช่วยเหลือ <span class="text-red-500">*</span></span>
            <FieldAlert v-if="commentMap.has('requested_assistance_type')" :reason="commentMap.get('requested_assistance_type')!" />
          </div>

          <div class="space-y-2">
            <label
              v-for="opt in aidTypeOptions"
              :key="opt.value"
              class="flex items-center gap-3 border rounded-xl px-4 py-3 cursor-pointer transition-all duration-150"
              :class="aidTypes.includes(opt.value) ? 'border-[#1A56DB] bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'"
              @click.prevent="toggleAidType(opt.value)"
            >
              <div
                class="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all duration-150"
                :class="aidTypes.includes(opt.value) ? 'bg-[#1A56DB] border-[#1A56DB]' : 'bg-white border-slate-300'"
              >
                <svg v-if="aidTypes.includes(opt.value)" class="w-[11px] h-[11px] text-white" viewBox="0 0 12 10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="1,5 4.5,9 11,1" />
                </svg>
              </div>
              <span class="text-[14px] transition-colors" :class="aidTypes.includes(opt.value) ? 'text-[#1A56DB] font-medium' : 'text-slate-700'">
                {{ opt.label }}
              </span>
            </label>
          </div>

          <div v-if="isOtherAidSelected" class="mt-3">
            <label class="block text-[13px] text-slate-600 mb-1.5 font-medium">
              รายละเอียดการช่วยเหลืออื่นๆ <span class="text-red-500">*</span>
            </label>
            <textarea
              v-model="aidOtherText"
              rows="3"
              placeholder="โปรดระบุรายละเอียดความช่วยเหลือที่ต้องการ..."
              class="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB] resize-none leading-relaxed"
              :class="!aidOtherText.trim() ? 'border-slate-200' : 'border-slate-300'"
            />
          </div>
        </div>
        -->

        <!-- 10.1 รายละเอียดการช่วยเหลือที่ต้องการ — ใช้ field ใหม่ requested_assistance_detail -->
        <div v-if="show('requested_assistance_detail')">
          <div class="flex items-center gap-2 mb-1.5">
            <span class="bg-blue-100 text-[#1A56DB] text-[11px] font-bold px-2 py-0.5 rounded-md">10.1</span>
            <span class="text-[13px] font-medium text-slate-600">รายละเอียดการช่วยเหลือที่ต้องการ <span class="text-red-500">*</span></span>
            <FieldAlert v-if="commentMap.has('requested_assistance_detail')" :reason="commentMap.get('requested_assistance_detail')!" />
          </div>
          <textarea
            v-model="aidOtherText"
            rows="3"
            maxlength="500"
            placeholder="โปรดระบุรายละเอียดความช่วยเหลือที่ต้องการ..."
            class="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB] resize-none leading-relaxed"
          />
          <p class="text-right text-[11px] text-slate-400 mt-1">{{ aidOtherText.length }}/500</p>
        </div>

        <!-- 10.2 ข้อมูลบัญชีธนาคาร — ยกเลิกตามมติประชุม 2026-05-19
             review_field bank_name / bank_account_number ถูก set is_active=false
             ส่วนรูปสมุดบัญชี + OCR ย้ายไป Step4Documents.vue ต่อจาก "รูปอื่น ๆ"
             เก็บโค้ดไว้เผื่อเปิดใช้งานกลับมาในอนาคต
        -->
        <!--
        <div v-if="show('requested_assistance_type') && ['bank_name','bank_account_number','bank_book_photo'].some(f => show(f))" class="h-px bg-slate-100" />

        <div v-if="['bank_name','bank_account_number','bank_book_photo'].some(f => show(f))">
          <div class="flex items-center gap-2 mb-3">
            <span class="bg-blue-100 text-[#1A56DB] text-[11px] font-bold px-2 py-0.5 rounded-md">10.2</span>
            <span class="text-[13px] font-medium text-slate-600">ข้อมูลบัญชีธนาคาร</span>
          </div>

          <div v-if="show('bank_name')" class="mb-4">
            <label class="flex items-center gap-1 text-[13px] text-slate-600 mb-1.5 font-medium">
              <span>ธนาคาร</span>
              <FieldAlert v-if="commentMap.has('bank_name')" :reason="commentMap.get('bank_name')!" />
            </label>
            <select v-model="bankNameId" class="w-full appearance-none bg-white border border-slate-200 rounded-xl px-4 py-3 text-[14px] text-slate-900">
              <option value="" disabled>— กรุณาเลือกธนาคาร —</option>
              <option v-for="opt in bankOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>

          <div v-if="show('bank_account_number')" class="mb-4">
            <label class="flex items-center gap-1 text-[13px] text-slate-600 mb-1.5 font-medium">
              <span>เลขที่บัญชี</span>
              <FieldAlert v-if="commentMap.has('bank_account_number')" :reason="commentMap.get('bank_account_number')!" />
            </label>
            <input
              :value="bankAccount"
              @input="handleBankAccountInput"
              @blur="bankAccountTouched = true"
              type="text"
              inputmode="numeric"
              placeholder="เช่น 123-4-56789-0"
              class="w-full border rounded-xl px-4 py-3 text-[14px]"
            />
            <p v-if="bankAccountError" class="text-[11px] text-red-500 mt-1 px-1">{{ bankAccountError }}</p>
          </div>
        </div>
        -->

      </div>
    </div>

  </div>
</template>
