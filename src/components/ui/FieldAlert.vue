<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'

defineProps<{ reason: string }>()

const open      = ref(false)
const btnRef    = ref<HTMLButtonElement | null>(null)
const popRef    = ref<HTMLDivElement | null>(null)
const popStyle  = ref<Record<string, string>>({})
const arrowStyle = ref<Record<string, string>>({})

function calcPos() {
  if (!btnRef.value) return
  const r    = btnRef.value.getBoundingClientRect()
  const vw   = window.innerWidth
  const popW = 240  // w-60
  let left   = r.left
  if (left + popW > vw - 8) left = Math.max(8, vw - popW - 8)

  popStyle.value = {
    top:       `${r.top}px`,
    left:      `${left}px`,
    transform: 'translateY(calc(-100% - 8px))',
  }

  // จัด arrow ให้ชี้ตรงกึ่งกลางปุ่มเสมอ ไม่ว่า popup จะถูกเลื่อนซ้ายเท่าไร
  const btnCenterX  = r.left + r.width / 2
  const arrowCenter = Math.max(12, Math.min(popW - 12, Math.round(btnCenterX - left)))
  arrowStyle.value  = { left: `${arrowCenter - 6}px` }  // arrow element กว้าง 12px (w-3)
}

function toggle() {
  if (!open.value) calcPos()
  open.value = !open.value
}

function onDocClick(e: MouseEvent) {
  if (!open.value) return
  const t = e.target as Node
  if (btnRef.value?.contains(t) || popRef.value?.contains(t)) return
  open.value = false
}

function onScroll() { open.value = false }

onMounted(() => {
  document.addEventListener('click', onDocClick, true)
  window.addEventListener('scroll', onScroll, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick, true)
  window.removeEventListener('scroll', onScroll, true)
})
</script>

<template>
  <span class="inline-flex items-center">
    <button
      ref="btnRef"
      type="button"
      class="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 hover:bg-amber-500 active:bg-amber-600 transition-colors flex-shrink-0"
      @click.stop="toggle"
      aria-label="ดูหมายเหตุการแก้ไข"
    >
      <svg class="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
      </svg>
    </button>

    <Teleport to="body">
      <Transition
        enter-active-class="transition-all duration-150 ease-out"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition-all duration-100 ease-in"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-95"
      >
        <div
          v-if="open"
          ref="popRef"
          :style="popStyle"
          class="fixed z-[9999] w-60 max-w-[calc(100vw-1rem)] bg-amber-50 border border-amber-300 rounded-xl shadow-lg px-3 py-2.5 origin-bottom-left"
        >
          <p class="text-micro font-semibold text-amber-700 mb-1">หมายเหตุจากเจ้าหน้าที่</p>
          <p class="text-hint text-amber-800 leading-relaxed whitespace-pre-wrap break-words">{{ reason }}</p>
          <div :style="arrowStyle" class="absolute -bottom-1.5 w-3 h-3 bg-amber-50 border-r border-b border-amber-300 rotate-45"></div>
        </div>
      </Transition>
    </Teleport>
  </span>
</template>
