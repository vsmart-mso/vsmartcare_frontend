<script setup lang="ts">
// ─── StepFormSkeleton ───────────────────────────────────────────────────────
// โครงหน้าจอจำลองของฟอร์มแต่ละ step — แสดงระหว่างรอ API โหลดข้อมูล
// (เช่น ตัวเลือกสถานภาพสมรส / ประเภทที่อยู่อาศัย / รายชื่อธนาคาร)
//
// รูปร่างถูกออกแบบให้เหมือนการ์ดจริงในฟอร์ม: การ์ดสีขาว + แถบหัวสีฟ้า + ช่องกรอก
// props ปรับได้เพื่อให้โครงร่างใกล้เคียงกับแต่ละ step
import Skeleton from '@/components/ui/Skeleton.vue'

withDefaults(
  defineProps<{
    cards?: number        // จำนวนการ์ด (section) ที่จะจำลอง
    rowsPerCard?: number  // จำนวนช่องกรอกจำลองต่อการ์ด
  }>(),
  {
    cards: 2,
    rowsPerCard: 3,
  },
)
</script>

<template>
  <!-- role="status" + aria-label ช่วยให้ screen reader บอกผู้ใช้ว่ากำลังโหลด -->
  <div class="space-y-4" role="status" aria-label="กำลังโหลดแบบฟอร์ม">
    <div
      v-for="c in cards"
      :key="c"
      class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
    >
      <!-- แถบหัวการ์ด — จำลองวงกลมเลขลำดับ + ชื่อหัวข้อ -->
      <div class="flex items-center gap-3 bg-blue-50/60 px-4 py-3 border-b border-blue-100">
        <Skeleton width="2rem" height="2rem" rounded="rounded-full" />
        <Skeleton width="55%" height="0.9rem" />
      </div>

      <!-- เนื้อในการ์ด — จำลองช่องกรอก (label สั้น + กล่อง input) -->
      <div class="p-4 space-y-4">
        <div v-for="r in rowsPerCard" :key="r" class="space-y-1.5">
          <Skeleton width="40%" height="0.75rem" />
          <Skeleton width="100%" height="2.75rem" rounded="rounded-xl" />
        </div>
      </div>
    </div>

    <!-- ข้อความสำหรับ screen reader (ผู้ใช้ทั่วไปมองไม่เห็น) -->
    <span class="sr-only">กำลังโหลดข้อมูล กรุณารอสักครู่...</span>
  </div>
</template>
