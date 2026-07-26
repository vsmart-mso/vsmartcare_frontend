<script setup lang="ts">
/**
 * BankBookOcrDecisionModal — Modal ตัดสินใจเมื่อ OCR สมุดบัญชีไม่ผ่าน
 *
 * 2 ทางเลือก:
 *   reupload — ลบรูปแล้วถ่าย/อัปโหลดใหม่
 *   manual   — เปิดฟอร์มกรอกข้อมูลบัญชีเอง (เก็บรูปเดิมไว้)
 */
defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  reupload: []
  manual: []
  close: []
}>()
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-150"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4 py-6"
        @click.self="emit('close')"
      >
        <div class="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
          <div class="flex items-center gap-3">
            <div class="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <svg class="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <div class="min-w-0">
              <h3 class="text-body font-semibold text-slate-800">ตรวจสอบสมุดบัญชีไม่ผ่าน</h3>
            </div>
          </div>

          <div class="mt-5 space-y-2.5">
            <button
              type="button"
              class="w-full rounded-xl bg-[#1A56DB] py-2.5 text-body-xs font-semibold text-white active:scale-[0.98] transition-transform"
              @click="emit('reupload')"
            >
              อัปโหลดรูปใหม่
            </button>
            <button
              type="button"
              class="w-full rounded-xl border border-slate-200 py-2.5 text-body-xs font-semibold text-slate-700 hover:border-[#1A56DB] hover:text-[#1A56DB] active:scale-[0.98] transition-all"
              @click="emit('manual')"
            >
              กรอกข้อมูลบัญชีเอง
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
