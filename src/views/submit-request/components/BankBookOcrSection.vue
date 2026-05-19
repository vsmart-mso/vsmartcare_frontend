<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useImageUpload } from '@/composables/useImageUpload'
import { useAuthStore } from '@/stores/auth'
import { useApplicationStore } from '@/stores/application'
import type { ThaiDUser } from '@/types/auth'
import { ocrBankBook, type OcrBankBookResponse } from '@/api/ocr'

// ─── Props ──────────────────────────────────────────────────────────────────

const props = defineProps<{
  /** Server blob URL สำหรับ edit mode (ไม่มี local file) */
  existingImageUrl?: string
  /** กำลัง fetch รูปจาก server ใน edit mode */
  fetchingImage?: boolean
  /** รายชื่อธนาคารสำหรับ auto-fill เมื่อ OCR match */
  bankOptions: { value: string; label: string }[]
}>()

// ─── Emits ──────────────────────────────────────────────────────────────────

const emit = defineEmits<{
  /** เมื่อผู้ใช้เลือก/เปลี่ยน/ลบรูป */
  'update:file': [file: File | null]
  /** เมื่อผู้ใช้ลบรูป (รวมถึงลบ server image ใน edit mode) */
  'clear': []
  /** OCR auto-fill ธนาคาร */
  'ocr:fill-bank': [bankNameId: string]
  /** OCR auto-fill เลขบัญชี */
  'ocr:fill-account': [accountNumber: string]
}>()

// ─── Bank book image upload ─────────────────────────────────────────────────

const auth = useAuthStore()
const app  = useApplicationStore()
// compress ที่ frontend: max 1200×1600px, WebP quality 82%
const bankBook = useImageUpload({ maxWidth: 1200, maxHeight: 1600, quality: 0.82 })

// preview: local ก่อน, server image ทีหลัง
const previewUrl = computed(() =>
  bankBook.previewUrl.value || props.existingImageUrl || ''
)

// ─── OCR State ──────────────────────────────────────────────────────────────

const ocrAbort = ref<AbortController | null>(null)
const ocrResult  = ref<OcrBankBookResponse | null>(null)
const ocrLoading = ref(false)
const ocrError   = ref('')

/** สร้าง target_name จาก ThaiD user */
function buildTargetName(): string {
  const u = auth.user as ThaiDUser | null
  if (!u?.title || !u?.fname || !u?.lname) return ''
  return `${u.title} ${u.fname} ${u.lname}`
}

/** เรียก OCR ใน background */
async function runOcr(file: File) {
  const targetName = buildTargetName()
  if (!targetName) {
    ocrError.value = 'ไม่พบชื่อผู้ใช้ กรุณาเข้าสู่ระบบใหม่'
    return
  }

  ocrAbort.value?.abort()
  const controller = new AbortController()
  ocrAbort.value = controller

  ocrError.value = ''
  ocrLoading.value = true
  ocrResult.value = null
  app.setBankBookOcrLoading(true)
  app.setBankBookOcrResult(null)

  try {
    const result = await ocrBankBook(file, targetName, null, controller.signal)
    ocrResult.value = result
    app.setBankBookOcrResult(result)

    const info = result.bank_info
    if (info && (info.match_status === 'match' || info.match_status === 'review')) {
      // Auto-fill ธนาคาร
      if (info.bank_name && props.bankOptions.length > 0) {
        const match = props.bankOptions.find(
          opt => opt.label.includes(info.bank_name!) || info.bank_name!.includes(opt.label)
        )
        if (match) emit('ocr:fill-bank', match.value)
      }
      // Auto-fill เลขบัญชี
      if (info.account_number) {
        emit('ocr:fill-account', info.account_number)
      }
    }

    if (info?.match_status === 'no_text') {
      ocrError.value = 'ไม่พบข้อความในรูป — อาจไม่ใช่รูปสมุดบัญชีธนาคาร กรุณาอัปโหลดรูปใหม่'
    } else if (info?.match_status === 'blurry') {
      ocrError.value = 'รูปไม่ชัด กรุณาถ่ายใหม่ให้ชัดขึ้น'
    }
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการตรวจสอบรูป'
    ocrError.value = msg
    ocrResult.value = null
    app.setBankBookOcrResult(null)
  } finally {
    ocrLoading.value = false
    ocrAbort.value = null
    app.setBankBookOcrLoading(false)
  }
}

/** หยุด OCR + ล้างผลลัพธ์ */
function cancelOcr() {
  ocrAbort.value?.abort()
  ocrAbort.value = null
  ocrError.value = ''
  ocrResult.value = null
  app.clearBankBookOcr()
}

/** ล้างทุกอย่าง: file + server image + OCR */
function handleClear() {
  bankBook.clear()
  cancelOcr()
  emit('clear')
}

// ─── Watch: เมื่อมีไฟล์ใหม่ → เริ่ม OCR ─────────────────────────────────────

watch(() => bankBook.file.value, (file) => {
  emit('update:file', file ?? null)
  if (file) {
    runOcr(file)
  } else {
    cancelOcr()
  }
})

// ─── Restore OCR state จาก store เมื่อ component mount ใหม่ (ผู้ใช้กลับมาจาก step อื่น) ──
// OCR ยังรันอยู่เบื้องหลังแม้ component จะ unmount ไปแล้ว — ดึงสถานะกลับมาแสดง
onMounted(() => {
  if (app.bankBookOcrLoading) {
    ocrLoading.value = true
  } else if (app.bankBookOcrResult) {
    ocrResult.value = app.bankBookOcrResult
  }
})

// ─── Expose: ให้ parent ใช้ restore file ได้ ────────────────────────────────

defineExpose({
  /** restore File object (กรณี user กลับมาจาก step อื่น) */
  restoreFile: (file: File) => bankBook.restore(file),
  /** อ่าน file ปัจจุบัน */
  get file() { return bankBook.file.value },
})
</script>

<template>
  <div>
    <!-- error from useImageUpload (compress fail) -->
    <p v-if="bankBook.error.value" class="mb-2 text-[12px] text-red-500">
      {{ bankBook.error.value }}
    </p>

    <!-- ═════════════ preview + clear ═════════════ -->
    <div v-if="previewUrl" class="border border-slate-200 rounded-xl overflow-hidden">
      <div class="relative">
        <img
          :src="previewUrl"
          alt="รูปสมุดบัญชี"
          class="w-full object-contain max-h-48 bg-slate-50"
        />
        <!-- loading overlay -->
        <div
          v-if="bankBook.isLoading.value || fetchingImage"
          class="absolute inset-0 bg-white/70 flex items-center justify-center"
        >
          <svg class="w-6 h-6 text-[#1A56DB] animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
        </div>
      </div>
      <div class="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
        <div class="flex flex-col min-w-0 max-w-[60%]">
          <span class="text-[12px] text-slate-500 truncate">
            {{ bankBook.file.value?.name ?? 'รูปเดิมจากระบบ' }}
          </span>
          <span v-if="bankBook.file.value" class="text-[11px] text-slate-400">
            {{ bankBook.file.value.size < 1024 * 1024
              ? `${(bankBook.file.value.size / 1024).toFixed(0)} KB`
              : `${(bankBook.file.value.size / (1024 * 1024)).toFixed(2)} MB` }}
          </span>
        </div>
        <button
          type="button"
          @click="handleClear"
          class="text-[13px] font-medium text-red-500 hover:text-red-600 active:scale-95 transition-all flex-shrink-0"
        >
          ลบและถ่ายใหม่
        </button>
      </div>
    </div>

    <!-- ═════════════ OCR Status ═════════════ -->

    <!-- Loading -->
    <div v-if="ocrLoading" class="mt-3 flex items-center gap-2.5 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5">
      <svg class="w-4 h-4 text-[#1A56DB] animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
      </svg>
      <p class="text-[13px] text-[#1A56DB] font-medium">กำลังตรวจสอบข้อมูลสมุดบัญชี...</p>
    </div>

    <!-- Error (รวม blurry / no_text) -->
    <div v-else-if="ocrError" class="mt-3 flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
      <svg class="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd"/>
      </svg>
      <p class="text-[12px] text-red-700 leading-snug">{{ ocrError }}</p>
    </div>

    <!-- Match ✓ -->
    <div v-else-if="ocrResult?.bank_info?.match_status === 'match'" class="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 space-y-1.5">
      <div class="flex items-center gap-2">
        <svg class="w-4 h-4 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p class="text-[13px] font-semibold text-emerald-700">ตรวจสอบสมุดบัญชีสำเร็จ ✓</p>
      </div>
      <div class="text-[12px] text-emerald-700 space-y-0.5 ml-6">
        <p v-if="ocrResult.bank_info.bank_name"><strong>ธนาคาร:</strong> {{ ocrResult.bank_info.bank_name }}</p>
        <p v-if="ocrResult.bank_info.account_number"><strong>เลขที่บัญชี:</strong> {{ ocrResult.bank_info.account_number }}</p>
        <p v-if="ocrResult.bank_info.account_name"><strong>ชื่อบัญชี:</strong> {{ ocrResult.bank_info.account_name }}</p>
        <p class="text-[11px] text-emerald-500 mt-1">คะแนนความตรงกัน {{ ocrResult.bank_info.fuzzy_score.toFixed(1) }}%</p>
      </div>
    </div>

    <!-- Review ⚠ -->
    <div v-else-if="ocrResult?.bank_info?.match_status === 'review'" class="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 space-y-1.5">
      <div class="flex items-center gap-2">
        <svg class="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <p class="text-[13px] font-semibold text-amber-700">กรุณาตรวจสอบข้อมูลอีกครั้ง</p>
      </div>
      <div class="text-[12px] text-amber-700 space-y-0.5 ml-6">
        <p v-if="ocrResult.bank_info.bank_name"><strong>ธนาคาร:</strong> {{ ocrResult.bank_info.bank_name }}</p>
        <p v-if="ocrResult.bank_info.account_number"><strong>เลขที่บัญชี:</strong> {{ ocrResult.bank_info.account_number }}</p>
        <p v-if="ocrResult.bank_info.account_name"><strong>ชื่อบัญชี:</strong> {{ ocrResult.bank_info.account_name }}</p>
        <p class="text-[11px] text-amber-500 mt-1">คะแนนความตรงกัน {{ ocrResult.bank_info.fuzzy_score.toFixed(1) }}% — อาจมีบางส่วนไม่ตรง</p>
      </div>
    </div>

    <!-- Mismatch ✗ -->
    <div v-else-if="ocrResult?.bank_info?.match_status === 'mismatch'" class="mt-3 flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
      <svg class="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd"/>
      </svg>
      <div>
        <p class="text-[13px] font-semibold text-red-700">ชื่อเจ้าของบัญชีไม่ตรงกับผู้ยื่นคำขอ</p>
        <p class="text-[12px] text-red-600 mt-0.5">กรุณาตรวจสอบรูปสมุดบัญชีหรืออัปโหลดใหม่</p>
        <p v-if="ocrResult.bank_info.account_name" class="text-[11px] text-red-500 mt-0.5">ชื่อในบัญชี: {{ ocrResult.bank_info.account_name }}</p>
      </div>
    </div>

    <!-- ═════════════ Upload buttons (เมื่อยังไม่มีรูป) ═════════════ -->
    <div
      v-else
      class="border-2 border-dashed rounded-xl p-4 transition-colors"
      :class="(bankBook.isLoading.value || fetchingImage) ? 'border-[#1A56DB]/40 bg-blue-50/50' : 'border-slate-200'"
    >
      <div class="flex items-center gap-2 mb-4">
        <svg v-if="!(bankBook.isLoading.value || fetchingImage)" class="w-5 h-5 text-[#1A56DB] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 11l5-5 5 5M12 6v12" />
        </svg>
        <svg v-else class="w-5 h-5 text-[#1A56DB] flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        <p class="text-[13px] font-medium leading-snug transition-colors" :class="(bankBook.isLoading.value || fetchingImage) ? 'text-[#1A56DB]' : 'text-slate-600'">
          {{ (bankBook.isLoading.value || fetchingImage) ? 'กำลังโหลดรูปภาพ...' : 'ถ่ายหรืออัปโหลดรูปหน้าสมุดบัญชีธนาคาร' }}
        </p>
      </div>

      <div class="flex gap-3">
        <label
          for="camera-input"
          class="flex-1 flex items-center justify-center gap-2 border border-slate-200 rounded-xl py-2.5 text-[13px] font-medium text-slate-700 bg-white hover:border-[#1A56DB] hover:text-[#1A56DB] active:scale-[0.98] transition-all cursor-pointer select-none"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          ถ่ายภาพ
        </label>
        <label
          for="gallery-input"
          class="flex-1 flex items-center justify-center gap-2 border border-slate-200 rounded-xl py-2.5 text-[13px] font-medium text-slate-700 bg-white hover:border-[#1A56DB] hover:text-[#1A56DB] active:scale-[0.98] transition-all cursor-pointer select-none"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          เลือกจาก Gallery
        </label>
      </div>
    </div>

    <!-- hidden file inputs -->
    <input
      id="camera-input"
      type="file"
      accept="image/*"
      capture="environment"
      class="hidden"
      @change="bankBook.handleFileSelect"
    />
    <input
      id="gallery-input"
      type="file"
      accept="image/*"
      class="hidden"
      @change="bankBook.handleFileSelect"
    />
  </div>
</template>
