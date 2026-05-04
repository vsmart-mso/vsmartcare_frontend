<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

// ─── State: checkbox ทั้ง 3 ตัว ───────────────────────────────────────────────
// ref(false) = ค่าเริ่มต้นเป็น false (ยังไม่ได้ติ๊ก)
const consentPDPA    = ref(false) // ยินยอมให้จัดเก็บข้อมูลส่วนบุคคลตาม PDPA
const consentTerms   = ref(false) // รับทราบเงื่อนไขการใช้บริการ
const consentWarning = ref(false) // รับทราบคำเตือนก่อนบันทึกข้อมูล

// computed: ปุ่ม "ยืนยัน" จะ active เฉพาะเมื่อติ๊กครบทั้ง 3
// computed() จะคำนวณใหม่อัตโนมัติทุกครั้งที่ค่าใด checkbox เปลี่ยน
const canProceed = computed(() =>
  consentPDPA.value && consentTerms.value && consentWarning.value
)

// ─── Actions ───────────────────────────────────────────────────────────────────

function handleBack() {
  if (window.history.length > 1) router.back()
  else router.push({ name: 'login' })
}

function handleReject() {
  // ปฏิเสธ: พาผู้ใช้กลับหน้า Login
  router.push({ name: 'login' })
}

function handleProceed() {
  if (!canProceed.value) return
  // TODO: บันทึก consent log ผ่าน API ก่อนไปหน้าถัดไป
  router.push({ name: 'check-self' })
}
</script>

<template>
  <!--
    Layout หน้า PDPA:
    - Header: ติดบนสุด (fixed) สีน้ำเงิน
    - Main: เนื้อหา scroll ได้ มี padding ชดเชย header และ footer
    - Footer: ติดล่างสุด (fixed) มีปุ่มยืนยัน/ปฏิเสธ
  -->
  <div class="min-h-dvh bg-slate-100">

    <!-- ══════════════════════════════════════════
         App Bar (fixed header)
         ══════════════════════════════════════════ -->
    <header class="fixed top-0 left-0 right-0 h-14 bg-[#1A56DB] z-50"
            style="padding-top: env(safe-area-inset-top)">
      <div class="relative mx-auto h-full flex items-center max-w-md px-4">

        <!-- ปุ่ม Back -->
        <button
          @click="handleBack"
          class="flex items-center justify-center w-9 h-9 rounded-full text-white hover:bg-white/20 active:bg-white/30 transition-colors"
          aria-label="ย้อนกลับ"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <!-- Title: absolute center เพื่อให้อยู่กลางจอเสมอแม้ปุ่มซ้าย-ขวาไม่เท่ากัน -->
        <h1 class="absolute inset-x-0 text-center text-white text-[16px] font-semibold pointer-events-none">
          ความยินยอม (PDPA)
        </h1>
      </div>
    </header>

    <!-- ══════════════════════════════════════════
         Main Content (scrollable)
         pt-14 = ชดเชยความสูง header
         pb-28 = ชดเชยความสูง footer
         ══════════════════════════════════════════ -->
    <main class="pt-14 pb-28 mx-auto w-full max-w-md">

      <!-- ── ไอคอนโล่ + Title ── -->
      <div class="flex flex-col items-center px-5 pt-7 pb-5 text-center">

        <!-- ไอคอนโล่: วงกลมสีน้ำเงินอ่อน + shield SVG สีน้ำเงิน -->
        <div class="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mb-4" aria-hidden="true">
          <svg class="w-7 h-7 text-[#1A56DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        </div>

        <h2 class="text-[20px] font-bold text-slate-900 leading-snug mb-2">
          การแจ้งเตือนและการยืนยันข้อมูล
        </h2>
        <p class="text-[13px] text-slate-500 leading-relaxed">
          กรุณาอ่านและยืนยันข้อมูลก่อนดำเนินการบันทึกคำขอรับ<br />ความช่วยเหลือ
        </p>
      </div>

      <!-- ── Card: ข้อมูลการยินยอม + Checkboxes ── -->
      <div class="mx-4 mb-4 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

        <!-- รายการข้อมูล 3 ข้อ -->
        <div class="px-5 pt-5 pb-4 space-y-4">

          <!-- ข้อ 1: วัตถุประสงค์ -->
          <div class="flex gap-3">
            <!-- ไอคอนเอกสาร -->
            <div class="flex-shrink-0 mt-0.5">
              <svg class="w-5 h-5 text-[#1A56DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[14px] font-semibold text-slate-900 mb-0.5">วัตถุประสงค์การเก็บข้อมูล</p>
              <p class="text-[13px] text-slate-500 leading-relaxed">
                เพื่อพิจารณาให้ความช่วยเหลือทางสังคมตามภารกิจของกระทรวงการพัฒนาสังคมและความมั่นคงของมนุษย์
              </p>
            </div>
          </div>

          <!-- ข้อ 2: ข้อมูลที่จัดเก็บ -->
          <div class="flex gap-3">
            <!-- ไอคอนตา -->
            <div class="flex-shrink-0 mt-0.5">
              <svg class="w-5 h-5 text-[#1A56DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[14px] font-semibold text-slate-900 mb-0.5">ข้อมูลที่จัดเก็บ</p>
              <p class="text-[13px] text-slate-500 leading-relaxed">
                ชื่อ-สกุล, เลขบัตร ปชช., ที่อยู่, รายได้, สภาพปัญหา, เอกสารแนบและข้อมูลธนาคาร/พร้อมเพย์
              </p>
            </div>
          </div>

          <!-- ข้อ 3: การเปิดเผยต่อหน่วยงาน -->
          <div class="flex gap-3">
            <!-- ไอคอน share -->
            <div class="flex-shrink-0 mt-0.5">
              <svg class="w-5 h-5 text-[#1A56DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[14px] font-semibold text-slate-900 mb-0.5">การเปิดเผยต่อหน่วยงาน</p>
              <p class="text-[13px] text-slate-500 leading-relaxed">
                ข้อมูลจะถูกส่งต่อให้ นสค., คณะกรรมการ, พมจ. และหน่วยงานการเงิน เพื่อพิจารณาเบิกจ่าย
              </p>
            </div>
          </div>
        </div>

        <!-- เส้นคั่น -->
        <div class="h-px bg-slate-100 mx-5" />

        <!-- Checkboxes ในกลุ่มแรก -->
        <div class="px-5 py-4 space-y-4">

          <!-- Checkbox 1: ยินยอม PDPA -->
          <label class="flex items-start gap-3 cursor-pointer select-none">
            <input type="checkbox" v-model="consentPDPA" class="sr-only" />
            <!--
              sr-only = ซ่อน checkbox จริงจากตา แต่ screen reader ยังอ่านได้
              แทนที่ด้วย div ที่ดูสวยกว่า และ v-model ทำงานผ่าน label
            -->
            <div
              :class="[
                'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-150',
                consentPDPA
                  ? 'bg-[#1A56DB] border-[#1A56DB]'
                  : 'bg-white border-slate-300'
              ]"
              aria-hidden="true"
            >
              <svg v-show="consentPDPA" class="w-[11px] h-[11px] text-white" viewBox="0 0 12 10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="1,5 4.5,9 11,1" />
              </svg>
            </div>
            <span class="text-[14px] text-slate-700 leading-snug">
              ข้าพเจ้ายินยอมให้จัดเก็บและใช้ข้อมูลส่วนบุคคลตาม PDPA
            </span>
          </label>

          <!-- Checkbox 2: รับทราบเงื่อนไข -->
          <label class="flex items-start gap-3 cursor-pointer select-none">
            <input type="checkbox" v-model="consentTerms" class="sr-only" />
            <div
              :class="[
                'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-150',
                consentTerms
                  ? 'bg-[#1A56DB] border-[#1A56DB]'
                  : 'bg-white border-slate-300'
              ]"
              aria-hidden="true"
            >
              <svg v-show="consentTerms" class="w-[11px] h-[11px] text-white" viewBox="0 0 12 10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="1,5 4.5,9 11,1" />
              </svg>
            </div>
            <span class="text-[14px] text-slate-700 leading-snug">
              ข้าพเจ้ารับทราบเงื่อนไขการใช้บริการของระบบ พม. CARE
            </span>
          </label>

        </div>
      </div>

      <!-- ── Card: คำเตือนก่อนบันทึกข้อมูล ── -->
      <div class="mx-4 mb-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">

        <!-- หัวคำเตือน: ไอคอน + label + title -->
        <div class="flex gap-3 mb-4">
          <!-- วงกลม amber + ไอคอนสามเหลี่ยมเตือน -->
          <div class="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0" aria-hidden="true">
            <svg class="w-5 h-5 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
              <path fill-rule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clip-rule="evenodd" />
            </svg>
          </div>
          <div>
            <!-- label เล็กสีส้ม -->
            <p class="text-[11px] font-semibold text-amber-600 uppercase tracking-wider mb-0.5">
              ก่อนบันทึกข้อมูล
            </p>
            <p class="text-[15px] font-bold text-slate-900">คำเตือนก่อนบันทึกข้อมูล</p>
          </div>
        </div>

        <!-- เนื้อหาคำเตือน พร้อม highlighted text สีน้ำเงิน -->
        <p class="text-[14px] text-slate-700 leading-relaxed mb-5">
          ข้าพเจ้าขอรับรองว่า จะให้หรือแจ้งข้อมูลและเอกสารที่
          <span class="text-[#1A56DB] font-medium">ถูกต้องตามความเป็นจริง</span>
          และรับทราบว่าการให้หรือแจ้งข้อมูลและเอกสารอันเป็นเท็จ
          อาจต้อง<span class="text-[#1A56DB] font-medium">รับผิดตามกฎหมายทั้งทางแพ่งและทางอาญา</span>
        </p>

        <!-- Checkbox 3: อยู่ในกรอบ — เปลี่ยน border + bg เมื่อติ๊ก -->
        <!--
          transition-all = animation ทุก property
          border-dashed เมื่อยังไม่ติ๊ก / border-solid สีน้ำเงินเมื่อติ๊ก
        -->
        <label
          :class="[
            'flex items-center gap-3 cursor-pointer select-none rounded-xl border-2 px-4 py-3 transition-all duration-200',
            consentWarning
              ? 'border-[#1A56DB] bg-blue-50'
              : 'border-dashed border-slate-300 bg-white'
          ]"
        >
          <input type="checkbox" v-model="consentWarning" class="sr-only" />
          <div
            :class="[
              'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-150',
              consentWarning
                ? 'bg-[#1A56DB] border-[#1A56DB]'
                : 'bg-white border-slate-300'
            ]"
            aria-hidden="true"
          >
            <svg v-show="consentWarning" class="w-[11px] h-[11px] text-white" viewBox="0 0 12 10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="1,5 4.5,9 11,1" />
            </svg>
          </div>
          <!-- ข้อความเปลี่ยนสีตามสถานะ -->
          <span
            :class="[
              'text-[14px] leading-snug transition-colors duration-200',
              consentWarning ? 'text-[#1A56DB] font-medium' : 'text-slate-600'
            ]"
          >
            ข้าพเจ้ารับทราบคำเตือนข้างต้น
          </span>
        </label>

      </div>

    </main>

    <!-- ══════════════════════════════════════════
         Sticky Footer
         ══════════════════════════════════════════ -->
    <footer
      class="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200"
      style="padding-bottom: max(env(safe-area-inset-bottom), 12px)"
    >
      <div class="mx-auto max-w-md px-4 pt-3">

        <!-- hint text: แสดงเฉพาะตอนที่ยังไม่ครบ -->
        <p
          v-show="!canProceed"
          class="text-center text-[12px] text-slate-400 mb-2"
        >
          กรุณายืนยันรายการทั้งหมดก่อนดำเนินการต่อ
        </p>

        <!-- ปุ่ม 2 ปุ่ม -->
        <div class="flex gap-3">

          <!-- ปุ่ม "ปฏิเสธ" — ghost button -->
          <button
            @click="handleReject"
            class="flex-1 h-12 rounded-xl border-2 border-slate-300 bg-white text-[15px] font-semibold text-slate-600 hover:bg-slate-50 active:bg-slate-100 transition-colors"
          >
            ปฏิเสธ
          </button>

          <!-- ปุ่ม "ยืนยันและดำเนินการต่อ" — primary blue, disabled จนกว่าจะครบ -->
          <!--
            :disabled="!canProceed" = ปิดการใช้งานเมื่อยังไม่ครบ
            opacity + pointer-events = ทำให้ดูเทา + กดไม่ได้
          -->
          <button
            @click="handleProceed"
            :disabled="!canProceed"
            :class="[
              'flex-1 h-12 rounded-xl text-[15px] font-semibold text-white transition-all duration-200',
              canProceed
                ? 'bg-[#1A56DB] hover:bg-blue-700 active:bg-blue-800 shadow-sm'
                : 'bg-slate-300 cursor-not-allowed'
            ]"
          >
            ยืนยันและดำเนินการต่อ
          </button>

        </div>
      </div>
    </footer>

  </div>
</template>
