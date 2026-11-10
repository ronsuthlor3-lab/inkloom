# บันทึกการออกแบบ

## เอกลักษณ์
- **ชื่อ**: Inkloom (ink = หมึก, loom = กี่ทอ) — ครอบครัวเดียวกับ LeafLoom, Draftloom, Tallyloom ไม่มีส่วนของชื่อ WPS หรือชื่อสินค้าอื่น
  ชื่อสำรอง: Quillfern, Proseweave, หมึกทอ — ผู้ใช้ควรค้นฐานเครื่องหมายการค้าก่อนใช้จริง
- **โลโก้**: ปลายปากกาคอแร้งบนแผ่นกระดาษ มีเส้นทอสีอำพัน วาดเป็น SVG เอง (`assets/logo.svg`)
- **สี**: หมึกม่วงพลัม `#5b2f63` + อำพัน `#c7731f` บนพื้นเทาอุ่น (ตั้งใจไม่ใช้โทนน้ำเงินที่โปรแกรมพิมพ์เอกสารชื่อดังใช้กัน)
- **ฟอนต์ในเอกสาร**: Sarabun, Noto Sans Thai, Noto Serif Thai, Mitr จาก Google Fonts (SIL Open Font License) + ฟอนต์ระบบ
- **ไอคอน**: ตัวอักษร/สัญลักษณ์ธรรมดา และ SVG เส้นที่วาดเอง
- **ข้อความ**: เขียนใหม่ภาษาไทยทั้งหมด
- **เลย์เอาต์**: แถบไฟล์ → แถบเครื่องมือแถวเดียวแบ่งกลุ่ม → แผ่นกระดาษกลางจอบนพื้นเทา → แถบสถานะ (หน้า คำ ตัวอักษร)
  เป็นเลย์เอาต์ทั่วไปของประเภทแอป ไม่มีริบบอนหรือแท็บเมนูแบบโปรแกรมใด

## สถาปัตยกรรม
- หน้าเดียว HTML/CSS/JS ไม่ต้อง build
- `editor.js`: ตัวแก้ไข (`contenteditable`), คำสั่งจัดรูปแบบ, ตาราง, ค้นหา/แทนที่, นับคำ, ตัวกรอง HTML (allowlist)
- `convert.js`: HTML ↔ .docx (docx/mammoth), HTML ↔ Markdown, ข้อความล้วน
- ไลบรารี .docx โหลดแบบตามต้องการ (dynamic script) จาก CDN ระบุเวอร์ชัน
- เนื้อหาเก็บเป็น HTML ที่ผ่านตัวกรองแล้ว; บันทึกอัตโนมัติใน `localStorage`

```
inkloom/
├── index.html  style.css
├── editor.js  convert.js  app.js
├── assets/logo.svg
├── samples/report.docx
├── docs/ spec.md feasibility.md design.md test-report.md
├── README.md  LICENSE
```
