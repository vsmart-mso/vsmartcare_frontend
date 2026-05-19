<script setup lang="ts">
import { computed, watch, onMounted, ref } from 'vue'
import { useImageUpload } from '@/composables/useImageUpload'
import PhotoUploadCard from '../components/PhotoUploadCard.vue'
import BankBookOcrStatus from '../components/BankBookOcrStatus.vue'
import FieldAlert from '@/components/ui/FieldAlert.vue'
import { useApplicationStore } from '@/stores/application'
import { useAuthStore } from '@/stores/auth'
import type { ThaiDUser } from '@/types/auth'
import { lookupsApi } from '@/api/lookups'
import { welfareApi } from '@/api/welfare'

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
const otherDoc     = useImageUpload({ maxWidth: 1200, maxHeight: 1600, quality: 0.85 })
const otherDocName = ref('') // ชื่อประเภทเอกสาร "อื่นๆ" — backend บังคับส่งเมื่ออัปโหลด

// ─── รูปหน้าสมุดบัญชีธนาคาร (ย้ายมาจาก Step3 ตามมติประชุม 2026-05-19) ─────────
// compress: max 1200×1600px, WebP quality 82% — เหมือนเดิมตอนอยู่ Step3
const bankBook = useImageUpload({ maxWidth: 1200, maxHeight: 1600, quality: 0.82 })
const fetchingBankBook = ref(false)

// bankOptions ดึงจาก lookups API — ส่งให้ BankBookOcrStatus ใช้ map ชื่อ→id
const bankOptions = ref<{ value: string; label: string }[]>([])

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
function handleOcrAutoFill(payload: { bankNameId: string; accountNumber: string }) {
  app.setBankInfo(
    payload.bankNameId   || app.step3?.bankNameId  || '',
    payload.accountNumber || app.step3?.bankAccount || '',
  )
}

// computed preview — ใช้ local preview ก่อน ถ้าไม่มีใช้ blob URL จาก server (edit mode)
const previewBankBook = computed(() => bankBook.previewUrl.value || app.existingImageUrls['bank_book'] || '')

// ─── Edit mode: loading flag ขณะ fetch รูปจาก server ──────────────────────────
const fetchingImages = ref(false)

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
const previewOtherDoc    = computed(() => otherDoc.previewUrl.value    || app.existingImageUrls['other_doc']    || '')

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
    { u: otherDoc,    k: 'other_doc'    },
    { u: bankBook,    k: 'bank_book'    },
  ].filter(({ u, k }) => u.file.value || app.existingImageUrls[k]).length,
)

// ─── Validation ────────────────────────────────────────────────────────────────
const otherDocNameRequired = computed(() => hasImg(otherDoc, 'other_doc') && !otherDocName.value.trim())
// field ที่ซ่อน (ไม่อยู่ใน filterFields) ถือว่า valid เสมอ
// bank_book_photo เป็น required ตามมติประชุม 2026-05-19 (ย้ายจาก Step3 มา Step4)
const isReady = computed(() =>
  (!show('evidence_house_exterior') || hasImg(exterior, 'exterior')) &&
  (!show('evidence_house_interior') || hasImg(interior, 'interior')) &&
  (!show('evidence_person_photo')   || hasImg(person,   'person'))   &&
  (!show('evidence_problem_photo')  || hasImg(problem,  'problem'))  &&
  (!show('evidence_family_photo')   || hasImg(family,   'family'))   &&
  (!show('bank_book_photo')         || hasImg(bankBook, 'bank_book')) &&
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
watch(() => otherDoc.file.value,    (f) => syncFile('other_doc',    'other_doc',    f ?? null, otherDocName.value))
watch(() => bankBook.file.value,    (f) => syncFile('bank_book',    'bank_book',    f ?? null))
// เมื่อชื่อเปลี่ยน ให้ persist ลง store เสมอ (ไม่ว่าจะมีไฟล์หรือไม่)
// ใช้ existingOtherTypeName เป็น temp storage เพื่อให้ชื่อรอดเมื่อ component unmount
watch(otherDocName, (name) => {
  app.existingOtherTypeName = name
  const f = otherDoc.file.value
  if (!f) return
  app.addDocument(
    { id: 'other_doc', docType: 'other_doc', fileName: f.name, fileSizeBytes: f.size, mimeType: f.type, otherTypeName: name },
    f
  )
})

// เมื่อ component mount ใหม่ (เช่น ผู้ใช้กลับมา Step4) ให้ restore ไฟล์จาก store
// File object ยังอยู่ใน app.files (Map ใน Pinia) แต่ preview ใน useImageUpload หายไปแล้ว
onMounted(async () => {
  // field = ชื่อ reviewComment ของ slot นั้น — ใช้ guard การ fetch รูปในโหมด edit-request
  const slots: Array<{ id: string; field: string; uploader: ReturnType<typeof useImageUpload> }> = [
    { id: 'exterior',     field: 'evidence_house_exterior',       uploader: exterior     },
    { id: 'interior',     field: 'evidence_house_interior',       uploader: interior     },
    { id: 'person',       field: 'evidence_person_photo',         uploader: person       },
    { id: 'problem',      field: 'evidence_problem_photo',        uploader: problem      },
    { id: 'family',       field: 'evidence_family_photo',         uploader: family       },
    { id: 'house_home',   field: 'doc_house_registration_house',  uploader: houseHome    },
    { id: 'house_person', field: 'doc_house_registration_person', uploader: housePerson  },
    { id: 'other_doc',    field: 'doc_other',                     uploader: otherDoc     },
    { id: 'bank_book',    field: 'bank_book_photo',               uploader: bankBook     },
  ]

  // 1. restore local files จาก store (กรณี user กลับมา Step4 โดยไม่ออกจากหน้า)
  for (const { id, uploader } of slots) {
    const stored = app.getFile(id)
    if (stored) uploader.restore(stored)
  }

  // 2. restore ชื่อเอกสาร "อื่นๆ" — existingOtherTypeName เก็บค่าล่าสุดเสมอ
  //    (watch อัปเดตทุกครั้งที่ user พิมพ์ ทั้ง create และ edit mode)
  if (app.existingOtherTypeName) otherDocName.value = app.existingOtherTypeName

  // 3. ดึงรายชื่อธนาคารจาก API (ใช้ใน OCR auto-fill ของสมุดบัญชี)
  const bankNameData = await lookupsApi.fetchBankNames().catch(() => [])
  bankOptions.value  = bankNameData.map(d => ({ value: String(d.id), label: d.name }))

  // 4. Edit mode: lazy-fetch รูปเดิมจาก server (fetch เฉพาะ slot ที่ยังไม่มีรูป)
  //    โหมด edit-request: ดึงเฉพาะ slot ที่ field ถูกแสดง — เลี่ยงโหลดรูปที่ไม่ใช้
  if (app.editMode && app.editApplicantId) {

    fetchingImages.value = true
    try {
      await Promise.all(slots.map(async ({ id, field }) => {
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
      otherDoc:     otherDoc.file.value,
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
          <span class="text-white text-[13px] font-bold">11</span>
        </div>
        <p class="text-[14px] font-bold text-[#1A56DB]">หลักฐานการเยี่ยมบ้าน</p>
      </div>
      <div class="p-4 space-y-3">

        <!-- 13.1 header -->
        <div>
          <div class="flex items-center gap-2 mb-0.5">
            <span class="bg-blue-100 text-[#1A56DB] text-[11px] font-bold px-2 py-0.5 rounded-md">11.1</span>
            <span class="text-[13px] font-medium text-slate-600">รูปภาพประกอบ (จำเป็น)</span>
          </div>
          <p class="text-[12px] text-slate-500 ml-0.5">
            ถ่ายภาพหรือเลือกจาก อัลบั้ม — รูปสำคัญสำหรับการพิจารณาช่วยเหลือ
          </p>
        </div>

        <!-- รูปสภาพบ้านภายนอก -->
        <PhotoUploadCard
          v-if="show('evidence_house_exterior')"
          upload-id="exterior"
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
      v-if="['doc_house_registration_house','doc_house_registration_person','doc_other'].some(f => show(f))"
      class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
    >
      <div class="flex items-center gap-3 bg-blue-50 px-4 py-3 border-b border-blue-100">
        <div class="w-8 h-8 rounded-full bg-[#1A56DB] flex items-center justify-center flex-shrink-0">
          <span class="text-white text-[13px] font-bold">12</span>
        </div>
        <p class="text-[14px] font-bold text-[#1A56DB]">เอกสารแนบเพิ่มเติม</p>
      </div>
      <div class="p-4 space-y-3">

        <!-- 12.1 header -->
        <div>
          <div class="flex items-center gap-2 mb-0.5">
            <span class="bg-blue-100 text-[#1A56DB] text-[11px] font-bold px-2 py-0.5 rounded-md">12.1</span>
            <span class="text-[13px] font-medium text-slate-600">เอกสารประกอบ</span>
          </div>
          <p class="text-[12px] text-slate-500 ml-0.5">หากมีเอกสารเพิ่มเติม สามารถแนบได้</p>
        </div>

        <!-- ทะเบียนบ้าน (รายการบ้าน) -->
        <PhotoUploadCard
          v-if="show('doc_house_registration_house')"
          upload-id="house-home"
          title="รูปทะเบียนบ้าน (รายการเกี่ยวกับบ้าน)"
          subtitle="หน้าทะเบียนบ้าน"
          icon="document"
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
          title="รูปทะเบียนบ้าน (รายการเกี่ยวกับบุคคล)"
          subtitle="หน้าข้อมูลบุคคลในทะเบียนบ้าน"
          icon="document"
          :preview-url="previewHousePerson"
          :file-name="housePerson.file.value?.name"
          :file-size="housePerson.file.value?.size"
          :is-loading="housePerson.isLoading.value || fetchingImages"
          :error="housePerson.error.value"
          :alert-reason="commentMap.get('doc_house_registration_person')"
          @file-select="housePerson.handleFileSelect"
          @clear="clrImg(housePerson, 'house_person')"
        />

        <!-- รูปอื่น ๆ -->
        <PhotoUploadCard
          v-if="show('doc_other')"
          upload-id="other-doc"
          title="รูปอื่น ๆ"
          subtitle="เอกสารแนบเพิ่มเติม"
          icon="document"
          :preview-url="previewOtherDoc"
          :file-name="otherDoc.file.value?.name"
          :file-size="otherDoc.file.value?.size"
          :is-loading="otherDoc.isLoading.value || fetchingImages"
          :error="otherDoc.error.value"
          :alert-reason="commentMap.get('doc_other')"
          @file-select="otherDoc.handleFileSelect"
          @clear="clrImg(otherDoc, 'other_doc')"
        >
          <!-- input ชื่อเอกสาร อยู่ตรงกลางระหว่าง header กับปุ่มอัปโหลด -->
          <input
            v-model="otherDocName"
            type="text"
            placeholder="ระบุชื่อเอกสาร เช่น ใบรับรองแพทย์"
            :class="[
              'w-full border rounded-lg px-3 py-2 text-[13px] placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors',
              otherDocNameRequired
                ? 'border-red-300 focus:ring-red-200 focus:border-red-400'
                : 'border-slate-200 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]'
            ]"
          />
          <p v-if="otherDocNameRequired" class="text-[11px] text-red-500 mt-1">
            กรุณาระบุชื่อเอกสาร
          </p>
        </PhotoUploadCard>

        <!-- ─── รูปหน้าสมุดบัญชีธนาคาร (ย้ายจาก Step3 มา) — บังคับ + มี OCR ───────── -->
        <div v-if="show('bank_book_photo')">
          <label class="flex items-center gap-1 text-[13px] text-slate-600 mb-1.5 font-medium">
            <span>รูปหน้าสมุดบัญชีธนาคาร <span class="text-red-500">*</span></span>
            <FieldAlert v-if="commentMap.has('bank_book_photo')" :reason="commentMap.get('bank_book_photo')!" />
          </label>

          <!-- error message -->
          <p v-if="bankBook.error.value" class="mb-2 text-[12px] text-red-500">
            {{ bankBook.error.value }}
          </p>

          <!-- พรีวิวเมื่ออัปโหลดแล้ว (local file หรือ server image) -->
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
                @click="bankBook.clear(); app.clearExistingImage('bank_book'); ocrRef?.reset()"
                class="text-[13px] font-medium text-red-500 hover:text-red-600 active:scale-95 transition-all flex-shrink-0"
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
            :disabled="ocrDisabled"
            @auto-fill="handleOcrAutoFill"
          />

          <!-- ปุ่มอัปโหลดเมื่อยังไม่มีรูป -->
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
              <p class="text-[13px] font-medium leading-snug transition-colors" :class="(bankBook.isLoading.value || fetchingBankBook) ? 'text-[#1A56DB]' : 'text-slate-600'">
                {{ (bankBook.isLoading.value || fetchingBankBook) ? 'กำลังโหลดรูปภาพ...' : 'ถ่ายหรืออัปโหลดรูปหน้าสมุดบัญชีธนาคาร' }}
              </p>
            </div>

            <label
              for="bank-book-input"
              class="flex w-full items-center justify-center gap-2 border border-slate-200 rounded-xl py-2.5 text-[13px] font-medium text-slate-700 bg-white hover:border-[#1A56DB] hover:text-[#1A56DB] active:scale-[0.98] transition-all cursor-pointer select-none"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              กดเพื่อ เลือก/ถ่าย ภาพ
            </label>
          </div>

          <input
            id="bank-book-input"
            type="file"
            accept="image/*"
            class="hidden"
            @change="bankBook.handleFileSelect"
          />
        </div>

      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════
         Section 15: ตรวจสอบข้อมูลและยืนยัน (ซ่อนในโหมด edit-request)
         ════════════════════════════════════════════════════════ -->
    <div v-if="!props.filterFields" class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="flex items-center gap-3 bg-blue-50 px-4 py-3 border-b border-blue-100">
        <div class="w-8 h-8 rounded-full bg-[#1A56DB] flex items-center justify-center flex-shrink-0">
          <span class="text-white text-[13px] font-bold">13</span>
        </div>
        <p class="text-[14px] font-bold text-[#1A56DB]">ตรวจสอบข้อมูลและยืนยัน</p>
      </div>
      <div class="p-4 space-y-3">

        <!-- คำเตือน -->
        <div class="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          <svg class="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p class="text-[13px] font-semibold text-amber-700">โปรดตรวจสอบข้อมูลก่อนส่ง</p>
            <p class="text-[12px] text-amber-600 mt-0.5">หลังส่งคำขอแล้ว จะไม่สามารถแก้ไขข้อมูลได้</p>
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
              <p class="text-[13px] font-semibold text-slate-800">ตัวตน + ที่อยู่ + ครอบครัว</p>
              <p class="text-[12px] text-slate-500 mt-0.5">ยืนยันผ่าน ThaiID ✓</p>
            </div>
            <button
              type="button"
              @click="$emit('navigate-to-step', 1)"
              class="text-[13px] font-medium text-[#1A56DB] hover:underline active:opacity-70 flex-shrink-0"
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
              <p class="text-[13px] font-semibold text-slate-800">เศรษฐกิจ + สวัสดิการ</p>
              <p class="text-[12px] text-slate-500 mt-0.5">ตามที่กรอกใน Step 2</p>
            </div>
            <button
              type="button"
              @click="$emit('navigate-to-step', 2)"
              class="text-[13px] font-medium text-[#1A56DB] hover:underline active:opacity-70 flex-shrink-0"
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
              <p class="text-[13px] font-semibold text-slate-800">ปัญหา + ความช่วยเหลือ</p>
              <p class="text-[12px] text-slate-500 mt-0.5">ตามที่กรอกใน Step 3</p>
            </div>
            <button
              type="button"
              @click="$emit('navigate-to-step', 3)"
              class="text-[13px] font-medium text-[#1A56DB] hover:underline active:opacity-70 flex-shrink-0"
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
              <p class="text-[13px] font-semibold text-slate-800">เอกสารและรูปประกอบ</p>
              <p class="text-[12px] text-slate-500 mt-0.5">อัปโหลดแล้ว {{ totalUploaded }} ไฟล์</p>
            </div>
            <button
              type="button"
              @click="scrollToTop"
              class="text-[13px] font-medium text-[#1A56DB] hover:underline active:opacity-70 flex-shrink-0"
            >
              แก้ไข
            </button>
          </div>

        </div>
      </div>
    </div>

  </div>
</template>
