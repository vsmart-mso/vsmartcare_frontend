<script setup lang="ts">
// <script setup> คือรูปแบบใหม่ของ Vue 3 (Composition API)
// โค้ดในนี้ทำงานครั้งเดียวตอน component ถูกสร้าง

import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { redirectBrowserToThaIDLogin } from '@/api/auth'

// import โลโก้จาก src/assets/ — Vite จะ optimize ไฟล์ให้อัตโนมัติ
import logoMSDHS from '@/assets/logo-msdhs.png'

// useRouter() ดึง router instance มาใช้สำหรับเปลี่ยนหน้า
const router = useRouter()

const thaidError = ref<string | null>(null)
const thaidLoading = ref(false)

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

    <!--
      main: ใช้ flex-1 เพื่อดัน footer ลงด้านล่างเสมอ
      ไม่มี px-5 ที่นี่ เพราะ brand section ต้องการ full-width
    -->
    <main class="flex-1 flex flex-col mx-auto w-full max-w-md">

      <!-- ═══════════════════════════════════════════════
           ส่วนที่ 1: Brand Header
           - มี gradient background สีชมพูอ่อน ทำให้เห็นชัดว่านี่คือ "header"
           - โลโก้ขนาดใหญ่ + ชื่อระบบ "พม. Care" เด่นกว่า heading ด้านล่าง
           ═══════════════════════════════════════════════ -->
      <div class="flex flex-col items-center px-5 pt-10 pb-8">
        <!-- โลโก้: กรอบวงกลมสีขาว shadow สำหรับใส่รูป -->
        <div class="mb-4">
          <div
            class="w-[104px] h-[104px] rounded-full bg-white shadow-lg border-2 border-[#BE185D]/20 overflow-hidden flex items-center justify-center"
          >
            <img
              :src="logoMSDHS"
              alt="โลโก้กระทรวงการพัฒนาสังคมและความมั่นคงของมนุษย์"
              class="w-[96px] h-[96px] object-contain"
            />
          </div>
        </div>

        <!--
          ชื่อระบบ "พม. Care"
          text-[28px] = ตั้งใจให้ใหญ่กว่า heading (22px) เพื่อให้ hierarchy ถูกต้อง:
          "พม. Care" (ชื่อแอป) > "เลือกช่องทาง..." (คำสั่งหน้านั้น)
        -->
        <p class="text-[28px] font-bold tracking-wide leading-none mb-2">
          <span class="text-[#BE185D]">พม.</span>
          <span class="text-slate-800"> Care</span>
        </p>

        <!-- คำอธิบาย: เล็กและเงียบกว่า ทำหน้าที่เสริม ไม่ดึงสายตา -->
        <p class="text-[13px] text-slate-500">ระบบขอรับความช่วยเหลือด้วยตนเอง</p>
      </div>

      <!-- ═══════════════════════════════════════════════
           ส่วนที่ 2–5: เนื้อหาหลัก (มี px-5 เฉพาะส่วนนี้)
           ═══════════════════════════════════════════════ -->
      <div class="flex flex-col px-5 pt-6 pb-8">

        <!-- ส่วนที่ 2: Title -->
        <div class="text-center mb-7">
          <!--
            h1 ขนาด 22px — ตั้งใจให้เล็กกว่า "พม. Care" (28px)
            เพื่อให้ visual hierarchy ชัดเจน: Brand > Page title > Content
          -->
          <h1 class="text-[20px] font-bold text-slate-900 leading-snug mb-2">
            เลือกช่องทางยืนยันตัวตน
          </h1>
          <p class="text-[14px] text-slate-500 leading-relaxed">
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
            <!-- Badge โลโก้ ThaID -->
            <div
              class="w-12 h-12 rounded-xl bg-[#1A56DB] flex items-center justify-center flex-shrink-0 shadow-sm"
            >
              <span class="text-white text-[11px] font-bold tracking-tight select-none">ThaID</span>
            </div>

            <!-- ข้อความ -->
            <div class="flex-1 min-w-0">
              <p class="text-[15px] font-semibold text-slate-900 leading-snug">
                เข้าสู่ระบบด้วย ThaID
              </p>
              <p class="text-[13px] text-slate-500 mt-0.5 leading-snug">
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
            class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800"
            role="alert"
          >
            {{ thaidError }}
          </p>

          <!-- เส้นคั่น "หรือ" -->
          <div class="flex items-center gap-3 px-1" aria-hidden="true">
            <div class="flex-1 h-px bg-slate-200" />
            <span class="text-[13px] text-slate-400 font-medium">หรือ</span>
            <div class="flex-1 h-px bg-slate-200" />
          </div>

          <!-- ปุ่ม ทางรัฐ (โครงสร้างเดียวกับ ThaID แต่ใช้สีเขียว) -->
          <button
            @click="handleTangRath"
            class="group w-full flex items-center gap-4 bg-white rounded-2xl border-2 border-green-200 p-4 text-left shadow-sm transition-all duration-150 hover:border-green-400 hover:shadow-md active:scale-[0.98] active:bg-green-50"
            aria-label="เข้าสู่ระบบด้วย ทางรัฐ"
          >
            <!-- Badge โลโก้ ทางรัฐ -->
            <div
              class="w-12 h-12 rounded-xl bg-[#166534] flex items-center justify-center flex-shrink-0 shadow-sm"
            >
              <span class="text-white text-[11px] font-bold leading-tight text-center select-none">
                ทางรัฐ
              </span>
            </div>

            <!-- ข้อความ -->
            <div class="flex-1 min-w-0">
              <p class="text-[15px] font-semibold text-slate-900 leading-snug">
                เข้าสู่ระบบด้วย ทางรัฐ
              </p>
              <p class="text-[13px] text-slate-500 mt-0.5 leading-snug">
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
          <p class="text-[13px] text-blue-700 leading-[1.65]">
            ระบบจะตรวจสอบว่าท่านมีคำขอค้างอยู่หรือไม่
            และนำท่านไปยังหน้าที่เหมาะสมโดยอัตโนมัติ
          </p>
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
      <p class="text-[12px] text-slate-400">
        © 2568 กระทรวงการพัฒนาสังคมและความมั่นคงของมนุษย์
      </p>
    </footer>

  </div>
</template>
