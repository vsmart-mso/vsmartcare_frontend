<script setup lang="ts">
import { computed, watch, onMounted, ref } from 'vue'
import { useImageUpload, compressImage } from '@/composables/useImageUpload'
import PhotoUploadCard from '../components/PhotoUploadCard.vue'
import BankBookOcrStatus from '../components/BankBookOcrStatus.vue'
import FieldAlert from '@/components/ui/FieldAlert.vue'
import SearchableSelect from '@/components/SearchableSelect.vue'
import { useApplicationStore } from '@/stores/application'
import { useAuthStore } from '@/stores/auth'
import type { ThaiDUser } from '@/types/auth'
import { lookupsApi } from '@/api/lookups'
import { welfareApi } from '@/api/welfare'
import { isDevMockSession, loadBankBookFixture } from '@/dev/mock/fixtures'

const emit = defineEmits<{
  'update:ready': [boolean]
  'navigate-to-step': [number]
  'update:loading': [boolean]
}>()

const app  = useApplicationStore()
const auth = useAuthStore()

// ─── filterFields prop ────────────────────────────────────────────────────────
const props = defineProps<{ filterFields?: string[] }>()
const show = (name: string): boolean => !props.filterFields || props.filterFields.includes(name)

// KTB: ปิดใน flow ยื่นคำขอใหม่ — เปิดเฉพาะแก้ไขคำขอเก่าที่เคยแนบ KTB และเจ้าหน้าที่ตีกลับ field นี้
const showKtbUpload = computed(() =>
  !!props.filterFields &&
  show('doc_ktb_corporate') &&
  !!app.existingEvidenceIds['ktb_form'],
)

const commentMap = computed(() => {
  const m = new Map<string, string>()
  for (const c of app.reviewComments) m.set(c.name, c.reason)
  return m
})

// ─── Section 13: รูปภาพหลักฐานการเยี่ยมบ้าน (บังคับทั้ง 5 รูป) ──────────────
const exterior = useImageUpload({ maxWidth: 1200, maxHeight: 1600, quality: 0.80 })
const interior = useImageUpload({ maxWidth: 1200, maxHeight: 1600, quality: 0.80 })
const person   = useImageUpload({ maxWidth: 900,  maxHeight: 1200, quality: 0.82 })
const problem  = useImageUpload({ maxWidth: 1200, maxHeight: 1600, quality: 0.80 })
const family   = useImageUpload({ maxWidth: 1200, maxHeight: 900,  quality: 0.80 })

// ─── Section 14: เอกสารแนบเพิ่มเติม (ไม่บังคับ) ────────────────────────────
const houseHome    = useImageUpload({ maxWidth: 1200, maxHeight: 1600, quality: 0.85 })
const housePerson  = useImageUpload({ maxWidth: 1200, maxHeight: 1600, quality: 0.85 })
const ktbForm      = useImageUpload({ maxWidth: 1200, maxHeight: 1600, quality: 0.85 })
// รูปอื่น ๆ รองรับสูงสุด 3 รูป (other_doc_0 / other_doc_1 / other_doc_2)
const otherDoc     = useImageUpload({ maxWidth: 1200, maxHeight: 1600, quality: 0.85 })
const otherDoc1    = useImageUpload({ maxWidth: 1200, maxHeight: 1600, quality: 0.85 })
const otherDoc2    = useImageUpload({ maxWidth: 1200, maxHeight: 1600, quality: 0.85 })
const otherDocName  = ref('') // ชื่อเอกสาร slot 0 — backend บังคับส่งเมื่ออัปโหลด
const otherDocName1 = ref('') // ชื่อเอกสาร slot 1
const otherDocName2 = ref('') // ชื่อเอกสาร slot 2
const otherDocCount = ref(1)  // จำนวน slot ที่แสดง (1–3 ขึ้นอยู่กับที่ผู้ใช้กด "เพิ่ม")

// ─── รูปหน้าสมุดบัญชีธนาคาร (ย้ายมาจาก Step3 ตามมติประชุม 2026-05-19) ─────────
// compress: max 1200×1600px, WebP quality 82% — เหมือนเดิมตอนอยู่ Step3
const bankBook = useImageUpload({ maxWidth: 1200, maxHeight: 1600, quality: 0.82 })
const fetchingBankBook = ref(false)
const loadingBankBookFixture = ref(false)
const showDevMockBankBookHint = computed(() => isDevMockSession())

// bankOptions ดึงจาก lookups API — ส่งให้ BankBookOcrStatus ใช้ map ชื่อ→id
const bankOptions = ref<{ value: string; label: string }[]>([])
// accountTypeOptions (ประเภทเงินฝาก) — ส่งให้ BankBookOcrStatus ใช้ map deposit_type→id
const accountTypeOptions = ref<{ value: string; label: string }[]>([])
const bankAccountTypeId = ref('')
const accountTypeSelectOptions = computed(() => [
  { value: '', label: '-- ยังไม่เลือก --' },
  ...accountTypeOptions.value,
])

// ─── OCR helpers ────────────────────────────────────────────────────────────
const ocrRef = ref<InstanceType<typeof BankBookOcrStatus> | null>(null)

// target name สำหรับให้ OCR เทียบกับชื่อในสมุดบัญชี
const ocrTargetName = computed(() => {
  const u = auth.user as ThaiDUser | null
  if (!u?.title || !u?.fname || !u?.lname) return ''
  return `${u.title} ${u.fname} ${u.lname}`
})

// หยุด OCR ชั่วคราวระหว่าง compress หรือ fetch จาก server
const ocrDisabled = computed(() => bankBook.isLoading.value || fetchingBankBook.value)

// OCR auto-fill: เขียนค่าลง store โดยตรง (Step3 unmount แล้ว — ใช้ setBankInfo)
function handleOcrAutoFill(payload: {
  bankNameId: string
  accountNumber: string
  bankAccountTypeId: string
  branchName: string
}) {
  bankAccountTypeId.value = payload.bankAccountTypeId || ''
  app.setBankInfo(
    payload.bankNameId        || app.step3?.bankNameId        || '',
    payload.accountNumber     || app.step3?.bankAccount       || '',
    bankAccountTypeId.value,
    payload.branchName        || app.step3?.bankBranchName    || '',
  )
}

function syncBankAccountType() {
  app.setBankInfo(
    app.step3?.bankNameId ?? '',
    app.step3?.bankAccount ?? '',
    bankAccountTypeId.value,
    app.step3?.bankBranchName ?? '',
  )
}

// computed preview — ใช้ local preview ก่อน ถ้าไม่มีใช้ blob URL จาก server (edit mode)
const previewBankBook = computed(() => bankBook.previewUrl.value || app.existingImageUrls['bank_book'] || '')

// ─── Edit mode: loading flag ขณะ fetch รูปจาก server ──────────────────────────
const fetchingImages = ref(false)

// ─── Lightbox: แสดง preview เต็มจอสำหรับรูปสมุดบัญชี ──────────────────────────
const showBankBookPreview = ref(false)
const bankBookInputRef = ref<HTMLInputElement | null>(null)

function clearBankBook() {
  bankBook.clear()
  app.clearExistingImage('bank_book')
  ocrRef.value?.reset()
}

async function applyBankBookFixture() {
  if (loadingBankBookFixture.value || bankBook.isLoading.value) return
  loadingBankBookFixture.value = true
  bankBook.error.value = ''
  try {
    if (bankBook.previewUrl.value) URL.revokeObjectURL(bankBook.previewUrl.value)
    const raw = await loadBankBookFixture()
    const result = await compressImage(raw, { maxWidth: 1200, maxHeight: 1600, quality: 0.82 })
    bankBook.restore(result.file)
  } catch (err) {
    bankBook.error.value = 'โหลดรูปตัวอย่างไม่สำเร็จ'
    console.error(err)
  } finally {
    loadingBankBookFixture.value = false
  }
}

// ตรวจสอบว่า slot มีรูปอยู่ (local file หรือ server blob URL ใน store)
function hasImg(uploader: ReturnType<typeof useImageUpload>, key: string): boolean {
  return !!uploader.file.value || !!app.existingImageUrls[key]
}

// ล้างรูปทั้ง local file และ server image ของ slot นั้น
function clrImg(uploader: ReturnType<typeof useImageUpload>, key: string) {
  uploader.clear()
  app.clearExistingImage(key)
}

// computed preview URLs — ใช้ local preview ก่อน ถ้าไม่มีใช้ blob URL จาก server
const previewExterior    = computed(() => exterior.previewUrl.value    || app.existingImageUrls['exterior']     || '')
const previewInterior    = computed(() => interior.previewUrl.value    || app.existingImageUrls['interior']     || '')
const previewPerson      = computed(() => person.previewUrl.value      || app.existingImageUrls['person']       || '')
const previewProblem     = computed(() => problem.previewUrl.value     || app.existingImageUrls['problem']      || '')
const previewFamily      = computed(() => family.previewUrl.value      || app.existingImageUrls['family']       || '')
const previewHouseHome   = computed(() => houseHome.previewUrl.value   || app.existingImageUrls['house_home']   || '')
const previewHousePerson = computed(() => housePerson.previewUrl.value || app.existingImageUrls['house_person'] || '')
const previewKtbForm     = computed(() => ktbForm.previewUrl.value     || app.existingImageUrls['ktb_form']     || '')
const previewOtherDoc0   = computed(() => otherDoc.previewUrl.value    || app.existingImageUrls['other_doc_0']   || '')
const previewOtherDoc1   = computed(() => otherDoc1.previewUrl.value   || app.existingImageUrls['other_doc_1']   || '')
const previewOtherDoc2   = computed(() => otherDoc2.previewUrl.value   || app.existingImageUrls['other_doc_2']   || '')

// นับรูปทั้งหมดที่อัปโหลดแล้ว (นับทั้ง local file และ server image)
const totalUploaded = computed(() =>
  [
    { u: exterior,    k: 'exterior'     },
    { u: interior,    k: 'interior'     },
    { u: person,      k: 'person'       },
    { u: problem,     k: 'problem'      },
    { u: family,      k: 'family'       },
    { u: houseHome,   k: 'house_home'   },
    { u: housePerson, k: 'house_person' },
    { u: ktbForm,     k: 'ktb_form'     },
    { u: otherDoc,    k: 'other_doc_0'  },
    { u: otherDoc1,   k: 'other_doc_1'  },
    { u: otherDoc2,   k: 'other_doc_2'  },
    { u: bankBook,    k: 'bank_book'    },
  ].filter(({ u, k }) => u.file.value || app.existingImageUrls[k]).length,
)

// ─── Validation ────────────────────────────────────────────────────────────────
const otherDocNameRequired0 = computed(() => hasImg(otherDoc,  'other_doc_0') && !otherDocName.value.trim())
const otherDocNameRequired1 = computed(() => otherDocCount.value >= 2 && hasImg(otherDoc1, 'other_doc_1') && !otherDocName1.value.trim())
const otherDocNameRequired2 = computed(() => otherDocCount.value >= 3 && hasImg(otherDoc2, 'other_doc_2') && !otherDocName2.value.trim())
// validation รวม — ใช้ใน isReady
const otherDocNameRequired  = computed(() => otherDocNameRequired0.value || otherDocNameRequired1.value || otherDocNameRequired2.value)
const showManualAccountType = computed(() =>
  !!previewBankBook.value &&
  !app.bankBookOcrLoading &&
  !!app.bankBookOcrResult?.bank_info &&
  (app.bankBookOcrResult.bank_info.match_status === 'match' || app.bankBookOcrResult.bank_info.match_status === 'review') &&
  !app.bankBookOcrResult.bank_info.deposit_type?.trim()
)
// field ที่ซ่อน (ไม่อยู่ใน filterFields) ถือว่า valid เสมอ
// bank_book_photo เป็น required ตามมติประชุม 2026-05-19 (ย้ายจาก Step3 มา Step4)
const isReady = computed(() =>
  (!show('evidence_house_exterior') || hasImg(exterior, 'exterior')) &&
  (!show('evidence_house_interior') || hasImg(interior, 'interior')) &&
  (!show('evidence_person_photo')   || hasImg(person,   'person'))   &&
  (!show('evidence_problem_photo')  || hasImg(problem,  'problem'))  &&
  (!show('evidence_family_photo')   || hasImg(family,   'family'))   &&
  (!show('bank_book_photo')         || hasImg(bankBook, 'bank_book')) &&
  // ทะเบียนบ้าน 2 ใบเป็น required — ต้องมีรูปครบจึงจะไปต่อได้
  (!show('doc_house_registration_house')   || hasImg(houseHome,   'house_home'))   &&
  (!show('doc_house_registration_person')  || hasImg(housePerson, 'house_person')) &&
  (!showKtbUpload.value                    || hasImg(ktbForm,     'ktb_form'))     &&
  !otherDocNameRequired.value
)

watch(isReady, (val) => emit('update:ready', val), { immediate: true })

// ─── แจ้ง parent ขณะโหลดรูปเดิมจาก server (โหมดแก้ไข) ────────────────────────
// Step นี้ไม่มีตัวเลือกจาก API จึงไม่ต้องโชว์ skeleton เต็มหน้า — การ์ดรูปแต่ละใบ
// มี spinner ของตัวเองอยู่แล้ว แค่บอก parent ให้ปิดปุ่ม "ถัดไป" ระหว่างโหลด
watch(fetchingImages, (val) => emit('update:loading', val), { immediate: true })

// ─── Sync ทุกไฟล์เข้า store (welfare_evidences) ──────────────────────────────
// ใช้ key คงที่เป็น docType เดียวกับ id เพื่อให้ addDocument() แทนที่แทนซ้ำ
function syncFile(id: string, docType: string, file: File | null, otherTypeName?: string) {
  if (file) {
    app.addDocument({ id, docType, fileName: file.name, fileSizeBytes: file.size, mimeType: file.type, otherTypeName }, file)
  } else {
    app.removeDocument(id)
  }
}
watch(() => exterior.file.value,    (f) => syncFile('exterior',     'exterior',     f ?? null))
watch(() => interior.file.value,    (f) => syncFile('interior',     'interior',     f ?? null))
watch(() => person.file.value,      (f) => syncFile('person',       'person',       f ?? null))
watch(() => problem.file.value,     (f) => syncFile('problem',      'problem',      f ?? null))
watch(() => family.file.value,      (f) => syncFile('family',       'family',       f ?? null))
watch(() => houseHome.file.value,   (f) => syncFile('house_home',   'house_home',   f ?? null))
watch(() => housePerson.file.value, (f) => syncFile('house_person', 'house_person', f ?? null))
watch(() => ktbForm.file.value,     (f) => syncFile('ktb_form',     'ktb_form',     f ?? null))
watch(() => otherDoc.file.value,    (f) => syncFile('other_doc_0',  'other_doc_0',  f ?? null, otherDocName.value))
watch(() => otherDoc1.file.value,   (f) => syncFile('other_doc_1',  'other_doc_1',  f ?? null, otherDocName1.value))
watch(() => otherDoc2.file.value,   (f) => syncFile('other_doc_2',  'other_doc_2',  f ?? null, otherDocName2.value))
watch(() => bankBook.file.value,    (f) => syncFile('bank_book',    'bank_book',    f ?? null))

// เมื่อชื่อเปลี่ยน ให้ persist ลง store เสมอ และ sync metadata ถ้ามีไฟล์
watch(otherDocName, (name) => {
  app.existingOtherTypeNames['other_doc_0'] = name
  const f = otherDoc.file.value
  if (!f) return
  app.addDocument({ id: 'other_doc_0', docType: 'other_doc_0', fileName: f.name, fileSizeBytes: f.size, mimeType: f.type, otherTypeName: name }, f)
})
watch(otherDocName1, (name) => {
  app.existingOtherTypeNames['other_doc_1'] = name
  const f = otherDoc1.file.value
  if (!f) return
  app.addDocument({ id: 'other_doc_1', docType: 'other_doc_1', fileName: f.name, fileSizeBytes: f.size, mimeType: f.type, otherTypeName: name }, f)
})
watch(otherDocName2, (name) => {
  app.existingOtherTypeNames['other_doc_2'] = name
  const f = otherDoc2.file.value
  if (!f) return
  app.addDocument({ id: 'other_doc_2', docType: 'other_doc_2', fileName: f.name, fileSizeBytes: f.size, mimeType: f.type, otherTypeName: name }, f)
})

// เมื่อ component mount ใหม่ (เช่น ผู้ใช้กลับมา Step4) ให้ restore ไฟล์จาก store
// File object ยังอยู่ใน app.files (Map ใน Pinia) แต่ preview ใน useImageUpload หายไปแล้ว
onMounted(async () => {
  bankAccountTypeId.value = app.step3?.bankAccountTypeId ?? ''

  // field = ชื่อ reviewComment ของ slot นั้น — ใช้ guard การ fetch รูปในโหมด edit-request
  const slots: Array<{ id: string; field: string; uploader: ReturnType<typeof useImageUpload> }> = [
    { id: 'exterior',     field: 'evidence_house_exterior',       uploader: exterior     },
    { id: 'interior',     field: 'evidence_house_interior',       uploader: interior     },
    { id: 'person',       field: 'evidence_person_photo',         uploader: person       },
    { id: 'problem',      field: 'evidence_problem_photo',        uploader: problem      },
    { id: 'family',       field: 'evidence_family_photo',         uploader: family       },
    { id: 'house_home',   field: 'doc_house_registration_house',  uploader: houseHome    },
    { id: 'house_person', field: 'doc_house_registration_person', uploader: housePerson  },
    { id: 'ktb_form',     field: 'doc_ktb_corporate',             uploader: ktbForm      },
    { id: 'other_doc_0',  field: 'doc_other',                     uploader: otherDoc     },
    { id: 'other_doc_1',  field: 'doc_other',                     uploader: otherDoc1    },
    { id: 'other_doc_2',  field: 'doc_other',                     uploader: otherDoc2    },
    { id: 'bank_book',    field: 'bank_book_photo',               uploader: bankBook     },
  ]

  // 1. restore local files จาก store (กรณี user กลับมา Step4 โดยไม่ออกจากหน้า)
  for (const { id, uploader } of slots) {
    const stored = app.getFile(id)
    if (stored) uploader.restore(stored)
  }

  // 2. restore ชื่อเอกสาร "อื่นๆ" แต่ละ slot — existingOtherTypeNames เก็บค่าล่าสุดเสมอ
  if (app.existingOtherTypeNames['other_doc_0']) otherDocName.value  = app.existingOtherTypeNames['other_doc_0']
  if (app.existingOtherTypeNames['other_doc_1']) otherDocName1.value = app.existingOtherTypeNames['other_doc_1']
  if (app.existingOtherTypeNames['other_doc_2']) otherDocName2.value = app.existingOtherTypeNames['other_doc_2']

  // restore จำนวน slot ที่เปิดอยู่ (ตามข้อมูลใน store — ทั้ง local file และ evidence จาก server)
  if (app.getFile('other_doc_2') || !!app.existingEvidenceIds['other_doc_2']) {
    otherDocCount.value = 3
  } else if (app.getFile('other_doc_1') || !!app.existingEvidenceIds['other_doc_1']) {
    otherDocCount.value = 2
  }

  // 3. ดึงรายชื่อธนาคารจาก API (ใช้ใน OCR auto-fill ของสมุดบัญชี)
  const bankNameData = await lookupsApi.fetchBankNames().catch(() => [])
  bankOptions.value  = bankNameData.map(d => ({ value: String(d.id), label: d.name }))

  // ประเภทเงินฝาก (สำหรับ map OCR deposit_type → id)
  const acctTypeData = await lookupsApi.fetchBankAccountTypes().catch(() => [])
  accountTypeOptions.value = acctTypeData.map(d => ({ value: String(d.id), label: d.name }))

  // 4. Edit mode: lazy-fetch รูปเดิมจาก server (fetch เฉพาะ slot ที่ยังไม่มีรูป)
  //    โหมด edit-request: ดึงเฉพาะ slot ที่ field ถูกแสดง — เลี่ยงโหลดรูปที่ไม่ใช้
  if (app.editMode && app.editApplicantId) {

    fetchingImages.value = true
    try {
      await Promise.all(slots.map(async ({ id, field }) => {
        if (id === 'ktb_form' && !showKtbUpload.value) return
        if (!show(field)) return                     // slot ไม่ถูกแสดง — ไม่ต้องโหลด
        if (app.existingImageUrls[id]) return       // มี cache แล้ว
        const evidenceId = app.existingEvidenceIds[id]
        if (!evidenceId) return                      // ไม่มีรูปเดิม
        const url = await welfareApi.fetchEvidenceAsObjectUrl(app.editApplicantId!, evidenceId)
        if (url) app.setExistingImage(id, url)
      }))
    } finally {
      fetchingImages.value = false
    }
  }
})

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// ลบ slot "รูปอื่น ๆ" — clear เฉพาะ slot ที่ระบุและล้าง store
function removeOtherDocSlot(slot: 1 | 2) {
  if (slot === 2) {
    otherDoc2.clear()
    app.clearExistingImage('other_doc_2')
    app.removeDocument('other_doc_2')
    otherDocName2.value = ''
    otherDocCount.value = 2
  } else {
    // ลบ slot 1 — ต้องลบ slot 2 ด้วยถ้าเปิดอยู่ (slot 2 ขึ้นกับ slot 1)
    otherDoc1.clear(); app.clearExistingImage('other_doc_1'); app.removeDocument('other_doc_1'); otherDocName1.value = ''
    otherDoc2.clear(); app.clearExistingImage('other_doc_2'); app.removeDocument('other_doc_2'); otherDocName2.value = ''
    otherDocCount.value = 1
  }
}

defineExpose({
  getData: () => ({
    photos: {
      exterior:     exterior.file.value,
      interior:     interior.file.value,
      person:       person.file.value,
      problem:      problem.file.value,
      family:       family.file.value,
      houseHome:    houseHome.file.value,
      housePerson:  housePerson.file.value,
      otherDoc0:    otherDoc.file.value,
      otherDoc1:    otherDoc1.file.value,
      otherDoc2:    otherDoc2.file.value,
    },
  }),
})
</script>

<template>
  <div class="space-y-4">

    <!-- ════════════════════════════════════════════════════════
         Section 11: หลักฐานการเยี่ยมบ้าน
         ════════════════════════════════════════════════════════ -->
    <div
      v-if="['evidence_house_exterior','evidence_house_interior','evidence_person_photo','evidence_problem_photo','evidence_family_photo'].some(f => show(f))"
      class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
    >
      <div class="flex items-center gap-3 bg-blue-50 px-4 py-3 border-b border-blue-100">
        <div class="w-8 h-8 rounded-full bg-[#1A56DB] flex items-center justify-center flex-shrink-0">
          <span class="text-white text-body-xs font-bold">11</span>
        </div>
        <p class="text-h2-section font-bold text-[#1A56DB]">หลักฐานการเยี่ยมบ้าน</p>
      </div>
      <div class="p-4 space-y-3">

        <!-- 13.1 header -->
        <div>
          <div class="flex items-center gap-2 mb-0.5">
            <span class="bg-blue-100 text-[#1A56DB] text-micro font-bold px-2 py-0.5 rounded-md">11.1</span>
            <span class="text-h3-legend font-medium text-slate-600">รูปภาพประกอบ (จำเป็น)</span>
          </div>
          <p class="text-hint text-slate-500 ml-0.5">
            ถ่ายภาพหรือเลือกจาก อัลบั้ม — รูปสำคัญสำหรับการพิจารณาช่วยเหลือ
          </p>
        </div>

        <!-- รูปสภาพบ้านภายนอก -->
        <PhotoUploadCard
          v-if="show('evidence_house_exterior')"
          upload-id="exterior"
          :replace-mode="app.editMode"
          title="รูปสภาพบ้านภายนอก"
          subtitle="ถ่ายภาพจากด้านหน้าบ้าน"
          icon="house"
          required
          :preview-url="previewExterior"
          :file-name="exterior.file.value?.name"
          :file-size="exterior.file.value?.size"
          :is-loading="exterior.isLoading.value || fetchingImages"
          :error="exterior.error.value"
          :alert-reason="commentMap.get('evidence_house_exterior')"
          @file-select="exterior.handleFileSelect"
          @clear="clrImg(exterior, 'exterior')"
        />

        <!-- รูปสภาพบ้านภายใน -->
        <PhotoUploadCard
          v-if="show('evidence_house_interior')"
          upload-id="interior"
          :replace-mode="app.editMode"
          title="รูปสภาพบ้านภายใน"
          subtitle="ภาพภายในบ้าน"
          icon="house"
          required
          :preview-url="previewInterior"
          :file-name="interior.file.value?.name"
          :file-size="interior.file.value?.size"
          :is-loading="interior.isLoading.value || fetchingImages"
          :error="interior.error.value"
          :alert-reason="commentMap.get('evidence_house_interior')"
          @file-select="interior.handleFileSelect"
          @clear="clrImg(interior, 'interior')"
        />

        <!-- รูปผู้ประสบปัญหา -->
        <PhotoUploadCard
          v-if="show('evidence_person_photo')"
          upload-id="person"
          :replace-mode="app.editMode"
          title="รูปผู้ประสบปัญหาฯ"
          subtitle="ภาพผู้ขอรับความช่วยเหลือ"
          icon="person"
          required
          :preview-url="previewPerson"
          :file-name="person.file.value?.name"
          :file-size="person.file.value?.size"
          :is-loading="person.isLoading.value || fetchingImages"
          :error="person.error.value"
          :alert-reason="commentMap.get('evidence_person_photo')"
          @file-select="person.handleFileSelect"
          @clear="clrImg(person, 'person')"
        />

        <!-- รูปสภาพปัญหา -->
        <PhotoUploadCard
          v-if="show('evidence_problem_photo')"
          upload-id="problem"
          :replace-mode="app.editMode"
          title="รูปสภาพปัญหาที่ต้องการให้ความช่วยเหลือ"
          subtitle="ภาพประกอบปัญหา"
          icon="warning"
          required
          :preview-url="previewProblem"
          :file-name="problem.file.value?.name"
          :file-size="problem.file.value?.size"
          :is-loading="problem.isLoading.value || fetchingImages"
          :error="problem.error.value"
          :alert-reason="commentMap.get('evidence_problem_photo')"
          @file-select="problem.handleFileSelect"
          @clear="clrImg(problem, 'problem')"
        />

        <!-- รูปสมาชิกในครอบครัว -->
        <PhotoUploadCard
          v-if="show('evidence_family_photo')"
          upload-id="family"
          :replace-mode="app.editMode"
          title="รูปสมาชิกในครอบครัว"
          subtitle="ภาพรวมสมาชิกในครอบครัว"
          icon="people"
          required
          :preview-url="previewFamily"
          :file-name="family.file.value?.name"
          :file-size="family.file.value?.size"
          :is-loading="family.isLoading.value || fetchingImages"
          :error="family.error.value"
          :alert-reason="commentMap.get('evidence_family_photo')"
          @file-select="family.handleFileSelect"
          @clear="clrImg(family, 'family')"
        />

      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════
         Section 12: เอกสารแนบเพิ่มเติม (ไม่บังคับ)
         ════════════════════════════════════════════════════════ -->
    <div
      v-if="showKtbUpload || ['doc_house_registration_house','doc_house_registration_person','doc_other','bank_book_photo'].some(f => show(f))"
      class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
    >
      <div class="flex items-center gap-3 bg-blue-50 px-4 py-3 border-b border-blue-100">
        <div class="w-8 h-8 rounded-full bg-[#1A56DB] flex items-center justify-center flex-shrink-0">
          <span class="text-white text-body-xs font-bold">12</span>
        </div>
        <p class="text-h2-section font-bold text-[#1A56DB]">เอกสารแนบเพิ่มเติม</p>
      </div>
      <div class="p-4 space-y-3">

        <!-- 12.1 header — แสดงเมื่อมี field เอกสารแนบ หรือรูปสมุดบัญชี -->
        <div v-if="showKtbUpload || ['bank_book_photo','doc_house_registration_house','doc_house_registration_person','doc_other'].some(f => show(f))">
          <div class="flex items-center gap-2 mb-0.5">
            <span class="bg-blue-100 text-[#1A56DB] text-micro font-bold px-2 py-0.5 rounded-md">12.1</span>
            <span class="text-h3-legend font-medium text-slate-600">เอกสารประกอบ</span>
          </div>
          <p class="text-hint text-slate-500 ml-0.5">กรุณาแนบเอกสารที่จำเป็น (มีเครื่องหมาย *) ให้ครบ หากมีเอกสารอื่นเพิ่มเติมสามารถแนบได้</p>
        </div>

        <!-- ─── รูปหน้าสมุดบัญชีธนาคาร (ย้ายจาก Step3 มา) — บังคับ + มี OCR ───────── -->
        <div v-if="show('bank_book_photo')">
          <label class="flex items-center gap-1 text-body text-slate-600 mb-1.5 font-medium">
            <span>รูปหน้าสมุดบัญชีธนาคาร <span class="text-red-500">*</span></span>
            <FieldAlert v-if="commentMap.has('bank_book_photo')" :reason="commentMap.get('bank_book_photo')!" />
          </label>

          <div
            v-if="showDevMockBankBookHint"
            class="mb-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-body-xs text-sky-950"
            role="note"
          >
            <p class="font-semibold mb-1">โหมดพัฒนา — รูปสมุดบัญชีตัวอย่าง</p>
            <p class="text-sky-900/90 leading-relaxed mb-2">
              ชื่อใน mock login ตรงกับรูปตัวอย่าง (นาย ภูริพัฒน ปัญญา) — กดปุ่มด้านล่างเพื่อโหลดรูปและรัน OCR จริง
            </p>
            <button
              type="button"
              class="rounded-lg border border-sky-300 bg-white px-3 py-2 text-body-xs font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-60"
              :disabled="loadingBankBookFixture || bankBook.isLoading.value || fetchingBankBook"
              @click="applyBankBookFixture"
            >
              {{ loadingBankBookFixture ? 'กำลังโหลดรูปตัวอย่าง…' : 'ใช้รูปสมุดบัญชีตัวอย่าง' }}
            </button>
          </div>

          <!-- error message -->
          <p v-if="bankBook.error.value" class="mb-2 text-hint text-red-500">
            {{ bankBook.error.value }}
          </p>

          <!-- พรีวิวเมื่ออัปโหลดแล้ว (local file หรือ server image) — กดรูปเพื่อดูขนาดเต็ม -->
          <div v-if="previewBankBook" class="border border-slate-200 rounded-xl overflow-hidden">
            <div class="relative group cursor-zoom-in" @click="showBankBookPreview = true">
              <img
                :src="previewBankBook"
                alt="รูปสมุดบัญชี"
                class="w-full object-contain max-h-48 bg-slate-50"
              />
              <!-- ไอคอน zoom ปรากฏเมื่อ hover -->
              <div class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                <div class="opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-full p-2">
                  <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                  </svg>
                </div>
              </div>
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
                <span class="text-body-xs text-slate-500 truncate">{{ bankBook.file.value?.name ?? 'รูปเดิมจากระบบ' }}</span>
                <span v-if="bankBook.file.value" class="text-micro text-slate-400">
                  {{ bankBook.file.value.size < 1024 * 1024
                    ? `${(bankBook.file.value.size / 1024).toFixed(0)} KB`
                    : `${(bankBook.file.value.size / (1024 * 1024)).toFixed(2)} MB` }}
                </span>
              </div>
              <button
                v-if="app.editMode"
                type="button"
                @click="bankBookInputRef?.click()"
                class="text-body-xs font-medium text-[#1A56DB] hover:text-blue-700 active:scale-95 transition-all flex-shrink-0"
              >
                แก้ไข
              </button>
              <button
                v-else
                type="button"
                @click="clearBankBook()"
                class="text-body-xs font-medium text-red-500 hover:text-red-600 active:scale-95 transition-all flex-shrink-0"
              >
                ลบและถ่ายใหม่
              </button>
            </div>
          </div>

          <!-- OCR Status component — จัดการ OCR ใน background + แสดงผลเทียบชื่อ -->
          <BankBookOcrStatus
            ref="ocrRef"
            :file="bankBook.file.value"
            :target-name="ocrTargetName"
            :bank-options="bankOptions"
            :account-type-options="accountTypeOptions"
            :manual-account-type-id="bankAccountTypeId"
            :disabled="ocrDisabled"
            @auto-fill="handleOcrAutoFill"
          />

          <!-- ปุ่มอัปโหลดเมื่อยังไม่มีรูป -->
          <div
            v-if="showManualAccountType"
            class="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3"
          >
            <label class="block text-body-xs font-semibold text-amber-800 mb-1.5">
              ประเภทเงินฝาก <span class="text-red-500">*</span>
            </label>
            <SearchableSelect
              v-model="bankAccountTypeId"
              :options="accountTypeSelectOptions"
              placeholder="เลือกประเภทเงินฝาก"
              :disabled="accountTypeOptions.length === 0"
              :has-error="!bankAccountTypeId"
              @change="syncBankAccountType"
            />
            <p class="text-micro text-amber-700 mt-1.5">
              กรุณาเลือกข้อมูลจากสมุดบัญชี
            </p>
          </div>

          <div
            v-if="!previewBankBook"
            class="border-2 border-dashed rounded-xl p-4 transition-colors"
            :class="(bankBook.isLoading.value || fetchingBankBook) ? 'border-[#1A56DB]/40 bg-blue-50/50' : 'border-slate-200'"
          >
            <div class="flex items-center gap-2 mb-4">
              <svg v-if="!(bankBook.isLoading.value || fetchingBankBook)" class="w-5 h-5 text-[#1A56DB] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 11l5-5 5 5M12 6v12" />
              </svg>
              <svg v-else class="w-5 h-5 text-[#1A56DB] flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              <p class="text-body-xs font-medium leading-snug transition-colors" :class="(bankBook.isLoading.value || fetchingBankBook) ? 'text-[#1A56DB]' : 'text-slate-600'">
                {{ (bankBook.isLoading.value || fetchingBankBook) ? 'กำลังโหลดรูปภาพ...' : 'ถ่ายหรืออัปโหลดรูปหน้าสมุดบัญชีธนาคาร' }}
              </p>
            </div>

            <label
              for="bank-book-input"
              class="flex w-full items-center justify-center gap-2 border border-slate-200 rounded-xl py-2.5 text-body-xs font-medium text-slate-700 bg-white hover:border-[#1A56DB] hover:text-[#1A56DB] active:scale-[0.98] transition-all cursor-pointer select-none"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              กดเพื่อ เลือก/ถ่ายภาพ
            </label>
          </div>

          <input
            ref="bankBookInputRef"
            id="bank-book-input"
            type="file"
            accept="image/*"
            class="hidden"
            @change="bankBook.handleFileSelect"
          />
        </div>

        <!-- ทะเบียนบ้าน (รายการบ้าน) -->
        <PhotoUploadCard
          v-if="show('doc_house_registration_house')"
          upload-id="house-home"
          :replace-mode="app.editMode"
          title="รูปทะเบียนบ้าน (รายการเกี่ยวกับบ้าน)"
          subtitle="หน้าทะเบียนบ้าน"
          icon="document"
          required
          :preview-url="previewHouseHome"
          :file-name="houseHome.file.value?.name"
          :file-size="houseHome.file.value?.size"
          :is-loading="houseHome.isLoading.value || fetchingImages"
          :error="houseHome.error.value"
          :alert-reason="commentMap.get('doc_house_registration_house')"
          @file-select="houseHome.handleFileSelect"
          @clear="clrImg(houseHome, 'house_home')"
        />

        <!-- ทะเบียนบ้าน (รายการบุคคล) -->
        <PhotoUploadCard
          v-if="show('doc_house_registration_person')"
          upload-id="house-person"
          :replace-mode="app.editMode"
          title="รูปทะเบียนบ้าน (รายการเกี่ยวกับบุคคล)"
          subtitle="หน้าข้อมูลบุคคลในทะเบียนบ้าน"
          icon="document"
          required
          :preview-url="previewHousePerson"
          :file-name="housePerson.file.value?.name"
          :file-size="housePerson.file.value?.size"
          :is-loading="housePerson.isLoading.value || fetchingImages"
          :error="housePerson.error.value"
          :alert-reason="commentMap.get('doc_house_registration_person')"
          @file-select="housePerson.handleFileSelect"
          @clear="clrImg(housePerson, 'house_person')"
        />

        <!-- แบบฟอร์ม KTB Corporate Online (เฉพาะเคสเก่าที่เคยแนบ + ถูกตีกลับให้แก้) -->
        <PhotoUploadCard
          v-if="showKtbUpload"
          upload-id="ktb-form"
          :replace-mode="app.editMode"
          title="รูปแบบฟอร์ม KTB Corporate Online"
          subtitle="ถ่ายรูปแบบแจ้งข้อมูลการรับเงินโอนที่กรอกแล้ว"
          icon="document"
          required
          :preview-url="previewKtbForm"
          :file-name="ktbForm.file.value?.name"
          :file-size="ktbForm.file.value?.size"
          :is-loading="ktbForm.isLoading.value || fetchingImages"
          :error="ktbForm.error.value"
          :alert-reason="commentMap.get('doc_ktb_corporate')"
          @file-select="ktbForm.handleFileSelect"
          @clear="clrImg(ktbForm, 'ktb_form')"
        />

        <!-- รูปอื่น ๆ (รองรับสูงสุด 3 รูป) -->
        <template v-if="show('doc_other')">

          <!-- Slot 0 — รูปอื่น ๆ ใบที่ 1 (แสดงเสมอ) -->
          <PhotoUploadCard
            upload-id="other-doc-0"
            :replace-mode="app.editMode"
            title="รูปอื่น ๆ"
            subtitle="เอกสารแนบเพิ่มเติม"
            icon="document"
            :preview-url="previewOtherDoc0"
            :file-name="otherDoc.file.value?.name"
            :file-size="otherDoc.file.value?.size"
            :is-loading="otherDoc.isLoading.value || fetchingImages"
            :error="otherDoc.error.value"
            :alert-reason="commentMap.get('doc_other')"
            @file-select="otherDoc.handleFileSelect"
            @clear="clrImg(otherDoc, 'other_doc_0')"
          >
            <input
              v-model="otherDocName"
              type="text"
              maxlength="255"
              placeholder="ระบุชื่อเอกสาร เช่น ใบรับรองแพทย์"
              :class="[
                'w-full border rounded-lg px-3 py-2 text-body placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors',
                otherDocNameRequired0
                  ? 'border-red-300 focus:ring-red-200 focus:border-red-400'
                  : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'
              ]"
            />
            <p v-if="otherDocNameRequired0" class="text-micro text-red-500 mt-1">
              กรุณาระบุชื่อเอกสาร
            </p>
          </PhotoUploadCard>

          <!-- Slot 1 — รูปอื่น ๆ ใบที่ 2 -->
          <div v-if="otherDocCount >= 2" class="flex flex-col">
            <PhotoUploadCard
              upload-id="other-doc-1"
              :replace-mode="app.editMode"
              title="รูปอื่น ๆ (2)"
              subtitle="เอกสารแนบเพิ่มเติม"
              icon="document"
              :preview-url="previewOtherDoc1"
              :file-name="otherDoc1.file.value?.name"
              :file-size="otherDoc1.file.value?.size"
              :is-loading="otherDoc1.isLoading.value || fetchingImages"
              :error="otherDoc1.error.value"
              @file-select="otherDoc1.handleFileSelect"
              @clear="clrImg(otherDoc1, 'other_doc_1')"
            >
              <input
                v-model="otherDocName1"
                type="text"
                maxlength="255"
                placeholder="ระบุชื่อเอกสาร เช่น ใบรับรองแพทย์"
                :class="[
                  'w-full border rounded-lg px-3 py-2 text-body placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors',
                  otherDocNameRequired1
                    ? 'border-red-300 focus:ring-red-200 focus:border-red-400'
                    : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'
                ]"
              />
              <p v-if="otherDocNameRequired1" class="text-micro text-red-500 mt-1">
                กรุณาระบุชื่อเอกสาร
              </p>
            </PhotoUploadCard>
            <!-- ปุ่มลบ slot 1 — แสดงเฉพาะเมื่อ slot 2 ยังไม่เปิด -->
            <button
              v-if="otherDocCount === 2"
              type="button"
              @click="removeOtherDocSlot(1)"
              class="mt-2 mx-auto flex items-center gap-1.5 text-body-xs text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 rounded-lg px-3 py-1.5 transition-all active:scale-95"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              ลบช่องนี้
            </button>
          </div>

          <!-- Slot 2 — รูปอื่น ๆ ใบที่ 3 -->
          <div v-if="otherDocCount >= 3" class="flex flex-col">
            <PhotoUploadCard
              upload-id="other-doc-2"
              :replace-mode="app.editMode"
              title="รูปอื่น ๆ (3)"
              subtitle="เอกสารแนบเพิ่มเติม"
              icon="document"
              :preview-url="previewOtherDoc2"
              :file-name="otherDoc2.file.value?.name"
              :file-size="otherDoc2.file.value?.size"
              :is-loading="otherDoc2.isLoading.value || fetchingImages"
              :error="otherDoc2.error.value"
              @file-select="otherDoc2.handleFileSelect"
              @clear="clrImg(otherDoc2, 'other_doc_2')"
            >
              <input
                v-model="otherDocName2"
                type="text"
                maxlength="255"
                placeholder="ระบุชื่อเอกสาร เช่น ใบรับรองแพทย์"
                :class="[
                  'w-full border rounded-lg px-3 py-2 text-body placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors',
                  otherDocNameRequired2
                    ? 'border-red-300 focus:ring-red-200 focus:border-red-400'
                    : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'
                ]"
              />
              <p v-if="otherDocNameRequired2" class="text-micro text-red-500 mt-1">
                กรุณาระบุชื่อเอกสาร
              </p>
            </PhotoUploadCard>
            <button
              type="button"
              @click="removeOtherDocSlot(2)"
              class="mt-2 mx-auto flex items-center gap-1.5 text-body-xs text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 rounded-lg px-3 py-1.5 transition-all active:scale-95"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              ลบช่องนี้
            </button>
          </div>

          <!-- ปุ่มเพิ่มรูปอื่น ๆ — แสดงเมื่อยังไม่ครบ 3 slot -->
          <button
            v-if="otherDocCount < 3"
            type="button"
            @click="otherDocCount++"
            class="w-full flex items-center justify-center gap-2 border border-dashed border-slate-300 rounded-xl py-2.5 text-body-xs font-medium text-slate-600 hover:border-[#1A56DB] hover:text-[#1A56DB] active:scale-[0.98] transition-all"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            เพิ่มรูปอื่น ๆ
          </button>

        </template>

      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════
         Section 15: ตรวจสอบข้อมูลและยืนยัน (ซ่อนในโหมด edit-request)
         ════════════════════════════════════════════════════════ -->
    <div v-if="!props.filterFields" class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="flex items-center gap-3 bg-blue-50 px-4 py-3 border-b border-blue-100">
        <div class="w-8 h-8 rounded-full bg-[#1A56DB] flex items-center justify-center flex-shrink-0">
          <span class="text-white text-body-xs font-bold">13</span>
        </div>
        <p class="text-h2-section font-bold text-[#1A56DB]">ตรวจสอบข้อมูลและยืนยัน</p>
      </div>
      <div class="p-4 space-y-3">

        <!-- คำเตือน -->
        <div class="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          <svg class="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p class="text-body font-semibold text-amber-700">โปรดตรวจสอบข้อมูลก่อนส่ง</p>
            <p class="text-hint text-amber-600 mt-0.5">หลังส่งคำขอแล้ว จะไม่สามารถแก้ไขข้อมูลได้</p>
          </div>
        </div>

        <!-- รายการสรุป -->
        <div class="space-y-2">

          <!-- Step 1: ข้อมูลส่วนตัว -->
          <div class="flex items-start gap-3 border border-slate-200 rounded-xl px-3 py-3">
            <div class="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg class="w-4 h-4 text-[#1A56DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-body font-semibold text-slate-800">ตัวตน + ที่อยู่ + ครอบครัว</p>
              <p class="text-hint text-slate-500 mt-0.5">ยืนยันผ่าน ThaiID ✓</p>
            </div>
            <button
              type="button"
              @click="$emit('navigate-to-step', 1)"
              class="text-body-xs font-medium text-[#1A56DB] hover:underline active:opacity-70 flex-shrink-0"
            >
              แก้ไข
            </button>
          </div>

          <!-- Step 2: เศรษฐกิจ -->
          <div class="flex items-start gap-3 border border-slate-200 rounded-xl px-3 py-3">
            <div class="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg class="w-4 h-4 text-[#1A56DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 10h18M3 6h18M3 14h18M3 18h18" />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-body font-semibold text-slate-800">เศรษฐกิจ + สวัสดิการ</p>
              <p class="text-hint text-slate-500 mt-0.5">ตามที่กรอกใน Step 2</p>
            </div>
            <button
              type="button"
              @click="$emit('navigate-to-step', 2)"
              class="text-body-xs font-medium text-[#1A56DB] hover:underline active:opacity-70 flex-shrink-0"
            >
              แก้ไข
            </button>
          </div>

          <!-- Step 3: ปัญหา -->
          <div class="flex items-start gap-3 border border-slate-200 rounded-xl px-3 py-3">
            <div class="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg class="w-4 h-4 text-[#1A56DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-body font-semibold text-slate-800">ปัญหา + ความช่วยเหลือ</p>
              <p class="text-hint text-slate-500 mt-0.5">ตามที่กรอกใน Step 3</p>
            </div>
            <button
              type="button"
              @click="$emit('navigate-to-step', 3)"
              class="text-body-xs font-medium text-[#1A56DB] hover:underline active:opacity-70 flex-shrink-0"
            >
              แก้ไข
            </button>
          </div>

          <!-- Step 4: เอกสาร (scroll กลับขึ้นบนหน้านี้) -->
          <div class="flex items-start gap-3 border border-slate-200 rounded-xl px-3 py-3">
            <div class="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg class="w-4 h-4 text-[#1A56DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-body font-semibold text-slate-800">เอกสารและรูปประกอบ</p>
              <p class="text-hint text-slate-500 mt-0.5">อัปโหลดแล้ว {{ totalUploaded }} ไฟล์</p>
            </div>
            <button
              type="button"
              @click="scrollToTop"
              class="text-body-xs font-medium text-[#1A56DB] hover:underline active:opacity-70 flex-shrink-0"
            >
              แก้ไข
            </button>
          </div>

        </div>
      </div>
    </div>

  </div>

  <!-- ════ Lightbox สมุดบัญชีธนาคาร ════ -->
  <Teleport to="body">
    <Transition name="bank-fade">
      <div
        v-if="showBankBookPreview && previewBankBook"
        class="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
      >
        <!-- ปุ่มปิด -->
        <button
          type="button"
          class="absolute top-4 right-4 text-white bg-black/50 hover:bg-black/70 rounded-full w-10 h-10 flex items-center justify-center transition-colors z-10"
          @click="showBankBookPreview = false"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <!-- รูปขนาดเต็ม -->
        <img
          :src="previewBankBook"
          alt="รูปสมุดบัญชีธนาคาร"
          class="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl"
          @click.stop
        />

        <!-- ป้ายชื่อด้านล่าง -->
        <div class="absolute bottom-4 left-0 right-0 flex justify-center">
          <span class="bg-black/50 text-white text-body-xs px-4 py-1.5 rounded-full">
            รูปหน้าสมุดบัญชีธนาคาร
          </span>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.bank-fade-enter-active,
.bank-fade-leave-active {
  transition: opacity 0.2s ease;
}
.bank-fade-enter-from,
.bank-fade-leave-to {
  opacity: 0;
}
</style>
