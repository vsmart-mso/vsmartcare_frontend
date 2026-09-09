<script setup lang="ts">
/**
 * แจ้งว่าเปิดระบบยืนยันตัวตนไม่ได้ แล้วให้ผู้ใช้เลือกทางไป
 *
 * ขึ้นเฉพาะกรณี **เปิดระบบไม่ได้** (SDK โหลดไม่ขึ้น / AINU ไม่ตอบ / credential พัง)
 * ไม่ใช่กรณี **สแกนไม่ผ่าน** ซึ่ง AINU มีจอของเขาเองอยู่แล้ว
 *
 * ก่อนมีจอนี้ ผู้ใช้จะติดลูป: กดถัดไป → จอวาบ → กลับหน้าเดิม → กดใหม่ ไม่มีทางออก
 * และได้แถวขยะใน DB เพิ่มทุกครั้งที่กด
 *
 * ⚠️ ไม่แสดงรายละเอียด error ให้ผู้ใช้เห็น — stack trace ของ SDK อ่านไม่รู้เรื่อง
 * และไม่ช่วยให้ผู้ใช้ตัดสินใจอะไรได้ · ข้อมูลไล่ปัญหาอยู่ใน console กับ raw_payload ใน DB
 */
import { watch } from 'vue'
import { useScrollLock } from '@vueuse/core'

const props = defineProps<{
  open: boolean
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
             ไม่งั้นจะกลับไปติดลูปเดิมที่ปุ่มล่างยังเป็น "ถัดไป" -->
        <div
          class="flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl shadow-blue-900/25 ring-1 ring-blue-100"
          @click.stop
        >
          <div class="shrink-0 bg-gradient-to-b from-[#1A56DB] to-[#1648C4] px-4 py-5 text-center sm:px-6">
            <div class="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-white/15 ring-4 ring-white/20 sm:h-16 sm:w-16">
              <svg class="h-7 w-7 text-white sm:h-8 sm:w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m0 3.75h.008M12 3a9 9 0 100 18 9 9 0 000-18z" />
              </svg>
            </div>
            <h2 id="liveness-unavailable-heading" class="text-title font-bold text-white">
              ระบบยืนยันตัวตนใช้งานไม่ได้ขณะนี้
            </h2>
          </div>

          <div id="liveness-unavailable-body" class="px-5 py-5 sm:px-6">
            <p class="text-body leading-relaxed text-slate-700">
              ขณะนี้ระบบยืนยันตัวตนด้วยใบหน้าเชื่อมต่อไม่ได้ ซึ่งไม่ได้เกิดจากข้อมูลของคุณ
            </p>
            <p class="mt-2.5 text-body leading-relaxed text-slate-700">
              คุณสามารถลองใหม่อีกครั้ง หรือ<strong class="font-semibold text-slate-900">ส่งคำขอต่อได้เลยโดยไม่ต้องยืนยันตัวตน</strong>
              ข้อมูลที่กรอกไว้ทั้งหมดจะไม่หาย
            </p>

            <div class="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                class="min-h-[44px] w-full rounded-xl bg-[#1A56DB] px-4 py-3.5 text-body font-bold text-white shadow-md shadow-blue-200 transition-all hover:bg-[#1648C4] active:scale-[0.98]"
                @click="emit('retry')"
              >
                ลองใหม่อีกครั้ง
              </button>
              <button
                type="button"
                class="min-h-[44px] w-full rounded-xl border-2 border-[#1A56DB] bg-white px-4 py-3.5 text-body font-semibold text-[#1A56DB] transition-all hover:bg-blue-50 active:scale-[0.98]"
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
