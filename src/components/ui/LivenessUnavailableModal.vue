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
  /** ปิด modal เฉย ๆ — gate ไม่เปิด ปุ่มล่างยังเป็น "ถัดไป" (requirement 2026-09: ยอมให้วนลูป) */
  close: []
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
        @click.self="emit('close')"
      >
        <!-- ปิดได้ทั้งกากบาทและคลิกพื้นหลัง — ปิดแล้วปุ่มล่างยังเป็น "ถัดไป"
             ผู้ใช้กดถัดไปจะเจอ modal นี้ซ้ำ (requirement ใหม่: ยอมให้วนลูปไปก่อน) -->
        <div
          class="flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl shadow-blue-900/25 ring-1 ring-blue-100"
          @click.stop
        >
          <div class="relative shrink-0 bg-gradient-to-b from-[#1A56DB] to-[#1648C4] px-4 py-5 text-center sm:px-6">
            <button
              type="button"
              class="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/15 hover:text-white"
              aria-label="ปิดหน้าต่างนี้"
              @click="emit('close')"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="h-5 w-5">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
            <div class="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-white/15 ring-4 ring-white/20 sm:h-16 sm:w-16">
              <!-- สามเหลี่ยมเตือนสีเหลือง — ตัดกับหัวสีน้ำเงินและสื่อว่า "ต้องอ่านก่อนไปต่อ" -->
              <svg class="h-7 w-7 text-yellow-400 sm:h-8 sm:w-8" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path
                  fill-rule="evenodd"
                  d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 1.998-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.502-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z"
                  clip-rule="evenodd"
                />
              </svg>
            </div>
            <h2 id="liveness-unavailable-heading" class="text-title font-bold text-white">
              เกิดข้อผิดพลาดในการเชื่อมต่อ
            </h2>
          </div>

          <div id="liveness-unavailable-body" class="px-5 py-5 sm:px-6">
            <p class="text-body leading-relaxed text-slate-700">
              ระบบไม่สามารถเชื่อมต่อเพื่อยืนยันตัวตนได้ในขณะนี้
              ข้อมูลที่ท่านกรอกไว้จะยังคงอยู่ ท่านสามารถลองเชื่อมต่อใหม่อีกครั้ง
            </p>

            <div class="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                class="min-h-[44px] w-full rounded-xl bg-[#1A56DB] px-4 py-3.5 text-body font-bold text-white shadow-md shadow-blue-200 transition-all hover:bg-[#1648C4] active:scale-[0.98]"
                @click="emit('retry')"
              >
                ลองใหม่อีกครั้ง
              </button>
              <!-- <button
                type="button"
                class="min-h-[44px] w-full rounded-xl border-2 border-[#1A56DB] bg-white px-4 py-3.5 text-body font-semibold text-[#1A56DB] transition-all hover:bg-blue-50 active:scale-[0.98]"
                @click="emit('skip')"
              >
                ยื่นคำร้องโดยไม่ยืนยันตัวตน
              </button> -->
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
