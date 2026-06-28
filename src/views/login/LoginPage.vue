<script setup lang="ts">
// <script setup> คือรูปแบบใหม่ของ Vue 3 (Composition API)
// โค้ดในนี้ทำงานครั้งเดียวตอน component ถูกสร้าง

import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { redirectBrowserToThaIDLogin } from '@/api/auth'
import AppBrandHeader from '@/components/ui/AppBrandHeader.vue'
import LoginBetaNoticeModal from '@/components/ui/LoginBetaNoticeModal.vue'
import { isLoginBetaNoticeEnabled } from '@/config/env'

// import โลโก้ช่องทาง login
import logoThaID    from '@/assets/logo-thaid.png'
import logoThangrath from '@/assets/logo-thangrath.png'

// useRouter() ดึง router instance มาใช้สำหรับเปลี่ยนหน้า
const router = useRouter()
const route  = useRoute()

const thaidError = ref<string | null>(null)
const thaidLoading = ref(false)
const showBetaNotice = ref(isLoginBetaNoticeEnabled())

function dismissBetaNotice() {
  showBetaNotice.value = false
}

// รับ error message ที่ส่งมาจาก LoginThaIDReturnPage (เช่น ผู้ใช้ปฏิเสธในแอป ThaiD)
onMounted(() => {
  const err = route.query.auth_error
  if (typeof err === 'string' && err) {
    thaidError.value = err
    // ลบ query ออกจาก URL ไม่ให้ค้างเมื่อ user refresh
    router.replace({ name: 'login' })
  }

})

/** พาเบราว์เซอร์ไปหน้า OAuth / QR ของ ThaiD โดยตรง หลังยืนยันแล้วจะกลับมาที่ /login/thaid/return */
async function handleThaID() {
  if (thaidLoading.value) return
  thaidError.value = null
  thaidLoading.value = true
  try {
    await redirectBrowserToThaIDLogin(router)
  } catch (e: unknown) {
    thaidLoading.value = false
    thaidError.value = e instanceof Error ? e.message : 'เริ่มล็อกอิน ThaiD ไม่สำเร็จ'
  }
}

// ฟังก์ชันเมื่อกดปุ่ม ทางรัฐ
function handleTangRath() {
  // TODO: เปิด DGA Liveness SDK และจัดการ flow การสแกนใบหน้า
  // ตอนนี้พาไปหน้า check-self ชั่วคราวเพื่อทดสอบ UI
  router.push({ name: 'check-self' })
}
</script>

<template>
  <!--
    Layout หลักของหน้า Login:
    - min-h-dvh = ความสูงอย่างน้อยเต็มจอ (dvh รองรับ browser bar บนมือถือ)
    - flex flex-col = จัด children แนวตั้ง
    - ไม่ใช้ justify-center เพื่อให้ brand section อยู่ด้านบนเสมอ
  -->
  <div class="min-h-dvh flex flex-col bg-[#F8FAFC]">

    <LoginBetaNoticeModal :open="showBetaNotice" @dismiss="dismissBetaNotice" />

    <!--
      main: ใช้ flex-1 เพื่อดัน footer ลงด้านล่างเสมอ
      ไม่มี px-5 ที่นี่ เพราะ brand section ต้องการ full-width
    -->
    <main class="flex-1 flex flex-col mx-auto w-full max-w-md">

      <!-- ═══════════════════════════════════════════════
           ส่วนที่ 1: Brand Header
           - มี gradient background สีชมพูอ่อน ทำให้เห็นชัดว่านี่คือ "header"
           - โลโก้ขนาดใหญ่ + ชื่อระบบ "พม. CARE" เด่นกว่า heading ด้านล่าง
           ═══════════════════════════════════════════════ -->
      <div class="px-5 pt-10 pb-8">
        <AppBrandHeader />
      </div>

      <!-- ═══════════════════════════════════════════════
           ส่วนที่ 2–5: เนื้อหาหลัก (มี px-5 เฉพาะส่วนนี้)
           ═══════════════════════════════════════════════ -->
      <div class="flex flex-col px-5 pt-6 pb-8">

        <!-- ประกาศช่วงทดลองใช้งาน -->
        <div class="mb-5 bg-amber-50 border border-amber-300 rounded-xl p-4">
          <!-- หัวข้อพร้อมไอคอน — จัดกึ่งกลาง เหมือนกล่องเอกสารด้านล่าง -->
          <div class="flex items-center justify-center gap-2 mb-2">
            <div class="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <svg class="w-4 h-4 text-amber-500" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 1.998-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.502-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clip-rule="evenodd" />
              </svg>
            </div>
            <p class="text-[16px] font-bold text-amber-800 leading-snug">
              ช่วงทดลองการใช้งานระบบ เฉพาะ 9 พื้นที่เท่านั้น
            </p>
          </div>
          <!-- รายชื่อจังหวัด -->
          <p class="text-[14px] text-amber-800 text-center leading-relaxed">
            (สมุทรปราการ, หนองคาย, เชียงใหม่, แพร่, เชียงราย, กาญจนบุรี, นครราชสีมา, สงขลา, พัทลุง)
          </p>
        </div>

        <!-- ส่วนที่ 2: Title -->
        <div class="text-center mb-7">
          <!-- h1 — token H2-section (1.25rem) ใต้ Display brand -->
          <h1 class="text-h2-section font-bold text-slate-900 leading-snug mb-2">
            เลือกช่องทางยืนยันตัวตน
          </h1>
          <p class="text-body-md text-slate-500 leading-relaxed">
            ยืนยันตัวตนเพื่อยื่นคำขอหรือติดตามสถานะ
          </p>
        </div>

        <!-- ส่วนที่ 3: ปุ่มเลือกวิธี Login -->
        <div class="space-y-3 mb-5">

          <!-- ปุ่ม ThaID -->
          <!--
            group = ทำให้ child elements ตอบสนองต่อ hover ของ parent ได้
            active:scale-[0.98] = ขยับเล็กน้อยเมื่อกด ให้ความรู้สึก tactile บนมือถือ
          -->
          <button
            type="button"
            :disabled="thaidLoading"
            @click="handleThaID"
            class="group w-full flex items-center gap-4 bg-white rounded-2xl border-2 border-blue-200 p-4 text-left shadow-sm transition-all duration-150 hover:border-blue-400 hover:shadow-md active:scale-[0.98] active:bg-blue-50 disabled:opacity-60 disabled:pointer-events-none"
            aria-label="เข้าสู่ระบบด้วย ThaID"
          >
            <!-- โลโก้ ThaID -->
            <div class="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 shadow-sm">
              <img :src="logoThaID" alt="ThaID" class="w-full h-full object-contain" />
            </div>

            <!-- ข้อความ -->
            <div class="flex-1 min-w-0">
              <p class="text-body font-semibold text-slate-900 leading-snug">
                เข้าสู่ระบบด้วย ThaID
              </p>
              <p class="text-body-xs text-slate-500 mt-0.5 leading-snug">
                ยืนยันตัวตนด้วยระบบ ThaID
              </p>
            </div>

            <!-- ลูกศรชี้ขวา — เปลี่ยนสีเมื่อ hover ที่ parent (group-hover) -->
            <svg
              class="w-5 h-5 text-slate-300 flex-shrink-0 transition-colors group-hover:text-blue-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2.5"
              aria-hidden="true"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <p
            v-if="thaidError"
            class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-body-xs text-red-800"
            role="alert"
          >
            {{ thaidError }}
          </p>

          <!-- เส้นคั่น "หรือ" -->
          <div class="flex items-center gap-3 px-1" aria-hidden="true">
            <div class="flex-1 h-px bg-slate-200" />
            <span class="text-body-xs text-slate-400 font-medium">หรือ</span>
            <div class="flex-1 h-px bg-slate-200" />
          </div>

          <!-- ปุ่ม ทางรัฐ (โครงสร้างเดียวกับ ThaID แต่ใช้สีเขียว) -->
          <button
            @click="handleTangRath"
            class="group w-full flex items-center gap-4 bg-white rounded-2xl border-2 border-green-200 p-4 text-left shadow-sm transition-all duration-150 hover:border-green-400 hover:shadow-md active:scale-[0.98] active:bg-green-50"
            aria-label="เข้าสู่ระบบด้วย ทางรัฐ"
          >
            <!-- โลโก้ ทางรัฐ -->
            <div class="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 shadow-sm">
              <img :src="logoThangrath" alt="ทางรัฐ" class="w-full h-full object-contain" />
            </div>

            <!-- ข้อความ -->
            <div class="flex-1 min-w-0">
              <p class="text-body font-semibold text-slate-900 leading-snug">
                เข้าสู่ระบบด้วย ทางรัฐ
              </p>
              <p class="text-body-xs text-slate-500 mt-0.5 leading-snug">
                ยืนยันตัวตนด้วย Face Recognition (Liveness)
              </p>
            </div>

            <!-- ลูกศรชี้ขวา -->
            <svg
              class="w-5 h-5 text-slate-300 flex-shrink-0 transition-colors group-hover:text-green-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2.5"
              aria-hidden="true"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <!-- ส่วนที่ 4: กล่องข้อมูล (Info Box) -->
        <div class="flex gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4">
          <!-- ไอคอน i (information) -->
          <svg
            class="w-[18px] h-[18px] text-blue-500 flex-shrink-0 mt-[2px]"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fill-rule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
              clip-rule="evenodd"
            />
          </svg>
          <p class="text-body-xs text-blue-700 leading-[1.65]">
            ระบบจะตรวจสอบว่าท่านมีคำขอค้างอยู่หรือไม่
            และนำท่านไปยังหน้าที่เหมาะสมโดยอัตโนมัติ
          </p>
        </div>

        <!-- ส่วนที่ 5: กล่องเตรียมเอกสาร (Document Preparation Notice) -->
        <div class="mt-4 bg-amber-50 border border-amber-300 rounded-xl p-4">
          <!-- หัวข้อพร้อมไอคอน warning -->
          <div class="flex items-center gap-2 mb-3">
            <div class="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <svg
                class="w-4 h-4 text-amber-500"
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
            <p class="text-body-xs font-bold text-amber-800 leading-snug">
              โปรดเตรียมเอกสารให้ครบถ้วนก่อนเข้าสู่ระบบ
            </p>
          </div>

          <!-- รายการเอกสาร -->
          <ol class="list-decimal list-inside space-y-2 text-body-xs text-amber-900 leading-relaxed pl-1">

            <!-- ข้อ 1: รูปถ่าย -->
            <li class="font-medium">
              รูปถ่ายประกอบการพิจารณา
              <ul class="list-disc list-inside pl-4 mt-1 space-y-0.5 font-normal text-amber-800">
                <li>รูปสภาพที่อยู่อาศัยภายนอกและภายใน</li>
                <li>รูปผู้ประสบปัญหาทางสังคมคู่กับบัตรประชาชน</li>
                <li>รูปสภาพปัญหาหรือความเดือดร้อนที่ต้องการขอรับความช่วยเหลือ</li>
                <li>รูปสมาชิกในครอบครัว</li>
              </ul>
            </li>

            <!-- ข้อ 2: บัตรประชาชน -->
            <li class="font-medium">
              บัตรประจำตัวประชาชน หรือ สำเนาทะเบียนราษฎร หรือ
              เอกสารอื่นที่ทางราชการออกให้
            </li>

            <!-- ข้อ 3: ทะเบียนบ้าน -->
            <li class="font-medium">
              ทะเบียนบ้าน
              <ul class="list-disc list-inside pl-4 mt-1 space-y-0.5 font-normal text-amber-800">
                <li>รายการเกี่ยวกับบ้านและบุคคล</li>
              </ul>
            </li>

            <!-- ข้อ 4: สมุดบัญชีธนาคาร -->
            <li class="font-medium">
              สมุดบัญชีธนาคาร
              <span class="font-normal">(หน้าที่แสดงชื่อบัญชีและเลขที่บัญชี)</span>
            </li>

          </ol>
        </div>

      </div>
    </main>

    <!-- Footer: อยู่ล่างสุดเสมอ เพราะ main มี flex-1 -->
    <!--
      env(safe-area-inset-bottom) = เว้นระยะ Home Bar บน iPhone (notch devices)
      max(..., 16px) = อย่างน้อย 16px แม้ไม่มี safe area
    -->
    <footer
      class="text-center py-4"
      style="padding-bottom: max(env(safe-area-inset-bottom), 16px)"
    >
    </footer>

  </div>
</template>
