# AINU liveness

ด่านยืนยันว่าเป็นมนุษย์ คั่นก่อนส่งคำร้องในหน้า `/submit-request`

```
Step5 ยืนยันข้อมูล → ปุ่ม "ถัดไป" → liveness เต็มจอ → ผ่าน → ปุ่ม "ยืนยันและส่งคำขอ"
```

flow `DGA-PMCARE-001` — **liveness อย่างเดียว** ไม่มี OCR ไม่มี DOPA ไม่ทำ face compare

> **สถานะ: UAT เท่านั้น ยังไม่ใช่ security control** — ดูหัวข้อ "ข้อจำกัด" ท้ายไฟล์ก่อนคิดจะขึ้น production

---

## วิธีใช้

```vue
<script setup lang="ts">
import { LivenessRunner } from '@/lib/liveness'
</script>

<template>
  <LivenessRunner
    v-if="livenessOpen"
    @passed="onLivenessPassed"
    @failed="onLivenessFailed"
    @closed="livenessOpen = false"
  />
</template>
```

| event | เมื่อไหร่ | payload |
|---|---|---|
| `passed` | `transactionStatus === 'completed'` | ผลดิบจาก AINU |
| `failed` | ได้ผลแล้วแต่ไม่ใช่ `completed` | ผลดิบจาก AINU (ยังไม่มีใครใช้) |
| `closed` | ผู้ใช้กด "ยกเลิก" ในเฟรม | — |

**ใช้ `v-if` เสมอ** ไม่ใช่ `v-show` — การ unmount ทำให้เฟรมโหลดใหม่ → `setup()` ใหม่ →
ได้ transaction ใหม่ทุกครั้งที่ลองใหม่

---

## ⚠️ ห้าม Tailwind หรือ `style.css` แตะหน้าเฟรมเด็ดขาด

**นี่คือเหตุผลทั้งหมดที่ต้องแยกหน้าและใช้ iframe** ไม่ใช่เรื่องความสวยงามของโครงสร้าง

AINU SDK เรนเดอร์ UI ของตัวเองด้วยคลาส Tailwind (`"flex flex-col space-y-4"` เห็นได้ในไฟล์ bundle)
พอหน้าที่ฝังมันมี Tailwind v4 ของโปรเจกต์อยู่ด้วย (นิยาม `--tw-*` คนละชุด) ทั้งสองชนกันแล้ว
**SDK ตายเงียบ ๆ** — spinner ตกจอ แล้วขาวโล่ง โดย `onReady()` ยังสำเร็จตามปกติ
ทำให้ console ดูเหมือนไม่มีอะไรผิด

พิสูจน์ด้วยการ bisect จาก `ekyc-sdk_sample-code.html` ของ AINU เอง เสิร์ฟจาก origin เดียวกับที่พัง:

| หน้า | ผล |
|---|---|
| sample ล้วน | ✅ |
| sample + Vue | ✅ |
| sample + `brand.css` | ✅ |
| **sample + Tailwind** | ❌ |

ตัดออกไปก่อนหน้านั้นแล้วทั้งหมด: origin/port `localhost:5173`, สิทธิ์กล้อง (reset แล้ว),
browser extension (incognito แล้ว), `<html lang="th">`, `referenceId` แบบ UUID,
และวิธีเขียน component (ยก sample มาใส่ Vue แบบเป๊ะก็ยังพัง)

**สิ่งที่กันไว้ตอนนี้:** `frame.html` เป็น rollup entry แยกจาก `index.html` (ดู `vite.config.ts`)
CSS ของแอปเข้าไม่ถึงเลยโดยโครงสร้าง ไม่ต้องไล่ทีละกฎ

---

## ไฟล์ในโฟลเดอร์นี้

| ไฟล์ | หน้าที่ |
|---|---|
| `index.ts` | public API — ที่อื่นในแอป import จากนี่เท่านั้น |
| `LivenessRunner.vue` | ฝัง `frame.html` เป็น iframe เต็มจอ + รับผลผ่าน `postMessage` |
| `messages.ts` | contract ของ `postMessage` + URL ของเฟรม + id ของ element (ทั้งสองฝั่งใช้ร่วมกัน) |
| `frame.html` | เอกสารในเฟรม — **Vite entry ตัวที่สอง** |
| `frame.ts` | สคริปต์ของเฟรม **ที่เดียวในโปรเจกต์ที่แตะ `window.AinuEkyc`** |
| `frame.css` | CSS ของเฟรม ลอกจาก sample ของ AINU |
| `ainu-ekyc.d.ts` | type ของ SDK (เขียนมือ เป็น subset ของ API จริง) |

**สิ่งเดียวที่อยู่นอกโฟลเดอร์นี้:**

- `public/ekyc-sdk-v1.0.3-beta.1.index.iife.js` (1.6 MB) — Vite บังคับให้ static asset
  ที่อ้างด้วย path ตายตัวต้องอยู่ใน `public/` ย้ายเข้ามาไม่ได้
  **ชื่อไฟล์ต้องตรงกับ `<script src>` ใน `frame.html` เป๊ะ** ไม่มี bundler resolution มาช่วย
  ผิดแล้วพังตอน runtime (`window.AinuEkyc` เป็น `undefined`) ไม่ใช่ตอน build
- 1 บรรทัดใน `vite.config.ts` (`rollupOptions.input.liveness`) — ต้องตรงกับ
  `LIVENESS_FRAME_URL` ใน `messages.ts`
- `src/env.d.ts` — 4 ตัวแปร `VITE_ACCOUNT_*` (ไม่ประกาศ = `vue-tsc` ไม่ผ่าน)

`index.html` **ไม่ได้** โหลด SDK — มีแต่เฟรมที่ใช้ ไม่ต้องให้ทุกคนดาวน์โหลด 1.6 MB ทุก pageload

---

## Environment

ต้องมีใน `.env` ที่ root ของโปรเจกต์ (ดู `.env.example`) —
**ตั้งแล้วต้อง restart dev server** Vite อ่าน env ตอน start เท่านั้น

| ตัวแปร | ค่า |
|---|---|
| `VITE_ACCOUNT_ID` | `ekycsdk-dga-pmcare` — ⚠️ **ไม่ใช่** `demo-dga-pmcare` ที่เป็น username เว็บเดโม |
| `VITE_ACCOUNT_SECRET` | จาก `DGA-PCA001_credential` ช่อง Web SDK |
| `VITE_FLOW_ID` | `DGA-PMCARE-001` |
| `VITE_LANGUAGE` | `TH` หรือ `EN` |

ถ้าไม่ครบ เฟรมจะขึ้นแถบแดงบอกตรง ๆ ว่ายังไม่ได้ตั้ง — ไม่ต้องเดา

---

## ต้องเป็น HTTPS

กล้องไม่ทำงานบน HTTP และ self-signed ก็ไม่ผ่านบนมือถือ

- `localhost` — ใช้ได้
- `http://192.168.x.x` — **ใช้ไม่ได้** ไม่ใช่ secure context
  (Android Chrome มี flag ช่วยได้ แต่ iOS ไม่มีทาง)

เทสบนมือถือให้ผ่าน tunnel:

```bash
cloudflared tunnel --protocol http2 --url http://localhost:5173
```

ต้องใส่ `--protocol http2` เพราะเน็ตที่ทดสอบบล็อก QUIC ขาออก port 7844
`vite.config.ts` ประกาศ `allowedHosts: ['.trycloudflare.com']` ไว้แล้ว
(จุดนำหน้า = ทุก subdomain) tunnel URL สุ่มใหม่ทุกครั้งจึงใช้ได้โดยไม่ต้องแก้ไฟล์

---

## เวลา debug SDK ตัวนี้

**3 อย่างที่ต้องมองข้าม** — ขึ้นในตัวที่ทำงานได้เหมือนกัน ไม่ใช่ปัญหา:

```
GET https://uat.ainu.tech/undefined 404
POST /ekyc 403
Uncaught (in promise) Error: An unexpected response was received from the server.
```

**ตัวชี้ว่าไปถึงไหนแล้วจริง ๆ** คือ `[eKYC Server] Waiting for data from the SDK.` ที่วนลูป —
ถ้าไม่ขึ้นแปลว่าตายก่อน `initLivenessSDK`

**SDK มี 2 ชั้น** — `sdkVersion: 1.0.3-beta.1` คือตัวที่เราฝัง ส่วน `liveness.sdkVersion: 2.0.0-beta.2`
คือ engine ที่ AINU โหลดจากเซิร์ฟเวอร์เขาเอง (ใช้ MediaPipe จาก cdn.jsdelivr.net)
อัปเดตได้ตลอดโดยเราคุมไม่ได้ ถ้าอยู่ ๆ พฤติกรรมเปลี่ยน ให้ดูค่านี้ก่อน

**อย่า hardcode retry limit** — มาจาก config ฝั่งเซิร์ฟเวอร์ของ AINU เปลี่ยนได้โดยไม่บอก
(เคยเป็น `1` เมื่อ 2026-08-24 แล้วเป็น `5` เมื่อ 2026-09-03)
ถ้าจะโชว์ให้ผู้ใช้เห็นต้องอ่านจาก `summary.configuration` ในผลลัพธ์

---

## ทำไม liveness ต้องมาก่อน `handleSubmit`

`handleSubmit` ไม่ atomic — `createCase()` → `createConsent()` → อัปโหลดไฟล์ทีละไฟล์ → `router.push`
ถ้าแทรก liveness กลางทางแล้วผู้ใช้ไม่ผ่าน จะเหลือเคสค้างใน DB ที่ไม่มีใครยื่นจริง

ด่านนี้จึงอยู่ที่ปุ่มล้วน ๆ — `handleSubmit` ไม่ถูกแก้แม้แต่บรรทัดเดียว

---

## ข้อจำกัดที่ต้องรู้ก่อนขึ้น production

**ด่านนี้ยัง bypass ได้** — `onEkycResult()` ทำงานในเบราว์เซอร์ผู้ใช้ เปิด DevTools ยัด payload
ปลอมว่า `completed` ได้ backend แยกไม่ออก **ยังไม่ใช่ security control**
ทางแก้ที่ถูกคือให้ AINU ยิงผลมาที่ partner endpoint (webhook) แล้วเชื่อเฉพาะตัวนั้น

**`accountSecret` อ่านได้จาก JS ที่ ship** — Vite inline ค่า env ลง bundle
**UAT เท่านั้น อย่าเอา build นี้ขึ้นที่ที่คนนอกเข้าถึงได้**

**ค้างกับ AINU 3 เรื่อง:**
1. partner endpoint / webhook spec (format + signature)
2. วิธี verify image integrity signature
3. credential production + IP whitelist
   · ใน SDK มี endpoint `/v1/auth/websdk/token/handshake` โผล่อยู่ — อาจมี flow ที่ backend
   แลก token แทนได้ ซึ่งจะแก้เรื่อง secret อยู่ฝั่ง client ไปด้วย

---

## เหลือทำ

**UX**
- [ ] **map สาเหตุที่ไม่ผ่านเป็นข้อความไทย** — ตอนนี้ fail ทุกกรณีขึ้นข้อความเดียวกันหมด
      ทั้งที่ payload มี `liveness.reason` (`TIMEOUT` / `FACE_NOT_FOUND` / …) กับ `failReason` (`EKYC_ERROR_0xx`)
      "หาหน้าไม่เจอ" กับ "หมดเวลา" ควรบอกคนละอย่าง
      → ลอก pattern `CODE_MESSAGES` จาก `src/utils/authUserMessages.ts` ได้เลย
- [ ] **`type: 'error'` ไม่ถึงหน้าแม่** — `LivenessRunner.vue` แค่ `console.error`
      เวลา SDK โหลดไม่ขึ้นหรือ env ไม่ครบ ผู้ใช้เจอจอดำ ทางออกเดียวคือปุ่ม "ยกเลิก" ในเฟรม
- [ ] **คำแนะนำก่อนถ่าย** — นั่งใกล้กล้อง / หันหน้าเข้าหาแสง อย่าให้แสงอยู่ข้างหลัง / ยกกล้องให้อยู่ระดับตา
      (สามข้อนี้ตรงกับสาเหตุที่ทดสอบแล้วพบว่าทำให้เว็บแคมโน้ตบุ๊กไม่ผ่าน)
- [ ] **เตือนก่อนออกจากหน้า** — `stores/application.ts` backup draft ลง sessionStorage อยู่แล้ว
      แต่ **ไม่เก็บ `File`** → refresh เฉย ๆ ก็เสียไฟล์ที่อัปโหลดมาแล้วทั้งหมด
      คนที่ทำไม่ผ่านแล้วหงุดหงิดปิดทิ้งจะเสียงานที่กรอกมา 4 ขั้นตอน
- [ ] `livenessPassed` อยู่ในหน่วยความจำ — refresh แล้วต้องทำ liveness ใหม่

**Backend (ยังไม่ได้เริ่ม)**
- [ ] **เก็บ log ผล liveness** — ตอนนี้ผลอยู่แค่ในเบราว์เซอร์ ไม่มีอะไรบันทึก
      แผน: `liveness-service` ตัวใหม่ (ลอกโครง `ocr-service`) port 8006 + proxy 1 ตัวที่ BFF
      เก็บ `raw_payload` โดย **ตัด base64 ออกก่อนเสมอ**
      (`livenessImage`, `fullFrontThaiCard`, `fullFrontThaiCardSupport`, `thaiIDPortrait`)
      ⚠️ BFF ไม่มี generic proxy ต้องเขียน endpoint มือใน `app/main.py`
- [ ] **gate ฝั่ง backend** — `POST /v1/cases` ยังรับคำร้องที่ไม่ผ่าน liveness ได้อยู่
      ต้องให้ senior ตัดสินก่อนว่า hard gate หรือ soft gate
      (ข้อเสนอ: soft gate ก่อน — ผู้ใช้คือกลุ่มเปราะบาง ถ้าบล็อกแล้วถ่ายไม่ผ่าน = ยื่นขอความช่วยเหลือไม่ได้เลย)
- [ ] มี container `vsmartcare_backend-liveness-service-1` รันค้างอยู่ที่ 8006 จาก image เก่า
      ต้องเคลียร์ก่อนเริ่มทำจริง (โค้ดเดิมอยู่บน branch `liveness-service` commit `6354067`
      แต่ **compose ไม่เคยถูก commit**)

**ทดสอบ**
- [ ] **เทสครบ flow บนมือถือ** — ติด 2 ด่าน:
      1. `VITE_API_URL` ชี้ localhost มือถือเรียก BFF ไม่ถึง → แก้ด้วย Vite proxy ให้ API วิ่งผ่าน
         origin เดียวกับ tunnel
      2. ThaID OAuth ต้อง redirect กลับ URL ที่ลงทะเบียนไว้ ส่วน tunnel URL สุ่มใหม่ทุกครั้ง
         → ต้องดูว่า `/login/thaid/dev-mock` (`VITE_ENABLE_THAID_DEV_MOCK`) ข้ามได้ไหม
- [ ] เว็บแคมโน้ตบุ๊ก **scan ไม่ผ่านซ้ำ ๆ** ส่วนมือถือผ่านครั้งเดียว
      (มุมกล้องต่ำกว่าระดับตา หน้าเล็กในเฟรม แสงย้อน + โมเดล AINU tune มาสำหรับมือถือ)
      → ถ้าสถิติออกมาแย่จริง อาจต้องทำ **QR handoff ไปมือถือ** — frontend ยังไม่มี QR lib
