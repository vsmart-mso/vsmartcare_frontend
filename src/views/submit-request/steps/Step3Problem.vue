<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useImageUpload } from '@/composables/useImageUpload'
import { useApplicationStore } from '@/stores/application'
import { lookupsApi } from '@/api/lookups'
import { welfareApi } from '@/api/welfare'

const app = useApplicationStore()

// ─── 9.1 รายละเอียดปัญหา ─────────────────────────────────────────────────────
const problemDescription = ref('')

// ─── 10.1 ประเภทความช่วยเหลือ ────────────────────────────────────────────────
const aidTypes = ref<string[]>([])
const aidTypeOptions = ref<{ value: string; label: string }[]>([])

function toggleAidType(value: string) {
  const idx = aidTypes.value.indexOf(value)
  if (idx === -1) aidTypes.value.push(value)
  else aidTypes.value.splice(idx, 1)
}

// ─── 10.2 ข้อมูลบัญชีธนาคาร ─────────────────────────────────────────────────
const bankNameId  = ref('')   // applicants.bank_name_id — เก็บเป็น string เพื่อ v-model select
const bankOptions = ref<{ value: string; label: string }[]>([])
const bankAccount = ref('')

const bankAccountTouched = ref(false)

// รับเฉพาะตัวเลขและขีด - และจำกัดความยาวรวมไม่เกิน 15 ตัว
function handleBankAccountInput(e: Event) {
  const el = e.target as HTMLInputElement
  const filtered = el.value.replace(/[^0-9-]/g, '').slice(0, 15)
  bankAccount.value = filtered
  el.value = filtered
}

// error เฉพาะกรณีที่กรอกแล้วและช่องว่าง
const bankAccountError = computed(() =>
  bankAccountTouched.value && !bankAccount.value.trim()
    ? 'กรุณากรอกเลขที่บัญชี'
    : ''
)

// flag กันไม่ให้ watcher ยิง reset ระหว่าง onMounted กำลัง restore ข้อมูล
const isRestoring = ref(false)

// เมื่อเปลี่ยนธนาคาร ให้ reset ช่องเลขบัญชีและ touched ใหม่
// แต่ข้ามช่วงที่ onMounted กำลัง pre-fill ข้อมูลจาก store
watch(bankNameId, () => {
  if (isRestoring.value) return
  bankAccount.value = ''
  bankAccountTouched.value = false
})

// ─── รูปหน้าสมุดบัญชีธนาคาร ──────────────────────────────────────────────────
// compress ที่ frontend ก่อน upload: max 1200×1600px, WebP quality 82%
const bankBook = useImageUpload({ maxWidth: 1200, maxHeight: 1600, quality: 0.82 })
const fetchingBankBook = ref(false)

// computed preview — ใช้ local preview ก่อน ถ้าไม่มีใช้ blob URL จาก server (edit mode)
const previewBankBook = computed(() => bankBook.previewUrl.value || app.existingImageUrls['bank_book'] || '')

// ─── Validation ───────────────────────────────────────────────────────────────
const isReady = computed(() => {
  if (!problemDescription.value.trim()) return false
  if (aidTypes.value.length === 0) return false
  if (!bankNameId.value) return false
  if (!bankAccount.value.trim()) return false
  if (!bankBook.file.value && !app.existingImageUrls['bank_book']) return false
  return true
})

const emit = defineEmits<{ 'update:ready': [boolean] }>()
watch(isReady, (val) => emit('update:ready', val), { immediate: true })

// ─── Sync bankBook file → store (key คงที่ 'bank_book') ──────────────────────
// watch แยกไว้เพื่อให้ store มีไฟล์อยู่เสมอ แม้ parent ยังไม่เรียก getData()
watch(() => bankBook.file.value, (file) => {
  if (file) {
    app.addDocument(
      { id: 'bank_book', docType: 'bank_book', fileName: file.name, fileSizeBytes: file.size, mimeType: file.type },
      file,
    )
  } else {
    app.removeDocument('bank_book')
  }
})

// ─── Pre-fill จาก store เมื่อ user ย้อนกลับ ─────────────────────────────────
onMounted(async () => {
  // ดึงประเภทความช่วยเหลือและรายชื่อธนาคารจาก API พร้อมกัน
  const [requestTypeData, bankNameData] = await Promise.all([
    lookupsApi.fetchRequestTypes().catch(() => []),
    lookupsApi.fetchBankNames().catch(() => []),
  ])
  // กรองเฉพาะ "ช่วยเหลือเป็นเงิน" เพื่อให้แสดงแค่ตัวเลือกนี้
  aidTypeOptions.value = requestTypeData
    .map(d => ({ value: String(d.id), label: d.name }))
    .filter(opt => opt.label.includes('ช่วยเหลือเป็นเงิน'))
  bankOptions.value    = bankNameData.map(d => ({ value: String(d.id), label: d.name }))

  // auto-select อัตโนมัติ เพราะมีตัวเลือกเดียว (เฉพาะกรณีที่ยังไม่มีข้อมูลใน store)
  if (aidTypeOptions.value.length > 0 && !app.step3) {
    aidTypes.value = [aidTypeOptions.value[0].value]
  }

  const s = app.step3
  if (s) {
    isRestoring.value = true          // บอก watcher ให้ข้ามการ reset
    problemDescription.value = s.problemDescription
    aidTypes.value           = [...s.aidTypes]
    bankNameId.value         = s.bankNameId
    bankAccount.value        = s.bankAccount
    await nextTick()                  // รอให้ watcher ที่ถูก schedule ไว้ยิงก่อน
    isRestoring.value = false         // คืนสถานะปกติให้ watcher ทำงานเมื่อ user เปลี่ยนธนาคาร
  }

  // restore สมุดบัญชีจาก store (File object ยังอยู่ใน app.files แม้ component จะ unmount ไปแล้ว)
  const storedBankBook = app.getFile('bank_book')
  if (storedBankBook) {
    bankBook.restore(storedBankBook)
    return  // มี local file แล้ว — ไม่ต้อง fetch จาก server
  }

  // Edit mode: lazy-fetch รูปสมุดบัญชีจาก server (fetch เฉพาะเมื่อยังไม่มี cache)
  if (app.editMode && app.editApplicantId && !app.existingImageUrls['bank_book']) {
    const evidenceId = app.existingEvidenceIds['bank_book']
    if (evidenceId) {
      fetchingBankBook.value = true
      try {
        const url = await welfareApi.fetchEvidenceAsObjectUrl(app.editApplicantId, evidenceId)
        if (url) app.setExistingImage('bank_book', url)
      } finally {
        fetchingBankBook.value = false
      }
    }
  }
})

defineExpose({
  getData: () => ({
    problemDescription: problemDescription.value,
    aidTypes:           aidTypes.value,
    bankNameId:         bankNameId.value,
    bankAccount:        bankAccount.value.replace(/-/g, ''),
    // bankBookPhoto ส่งผ่าน store (key 'bank_book') — ไม่ส่งผ่าน getData()
  }),
})
</script>

<template>
  <div class="space-y-4">

    <!-- ════════════════════════════════════════════════════════
         Section 9: สภาพปัญหาความเดือดร้อนของครอบครัว
         ════════════════════════════════════════════════════════ -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
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
        </div>

        <label class="block text-[13px] text-slate-600 mb-1.5 font-medium">
          สภาพปัญหาความเดือดร้อนของครอบครัว <span class="text-red-500">*</span>
        </label>
        <textarea
          v-model="problemDescription"
          rows="5"
          placeholder="อธิบายสภาพปัญหาและความเดือดร้อนที่ประสบ..."
          class="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB] resize-none leading-relaxed"
        />

      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════
         Section 10: ความช่วยเหลือที่ต้องการ
         ════════════════════════════════════════════════════════ -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="flex items-center gap-3 bg-blue-50 px-4 py-3 border-b border-blue-100">
        <div class="w-8 h-8 rounded-full bg-[#1A56DB] flex items-center justify-center flex-shrink-0">
          <span class="text-white text-[13px] font-bold">10</span>
        </div>
        <p class="text-[14px] font-bold text-[#1A56DB]">ความช่วยเหลือที่ต้องการ</p>
      </div>
      <div class="p-4 space-y-4">

        <!-- 10.1 ประเภทความช่วยเหลือ -->
        <div>
          <div class="flex items-center gap-2 mb-1.5">
            <span class="bg-blue-100 text-[#1A56DB] text-[11px] font-bold px-2 py-0.5 rounded-md">10.1</span>
            <span class="text-[13px] font-medium text-slate-600">ประเภทความช่วยเหลือ <span class="text-red-500">*</span></span>
          </div>
          <!-- <p class="text-[12px] text-slate-500 mb-3">เลือกได้หลายข้อ </p> -->

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
        </div>

        <div class="h-px bg-slate-100" />

        <!-- 10.2 ข้อมูลบัญชีธนาคาร -->
        <div>
          <div class="flex items-center gap-2 mb-3">
            <span class="bg-blue-100 text-[#1A56DB] text-[11px] font-bold px-2 py-0.5 rounded-md">10.2</span>
            <span class="text-[13px] font-medium text-slate-600">ข้อมูลบัญชีธนาคาร</span>
          </div>

          <!-- ธนาคาร -->
          <div class="mb-4">
            <label class="block text-[13px] text-slate-600 mb-1.5 font-medium">
              ธนาคาร <span class="text-red-500">*</span>
            </label>
            <div class="relative">
              <select
                v-model="bankNameId"
                class="w-full appearance-none bg-white border border-slate-200 rounded-xl px-4 py-3 text-[14px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB] transition-colors"
                :class="bankNameId ? 'border-slate-300' : 'border-slate-200'"
              >
                <option value="" disabled>— กรุณาเลือกธนาคาร —</option>
                <option v-for="opt in bankOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
              <div class="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
                <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          <!-- เลขที่บัญชี -->
          <div class="mb-4">
            <label class="block text-[13px] text-slate-600 mb-1.5 font-medium">
              เลขที่บัญชี <span class="text-red-500">*</span>
            </label>
            <input
              :value="bankAccount"
              @input="handleBankAccountInput"
              @blur="bankAccountTouched = true"
              type="text"
              inputmode="numeric"
              placeholder="เช่น 123-4-56789-0"
              class="w-full border rounded-xl px-4 py-3 text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors"
              :class="bankAccountError
                ? 'border-red-300 focus:ring-red-200'
                : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'"
            />
            <p v-if="bankAccountError" class="text-[11px] text-red-500 mt-1 px-1">{{ bankAccountError }}</p>
          </div>

          <!-- รูปหน้าสมุดบัญชีธนาคาร -->
          <div>
            <label class="block text-[13px] text-slate-600 mb-1.5 font-medium">
              รูปหน้าสมุดบัญชีธนาคาร <span class="text-red-500">*</span>
            </label>

            <!-- error message -->
            <p v-if="bankBook.error.value" class="mb-2 text-[12px] text-red-500">
              {{ bankBook.error.value }}
            </p>

            <!-- แสดงพรีวิวเมื่ออัปโหลดแล้ว (local file หรือ server image) -->
            <div v-if="previewBankBook" class="border border-slate-200 rounded-xl overflow-hidden">
              <div class="relative">
                <img
                  :src="previewBankBook"
                  alt="รูปสมุดบัญชี"
                  class="w-full object-contain max-h-48 bg-slate-50"
                />
                <!-- loading overlay ขณะ compress หรือ fetch จาก server -->
                <div v-if="bankBook.isLoading.value || fetchingBankBook" class="absolute inset-0 bg-white/70 flex items-center justify-center">
                  <svg class="w-6 h-6 text-[#1A56DB] animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                </div>
              </div>
              <div class="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
                <div class="flex flex-col min-w-0 max-w-[60%]">
                  <span class="text-[12px] text-slate-500 truncate">{{ bankBook.file.value?.name ?? 'รูปเดิมจากระบบ' }}</span>
                  <span v-if="bankBook.file.value" class="text-[11px] text-slate-400">
                    {{ bankBook.file.value.size < 1024 * 1024
                      ? `${(bankBook.file.value.size / 1024).toFixed(0)} KB`
                      : `${(bankBook.file.value.size / (1024 * 1024)).toFixed(2)} MB` }}
                  </span>
                </div>
                <button
                  type="button"
                  @click="bankBook.clear(); app.clearExistingImage('bank_book')"
                  class="text-[13px] font-medium text-red-500 hover:text-red-600 active:scale-95 transition-all flex-shrink-0"
                >
                  ลบและถ่ายใหม่
                </button>
              </div>
            </div>

            <!-- ปุ่มอัปโหลดเมื่อยังไม่มีรูป -->
            <div
              v-else
              class="border-2 border-dashed rounded-xl p-4 transition-colors"
              :class="(bankBook.isLoading.value || fetchingBankBook) ? 'border-[#1A56DB]/40 bg-blue-50/50' : 'border-slate-200'"
            >
              <div class="flex items-center gap-2 mb-4">
                <!-- ไอคอน upload / spinner ขณะ compress หรือ fetch -->
                <svg v-if="!(bankBook.isLoading.value || fetchingBankBook)" class="w-5 h-5 text-[#1A56DB] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 11l5-5 5 5M12 6v12" />
                </svg>
                <svg v-else class="w-5 h-5 text-[#1A56DB] flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                <p class="text-[13px] font-medium leading-snug transition-colors" :class="(bankBook.isLoading.value || fetchingBankBook) ? 'text-[#1A56DB]' : 'text-slate-600'">
                  {{ (bankBook.isLoading.value || fetchingBankBook) ? 'กำลังโหลดรูปภาพ...' : 'ถ่ายหรืออัปโหลดรูปหน้าสมุดบัญชีธนาคาร' }}
                </p>
              </div>

              <div class="flex gap-3">
                <!--
                  ใช้ <label for> แทน JS .click() เพื่อให้ capture="environment"
                  ทำงานได้บน iOS Safari ซึ่งจะ ignore capture เมื่อถูก trigger จาก script
                  วิธีนี้คือมาตรฐาน W3C Media Capture spec ที่รองรับทั้ง iOS/Android
                -->
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

            <!--
              input ถ่ายภาพ: capture="environment" → เปิดกล้องหลังโดยตรงบน iOS/Android
              ต้องใช้ id เพื่อให้ <label for> ทำงานได้
            -->
            <input
              id="camera-input"
              type="file"
              accept="image/*"
              capture="environment"
              class="hidden"
              @change="bankBook.handleFileSelect"
            />
            <!-- input gallery: ไม่มี capture → เปิด photo picker / file chooser -->
            <input
              id="gallery-input"
              type="file"
              accept="image/*"
              class="hidden"
              @change="bankBook.handleFileSelect"
            />
          </div>
        </div>

      </div>
    </div>

  </div>
</template>
