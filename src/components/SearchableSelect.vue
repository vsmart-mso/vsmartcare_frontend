<script setup lang="ts">
// Dropdown ที่มีช่องค้นหา ใช้แทน <select> ในหน้าที่มีตัวเลือกเยอะ เช่น จังหวัด/อำเภอ/ตำบล
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

interface Option {
  value: string
  label: string
}

const props = defineProps<{
  modelValue: string        // ค่าที่เลือกอยู่ (ผูกกับ v-model)
  options: Option[]         // รายการตัวเลือกทั้งหมด
  placeholder?: string      // ข้อความเมื่อยังไม่ได้เลือก
  disabled?: boolean        // ปิดใช้งาน (เช่น ยังไม่ได้เลือกระดับก่อนหน้า)
  hasError?: boolean        // แสดงกรอบสีแดงเมื่อมี error
}>()

const emit = defineEmits<{
  'update:modelValue': [string]   // ส่งค่าที่เลือกกลับไปให้ parent
  'change': []                    // แจ้งว่ามีการเลือกใหม่ (ใช้ mark touched)
  'blur': []                      // แจ้งว่า dropdown ถูกปิด
}>()

const isOpen        = ref(false)
const searchText    = ref('')
const inputRef      = ref<HTMLInputElement>()
const containerRef  = ref<HTMLDivElement>()

// กรองรายการตามคำค้นหา
const filtered = computed(() => {
  const q = searchText.value.trim().toLowerCase()
  if (!q) return props.options
  return props.options.filter(o => o.label.toLowerCase().includes(q))
})

// ข้อความที่แสดงบนปุ่ม trigger
const displayLabel = computed(() =>
  props.options.find(o => o.value === props.modelValue)?.label ?? ''
)

function open() {
  if (props.disabled) return
  isOpen.value   = true
  searchText.value = ''
  // เลื่อน focus ไปที่ช่องค้นหาหลังจาก dropdown เปิด
  setTimeout(() => inputRef.value?.focus(), 50)
}

function select(opt: Option) {
  emit('update:modelValue', opt.value)
  emit('change')
  isOpen.value   = false
  searchText.value = ''
}

function close() {
  isOpen.value   = false
  searchText.value = ''
  emit('blur')
}

// ปิด dropdown เมื่อคลิกนอก component
function handleOutside(e: MouseEvent) {
  if (!containerRef.value?.contains(e.target as Node) && isOpen.value) {
    close()
  }
}

onMounted(()       => document.addEventListener('mousedown', handleOutside))
onBeforeUnmount(() => document.removeEventListener('mousedown', handleOutside))
</script>

<template>
  <div ref="containerRef" class="relative">

    <!-- ปุ่ม trigger แสดงค่าที่เลือก -->
    <button
      type="button"
      :disabled="disabled"
      @click="open"
      class="w-full text-left border rounded-xl px-3 py-2.5 text-[14px] bg-white focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB] transition-colors disabled:bg-slate-50 disabled:cursor-not-allowed"
      :class="hasError ? 'border-red-300' : 'border-slate-200'"
    >
      <span :class="modelValue ? 'text-slate-900' : 'text-slate-400'">
        {{ displayLabel || placeholder || '— เลือก —' }}
      </span>
    </button>

    <!-- ไอคอนลูกศร -->
    <div class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
      <svg
        class="w-4 h-4 transition-transform duration-200"
        :class="[isOpen ? 'rotate-180' : '', disabled ? 'text-slate-300' : 'text-slate-400']"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </div>

    <!-- Panel dropdown -->
    <div
      v-if="isOpen"
      class="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
    >
      <!-- ช่องค้นหา -->
      <div class="p-2 border-b border-slate-100">
        <div class="relative">
          <svg
            class="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref="inputRef"
            v-model="searchText"
            type="text"
            placeholder="ค้นหา..."
            class="w-full pl-8 pr-3 py-1.5 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A56DB]"
          />
        </div>
      </div>

      <!-- รายการตัวเลือก -->
      <ul class="max-h-52 overflow-y-auto">
        <li
          v-if="filtered.length === 0"
          class="px-4 py-3 text-[13px] text-slate-400 text-center"
        >
          ไม่พบข้อมูล
        </li>
        <li
          v-for="opt in filtered"
          :key="opt.value"
          @mousedown.prevent="select(opt)"
          class="px-4 py-2.5 text-[14px] cursor-pointer transition-colors"
          :class="opt.value === modelValue
            ? 'bg-blue-50 text-[#1A56DB] font-medium'
            : 'text-slate-700 hover:bg-slate-50'"
        >
          {{ opt.label }}
        </li>
      </ul>
    </div>

  </div>
</template>
