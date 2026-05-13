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
      <div class="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mb-4">
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

      <!-- หัวคำเตือน: ไอคอน + label + title -->
      <div class="flex gap-3 px-4 pt-4 pb-2">
        <!-- วงกลม amber + ไอคอนสามเหลี่ยมเตือน (filled) -->
        <div class="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0" aria-hidden="true">
          <svg class="w-5 h-5 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
            <path fill-rule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clip-rule="evenodd" />
          </svg>
        </div>
        <div>
          <!-- label เล็กสีส้ม -->
          <p class="text-[11px] font-semibold text-amber-600 uppercase tracking-wider mb-0.5">
            ก่อนส่งข้อมูลเข้าระบบ
          </p>
          <p class="text-[15px] font-bold text-slate-900">คำยืนยันก่อนส่งข้อมูล</p>
        </div>
      </div>

      <div class="px-4 pt-2 pb-4 space-y-3">

        <!-- ย่อหน้าที่ 1 -->
        <p class="text-[14px] text-slate-700 leading-relaxed indent-6">
          ข้าพเจ้ารับรองว่า ข้อมูลและเอกสารข้างต้น<span class="text-[#1A56DB] font-semibold">ถูกต้องตรงตามความเป็นจริง</span>ทุกประการหากข้อมูลและเอกสารข้างต้นไม่ถูกต้องครบถ้วนตรงตามความเป็นจริง ข้าพเจ้าตกลงยินยอมให้<span class="text-[#1A56DB] font-semibold">ระงับสวัสดิการ</span>และประโยชน์อื่น
        </p>

        <!-- ย่อหน้าที่ 2 -->
        <p class="text-[14px] text-slate-700 leading-relaxed indent-6">
          ข้าพเจ้ายินยอมให้<span class="text-[#1A56DB] font-semibold">เปิดเผยข้อมูลข่าวสาร</span> เพื่อประโยชน์ในการ<span class="text-[#1A56DB] font-semibold">พัฒนาคุณภาพชีวิต</span>ของข้าพเจ้าและครอบครัว
        </p>

        <!-- Checkbox ยืนยัน -->
        <label class="flex items-start gap-3 cursor-pointer select-none mt-4 mb-1">
          <input type="checkbox" v-model="confirmed" class="sr-only" />
          <div
            :class="[
              'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-150',
              confirmed ? 'bg-[#1A56DB] border-[#1A56DB]' : 'bg-white border-slate-300'
            ]"
            aria-hidden="true"
          >
            <svg v-show="confirmed" class="w-[11px] h-[11px] text-white" viewBox="0 0 12 10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="1,5 4.5,9 11,1" />
            </svg>
          </div>
          <span class="text-[14px] text-slate-700 leading-snug">
            ข้าพเจ้าผู้ยื่นขอรับความช่วยเหลือขอยืนยันความถูกต้องของข้อมูลที่ส่งเข้าระบบโดยผู้บันทึกข้อมูลต้องกดยอมรับข้อตกลงก่อนดำเนินการบันทึกข้อมูลและส่งข้อมูลในระบบ
          </span>
        </label>

      </div>
    </div>

  </div>
</template>
