<script setup lang="ts">
// ─── CaseTrackingSkeleton ───────────────────────────────────────────────────
// โครงหน้าจอจำลองของหน้าติดตามคำขอ — แสดงระหว่างรอ API โหลด
// (ดึงรายการคำร้อง → รายละเอียดเคส → ประวัติสถานะ → comment) ซึ่งมีหลาย call
//
// รูปร่างถูกออกแบบให้ตรงกับเนื้อหาจริง: การ์ดผู้ใช้ + ข้อมูลคำขอ + การ์ดสถานะ + timeline
import Skeleton from '@/components/ui/Skeleton.vue'
</script>

<template>
  <div class="space-y-3" role="status" aria-label="กำลังโหลดข้อมูลคำขอ">

    <!-- การ์ดผู้ใช้ — วงกลม avatar + ชื่อ + เลขบัตร -->
    <div class="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 flex items-center gap-3">
      <Skeleton width="2.5rem" height="2.5rem" rounded="rounded-full" />
      <div class="flex-1 space-y-1.5">
        <Skeleton width="55%" height="0.9rem" />
        <Skeleton width="35%" height="0.75rem" />
      </div>
    </div>

    <!-- ข้อมูลคำขอ — หมายเลขคำขอ + วันที่ยื่น -->
    <div class="px-1 space-y-1.5">
      <Skeleton width="60%" height="0.95rem" />
      <Skeleton width="45%" height="0.8rem" />
    </div>

    <!-- การ์ดสถานะปัจจุบัน -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-4 space-y-3">
      <Skeleton width="30%" height="0.75rem" />
      <Skeleton width="65%" height="1rem" />
    </div>

    <!-- การ์ด timeline — 4 ขั้นตอน (วงกลม + ป้ายชื่อใต้วงกลม) -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-5">
      <div class="flex items-start justify-between">
        <template v-for="n in 4" :key="n">
          <div class="flex flex-col items-center gap-2.5" style="width: 64px">
            <Skeleton width="2.25rem" height="2.25rem" rounded="rounded-full" />
            <Skeleton width="100%" height="0.7rem" />
          </div>
          <!-- เส้นเชื่อมระหว่างขั้นตอน (ไม่แสดงหลังขั้นตอนสุดท้าย) -->
          <Skeleton v-if="n < 4" width="1rem" height="2px" />
        </template>
      </div>
    </div>

    <span class="sr-only">กำลังโหลดข้อมูลคำขอ กรุณารอสักครู่...</span>
  </div>
</template>
