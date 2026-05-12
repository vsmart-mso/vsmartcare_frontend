import { ref } from 'vue'

// ─── ขีดจำกัดขนาดไฟล์ input (ตรงกับ backend MAX_UPLOAD_BYTES) ─────────────────
const MAX_INPUT_BYTES = 10 * 1024 * 1024  // 10 MB

// ─── ตัวเลือกการ compress ──────────────────────────────────────────────────────
export interface ImageCompressOptions {
  // ความกว้างสูงสุด (px) — ความสูงจะถูก scale ตามสัดส่วน
  maxWidth?: number
  // ความสูงสูงสุด (px) — ใช้คู่กับ maxWidth เพื่อ clamp ทั้งสองด้าน
  maxHeight?: number
  // คุณภาพของภาพ 0–1 (ใช้กับ JPEG/WebP) — 0.85 คือค่ามาตรฐานที่ให้คุณภาพดีและไฟล์เล็ก
  quality?: number
  // ฟอร์แมตที่ต้องการ output (WebP คือค่าเริ่มต้น fallback เป็น JPEG ถ้าไม่รองรับ)
  outputType?: 'image/webp' | 'image/jpeg' | 'image/png'
}

// ─── ค่า default: 1920px max side, quality 0.85, WebP ──────────────────────────
// 1920px ครอบคลุม Full HD ทั้ง portrait และ landscape โดยไม่ upscale ถ้าเล็กกว่า
const DEFAULT_OPTIONS: Required<ImageCompressOptions> = {
  maxWidth:   1920,
  maxHeight:  1920,
  quality:    0.85,
  outputType: 'image/webp',
}

// ─── ผลลัพธ์ที่คืนกลับมาหลัง compress ────────────────────────────────────────
export interface CompressedImage {
  file:        File       // File object พร้อม upload
  previewUrl:  string     // data URL สำหรับแสดง preview (ต้อง revoke เมื่อไม่ใช้)
  originalSize: number    // ขนาดต้นฉบับ (bytes)
  compressedSize: number  // ขนาดหลัง compress (bytes)
}

// ─── ฟังก์ชัน compress หลัก ───────────────────────────────────────────────────
export async function compressImage(
  file: File,
  options: ImageCompressOptions = {},
): Promise<CompressedImage> {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  // ตรวจสอบว่า browser รองรับ WebP หรือไม่ — fallback เป็น JPEG
  const outputType = opts.outputType === 'image/webp' && !supportsWebP()
    ? 'image/jpeg'
    : opts.outputType

  const compressed = await resizeWithCanvas(file, opts.maxWidth, opts.maxHeight, outputType, opts.quality)

  // สร้างชื่อไฟล์ใหม่ที่มีนามสกุลถูกต้อง
  const ext = outputType === 'image/webp' ? 'webp' : outputType === 'image/jpeg' ? 'jpg' : 'png'
  const baseName = file.name.replace(/\.[^.]+$/, '')
  const newFile = new File([compressed], `${baseName}.${ext}`, { type: outputType })

  // สร้าง preview URL จาก blob เพื่อประสิทธิภาพ (ไม่ต้อง base64 ทั้งไฟล์)
  const previewUrl = URL.createObjectURL(newFile)

  return {
    file:           newFile,
    previewUrl,
    originalSize:   file.size,
    compressedSize: newFile.size,
  }
}

// ─── Canvas resize ────────────────────────────────────────────────────────────
function resizeWithCanvas(
  file: File,
  maxWidth: number,
  maxHeight: number,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)

      // คำนวณขนาดใหม่โดยรักษา aspect ratio
      let { width, height } = img
      const widthRatio  = maxWidth  / width
      const heightRatio = maxHeight / height
      const scale = Math.min(1, widthRatio, heightRatio) // ไม่ขยายถ้าเล็กกว่า max

      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(width  * scale)
      canvas.height = Math.round(height * scale)

      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('Canvas 2D context ไม่รองรับ')); return }

      // ใช้ imageSmoothingQuality สูงสุดสำหรับ downscaling
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob)
          else reject(new Error('แปลงรูปภาพล้มเหลว'))
        },
        type,
        quality,
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('โหลดรูปภาพล้มเหลว'))
    }

    img.src = objectUrl
  })
}

// ─── ตรวจสอบ WebP support (cache ผล) ─────────────────────────────────────────
let _webpSupport: boolean | null = null
function supportsWebP(): boolean {
  if (_webpSupport !== null) return _webpSupport
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  _webpSupport = canvas.toDataURL('image/webp').startsWith('data:image/webp')
  return _webpSupport
}

// ─── Composable สำหรับใช้ใน component ────────────────────────────────────────
// ใช้แทนการจัดการ state เอง — รองรับหลาย field ในหน้าเดียว
export function useImageUpload(options: ImageCompressOptions = {}) {
  const file       = ref<File | null>(null)
  const previewUrl = ref<string>('')
  const isLoading  = ref(false)
  const error      = ref<string>('')

  async function handleFileSelect(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    const selected = input.files?.[0]
    input.value = '' // reset เพื่อให้เลือกไฟล์เดิมซ้ำได้

    if (!selected) return

    // รองรับเฉพาะไฟล์รูปภาพ
    if (!selected.type.startsWith('image/')) {
      error.value = 'กรุณาเลือกไฟล์รูปภาพเท่านั้น'
      return
    }

    // ตรวจสอบขนาดไฟล์ก่อน compress — เกิน 10 MB ปฏิเสธทันที
    if (selected.size > MAX_INPUT_BYTES) {
      const mb = (selected.size / (1024 * 1024)).toFixed(1)
      error.value = `ไฟล์มีขนาด ${mb} MB เกินกว่าที่อนุญาต (สูงสุด 10 MB)`
      return
    }

    isLoading.value = true
    error.value     = ''

    try {
      // revoke URL เก่าก่อนเพื่อป้องกัน memory leak
      if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)

      const result = await compressImage(selected, options)
      file.value       = result.file
      previewUrl.value = result.previewUrl
    } catch (err) {
      error.value = 'เกิดข้อผิดพลาดในการประมวลผลรูปภาพ'
      console.error(err)
    } finally {
      isLoading.value = false
    }
  }

  function clear(): void {
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    file.value       = null
    previewUrl.value = ''
    error.value      = ''
  }

  // restore File จาก store โดยไม่ต้อง compress ซ้ำ (ไฟล์ถูก compress ไปแล้วก่อนเก็บ)
  function restore(storedFile: File): void {
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    file.value       = storedFile
    previewUrl.value = URL.createObjectURL(storedFile)
    error.value      = ''
  }

  return {
    file,        // File | null — ส่งไปยัง backend ตอน submit
    previewUrl,  // string — ใช้กับ <img :src>
    isLoading,   // boolean — แสดง loading state
    error,       // string — แสดง error message
    handleFileSelect,
    clear,
    restore,
  }
}
