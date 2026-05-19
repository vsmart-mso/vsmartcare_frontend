<script setup lang="ts">
// ─── Skeleton ───────────────────────────────────────────────────────────────
// คอมโพเนนต์พื้นฐาน: แสดง "กล่องสีเทาเรืองแสง" (shimmer) ระหว่างรอข้อมูลโหลด
// แนวคิด: แทนที่จะโชว์หน้าจอว่างเปล่า เราโชว์โครงร่างจำลองที่ขยับได้
//        เพื่อบอกผู้ใช้ว่า "ระบบกำลังโหลด อย่าเพิ่งกดอะไร"
//
// วิธีใช้: นำหลาย ๆ Skeleton มาวางต่อกันเป็นรูปร่างของหน้าจอจริง
//   <Skeleton width="40%" height="0.75rem" />            ← จำลอง label
//   <Skeleton width="100%" height="2.75rem" rounded="rounded-xl" /> ← จำลอง input

withDefaults(
  defineProps<{
    width?: string    // ความกว้าง เช่น '100%', '8rem', '40%'
    height?: string   // ความสูง เช่น '1rem', '2.75rem'
    rounded?: string  // คลาส Tailwind กำหนดความโค้งมุม เช่น 'rounded-xl', 'rounded-full'
  }>(),
  {
    width: '100%',
    height: '1rem',
    rounded: 'rounded-md',
  },
)
</script>

<template>
  <!-- กล่องสีเทา + เอฟเฟกต์ shimmer (ดู style ด้านล่าง) -->
  <div
    class="skeleton-shimmer bg-slate-200"
    :class="rounded"
    :style="{ width, height }"
    aria-hidden="true"
  />
</template>

<style scoped>
/* เอฟเฟกต์ shimmer — แถบแสงไล่จากซ้ายไปขวาวนซ้ำ ๆ สื่อว่า "กำลังโหลด" */
.skeleton-shimmer {
  position: relative;
  overflow: hidden;
}

.skeleton-shimmer::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.65),
    transparent
  );
  animation: skeleton-shimmer 1.4s ease-in-out infinite;
}

@keyframes skeleton-shimmer {
  100% {
    transform: translateX(100%);
  }
}

/* เคารพการตั้งค่าผู้ใช้ที่ขอลดการเคลื่อนไหว — ปิด animation ให้ */
@media (prefers-reduced-motion: reduce) {
  .skeleton-shimmer::after {
    animation: none;
  }
}
</style>
