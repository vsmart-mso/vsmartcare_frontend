// คัดลอกไฟล์ WASM ของ MediaPipe จาก node_modules → public/mediapipe/wasm
//
// ทำไมต้อง copy: FaceLandmarker โหลด .wasm ตอน runtime ผ่าน URL (ไม่ผ่าน bundler)
// จึงต้องวางไว้ใน public/ — แต่ไฟล์รวมกัน ~22 MB ไม่ควร commit เข้า git
// (public/mediapipe/wasm/ ถูก ignore ไว้แล้ว) สคริปต์นี้จึงรันอัตโนมัติก่อน dev/build
//
// หมายเหตุ: ไฟล์โมเดล face_landmarker.task commit ไว้ใน repo เพราะไม่ได้มากับ npm
// package และไม่อยากให้ build พังเวลาเครื่อง build ออกเน็ตไม่ได้

import { cp, mkdir, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root   = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const outDir = join(root, 'public', 'mediapipe', 'wasm')

// FilesetResolver.forVisionTasks() เรียกเฉพาะ vision_wasm_internal.*
// และ vision_wasm_nosimd_internal.* (fallback เครื่องที่ไม่รองรับ SIMD)
// ตัว *_module_internal.* ใช้เฉพาะโหมด ES module ที่เราไม่ได้ใช้ → ไม่ต้อง copy
const NEEDED = /^vision_wasm(_nosimd)?_internal\.(js|wasm)$/

try {
  const files = (await readdir(srcDir)).filter(f => NEEDED.test(f))
  if (files.length === 0) throw new Error('ไม่พบไฟล์ wasm ที่ต้องใช้')

  await mkdir(outDir, { recursive: true })
  for (const file of files) {
    await cp(join(srcDir, file), join(outDir, file))
  }
  console.log(`[mediapipe] copied ${files.length} wasm files → public/mediapipe/wasm`)
} catch (err) {
  // ไม่ให้ build ล้ม — หน้ายืนยันใบหน้ามี fallback เป็นโหมดพื้นฐานอยู่แล้ว
  console.warn(`[mediapipe] copy failed: ${err.message} — liveness จะทำงานในโหมดพื้นฐาน`)
}
