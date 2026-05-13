<script setup lang="ts">
import { computed, watch, onMounted } from 'vue'
import { useImageUpload } from '@/composables/useImageUpload'
import PhotoUploadCard from '../components/PhotoUploadCard.vue'
import { useApplicationStore } from '@/stores/application'

const emit = defineEmits<{
  'update:ready': [boolean]
  'navigate-to-step': [number]
}>()

const app = useApplicationStore()

// ─── Section 13: รูปภาพหลักฐานการเยี่ยมบ้าน (บังคับทั้ง 5 รูป) ──────────────
const exterior = useImageUpload({ maxWidth: 1200, maxHeight: 1600, quality: 0.80 })
const interior = useImageUpload({ maxWidth: 1200, maxHeight: 1600, quality: 0.80 })
const person   = useImageUpload({ maxWidth: 900,  maxHeight: 1200, quality: 0.82 })
const problem  = useImageUpload({ maxWidth: 1200, maxHeight: 1600, quality: 0.80 })
const family   = useImageUpload({ maxWidth: 1200, maxHeight: 900,  quality: 0.80 })

// ─── Section 14: เอกสารแนบเพิ่มเติม (ไม่บังคับ) ────────────────────────────
const houseHome   = useImageUpload({ maxWidth: 1200, maxHeight: 1600, quality: 0.85 })
const housePerson = useImageUpload({ maxWidth: 1200, maxHeight: 1600, quality: 0.85 })
const otherDoc    = useImageUpload({ maxWidth: 1200, maxHeight: 1600, quality: 0.85 })

// นับรูปทั้งหมดที่อัปโหลดแล้ว (สำหรับแสดงใน section 15)
const totalUploaded = computed(() =>
  [exterior, interior, person, problem, family, houseHome, housePerson, otherDoc]
    .filter((u) => u.file.value).length,
)

// ─── Validation: ต้องอัปโหลดครบ 5 รูปบังคับ ─────────────────────────────────
const isReady = computed(() =>
  !!(exterior.file.value   && interior.file.value  &&
     person.file.value     && problem.file.value   && family.file.value &&
     houseHome.file.value  && housePerson.file.value && otherDoc.file.value)
)

watch(isReady, (val) => emit('update:ready', val), { immediate: true })

// ─── Sync ทุกไฟล์เข้า store (welfare_evidences) ──────────────────────────────
// ใช้ key คงที่เป็น docType เดียวกับ id เพื่อให้ addDocument() แทนที่แทนซ้ำ
function syncFile(id: string, docType: string, file: File | null) {
  if (file) {
    app.addDocument({ id, docType, fileName: file.name, fileSizeBytes: file.size, mimeType: file.type }, file)
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
watch(() => otherDoc.file.value,    (f) => syncFile('other_doc',    'other_doc',    f ?? null))

// เมื่อ component mount ใหม่ (เช่น ผู้ใช้กลับมา Step4) ให้ restore ไฟล์จาก store
// File object ยังอยู่ใน app.files (Map ใน Pinia) แต่ preview ใน useImageUpload หายไปแล้ว
onMounted(() => {
  const slots: Array<{ id: string; uploader: ReturnType<typeof useImageUpload> }> = [
    { id: 'exterior',     uploader: exterior     },
    { id: 'interior',     uploader: interior     },
    { id: 'person',       uploader: person       },
    { id: 'problem',      uploader: problem      },
    { id: 'family',       uploader: family       },
    { id: 'house_home',   uploader: houseHome    },
    { id: 'house_person', uploader: housePerson  },
    { id: 'other_doc',    uploader: otherDoc     },
  ]
  for (const { id, uploader } of slots) {
    const stored = app.getFile(id)
    if (stored) uploader.restore(stored)
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
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
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
            ถ่ายภาพหรือเลือกจาก Gallery — รูปสำคัญสำหรับการพิจารณาช่วยเหลือ
          </p>
        </div>

        <!-- รูปสภาพบ้านภายนอก -->
        <PhotoUploadCard
          upload-id="exterior"
          title="รูปสภาพบ้านภายนอก"
          subtitle="ถ่ายภาพจากด้านหน้าบ้าน"
          icon="house"
          required
          :preview-url="exterior.previewUrl.value"
          :file-name="exterior.file.value?.name"
          :file-size="exterior.file.value?.size"
          :is-loading="exterior.isLoading.value"
          :error="exterior.error.value"
          @file-select="exterior.handleFileSelect"
          @clear="exterior.clear()"
        />

        <!-- รูปสภาพบ้านภายใน -->
        <PhotoUploadCard
          upload-id="interior"
          title="รูปสภาพบ้านภายใน"
          subtitle="ภาพภายในบ้าน"
          icon="house"
          required
          :preview-url="interior.previewUrl.value"
          :file-name="interior.file.value?.name"
          :file-size="interior.file.value?.size"
          :is-loading="interior.isLoading.value"
          :error="interior.error.value"
          @file-select="interior.handleFileSelect"
          @clear="interior.clear()"
        />

        <!-- รูปผู้ประสบปัญหา -->
        <PhotoUploadCard
          upload-id="person"
          title="รูปผู้ประสบปัญหาฯ"
          subtitle="ภาพผู้ขอรับความช่วยเหลือ"
          icon="person"
          required
          :preview-url="person.previewUrl.value"
          :file-name="person.file.value?.name"
          :file-size="person.file.value?.size"
          :is-loading="person.isLoading.value"
          :error="person.error.value"
          @file-select="person.handleFileSelect"
          @clear="person.clear()"
        />

        <!-- รูปสภาพปัญหา -->
        <PhotoUploadCard
          upload-id="problem"
          title="รูปสภาพปัญหาที่ต้องการให้ความช่วยเหลือ"
          subtitle="ภาพประกอบปัญหา"
          icon="warning"
          required
          :preview-url="problem.previewUrl.value"
          :file-name="problem.file.value?.name"
          :file-size="problem.file.value?.size"
          :is-loading="problem.isLoading.value"
          :error="problem.error.value"
          @file-select="problem.handleFileSelect"
          @clear="problem.clear()"
        />

        <!-- รูปสมาชิกในครอบครัว -->
        <PhotoUploadCard
          upload-id="family"
          title="รูปสมาชิกในครอบครัว"
          subtitle="ภาพรวมสมาชิกในครอบครัว"
          icon="people"
          required
          :preview-url="family.previewUrl.value"
          :file-name="family.file.value?.name"
          :file-size="family.file.value?.size"
          :is-loading="family.isLoading.value"
          :error="family.error.value"
          @file-select="family.handleFileSelect"
          @clear="family.clear()"
        />

      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════
         Section 12: เอกสารแนบเพิ่มเติม (ไม่บังคับ)
         ════════════════════════════════════════════════════════ -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
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
          upload-id="house-home"
          required
          title="รูปทะเบียนบ้าน (รายการเกี่ยวกับบ้าน)"
          subtitle="หน้าทะเบียนบ้าน"
          icon="document"
          :preview-url="houseHome.previewUrl.value"
          :file-name="houseHome.file.value?.name"
          :file-size="houseHome.file.value?.size"
          :is-loading="houseHome.isLoading.value"
          :error="houseHome.error.value"
          @file-select="houseHome.handleFileSelect"
          @clear="houseHome.clear()"
        />

        <!-- ทะเบียนบ้าน (รายการบุคคล) -->
        <PhotoUploadCard
          upload-id="house-person"
          required
          title="รูปทะเบียนบ้าน (รายการเกี่ยวกับบุคคล)"
          subtitle="หน้าข้อมูลบุคคลในทะเบียนบ้าน"
          icon="document"
          :preview-url="housePerson.previewUrl.value"
          :file-name="housePerson.file.value?.name"
          :file-size="housePerson.file.value?.size"
          :is-loading="housePerson.isLoading.value"
          :error="housePerson.error.value"
          @file-select="housePerson.handleFileSelect"
          @clear="housePerson.clear()"
        />

        <!-- รูปอื่น ๆ -->
        <PhotoUploadCard
          upload-id="other-doc"
          required
          title="รูปอื่น ๆ"
          subtitle="เอกสารแนบเพิ่มเติม"
          icon="document"
          :preview-url="otherDoc.previewUrl.value"
          :file-name="otherDoc.file.value?.name"
          :file-size="otherDoc.file.value?.size"
          :is-loading="otherDoc.isLoading.value"
          :error="otherDoc.error.value"
          @file-select="otherDoc.handleFileSelect"
          @clear="otherDoc.clear()"
        />

      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════
         Section 15: ตรวจสอบข้อมูลและยืนยัน
         ════════════════════════════════════════════════════════ -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
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
