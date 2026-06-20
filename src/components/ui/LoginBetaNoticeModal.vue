<script setup lang="ts">
import { watch } from 'vue'
import { useScrollLock } from '@vueuse/core'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  dismiss: []
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
        class="login-beta-notice-overlay fixed inset-0 z-[100] flex items-center justify-center overflow-hidden overscroll-none bg-slate-900/60 backdrop-blur-[2px]"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="login-beta-notice-heading"
        aria-describedby="login-beta-notice-body"
      >
        <div
          class="login-beta-notice-card flex w-full max-w-md flex-col overflow-hidden rounded-2xl border-2 border-yellow-400 bg-yellow-50 shadow-2xl shadow-yellow-900/25"
          @click.stop
        >
          <!-- หัวข้อเตือน — ธีมเหลือง -->
          <div class="shrink-0 border-b border-yellow-300 bg-gradient-to-b from-yellow-400 to-yellow-500 px-4 py-4 text-center sm:px-6 sm:py-5">
            <div class="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-full bg-yellow-100 shadow-inner ring-4 ring-yellow-200/80 sm:mb-3 sm:h-16 sm:w-16">
              <svg
                class="h-6 w-6 text-amber-600 sm:h-8 sm:w-8"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fill-rule="evenodd"
                  d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 1.998-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.502-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z"
                  clip-rule="evenodd"
                />
              </svg>
            </div>
            <h2
              id="login-beta-notice-heading"
              class="text-h2-section font-bold leading-snug text-yellow-950"
            >
              ประกาศแจ้งเตือน
            </h2>
          </div>

          <!-- เนื้อหา — เลื่อนได้เมื่อจอเตี้ย (portrait มือถือ) -->
          <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-6">
            <div
              id="login-beta-notice-body"
              class="rounded-xl border border-yellow-300 bg-white px-4 py-4 text-center sm:px-5 sm:py-5"
            >
              <p class="text-body-md font-semibold leading-relaxed text-yellow-950 sm:text-body">
                ⚠️ ระบบอยู่ระหว่างการทดสอบ ยังไม่สามารถใช้ในการขอรับบริการจริงได้ค่ะ/ครับ
              </p>
            </div>

            <div class="mt-4 rounded-xl border border-yellow-300 bg-yellow-100/80 px-4 py-3.5 text-center sm:mt-5 sm:py-4">
              <p class="text-body-md font-medium leading-relaxed text-yellow-900">
                สอบถามข้อมูลเพิ่มเติมสายด่วน พม.1300
              </p>
            </div>
          </div>

          <div class="shrink-0 border-t border-yellow-200/80 px-4 pb-4 pt-3 sm:px-6 sm:pb-6 sm:pt-4">
            <button
              type="button"
              class="min-h-[44px] w-full rounded-xl bg-[#1A56DB] px-4 py-3.5 text-body font-bold text-white shadow-md transition-all hover:bg-blue-700 active:scale-[0.98]"
              @click="emit('dismiss')"
            >
              รับทราบ
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.login-beta-notice-overlay {
  padding:
    max(12px, env(safe-area-inset-top))
    max(12px, env(safe-area-inset-right))
    max(12px, env(safe-area-inset-bottom))
    max(12px, env(safe-area-inset-left));
}

.login-beta-notice-card {
  max-height: calc(
    100dvh
    - max(12px, env(safe-area-inset-top))
    - max(12px, env(safe-area-inset-bottom))
    - 24px
  );
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
