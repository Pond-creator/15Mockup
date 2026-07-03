# Hub - รวมลิงก์งานทั้งหมด

หน้าเว็บรวมลิงก์ไปยังโปรเจคต่างๆ ที่ทำไว้ แบ่งตามหมวดหมู่ พร้อมระบบล็อกอิน (admin / user)

## Stack
- Frontend: HTML/CSS/JS static (GitHub Pages)
- Backend: Google Apps Script (GAS) Web App
- Database: Google Sheets (SPREADSHEET_ID: `1-YfN3lmSRfnuM6epslG_9w4UhW5OpZX92Cq4t2AnUyo`)
- Auth: sessionStorage (role-based, ตาม pattern เดียวกับ Folio Stock To Do List)

## โครงสร้าง Sheets (สร้างอัตโนมัติเมื่อเรียก API ครั้งแรก — ยกเว้นแถว user ที่ต้องเพิ่มเอง)
- `users` — username, password, role (admin/user), displayName
  - **ต้องเปิด Google Sheet แล้วพิมพ์แถว admin คนแรกเองในชีต** (โค้ดจะไม่ seed รหัสผ่านจริงให้อัตโนมัติ กันรหัสหลุดเวลา push ขึ้น GitHub)
- `links` — id, category, categoryOrder, name, url, linkOrder, description, active
  - `description` = คำอธิบายลิงก์ (แสดงใต้ชื่อในหน้าแรก), `active` = TRUE/FALSE เปิด/ปิดลิงก์ (ปิด = ซ่อนจากหน้าแรก)
  - คอลัมน์ description/active จะถูกเติมหัวให้อัตโนมัติเมื่อเรียก API ครั้งแรกหลัง deploy โค้ดใหม่ (ข้อมูลเก่าไม่กระทบ ถือว่า active)

## หน้าเว็บ
- `index.html` — หน้าล็อกอิน
- `hub.html` — หน้าใช้งานหลัก แสดงหมวดหมู่และปุ่มลิงก์ (ทุก role เห็นได้)
- `admin.html` — เพิ่ม/แก้ไข/ลบ หมวดหมู่และลิงก์ (admin เท่านั้น)
- `admin-users.html` — จัดการผู้ใช้ (admin เท่านั้น)

## วิธี Deploy

### 1. ตั้งรหัสผ่าน admin ในชีตโดยตรง
เปิด Google Sheet → sheet `users` (ถ้ายังไม่มีให้เรียก API ครั้งแรกก่อนเพื่อให้สร้าง header อัตโนมัติ) → เพิ่มแถว:
`username=pond, password=<ตั้งรหัสผ่านเอง>, role=admin, displayName=Pond`

### 2. API_SECRET
มีค่าสุ่มตั้งไว้ให้แล้วทั้งใน `gas/Code.gs` และ `js/api.js` (ต้องตรงกันเป๊ะๆ ทั้งสองไฟล์)
ถ้าอยากเปลี่ยนเป็นค่าของตัวเองทีหลัง ให้แก้ทั้งสองไฟล์พร้อมกัน แล้ว deploy ใหม่ (ขั้นตอนที่ 3)

### 3. Backend (Google Apps Script)
1. เปิด Google Sheet ที่สร้างไว้ → Extensions > Apps Script
2. คัดลอกโค้ดจาก `gas/Code.gs` (ที่แก้ API_SECRET แล้ว) ไปวางแทนของเดิม
3. Deploy > Manage deployments > แก้ไข deployment เดิม (ไอคอนดินสอ) > เวอร์ชันใหม่ > Deploy
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Web App URL เดิมยังใช้ได้ (ไม่เปลี่ยนถ้าแก้ deployment เดิม)

### 4. Frontend
1. `js/api.js` ตรวจว่า `API_URL` และ `API_SECRET` ถูกต้องครบทั้งสองบรรทัด
2. Push ทั้งโฟลเดอร์ขึ้น GitHub repo แล้วเปิดใช้งาน GitHub Pages
3. เข้าใช้งานที่ `https://<username>.github.io/<repo>/index.html`

### 5. ทดสอบ
- ล็อกอินด้วย username/password ที่ตั้งไว้ในชีต
- ไปที่ "จัดการหน้า" เพิ่มหมวดหมู่/ลิงก์แรก
- กลับหน้าหลักดูว่าปุ่มลิงก์ขึ้นถูกต้อง

## ข้อควรรู้ (Security)
- ทุก request (อ่านและเขียน) ต้องแนบ `secret` ตรงกับ `API_SECRET` ใน Code.gs ไม่งั้น API ปฏิเสธ — กันคนสุ่ม URL ยิง API ตรงๆ โดยไม่รู้ค่า secret
- `secret` ฝังอยู่ใน `js/api.js` ซึ่งเป็นไฟล์ public บน GitHub Pages (กด View Source เห็นได้) — กันคนสุ่มได้ แต่ไม่ใช่ auth ที่ปลอดภัย 100% เทียบเท่า login server จริง ถ้าอยากปลอดภัยกว่านี้ต้องทำ token หมดอายุ + backend ยืนยันตัวตนเต็มรูปแบบ (ซับซ้อนขึ้นและไม่ฟรีเท่าเดิม)
- `getUsers` ไม่คืนรหัสผ่านออกไปทาง API
- คำสั่งแก้ไข/ลบ (addLink, addUser ฯลฯ) เช็คสิทธิ์จาก `role` ที่ส่งมาจาก frontend เท่านั้น (ไม่มี server session จริง) ร่วมกับ secret ด้านบน — เพียงพอสำหรับใช้งานภายในทีมเล็ก แต่ไม่ควรใส่ข้อมูลอ่อนไหวมาก
- **ห้ามใส่รหัสผ่านผู้ใช้จริงไว้ในโค้ด/README ที่จะ push ขึ้น GitHub** — ตั้งรหัสผ่านตรงในชีตเท่านั้น (โค้ดปัจจุบันไม่ seed รหัสผ่านแล้ว)
- `API_SECRET` ต้องอยู่ใน `js/api.js` เพื่อให้ frontend ทำงานได้ (เป็นข้อจำกัดของเว็บ static ไม่มี backend ของตัวเอง) จึงไม่ใช่ความลับจริงๆ ถ้ามีคนเปิด View Source ก็เห็นได้ — ใช้กันแค่คนสุ่ม URL/บอทที่ไม่รู้ค่านี้ ไม่ได้กันคนที่ตั้งใจเจาะจริงจัง
- แนะนำตั้ง GitHub repo เป็น **Private** เพราะ API เขียนข้อมูลได้ (ไม่ใช่แค่อ่าน) — ลดโอกาสคนภายนอกบังเอิญเจอ repo แล้วไปหาทางเจาะต่อ (แต่ตัวหน้าเว็บ GitHub Pages เองยังเข้าถึงได้ถ้ารู้ลิงก์ตรงๆ)
- Sheet ต้องตั้ง Restricted, Web App execute as Me (ตาม [[feedback_github_security_checklist]])
- ฟรี 100% ไม่มีค่าใช้จ่าย

## ความเร็ว
- หน้าแรกโหลดช้าสัก 0.5-2 วิ เป็นเรื่องปกติของสแต็ก GAS + Sheets ฟรี (ทุก request ต้องไปเด้งผ่านเซิร์ฟเวอร์ Google) — ลดไม่ได้ทั้งหมด
- เคยมีบั๊กเปิดไฟล์ Sheet ซ้ำ 3 รอบต่อ 1 คำขอ (ตอนเพิ่ม feature description/active) แก้แล้วด้วยการแคช `getSS()` ให้เปิดครั้งเดียวต่อคำขอ
- ซื้อ Google One (แพ็กเกจพื้นที่เก็บข้อมูล) **ไม่ช่วย** เรื่องความเร็ว Apps Script — เป็นคนละระบบกัน ต้องใช้ Google Workspace ถึงจะมีผล (แพงกว่ามาก และยังไม่จำเป็นสำหรับสเกลนี้)
