<script setup lang="ts">
// Component นี้ reuse ได้ทุก step ที่ต้องอัปโหลดรูป
// ใช้ <label for> แทน JS .click() เพื่อให้ capture="environment" ทำงานได้บน iOS

import { ref } from 'vue'
import FieldAlert from '@/components/ui/FieldAlert.vue'

// สถานะแสดง/ซ่อน lightbox preview เต็มจอ
const showPreview = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

defineProps<{
  uploadId: string      // prefix ไม่ซ้ำกัน เช่น 'exterior', 'person' — ใช้สร้าง input id
  title: string
  subtitle?: string
  icon: 'house' | 'person' | 'warning' | 'people' | 'document'
  required?: boolean
  previewUrl: string
  fileName?: string
  fileSize?: number     // bytes — แสดงขนาดหลัง compress
  isLoading?: boolean
  error?: string
  alertReason?: string  // comment จากเจ้าหน้าที่ — แสดง FieldAlert ข้าง title
  replaceMode?: boolean // edit-request: ปุ่มแก้ไขแทนลบ — เปิด file picker โดยไม่ล้างรูปเดิม
}>()

defineEmits<{
  'file-select': [Event]
  'clear': []
}>()

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
</script>

<template>
  <div class="border border-slate-200 rounded-xl overflow-hidden bg-white">

    <!-- ส่วนหัว: ไอคอน + ชื่อ + คำอธิบาย -->
    <div class="flex items-start gap-3 p-3">
      <div class="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">

        <!-- house -->
        <svg v-if="icon === 'house'" class="w-5 h-5 text-[#1A56DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1h3a1 1 0 001-1V10M9 21h6" />
        </svg>

        <!-- person -->
        <svg v-else-if="icon === 'person'" class="w-5 h-5 text-[#1A56DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>

        <!-- warning -->
        <svg v-else-if="icon === 'warning'" class="w-5 h-5 text-[#1A56DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>

        <!-- people (group) -->
        <svg v-else-if="icon === 'people'" class="w-5 h-5 text-[#1A56DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>

        <!-- document -->
        <svg v-else-if="icon === 'document'" class="w-5 h-5 text-[#1A56DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>

      </div>
      <div class="flex-1 min-w-0">
        <p class="text-body-xs font-semibold text-slate-800 leading-snug flex items-center gap-1">
          <span>{{ title }}<span v-if="required" class="text-red-500"> *</span></span>
          <FieldAlert v-if="alertReason" :reason="alertReason" />
        </p>
        <p v-if="subtitle" class="text-hint text-slate-500 mt-0.5">{{ subtitle }}</p>
      </div>
    </div>

    <!-- slot สำหรับใส่ content เพิ่มเติมระหว่าง header กับปุ่ม เช่น input ชื่อเอกสาร -->
    <div v-if="$slots.default" class="px-3 pb-2">
      <slot />
    </div>

    <!-- กำลัง compress -->
    <div v-if="isLoading" class="px-3 pb-3 flex items-center gap-2 text-body-xs text-[#1A56DB]">
      <svg class="w-4 h-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
      </svg>
      <span>กำลังประมวลผลรูปภาพ...</span>
    </div>

    <!-- พรีวิวเมื่ออัปโหลดแล้ว — กดที่รูปเพื่อดูขนาดเต็ม -->
    <div v-else-if="previewUrl" class="px-3 pb-3">
      <div class="relative group cursor-zoom-in mb-2" @click="showPreview = true">
        <img
          :src="previewUrl"
          alt="รูปที่อัปโหลด"
          class="w-full rounded-lg object-contain max-h-44 bg-slate-50"
        />
        <!-- ไอคอน zoom ปรากฏเมื่อ hover -->
        <div class="absolute inset-0 rounded-lg bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <div class="opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-full p-2">
            <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
          </div>
        </div>
      </div>
      <div class="flex items-center justify-between">
        <div class="flex flex-col min-w-0 max-w-[75%]">
          <span class="text-hint text-slate-500 truncate">{{ fileName ?? 'รูปเดิมจากระบบ' }}</span>
          <span v-if="fileSize" class="text-micro text-slate-400">{{ formatBytes(fileSize) }}</span>
        </div>
        <button
          v-if="replaceMode"
          type="button"
          @click="fileInputRef?.click()"
          class="text-hint font-medium text-[#1A56DB] hover:text-blue-700 active:scale-95 transition-all flex-shrink-0"
        >
          แก้ไข
        </button>
        <button
          v-else
          type="button"
          @click="$emit('clear')"
          class="text-hint font-medium text-red-500 hover:text-red-600 active:scale-95 transition-all flex-shrink-0"
        >
          ลบ
        </button>
      </div>
    </div>

    <!-- ปุ่มเดียว — OS จะแสดง sheet ให้เลือกกล้องหรืออัลบัมเอง -->
    <div v-else class="px-3 pb-3">
      <label
        :for="`${uploadId}-pick`"
        class="flex w-full items-center justify-center gap-1.5 border border-slate-200 rounded-lg py-2 text-body-xs font-medium text-slate-700 bg-white hover:border-[#1A56DB] hover:text-[#1A56DB] cursor-pointer select-none transition-all active:scale-[0.98]"
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        กดเพื่อ เลือก/ถ่ายภาพ
      </label>
    </div>

    <!-- error -->
    <p v-if="error" class="px-3 pb-3 text-hint text-red-500">{{ error }}</p>

    <!-- input ซ่อน: ไม่มี capture → OS แสดง native sheet ให้เลือกกล้องหรืออัลบัมเอง -->
    <input
      ref="fileInputRef"
      :id="`${uploadId}-pick`"
      type="file"
      accept="image/*"
      class="hidden"
      @change="$emit('file-select', $event)"
    />
  </div>

  <!-- ════ Lightbox: กดที่รูปเพื่อดูขนาดเต็มจอ ════ -->
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="showPreview && previewUrl"
        class="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
      >
        <!-- ปุ่มปิด -->
        <button
          type="button"
          class="absolute top-4 right-4 text-white bg-black/50 hover:bg-black/70 rounded-full w-10 h-10 flex items-center justify-center transition-colors z-10"
          @click="showPreview = false"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <!-- รูปขนาดเต็ม -->
        <img
          :src="previewUrl"
          :alt="title"
          class="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl"
          @click.stop
        />

        <!-- ชื่อรูปด้านล่าง -->
        <div class="absolute bottom-4 left-0 right-0 flex justify-center">
          <span class="bg-black/50 text-white text-body-xs px-4 py-1.5 rounded-full">
            {{ title }}
          </span>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* animation เปิด/ปิด lightbox */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
