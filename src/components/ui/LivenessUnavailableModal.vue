<script setup lang="ts">
/**
 * แจ้งว่าเปิดระบบยืนยันตัวตนไม่ได้ แล้วให้ผู้ใช้เลือกทางไป
 *
 * ขึ้นเฉพาะกรณี **เปิดระบบไม่ได้** (SDK โหลดไม่ขึ้น / AINU ไม่ตอบ / credential พัง)
 * ไม่ใช่กรณี **สแกนไม่ผ่าน** ซึ่ง AINU มีจอของเขาเองอยู่แล้ว
 *
 * ก่อนมีจอนี้ ผู้ใช้จะติดลูป: กดถัดไป → จอวาบ → กลับหน้าเดิม → กดใหม่ ไม่มีทางออก
 * และได้แถวขยะใน DB เพิ่มทุกครั้งที่กด
 */
import { watch } from 'vue'
import { useScrollLock } from '@vueuse/core'

const props = defineProps<{
  open: boolean
  /** ข้อความสาเหตุ — แสดงเฉพาะตอน dev เพื่อไล่ปัญหา */
  detail?: string
}>()

const emit = defineEmits<{
  /** ลองเปิด session ใหม่ — ไม่ใช่ reload หน้า (ไฟล์แนบที่อัปโหลดไว้จะหาย) */
  retry: []
  /** ยอมข้ามด่านนี้แล้วไปยื่นคำร้องต่อ */
  skip: []
}>()

const isScrollLocked = useScrollLock(document.body)

watch(
  () => props.open,
  (open) => {
    isScrollLocked.value = open
  },
  { immediate: true },
)
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden overscroll-none bg-slate-900/60 px-4 backdrop-blur-[2px]"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="liveness-unavailable-heading"
        aria-describedby="liveness-unavailable-body"
      >
        <!-- ไม่มีปุ่มปิด และคลิกพื้นหลังไม่ปิด — ต้องเลือกทางใดทางหนึ่งเสมอ
             ไม่งั้นจะกลับไปติดลูปเดิมที่ปุ่มยังเป็น "ถัดไป" -->
        <div
          class="flex w-full max-w-md flex-col overflow-hidden rounded-2xl border-2 border-amber-400 bg-amber-50 shadow-2xl shadow-amber-900/25"
          @click.stop
        >
          <div class="shrink-0 border-b border-amber-300 bg-gradient-to-b from-amber-400 to-amber-500 px-4 py-4 text-center sm:px-6 sm:py-5">
            <div class="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-full bg-amber-100 shadow-inner ring-4 ring-amber-200/80 sm:mb-3 sm:h-16 sm:w-16">
              <svg class="h-6 w-6 text-amber-600 sm:h-8 sm:w-8" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path
                  fill-rule="evenodd"
                  d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 1.998-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.502-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z"
                  clip-rule="evenodd"
                />
              </svg>
            </div>
            <h2 id="liveness-unavailable-heading" class="text-title font-bold text-amber-950">
              ระบบยืนยันตัวตนใช้งานไม่ได้ขณะนี้
            </h2>
          </div>

          <div id="liveness-unavailable-body" class="px-4 py-4 sm:px-6 sm:py-5">
            <p class="text-body leading-relaxed text-amber-900">
              ขออภัยค่ะ ขณะนี้ระบบยืนยันตัวตนด้วยใบหน้าเชื่อมต่อไม่ได้
              ซึ่งไม่ได้เกิดจากข้อมูลของคุณ
            </p>
            <p class="mt-2 text-body leading-relaxed text-amber-900">
              คุณสามารถลองใหม่อีกครั้ง หรือ<strong>ส่งคำขอต่อได้เลยโดยไม่ต้องยืนยันตัวตน</strong>
              ข้อมูลที่กรอกไว้ทั้งหมดจะไม่หาย
            </p>

            <p v-if="detail" class="mt-3 rounded-lg bg-amber-100 px-3 py-2 font-mono text-hint text-amber-800">
              {{ detail }}
            </p>

            <div class="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                class="min-h-[44px] w-full rounded-xl bg-[#1A56DB] px-4 py-3.5 text-body font-bold text-white shadow-md transition-all hover:bg-blue-700 active:scale-[0.98]"
                @click="emit('retry')"
              >
                ลองใหม่อีกครั้ง
              </button>
              <button
                type="button"
                class="min-h-[44px] w-full rounded-xl border-2 border-amber-500 bg-white px-4 py-3.5 text-body font-semibold text-amber-800 transition-all hover:bg-amber-100 active:scale-[0.98]"
                @click="emit('skip')"
              >
                ยื่นคำร้องโดยไม่ยืนยันตัวตน
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
