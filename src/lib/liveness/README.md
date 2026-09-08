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
| `failureMessages.ts` | แปลง reason ของ AINU เป็นข้อความไทย + แยกเคส "อ่านผลไม่ออก" |
| `redact.ts` | ตัด base64 ออกจาก payload — ใช้กับ `buildLivenessReport()` เท่านั้น ⚠️ ตอนส่ง `/result` **ไม่ได้** ใช้ (ดูหัวข้อ backlog) |
| `report.ts` | ประกอบรายงานสำหรับแจ้งปัญหากับ AINU (transactionId + reason + เวอร์ชัน) |
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
- `src/api/liveness.ts` — 4 endpoint ที่คุยกับ case-service (`/session`, `/transaction`,
  `/result`, `/skip`) โฟลเดอร์นี้ไม่เรียก API เอง หน้าแม่เป็นคนเรียกทั้งหมด

`index.html` **ไม่ได้** โหลด SDK — มีแต่เฟรมที่ใช้ ไม่ต้องให้ทุกคนดาวน์โหลด 1.6 MB ทุก pageload

---

## Credential — ไม่มีใน frontend แล้ว

**เดิม** มี `VITE_ACCOUNT_ID` / `VITE_ACCOUNT_SECRET` / `VITE_FLOW_ID` / `VITE_LANGUAGE`
อยู่ใน `.env` **ลบทิ้งหมดแล้ว** เหตุผลคือ Vite inline ค่าลง bundle ตอน build
→ `accountSecret` อ่านได้จาก JS ที่ ship ออกไป

ตอนนี้ backend ถือ credential แล้วจ่าย config ให้ตอนเรียก `POST /v1/liveness/session`
เฟรมจึงต้องขอ config จากหน้าแม่ก่อน setup() (ดูหัวข้อ handshake ข้างล่าง)

**ผลข้างเคียงที่ต้องรู้: เปิด `frame.html` ตรง ๆ นอกแอปไม่ได้อีกแล้ว**
ไม่มีใครตอบ config ให้ เฟรมจะขึ้นข้อความบอกว่าต้องเปิดผ่านหน้ายื่นคำร้องเท่านั้น

ถ้า `/session` ตอบ `503 liveness_not_configured` แปลว่า `case-service/.env`
ยังไม่ได้ตั้ง `AINU_ACCOUNT_ID` / `AINU_ACCOUNT_SECRET` / `AINU_FLOW_ID`
หน้าคำร้องจะ **ข้ามด่านให้อัตโนมัติ** แล้วยื่นคำร้องต่อได้ — ไม่ใช่บั๊ก

---

## handshake ระหว่างหน้าแม่กับเฟรม

```
frame.ts โหลด → เช็ค secure context + window.AinuEkyc ก่อน (พังตรงนี้ = ไม่ต้อง handshake)
         → post 'need-config' (ยิงซ้ำทุก 150ms กันหน้าแม่ติด listener ไม่ทัน)
LivenessRunner รับ 'need-config' → postMessage config เข้า iframe
frame.ts รับ config → installNetworkWatcher() → setup() → onLoaded → start(referenceId)
```

⚠️ `accountSecret` เดินทางผ่าน **postMessage เท่านั้น** ห้ามใส่ใน query param เด็ดขาด
(จะโผล่ใน address bar, history, referrer) — `LIVENESS_FRAME_URL` จึงไม่มี query แล้ว

⚠️ `installNetworkWatcher()` ต้องติดตั้ง **ก่อน** `setup()` ไม่งั้น handshake รอบแรกหลุด
มันมีไว้ดัก `PROVIDER_UNAVAILABLE` (`/ekyc` ตอบ 404) กับ `AUTH_ERROR` (token handshake 403)
ซึ่งเป็น network call ภายในของ SDK ที่ไม่มี callback ไหนบอกเรา
**ห้ามย้ายไปทำที่แอปหลัก** จะไปดัก request ของทั้งระบบ

---

## ต้องเป็น HTTPS

กล้องทำงานเฉพาะ secure context

- `localhost` — ใช้ได้
- `http://192.168.x.x` — **ใช้ไม่ได้** (Android Chrome มี flag ช่วย แต่ iOS ไม่มีทาง)
  อาการเวลาลืม: SDK คืน `INIT_ERROR` ซึ่งอ่านไม่ออกว่าเกิดจากอะไร
  `frame.ts` เลยดัก `window.isSecureContext` เองก่อนเรียก SDK แล้วบอกตรง ๆ

---

## เทสจากมือถือ (ทำสำเร็จแล้ว 2026-09-03 — ThaID จริง + liveness ผ่านบน iPhone)

**LAN + mkcert ดีกว่า tunnel** เพราะ URL คงที่ ไม่ต้องแก้ config ใหม่ทุกรอบ

> เอกสารรุ่นแรกเขียนว่า "self-signed ไม่ผ่านบนมือถือ" — **ไม่จริง**
> จริงเฉพาะกรณีไม่ได้ลง root CA ถ้าลง CA ของ mkcert บนไอโฟนแล้ว iOS ยอมรับปกติ

### ตั้งครั้งแรก

```bash
brew install mkcert
mkcert -install                      # ต้องใส่รหัสผ่านเครื่อง
mkdir -p certs && mkcert -cert-file certs/lan.pem -key-file certs/lan-key.pem \
  <LAN_IP> localhost 127.0.0.1 ::1
```

ลง CA บนไอโฟน: AirDrop `$(mkcert -CAROOT)/rootCA.pem` → Settings → Profile Downloaded → Install
→ ⚠️ **Settings → General → About → Certificate Trust Settings → เปิดสวิตช์** (คนลืมข้อนี้กันเยอะที่สุด)

### สลับโหมด

| | `.env` (frontend) | `thaid-auth-service/.env` (backend) | `certs/` |
|---|---|---|---|
| **LAN** | `VITE_API_URL = https://<LAN_IP>:5173/api-vsmartcare` | `THAID_REDIRECT_URI=https://<LAN_IP>:5173/api-vsmartcare/v1/auth/thaid/callback` | มี |
| **localhost** | `http://localhost:8000/api-vsmartcare` | `http://localhost:8000/api-vsmartcare/v1/auth/thaid/callback` | ไม่มี |

แก้แล้ว restart ทั้ง `frontend` และ `thaid-auth-service` (Vite อ่าน env ตอน start เท่านั้น)

**⚠️ กับดัก 3 ข้อ**

1. **ต้องปิด `certs/` ตอนกลับ localhost** ไม่งั้น dev server เสิร์ฟ https แต่ API ชี้ http → mixed content
2. **ตอนอยู่โหมด LAN บน Mac ก็ต้องเปิด `https://<LAN_IP>:5173`** อย่าเปิด `localhost:5173` จะกลายเป็นคนละ origin กับ API แล้วติด CORS
3. **cert ผูกกับ IP** DHCP เปลี่ยน IP เมื่อไหร่ต้องออก cert ใหม่

### ทำไมต้องมี Vite proxy

`vite.config.ts` มี `server.proxy` ให้ `/api-vsmartcare` วิ่งไป `host.docker.internal:8000` เพราะ:

1. มือถือเรียก `localhost:8000` ไม่ได้ (นั่นคือตัวมันเอง)
2. BFF ตอบ `Disallowed CORS origin` ถ้าเรียกข้าม origin จาก LAN IP
   → proxy ทำให้เป็น same-origin เลยไม่มี CORS ตั้งแต่แรก
3. dev server รันใน Docker คนละ network กับ backend → ต้องเป็น `host.docker.internal`
   (รันบนโฮสต์ตรง ๆ ให้ตั้ง `VITE_DEV_API_PROXY_TARGET=http://localhost:8000`)

### เรื่อง ThaID: DOPA ไม่ได้เข้มเรื่อง whitelist (ใน UAT)

`redirect_uri` **มาจาก env `THAID_REDIRECT_URI` ของ backend เท่านั้น**
frontend ส่ง `browser_oauth_base` ไปด้วยก็จริง แต่ backend ไม่สนใจ — เปลี่ยนจากฝั่ง frontend ไม่ได้

ทดสอบแล้วว่า **DOPA ยอมรับ `https://<LAN_IP>:5173/...`** ที่ไม่ได้ลงทะเบียนไว้
→ ทดสอบ ThaID จริงจาก dev URL ไหนก็ได้ ไม่ต้องยื่นขอ whitelist
(ยังไม่รู้ว่า production เข้มกว่านี้ไหม — อย่าเหมาว่าเหมือนกัน)

**ทางเลือกถ้า LAN ใช้ไม่ได้** (Wi-Fi เปิด AP isolation กันเครื่องลูกข่ายคุยกัน):

```bash
cloudflared tunnel --protocol http2 --url http://localhost:5173
```

ต้องใส่ `--protocol http2` เพราะเน็ตที่ทดสอบบล็อก QUIC ขาออก port 7844
`allowedHosts: ['.trycloudflare.com']` ตั้งไว้แล้ว แต่ URL สุ่มใหม่ทุกครั้ง
→ ต้องแก้ `.env` ทั้งสองฝั่ง + restart ทุกรอบ

**ทางที่ถูกที่สุดถ้ามีเครื่องแอนดรอยด์**: `chrome://inspect` port forwarding map `localhost` ของมือถือ
มาที่เครื่อง dev ผ่านสาย USB — ThaID จริงใช้ได้โดยไม่ต้องแก้ config อะไรเลย และ Chrome
ถือว่า `localhost` เป็น secure context กล้องจึงทำงานบน http ไม่ต้องทำ cert

---

## SDK ทำงานยังไง (ตรวจจากตัวไฟล์ IIFE จริง)

```
หน้าเรา (frame.html)
 └─ SDK 1.0.3-beta.1        ← ไฟล์ 1.6 MB ใน public/ ที่เราฝังและ pin ได้
     └─ iframe ไปโดเมน AINU  (uat.ainu.tech / uat.nonprod-api.ainu.tech)
         └─ engine 2.0.0-beta.2 + MediaPipe/TFLite (WASM)  ← AINU โหลดเอง เรา pin ไม่ได้
```

**ตัวที่เราฝังบางมาก** grep แล้วมีแค่ `/v1/auth/token`, `/v1/auth/websdk/handshake`,
`/v1/auth/websdk/token/handshake`, `/ekyc` — หน้าที่คือแลก token แล้วสร้าง iframe
(มี `HTMLIFrameElement`, `contentWindow`, error `[eKYC SDK] iFrame is not defined`)

**ไม่มี MediaPipe/TFLite ในไฟล์นี้เลย** และข้อความ `[eKYC Server]` ที่วนใน console
ก็ไม่ได้มาจากไฟล์นี้ (grep เจอ 0 ครั้ง) — ทั้งสองอย่างอยู่ในชั้นในที่โหลดจากเซิร์ฟเวอร์ AINU

| งาน | ทำที่ไหน |
|---|---|
| ตรวจจับ/ติดตามใบหน้า, วงรีนำทาง, สั่งขยับ | **JS/WASM ในเบราว์เซอร์** (`Created TensorFlow Lite XNNPACK delegate for CPU`) |
| **ตัดสินผ่าน/ไม่ผ่าน** | **เซิร์ฟเวอร์ AINU** (`[eKYC Server] Waiting for status.` วนรอคำตอบ) |

**ผลที่ตามมา: หาสาเหตุที่ไม่ผ่านจากฝั่งเราไม่ได้** เกณฑ์ตัดสินอยู่บนเซิร์ฟเวอร์เขาทั้งหมด
ต้องใช้ `transactionId` ถาม AINU อย่างเดียว — และเป็นเหตุผลที่ต้องเก็บค่านี้ให้ได้ทุกครั้ง

---

## เราส่งอะไรให้ AINU บ้าง

โปรเจกต์เราแตะ AINU แค่ 2 บรรทัด (`frame.ts`) และ **ไม่เคยเรียก API ของ AINU เองเลย**

| ส่ง | ค่า |
|---|---|
| `accountId` / `accountSecret` | จาก `.env` |
| `flowId` / `language` / `containerId` | คงที่ |
| `referenceId` | `pmcare-<uuid>` — สุ่มใหม่ทุกครั้งที่เปิด **ไม่มีข้อมูลส่วนบุคคล** |

**ไม่ได้ส่งข้อมูลผู้ยื่นคำร้องเลย** — ไม่มีเลขบัตรประชาชน ไม่มีชื่อ ไม่มีข้อมูลจาก ThaID ไม่มี case id

ภาพใบหน้า **SDK ส่งเองภายใน** เราไม่ได้เขียนโค้ดส่ง ไม่เห็น ไม่ได้ควบคุม
ขากลับ AINU ส่งภาพ base64 กลับมาใน `onEkycResult` ด้วย

### โครงสร้าง payload จริง (จาก transaction ที่ผ่าน 2026-09-04)

```
transactionId · transactionStatus · failReason · description · createdAt · completedAt
workflow[] · accountId · referenceId · flowId · sdkVersion
deviceInfo · browserBrand · browserVersion · appId      ← appId = origin (เช่น "localhost")
summary.workflowResult { transactionStatus, failReason, livenessResultCode }
summary.configuration  { livenessFailedLimit, livenessUnavailableLimit, livenessStartAttemptLimit }
images.livenessImage                                    ← ⚠️ ซ้อนใน images ไม่ใช่ key ระดับบน
liveness { configuration, isStartCompleted, isProcessCompleted, livenessResultCode,
           appId, sdkId, sdkVersion, signature, metadata, keyId, timestamp, elapsedMs, reason }
```

**ข้อสังเกต:**
- เอกสาร AINU เขียนชื่อภาพเป็น key ระดับบน แต่ **ของจริงอยู่ใน `images`** —
  `redactLivenessPayload()` รับมือได้เพราะไล่ recursive + มีด่านสำรอง (สตริงยาวเกิน 300 ตัว)
  ทดสอบแล้วทั้งกรณีเป็น string, ซ้อนใน object, key ที่ไม่รู้จัก และ array
- transaction ที่ผ่านครั้งนี้ **`images.livenessImage` ว่างเปล่า** — ยังไม่เคยเห็น base64 จริง
- `signature` (684 ตัวอักษร) + `keyId` + `metadata` มีจริง = image integrity signature
  ที่ค้างเป็นคำถามข้อ 3 กับ AINU — เหลือแค่ถามวิธี verify
- `liveness.reason` = `PASS` ตอนสำเร็จ · `elapsedMs` บอกเวลาที่ใช้สแกน (7.5 วิ ในเคสนี้)

### referenceId — กุญแจเชื่อมสองระบบ

เอกสาร AINU: *"แนะนำให้ส่ง `referenceId` (transaction ID ฝั่ง partner) ทุกครั้งที่เปิด SDK
เพื่อใช้อ้างอิง/ตรวจสอบภายหลัง"* — และค่านี้ถูกส่งกลับมาใน result ด้วย

**backend เป็นคนสร้าง** — `POST /v1/liveness/session` คืน `reference_id` มาพร้อม config
(เดิม frontend สร้างเอง เปลี่ยนแล้วเมื่อ 7 ก.ย. 2026) เหตุผลคือแถวใน `liveness_attempts`
ถูกผูกกับ `persons_id` ตั้งแต่เปิด session ทำให้เห็นคนที่สแกนไม่ผ่านแล้วเลิกกลางคัน
ซึ่งแบบเดิมบันทึกไม่ได้เลย

`SubmitRequestPage` ถือค่าไว้แล้วส่งเข้าเฟรมทาง postMessage
**ห้ามให้เฟรมสร้างเอง** เพราะเฟรมถูก unmount ทิ้งทุกครั้งที่ปิด ค่าจะหายไปกับมัน

⚠️ **เรียก `/session` ใหม่ทุกครั้งที่เริ่มสแกน รวมตอนกดลองใหม่** ห้ามใช้ค่าเดิมซ้ำ
ไม่งั้นการสแกนหลายครั้งจะยุบเป็นแถวเดียวแล้วตามเรื่องกับ AINU ไม่ได้

⚠️ **เอา `reference_id` เดียวไปยื่นหลายคำร้องไม่ได้** — ใบที่สองจะได้แถว `REPLAYED`
ที่ไม่นับเป็นการยืนยันตัวตน

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

`INFO: Created TensorFlow Lite XNNPACK delegate for CPU` ขึ้นเป็นสีแดงใน console
เป็น log ของ MediaPipe ไม่ใช่ error จริง — มองข้ามได้เหมือนกัน

### จอ "Face scan verification failed" ไม่ใช่ผลลัพธ์สุดท้าย

เป็น UI **ภายใน** ของ AINU ที่ยังนับเป็นรอบ retry อยู่ — `onEkycResult` **ยังไม่ยิง**
ต้องกด "Try again" จนครบโควตา (จาก transaction จริง: `failed` / `unavailable` /
`startAttempt` limit อย่างละ 5) SDK ถึงจะคืนผลกลับมาให้เรา

**อย่ารอให้ครบเพื่อจะเอา `transactionId`** — มันมาตั้งแต่ `onReady` แล้ว
ตอน dev เฟรมจะโชว์แถบล่างจอให้แตะก๊อปได้ทันทีที่กล้องเปิด

### เครื่องมือตอน dev (ไม่ขึ้นใน production build)

| | |
|---|---|
| แถบ `txn:` ล่างจอ | โผล่ตอน `onReady` แตะเพื่อก๊อป `transactionId` |
| จอสรุปในเฟรม | ขึ้นทับทันทีที่ได้ผล **กลั้นผลไว้จนกดปุ่ม "ไปต่อ"** เพราะพอส่งออกไปหน้าแม่จะ unmount iframe ทิ้ง |
| แถบใต้ปุ่มในหน้าคำร้อง | รายงานเดียวกัน กดคลี่ดูย้อนหลังได้ |
| ข้อความ error ต่อท้าย `[status / code]` | ไว้เก็บรหัสที่ยังไม่รู้จักจากหน้าจอ |

รายงานประกอบจาก `buildLivenessReport()` — มี `transactionId`, `flowId`, `status`, reason,
เวอร์ชัน SDK ทั้งสองชั้น, userAgent และ payload ที่ **ตัด base64 ออกแล้ว** พร้อมส่งให้ AINU

**SDK มี 2 ชั้น** — `sdkVersion: 1.0.3-beta.1` คือตัวที่เราฝัง ส่วน `liveness.sdkVersion: 2.0.0-beta.2`
คือ engine ที่ AINU โหลดจากเซิร์ฟเวอร์เขาเอง (ใช้ MediaPipe จาก cdn.jsdelivr.net)
อัปเดตได้ตลอดโดยเราคุมไม่ได้ ถ้าอยู่ ๆ พฤติกรรมเปลี่ยน ให้ดูค่านี้ก่อน

**อย่า hardcode retry limit** — มาจาก config ฝั่งเซิร์ฟเวอร์ของ AINU เปลี่ยนได้โดยไม่บอก
(เคยเป็น `1` เมื่อ 2026-08-24 แล้วเป็น `5` เมื่อ 2026-09-03)
ถ้าจะโชว์ให้ผู้ใช้เห็นต้องอ่านจาก `summary.configuration` ในผลลัพธ์

ยืนยันจาก payload จริง 2026-09-04 — **3 โควตาแยกกัน ค่าละ 5**:
```json
"configuration": {
  "livenessFailedLimit": 5,
  "livenessUnavailableLimit": 5,
  "livenessStartAttemptLimit": 5
}
```

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
4. **desktop webcam ไม่ผ่านซ้ำ ๆ ขณะที่มือถือผ่านครั้งเดียว** — โมเดลมีเกณฑ์ต่างกันตามอุปกรณ์ไหม
   ปรับ threshold ต่อ flow ได้ไหม · ผู้ใช้จริงส่วนหนึ่งเป็นผู้สูงอายุที่อาจใช้คอมพิวเตอร์
   ถ้า desktop ผ่านยากจริงต้องรู้ตั้งแต่ตอนนี้
5. **pin เวอร์ชัน engine ได้ไหม** — engine 2.0.0-beta.2 อยู่บนเซิร์ฟเวอร์ AINU (ดูหัวข้อ
   "SDK ทำงานยังไง") อัปเดตได้ตลอดโดยเราคุมไม่ได้ ขอ changelog ล่วงหน้าได้ไหม
   ระบบที่มีคนใช้จริงไม่ควรเจอพฤติกรรมเปลี่ยนกลางอากาศ

---

## เหลือทำ

**UX**
- [x] map สาเหตุที่ไม่ผ่านเป็นข้อความไทย (`failureMessages.ts`)
      — ยืนยันรหัสจากของจริงแล้วแค่ `TIMEOUT`, `FACE_NOT_FOUND`, `INIT_ERROR` ที่เหลือยังเดา
      เจอรหัสใหม่เมื่อไหร่ให้เติมในตารางนั้น
- [x] `type: 'error'` ส่งถึงหน้าแม่แล้ว — ไม่ค้างจอดำอีก
- [ ] **คำแนะนำก่อนถ่าย** — นั่งใกล้กล้อง / หันหน้าเข้าหาแสง อย่าให้แสงอยู่ข้างหลัง / ยกกล้องให้อยู่ระดับตา
      (สามข้อนี้ตรงกับสาเหตุที่ทดสอบแล้วพบว่าทำให้เว็บแคมโน้ตบุ๊กไม่ผ่าน)
- [ ] **เตือนก่อนออกจากหน้า** — `stores/application.ts` backup draft ลง sessionStorage อยู่แล้ว
      แต่ **ไม่เก็บ `File`** → refresh เฉย ๆ ก็เสียไฟล์ที่อัปโหลดมาแล้วทั้งหมด
      คนที่ทำไม่ผ่านแล้วหงุดหงิดปิดทิ้งจะเสียงานที่กรอกมา 4 ขั้นตอน
- [ ] `livenessPassed` อยู่ในหน่วยความจำ — refresh แล้วต้องทำ liveness ใหม่

**Backend (ทำเสร็จแล้ว 7 ก.ย. 2026 — สเปกที่ `foropenmdfiles/ainu liveness/liveness_api_spec.md`)**
- [x] **เก็บ log ผล liveness** — ไม่ได้ทำเป็น service แยกอย่างที่วางแผนไว้ ไปอยู่ใน
      `case-service` แทน ตาราง `liveness_attempts` ผูกกับ `persons_id` ตั้งแต่เปิด session
- [x] **soft gate** ตามที่เสนอ — `POST /v1/cases` ยังรับคำร้องที่ไม่แนบ
      `liveness_reference_id` ได้ (backend สร้างแถว `NO_ATTEMPT` ให้เอง)
      เหตุผลเดิมยังใช้อยู่: ผู้ใช้คือกลุ่มเปราะบาง บล็อกแล้วถ่ายไม่ผ่าน = ยื่นขอความช่วยเหลือไม่ได้เลย
- [ ] ⚠️ **ส่ง payload ดิบ ไม่ redact** — ทีมตัดสินร่วมกันว่า backend ขอเก็บก้อนดิบ
      เพื่อ verify `signature` ย้อนหลัง (แม้เอกสารจะยืนยันว่าการตัดภาพไม่กระทบ `signature`)
      **ความเสี่ยงที่รับทราบแล้ว:** วันที่ AINU เริ่มส่ง `images.livenessImage` มาจริง
      ภาพใบหน้าประชาชนจะเข้า DB ทันทีโดยไม่มีใครรู้ตัว — ควรตั้ง alert ฝั่ง backend
      ถ้าจะกลับลำ `redactLivenessPayload()` พร้อมใช้ แก้ที่ `reportLivenessResult()` จุดเดียว

**ทดสอบ**
- [x] **เทสครบ flow บนมือถือ** สำเร็จ 2026-09-03 (iPhone, ThaID จริง, liveness ผ่าน)
      ทั้งสองด่านที่เคยกลัวแก้ได้แล้ว — Vite proxy แก้ข้อ 1, DOPA ไม่เข้ม whitelist เลยไม่ติดข้อ 2
      **ไม่ต้องใช้ `VITE_ENABLE_THAID_DEV_MOCK`** (ยังไม่เคยได้ลองใช้จริงเลย)
- [ ] เว็บแคมโน้ตบุ๊ก **scan ไม่ผ่านซ้ำ ๆ** ส่วนมือถือผ่านครั้งเดียว — **ยังเป็นแบบนี้อยู่**
      (มุมกล้องต่ำกว่าระดับตา หน้าเล็กในเฟรม แสงย้อน + โมเดล AINU tune มาสำหรับมือถือ)
      ก่อนโทษ SDK ให้คุม 3 อย่างนี้ก่อน: ยกกล้องให้อยู่ระดับตา / เข้าใกล้จนหน้าเต็มเฟรม / หันหน้าเข้าหาแสง
      ถ้าคุมแล้วยังไม่ผ่าน → เก็บ `transactionId` ของทั้งเคสที่ผ่านและไม่ผ่านส่งให้ AINU เทียบ
      → ถ้าสถิติออกมาแย่จริง อาจต้องทำ **QR handoff ไปมือถือ** — frontend ยังไม่มี QR lib
