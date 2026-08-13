import { ref } from 'vue'

// ─── ขีดจำกัดขนาดไฟล์ input (ตรงกับ backend MAX_UPLOAD_BYTES) ─────────────────
const MAX_INPUT_BYTES = 10 * 1024 * 1024  // 10 MB

// ─── ตัวเลือกลายน้ำ ────────────────────────────────────────────────────────────
export interface WatermarkOptions {
  // ข้อความลายน้ำ — ขึ้นบรรทัดใหม่ด้วย \n (วางกลางรูป เอียง 45°)
  text?: string
  // URL โลโก้ (มุมขวาล่าง) — ต้อง same-origin ไม่งั้น canvas จะ taint แล้ว toBlob พัง
  logoUrl?: string
}

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
  // ลายน้ำ — ถ้าไม่ระบุจะไม่ใส่ (rawFile จะเป็นไฟล์เดียวกับ file)
  watermark?: WatermarkOptions
}

// ─── ค่า default: 1920px max side, quality 0.85, WebP ──────────────────────────
// 1920px ครอบคลุม Full HD ทั้ง portrait และ landscape โดยไม่ upscale ถ้าเล็กกว่า
const DEFAULT_OPTIONS: Required<Omit<ImageCompressOptions, 'watermark'>> = {
  maxWidth:   1920,
  maxHeight:  1920,
  quality:    0.85,
  outputType: 'image/webp',
}

// ─── ผลลัพธ์ที่คืนกลับมาหลัง compress ────────────────────────────────────────
export interface CompressedImage {
  file:        File       // File object พร้อม upload (มีลายน้ำแล้วถ้าเปิดใช้)
  rawFile:     File       // ไฟล์เดียวกันแต่ยังไม่ใส่ลายน้ำ — ใช้กับ OCR (ไม่มีลายน้ำ = อ่านแม่นกว่า)
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

  const { raw, watermarked } = await resizeWithCanvas(
    file, opts.maxWidth, opts.maxHeight, outputType, opts.quality, options.watermark,
  )

  // สร้างชื่อไฟล์ใหม่ที่มีนามสกุลถูกต้อง
  const ext = outputType === 'image/webp' ? 'webp' : outputType === 'image/jpeg' ? 'jpg' : 'png'
  const baseName = file.name.replace(/\.[^.]+$/, '')
  const rawFile = new File([raw], `${baseName}.${ext}`, { type: outputType })
  const newFile = watermarked
    ? new File([watermarked], `wm_${baseName}.${ext}`, { type: outputType })
    : rawFile

  // สร้าง preview URL จาก blob เพื่อประสิทธิภาพ (ไม่ต้อง base64 ทั้งไฟล์)
  const previewUrl = URL.createObjectURL(newFile)

  return {
    file:           newFile,
    rawFile,
    previewUrl,
    originalSize:   file.size,
    compressedSize: newFile.size,
  }
}

// ─── Canvas resize (+ ลายน้ำ) ─────────────────────────────────────────────────
// คืน 2 blob: raw = หลัง resize เฉย ๆ, watermarked = raw + ลายน้ำ (null ถ้าไม่ได้เปิดใช้)
function resizeWithCanvas(
  file: File,
  maxWidth: number,
  maxHeight: number,
  type: string,
  quality: number,
  watermark?: WatermarkOptions,
): Promise<{ raw: Blob; watermarked: Blob | null }> {
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

      const toBlob = () => new Promise<Blob>((res, rej) => {
        canvas.toBlob(
          (blob) => blob ? res(blob) : rej(new Error('แปลงรูปภาพล้มเหลว')),
          type,
          quality,
        )
      })

      // raw ก่อน แล้วค่อยวาดลายน้ำทับบน canvas เดิมแล้ว encode อีกรอบ
      toBlob()
        .then(async (raw) => {
          const hasWatermark = !!(watermark?.text || watermark?.logoUrl)
          if (!hasWatermark) return { raw, watermarked: null }
          await drawWatermark(ctx, canvas.width, canvas.height, watermark!)
          return { raw, watermarked: await toBlob() }
        })
        .then(resolve)
        .catch(reject)
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('โหลดรูปภาพล้มเหลว'))
    }

    img.src = objectUrl
  })
}

// ─── ลายน้ำ ───────────────────────────────────────────────────────────────────
// ตำแหน่ง/ขนาด/ความโปร่งใส ตรงกับ volunteer_smart (static/js/show_data/porsorkor1/edit_documents.js)
// เพื่อให้รูปจากทั้งสองระบบมีลายน้ำหน้าตาเหมือนกัน — ต่างแค่ฟอนต์ (ที่นี่ใช้ Sarabun)
const WM_FONT = 'Sarabun, sans-serif'

function getWatermarkLayout(ctx: CanvasRenderingContext2D, text: string, width: number, height: number) {
  const lines = String(text || '').split('\n')
  let fontSize = Math.max(16, Math.round(Math.min(width, height) * 0.035))
  const maxWidth = width * 0.7

  // ย่อฟอนต์ลงทีละ 2px จนกว่าทุกบรรทัดจะไม่ล้น 70% ของความกว้าง (ไม่ต่ำกว่า 12px)
  while (fontSize > 12) {
    ctx.font = `${fontSize}px ${WM_FONT}`
    const tooWide = lines.some((line) => ctx.measureText(line).width > maxWidth)
    if (!tooWide) break
    fontSize -= 2
  }

  const lineHeight = Math.round(fontSize * 1.3)
  const totalHeight = lineHeight * lines.length
  return { lines, fontSize, lineHeight, startY: -(totalHeight / 2) + (lineHeight / 2) }
}

function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`โหลดโลโก้ลายน้ำไม่สำเร็จ: ${src}`))
    img.src = src
  })
}

async function drawWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  watermark: WatermarkOptions,
): Promise<void> {
  // ข้อความ — กลางรูป (เยื้องลงเล็กน้อยที่ 58% ของความสูง) เอียง 45° สีดำจาง 20%
  if (watermark.text) {
    // รอฟอนต์ Sarabun โหลดเสร็จก่อน ไม่งั้น measureText/fillText จะได้ fallback font
    try { await document.fonts?.load(`16px ${WM_FONT}`) } catch { /* ไม่มี Font Loading API — ใช้ fallback */ }

    const layout = getWatermarkLayout(ctx, watermark.text, width, height)
    ctx.save()
    ctx.font = `${layout.fontSize}px ${WM_FONT}`
    ctx.translate(width * 0.5, height * 0.58)
    ctx.rotate(-Math.PI / 4)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(0, 0, 0, 0.20)'
    layout.lines.forEach((line, i) => {
      ctx.fillText(line, 0, layout.startY + (i * layout.lineHeight))
    })
    ctx.restore()
  }

  // โลโก้ — มุมขวาล่าง ห่างขอบ 20px กว้างไม่เกิน 18% ของรูป จาง 50%
  // โหลดโลโก้พังไม่ควรทำให้อัปโหลดล้ม — ข้ามไปโดยยังได้ลายน้ำข้อความ
  if (watermark.logoUrl) {
    try {
      const logo = await loadImageEl(watermark.logoUrl)
      const maxLogoWidth = width * 0.18
      const ratio = Math.min(1, maxLogoWidth / logo.width)
      const lw = Math.round(logo.width * ratio)
      const lh = Math.round(logo.height * ratio)
      ctx.save()
      ctx.globalAlpha = 0.5
      ctx.drawImage(logo, width - lw - 20, height - lh - 20, lw, lh)
      ctx.restore()
    } catch (err) {
      console.warn(err)
    }
  }
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
  // ไฟล์เดียวกันแต่ยังไม่ใส่ลายน้ำ — ใช้เฉพาะงานที่ลายน้ำรบกวน (เช่น OCR สมุดบัญชี)
  // ไม่ได้เก็บลง store จึงหายเมื่อ component unmount → restore() จะ fallback เป็นไฟล์มีลายน้ำ
  const rawFile    = ref<File | null>(null)
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
      rawFile.value    = result.rawFile
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
    rawFile.value    = null
    previewUrl.value = ''
    error.value      = ''
  }

  // restore File จาก store โดยไม่ต้อง compress ซ้ำ (ไฟล์ถูก compress ไปแล้วก่อนเก็บ)
  // rawOverride: ไฟล์ไม่มีลายน้ำ ถ้าผู้เรียกยังถืออยู่ — ไม่ส่งมาก็ใช้ storedFile แทน
  function restore(storedFile: File, rawOverride?: File): void {
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    file.value       = storedFile
    rawFile.value    = rawOverride ?? storedFile
    previewUrl.value = URL.createObjectURL(storedFile)
    error.value      = ''
  }

  return {
    file,        // File | null — ส่งไปยัง backend ตอน submit (มีลายน้ำถ้าเปิดใช้)
    rawFile,     // File | null — ไฟล์ก่อนใส่ลายน้ำ สำหรับ OCR
    previewUrl,  // string — ใช้กับ <img :src>
    isLoading,   // boolean — แสดง loading state
    error,       // string — แสดง error message
    handleFileSelect,
    clear,
    restore,
  }
}
