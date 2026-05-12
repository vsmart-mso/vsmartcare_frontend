<script setup lang="ts">
import { ref, computed, watch } from 'vue'

// checkbox ยืนยันความถูกต้อง
const confirmed = ref(false)

const isReady = computed(() => confirmed.value)

const emit = defineEmits<{ 'update:ready': [boolean] }>()
watch(isReady, (val) => emit('update:ready', val), { immediate: true })

defineExpose({
  getData: () => ({ confirmed: confirmed.value }),
})
</script>

<template>
  <div class="space-y-5">

    <!-- ══════════════════════════════════════════════════
         Hero: ไอคอน + ชื่อหน้า
         ══════════════════════════════════════════════════ -->
    <div class="flex flex-col items-center text-center pt-2 pb-1">
      <!-- Shield icon -->
      <div class="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-4">
        <svg class="w-8 h-8 text-[#1A56DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      </div>
      <h2 class="text-[20px] font-bold text-slate-800 leading-snug mb-2">
        การแจ้งเตือนและการยืนยันข้อมูล
      </h2>
      <p class="text-[13px] text-slate-500 leading-relaxed max-w-xs">
        กรุณาอ่านและยืนยันข้อมูลก่อนดำเนินการบันทึกคำขอรับความช่วยเหลือ
      </p>
    </div>

    <!-- ══════════════════════════════════════════════════
         Card: คำยืนยันก่อนส่งข้อมูล
         ══════════════════════════════════════════════════ -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

      <!-- หัวการ์ด: แถบส้มเตือน -->
      <div class="flex items-center gap-2.5 bg-amber-50 border-b border-amber-100 px-4 py-2.5">
        <svg class="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <span class="text-[12px] font-semibold text-amber-700">ก่อนส่งข้อมูลเข้าระบบ</span>
      </div>

      <div class="p-4 space-y-4">

        <!-- หัวข้อ -->
        <p class="text-[15px] font-bold text-slate-800">คำยืนยันก่อนส่งข้อมูล</p>

        <!-- เนื้อหาคำยืนยัน (keywords เน้นสีน้ำเงิน) -->
        <p class="text-[14px] text-slate-700 leading-relaxed">
          ข้าพเจ้าขอรับรองว่า ข้อมูลและเอกสารข้างต้น<span class="text-[#1A56DB] font-semibold">ถูกต้องตรงตามความเป็นจริง</span>ทุกประการ
          หากข้อมูลหรือเอกสารไม่ถูกต้องครบถ้วนตรงตามความเป็นจริง
          ข้าพเจ้าตกลงยินยอมให้<span class="text-[#1A56DB] font-semibold">ระงับรับสวัสดิการ</span>และประโยชน์อื่น
          และยินยอมให้เปิดเผย<span class="text-[#1A56DB] font-semibold">ข้อมูลข่าวสาร</span>
          เพื่อประโยชน์ในการ<span class="text-[#1A56DB] font-semibold">พัฒนาคุณภาพชีวิต</span>ของข้าพเจ้าและครอบครัว
        </p>

        <!-- Checkbox ยืนยัน -->
        <label
          class="flex items-start gap-3 border-2 border-dashed rounded-xl px-4 py-3.5 cursor-pointer transition-all duration-150"
          :class="confirmed ? 'border-[#1A56DB] bg-blue-50' : 'border-slate-300 bg-white hover:border-slate-400'"
          @click.prevent="confirmed = !confirmed"
        >
          <div
            class="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-150"
            :class="confirmed ? 'bg-[#1A56DB] border-[#1A56DB]' : 'bg-white border-slate-300'"
          >
            <svg v-if="confirmed" class="w-[11px] h-[11px] text-white" viewBox="0 0 12 10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="1,5 4.5,9 11,1" />
            </svg>
          </div>
          <span
            class="text-[13px] leading-snug font-medium transition-colors"
            :class="confirmed ? 'text-[#1A56DB]' : 'text-slate-700'"
          >
            ข้าพเจ้ายืนยันความถูกต้องของข้อมูลที่จะส่งเข้าระบบ
          </span>
        </label>

      </div>
    </div>

  </div>
</template>
