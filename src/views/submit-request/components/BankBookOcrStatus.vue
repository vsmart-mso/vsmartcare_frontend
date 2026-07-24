<script setup lang="ts">
/**
 * BankBookOcrStatus — แสดงสถานะ OCR สำหรับรูปสมุดบัญชีธนาคาร
 *
 * Props:
 *   file          — File object ของรูปที่ผู้ใช้อัปโหลด (null = ยังไม่มีรูป)
 *   targetName    — ชื่อ-นามสกุลผู้ใช้ สำหรับเทียบกับ OCR
 *   bankOptions   — รายชื่อธนาคารจาก API สำหรับ auto-fill
 *   disabled      — true = หยุด OCR (เช่น ระหว่าง compress หรือ fetch จาก server)
 *
 * Emits:
 *   auto-fill     — เมื่อ OCR match/review → ส่ง bankNameId + accountNumber ให้ parent auto-fill
 *
 * ใช้เป็น children ของ Step3Problem.vue — แทรกใต้รูป preview สมุดบัญชี
 * OCR ทำงานอัตโนมัติเมื่อ file เปลี่ยน หรือเมื่อ targetName มีค่า
 */
import { ref, computed, watch, onMounted } from 'vue'
import { ocrBankBook, type OcrBankBookResponse } from '@/api/ocr'
import { useApplicationStore } from '@/stores/application'

const app = useApplicationStore()

// ─── Props ──────────────────────────────────────────────────────────────────
const props = defineProps<{
  file: File | null
  targetName: string
  bankOptions: { value: string; label: string }[]
  accountTypeOptions: { value: string; label: string }[]  // ประเภทเงินฝาก (master) สำหรับ map จาก OCR
  manualAccountTypeId?: string
  disabled?: boolean
}>()

// ─── Emits ──────────────────────────────────────────────────────────────────
const emit = defineEmits<{
  'auto-fill': [payload: {
    bankNameId: string
    accountNumber: string
    bankAccountTypeId: string
    branchName: string
  }]
  // OCR service ล่ม/เรียกไม่สำเร็จ — ให้ parent เปิด Modal ตัดสินใจ
  'ocr-error': []
}>()

// ─── State ──────────────────────────────────────────────────────────────────
const ocrAbort   = ref<AbortController | null>(null)
const ocrResult  = ref<OcrBankBookResponse | null>(null)
const ocrLoading = ref(false)
const ocrError   = ref('')

// ─── Restore ผล OCR จาก store เมื่อ component mount (เช่น ผู้ใช้กลับมาจาก Step4) ──
onMounted(() => {
  if (app.bankBookOcrResult && props.file) {
    // มีผลค้างใน store → แสดงทันที ไม่ต้อง OCR ซ้ำ
    ocrResult.value = app.bankBookOcrResult
    ocrLoading.value = app.bankBookOcrLoading
  }
})

// ─── เริ่ม OCR อัตโนมัติเมื่อ file เปลี่ยน ───────────────────────────────────
let _seq = 0 // serial number กัน race condition
let _prevFile: File | null = null
watch(
  () => [props.file, props.targetName, props.disabled] as const,
  async ([file, targetName, disabled]) => {
    // ถ้า file เพิ่งถูก restore จาก store (null → File) และ store มีผลอยู่แล้ว → ข้าม
    const isRestore = !_prevFile && file && app.bankBookOcrResult
    _prevFile = file

    // ล้างสถานะก่อนหน้า
    ocrAbort.value?.abort()
    ocrAbort.value = null
    ocrLoading.value = false
    ocrError.value = ''

    if (!file || !targetName || disabled) {
      if (!file) app.clearBankBookOcr()
      ocrResult.value = null
      return
    }

    // ถ้า restore จาก store ที่มีผลอยู่แล้ว → แสดงผลทันที ไม่ OCR ซ้ำ
    if (isRestore) {
      ocrResult.value = app.bankBookOcrResult
      ocrLoading.value = false
      return
    }

    app.clearBankBookOcr()
    ocrResult.value = null

    const seq = ++_seq
    const controller = new AbortController()
    ocrAbort.value = controller
    ocrLoading.value = true
    app.setBankBookOcrLoading(true)

    try {
      const result = await ocrBankBook(file, targetName, null, controller.signal)
      if (seq !== _seq) return // มี request ใหม่มาแล้ว

      // ── ทำความสะอาดเลขที่บัญชี: เก็บเฉพาะตัวเลข ──────────────────────────────
      // OCR อาจอ่านเลขบัญชีติด - ช่องว่าง หรือตัวอักษร/อักขระพิเศษมาด้วย
      // เลขบัญชีธนาคารต้องเป็นตัวเลขล้วน จึงตัดทุกอย่างที่ไม่ใช่ตัวเลขออก
      // ถ้าตัดแล้วเหลือว่าง (เช่น OCR อ่านมาเป็นตัวอักษรล้วน) จะถือว่าข้อมูลไม่ครบ
      // ผ่าน bankInfoComplete → แสดง error และบล็อกการส่งโดยอัตโนมัติ
      if (result.bank_info) {
        result.bank_info.account_number = sanitizeAccountNumber(result.bank_info.account_number)
      }

      ocrResult.value = result
      app.setBankBookOcrResult(result)

      // ── Auto-fill เมื่อ match หรือ review ──────────────────────────────────
      const info = result.bank_info
      if (info && (info.match_status === 'match' || info.match_status === 'review')) {
        const bankNameId = findBankId(info.bank_name)
        const bankAccountTypeId = findAccountTypeId(info.deposit_type)
        const branchName = info.branch_name?.trim() ?? ''
        if (bankNameId || info.account_number || bankAccountTypeId || branchName) {
          emit('auto-fill', {
            bankNameId:        bankNameId ?? '',
            accountNumber:     info.account_number ?? '',
            bankAccountTypeId: bankAccountTypeId ?? '',
            branchName,
          })
        }
      }

      // ── กรณีไม่ใช่รูปสมุดบัญชี ────────────────────────────────────────────
      if (info?.match_status === 'no_text') {
        ocrError.value = 'ไม่พบข้อความในรูป — อาจไม่ใช่รูปสมุดบัญชีธนาคาร กรุณาอัปโหลดรูปใหม่'
      } else if (info?.match_status === 'blurry') {
        ocrError.value = 'รูปไม่ชัด กรุณาถ่ายใหม่ให้ชัดขึ้น'
      }
    } catch (err: unknown) {
      if (seq !== _seq) return
      if (err instanceof DOMException && err.name === 'AbortError') return
      ocrError.value = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการตรวจสอบรูป'
      app.setBankBookOcrResult(null)
      emit('ocr-error')
    } finally {
      if (seq === _seq) {
        ocrLoading.value = false
        ocrAbort.value = null
        app.setBankBookOcrLoading(false)
      }
    }
  },
)

// OCR ต้องอ่านข้อมูลได้ครบทั้ง 5 อย่าง: ธนาคาร + เลขที่บัญชี + ชื่อบัญชี + ประเภทเงินฝาก + ชื่อสาขา
// (branch_code เป็นข้อมูลเสริม ไม่บังคับ เพราะสมุดหลายเล่มไม่พิมพ์รหัสสาขาชัด)
// ถ้าขาดอย่างใดอย่างหนึ่ง ถือว่าไม่ผ่าน (ใช้คุม UI ให้สอดคล้องกับ gate ใน SubmitRequestPage)
const bankInfoComplete = computed(() => {
  const i = ocrResult.value?.bank_info
  const hasAccountType = !!(i?.deposit_type?.trim() || props.manualAccountTypeId?.trim())
  return !!(
    i?.bank_name?.trim() &&
    i?.account_number?.trim() &&
    i?.account_name?.trim() &&
    hasAccountType &&
    i?.branch_name?.trim()
  )
})

const missingOnlyDepositType = computed(() => {
  const i = ocrResult.value?.bank_info
  return !!(
    i?.bank_name?.trim() &&
    i?.account_number?.trim() &&
    i?.account_name?.trim() &&
    !i?.deposit_type?.trim() &&
    !props.manualAccountTypeId?.trim() &&
    i?.branch_name?.trim()
  )
})

/**
 * เก็บเฉพาะตัวเลขจากเลขที่บัญชีที่ OCR อ่านได้
 * \D คือ "ทุกอักขระที่ไม่ใช่ตัวเลข" → ตัด - ช่องว่าง ตัวอักษร และอักขระพิเศษออกทั้งหมด
 * เช่น "123-4-56789-0" → "1234567890", "abc123" → "123", null → ''
 */
function sanitizeAccountNumber(raw: string | null): string {
  return (raw ?? '').replace(/\D/g, '')
}

/** หา bank_name_id จากชื่อธนาคารที่ OCR อ่านได้ (fuzzy match กับ label) */
function findBankId(bankName: string | null): string | null {
  if (!bankName || props.bankOptions.length === 0) return null
  const match = props.bankOptions.find(
    opt => opt.label.includes(bankName) || bankName.includes(opt.label)
  )
  return match?.value ?? null
}

/**
 * หา bank_account_type_id จากประเภทเงินฝากที่ OCR อ่านได้ (fuzzy match กับ label)
 * เช่น OCR อ่าน "ออมทรัพย์" → master "เงินฝากออมทรัพย์" (label.includes(ocr) = true)
 */
function findAccountTypeId(depositType: string | null): string | null {
  const t = depositType?.trim()
  if (!t || props.accountTypeOptions.length === 0) return null
  const match = props.accountTypeOptions.find(
    opt => opt.label.includes(t) || t.includes(opt.label)
  )
  return match?.value ?? null
}

/** รีเซ็ตผล OCR (เรียกจาก parent เมื่อผู้ใช้ลบรูป) */
function reset() {
  ocrAbort.value?.abort()
  ocrAbort.value = null
  ocrResult.value = null
  ocrLoading.value = false
  ocrError.value = ''
  app.clearBankBookOcr()
}

defineExpose({ reset })
</script>

<template>
  <div v-if="file" class="mt-3">
    <!-- OCR loading indicator -->
    <div v-if="ocrLoading" class="flex items-center gap-2.5 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5">
      <svg class="w-4 h-4 text-[#1A56DB] animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
      </svg>
      <p class="text-body-xs text-[#1A56DB] font-medium">กำลังตรวจสอบข้อมูลสมุดบัญชี...</p>
    </div>

    <!-- OCR error (รวมถึง blurry / no_text) -->
    <div v-else-if="ocrError" class="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
      <svg class="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd"/>
      </svg>
      <p class="text-hint text-red-700 leading-snug">{{ ocrError }}</p>
    </div>

    <!-- OCR match: แสดงข้อมูลบัญชี (สีเขียว) — เฉพาะเมื่อข้อมูลครบทั้ง 3 อย่าง -->
    <div v-else-if="ocrResult?.bank_info?.match_status === 'match' && bankInfoComplete" class="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 space-y-1.5">
      <div class="flex items-center gap-2">
        <svg class="w-4 h-4 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p class="text-body-xs font-semibold text-emerald-700">ตรวจสอบสมุดบัญชีสำเร็จ ✓</p>
      </div>
      <div class="text-hint text-emerald-700 space-y-0.5 ml-6">
        <p v-if="ocrResult.bank_info.bank_name"><strong>ธนาคาร:</strong> {{ ocrResult.bank_info.bank_name }}</p>
        <p v-if="ocrResult.bank_info.account_number"><strong>เลขที่บัญชี:</strong> {{ ocrResult.bank_info.account_number }}</p>
        <p v-if="ocrResult.bank_info.account_name"><strong>ชื่อบัญชี:</strong> {{ ocrResult.bank_info.account_name }}</p>
        <p v-if="ocrResult.bank_info.deposit_type"><strong>ประเภทเงินฝาก:</strong> {{ ocrResult.bank_info.deposit_type }}</p>
        <p v-if="ocrResult.bank_info.branch_name">
          <strong>สาขา:</strong> {{ ocrResult.bank_info.branch_name }}<template v-if="ocrResult.bank_info.branch_code"> ({{ ocrResult.bank_info.branch_code }})</template>
        </p>
        <p class="text-micro text-emerald-500 mt-1">คะแนนความตรงกัน {{ ocrResult.bank_info.fuzzy_score.toFixed(1) }}%</p>
      </div>
    </div>

    <!-- OCR review: ต้องตรวจสอบด้วยคน (สีเหลือง) — เฉพาะเมื่อข้อมูลครบทั้ง 3 อย่าง -->
    <div v-else-if="ocrResult?.bank_info?.match_status === 'review' && bankInfoComplete" class="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 space-y-1.5">
      <div class="flex items-center gap-2">
        <svg class="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <p class="text-body-xs font-semibold text-amber-700">กรุณาตรวจสอบข้อมูลอีกครั้ง</p>
      </div>
      <div class="text-hint text-amber-700 space-y-0.5 ml-6">
        <p v-if="ocrResult.bank_info.bank_name"><strong>ธนาคาร:</strong> {{ ocrResult.bank_info.bank_name }}</p>
        <p v-if="ocrResult.bank_info.account_number"><strong>เลขที่บัญชี:</strong> {{ ocrResult.bank_info.account_number }}</p>
        <p v-if="ocrResult.bank_info.account_name"><strong>ชื่อบัญชี:</strong> {{ ocrResult.bank_info.account_name }}</p>
        <p v-if="ocrResult.bank_info.deposit_type"><strong>ประเภทเงินฝาก:</strong> {{ ocrResult.bank_info.deposit_type }}</p>
        <p v-if="ocrResult.bank_info.branch_name">
          <strong>สาขา:</strong> {{ ocrResult.bank_info.branch_name }}<template v-if="ocrResult.bank_info.branch_code"> ({{ ocrResult.bank_info.branch_code }})</template>
        </p>
        <p class="text-micro text-amber-500 mt-1">คะแนนความตรงกัน {{ ocrResult.bank_info.fuzzy_score.toFixed(1) }}% — อาจมีบางส่วนไม่ตรง</p>
      </div>
    </div>

    <!-- OCR ข้อมูลไม่ครบ: อ่านชื่อตรงแต่ขาด ธนาคาร/เลขที่บัญชี/ชื่อบัญชี (สีแดง) -->
    <div
      v-else-if="(ocrResult?.bank_info?.match_status === 'match' || ocrResult?.bank_info?.match_status === 'review') && missingOnlyDepositType"
      class="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 space-y-1.5"
    >
      <div class="flex items-center gap-2">
        <svg class="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <p class="text-body-xs font-semibold text-amber-700">อ่านข้อมูลสมุดบัญชีได้แล้ว แต่ไม่พบประเภทเงินฝาก</p>
      </div>
      <div class="text-hint text-amber-700 space-y-0.5 ml-6">
        <p v-if="ocrResult.bank_info.bank_name"><strong>ธนาคาร:</strong> {{ ocrResult.bank_info.bank_name }}</p>
        <p v-if="ocrResult.bank_info.account_number"><strong>เลขที่บัญชี:</strong> {{ ocrResult.bank_info.account_number }}</p>
        <p v-if="ocrResult.bank_info.account_name"><strong>ชื่อบัญชี:</strong> {{ ocrResult.bank_info.account_name }}</p>
        <p v-if="ocrResult.bank_info.branch_name">
          <strong>สาขา:</strong> {{ ocrResult.bank_info.branch_name }}<template v-if="ocrResult.bank_info.branch_code"> ({{ ocrResult.bank_info.branch_code }})</template>
        </p>
        <p class="text-micro text-amber-600 mt-1">กรุณาเลือกประเภทเงินฝากจากช่องด้านล่าง</p>
      </div>
    </div>

    <div
      v-else-if="(ocrResult?.bank_info?.match_status === 'match' || ocrResult?.bank_info?.match_status === 'review') && !bankInfoComplete"
      class="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5"
    >
      <svg class="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd"/>
      </svg>
      <div>
        <p class="text-body-xs font-semibold text-red-700">อ่านข้อมูลสมุดบัญชีได้ไม่ครบ</p>
        <p class="text-hint text-red-600 mt-0.5">
          ต้องอ่านได้ครบทั้ง ธนาคาร เลขที่บัญชี ชื่อบัญชี ประเภทเงินฝาก และชื่อสาขา กรุณาถ่ายใหม่ให้ชัดหรืออัปโหลดรูปอื่น
        </p>
        <ul class="text-micro text-red-500 mt-1 space-y-0.5">
          <li v-if="!ocrResult?.bank_info?.bank_name?.trim()">• ไม่พบ ธนาคาร</li>
          <li v-if="!ocrResult?.bank_info?.account_number?.trim()">• ไม่พบ เลขที่บัญชี</li>
          <li v-if="!ocrResult?.bank_info?.account_name?.trim()">• ไม่พบ ชื่อบัญชี</li>
          <li v-if="!ocrResult?.bank_info?.deposit_type?.trim()">• ไม่พบ ประเภทเงินฝาก</li>
          <li v-if="!ocrResult?.bank_info?.branch_name?.trim()">• ไม่พบ ชื่อสาขา</li>
        </ul>
      </div>
    </div>

    <!-- OCR mismatch: ชื่อไม่ตรง (สีแดง) -->
    <div v-else-if="ocrResult?.bank_info?.match_status === 'mismatch'" class="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
      <svg class="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd"/>
      </svg>
      <div>
        <p class="text-body-xs font-semibold text-red-700">ชื่อเจ้าของบัญชีไม่ตรงกับผู้ยื่นคำขอ</p>
        <p class="text-hint text-red-600 mt-0.5">กรุณาตรวจสอบรูปสมุดบัญชีหรืออัปโหลดใหม่</p>
        <p v-if="ocrResult.bank_info.account_name" class="text-micro text-red-500 mt-0.5">ชื่อในบัญชี: {{ ocrResult.bank_info.account_name }}</p>
      </div>
    </div>
  </div>
</template>
