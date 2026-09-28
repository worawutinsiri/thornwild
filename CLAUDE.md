# Thornwild — คู่มือสำหรับ Claude Code (อ่านก่อนเริ่มงานทุกครั้ง)

เกม action RPG 3D บนเบราว์เซอร์ (Three.js r128 UMD จาก cdnjs, ไม่มี bundler, ไม่มี dependency อื่น)
เจ้าของโปรเจกต์คุยเป็น **ภาษาไทย** — ตอบเป็นภาษาไทย ใช้ศัพท์เทคนิคภาษาอังกฤษได้

- ประวัติการทำงาน / การตัดสินใจ / สถานะ roadmap ปัจจุบัน → [docs/HISTORY.md](docs/HISTORY.md) (**ต้องอัปเดตทุกครั้งที่จบ step**)
- เอกสารออกแบบเกมทุกระบบ → [GAME_DESIGN.md](GAME_DESIGN.md)
- ไฟล์ memory ของ Claude Code เป็นของเครื่องนั้น ๆ ไม่ได้ติดมากับ repo — เครื่องใหม่ให้ยึด 2 ไฟล์ข้างบนเป็นหลัก

## กติกาการทำงาน (คำสั่งที่เจ้าของโปรเจกต์กำหนดไว้แล้ว)

1. **ทำทีละ step** ตาม roadmap ใน HISTORY.md — แต่ละ step: implement → `node tools/smoke.mjs` ต้องขึ้น `smoke ok`
   → `node tools/build.mjs` → commit → push ไป `origin main` แล้วค่อยเริ่ม step ถัดไป
   **ห้าม commit ตอน smoke แดง** (เคยหลุดครั้งหนึ่งที่ b0c6251 เพราะ chain คำสั่งไม่หยุด — ใช้ `&&` ให้ครบ)
2. **"deploy"** = copy ไฟล์ขึ้น IIS ที่ `C:\inetpub\thornwild` ด้วย
   `powershell -ExecutionPolicy Bypass -File tools\deploy.ps1` — ทำ **เฉพาะเมื่อผู้ใช้สั่ง "deploy"** เท่านั้น
   (git push อย่างเดียวไม่ถือว่า deploy)
3. **ไม่ต้องทำ claude.ai artifact** — ผู้ใช้เล่นจาก IIS หรือเปิด `index.html` เอง
4. **branch `feature/thanos`** (อาชีพ Titan/ทานอส + ดีดนิ้วเมื่อเก็บอัญมณีครบ 6) **ห้าม merge เข้า main** จนกว่าผู้ใช้จะสั่ง
   branch นี้แตกก่อนเฟส 1 ถ้าจะ merge ทีหลังต้องระวัง conflict ใน `js/game.js` มาก
5. "พักก่อน" = หยุดรอ ไม่ต้องทำต่อ / "ทำต่อ" = ทำ step ถัดไปใน roadmap ทันทีโดยไม่ต้องถาม
6. อัปเดตส่วน "สถานะล่าสุด" และ "บันทึกตามลำดับเวลา" ใน `docs/HISTORY.md` ในคอมมิตเดียวกับงานของ step นั้น

## โครงไฟล์

```
index.html       UI ทั้งหมด (title/class/HUD/inventory/shop/smith/overlays) + <!-- BUILD:* --> markers
css/style.css    โทนสี, layout, .touch-on (HUD มือถือแบบกระชับ)
js/data.js       ตัวเลขทั้งหมด (TW.*): CLASSES, MONSTERS, ZONES, QUESTS, NPCS, ITEM_BASES, AFFIXES, SHOP, UPGRADE ...
js/items.js      TW.Items: roll/lines/totals/bonus/compare/value/upgradeCost
js/models.js     โมเดล low-poly จาก primitive (hero/monster/npc), x-ray silhouette
js/world.js      terrain (value noise, World.heightAt), พืชแบบ instanced+wind, หมู่บ้าน, ค่าย, ซากวิหาร, waystones, colliders
js/ui.js         DOM/HUD/minimap/floaters/panels (UI.*)
js/game.js       game loop, player/monster state machines, สกิล, เควสต์, loot, save, click-to-move, TW.Game test hooks
tools/smoke.mjs  Node harness (fake DOM + stub WebGLRenderer) — ประตูคุณภาพหลัก
tools/build.mjs  รวมเป็นไฟล์เดียว dist/thornwild.html (dist/ ถูก gitignore)
tools/deploy.ps1 robocopy ขึ้น IIS
web.config       IIS static site (MIME/UTF-8/compression)
```

## การทดสอบ

- `node tools/smoke.mjs` = เล่นครบ flow ทุกอาชีพพร้อม assertion (ครั้งแรกจะดาวน์โหลด three.min.js ไว้ที่ `.cache/`)
- `node tools/smoke.mjs <class> <frames>` = รันเฉพาะอาชีพ/จำนวนเฟรม
- test hooks อยู่ที่ `TW.Game` ท้าย `js/game.js` (state, player(), monsters(), teleport, hit, makeElite, forceBossKill,
  forceQuestComplete, debugDrop, debugMaterial, unlockNode, travelTo ...) — เพิ่ม hook ใหม่ได้เมื่อระบบใหม่ต้องการ
- **Headless Chrome/SwiftShader ช้าเกินไปสำหรับโหมดเกม (เกิน 10 นาที) — อย่าใช้** ใช้ harness แทน
- smoke "แดง" หลายครั้งเป็นความไม่นิ่งของเทสต์เอง ไม่ใช่บั๊กเกม: การ spawn สุ่ม (แก้ด้วย teleport ไปข้างมอน),
  `auto=1` ยิงสกิลระหว่างเช็ค (ปิดชั่วคราว), ตีบอสจากไกลทำให้บอส return + leash-heal (teleport ไปใกล้ก่อน),
  ไอเทมดรอปในรัศมีเก็บอัตโนมัติ — เช็คเรื่องพวกนี้ก่อนแก้โค้ดเกม
- URL flags ตอนพัฒนา: `?class=mage` (ข้ามเมนู), `&auto=1` (ยิงสกิลเอง), `?lite=1` (ปิดเงา), `?touch=1` (บังคับ HUD มือถือ),
  `?screen=class`

## ข้อเท็จจริงทางเทคนิคที่ควรรู้

- เซฟเกมอยู่ที่ `localStorage["tw.save.v1"]` (token, cls, name, level, exp, gold, potions, quest, kills, x/z, elapsed,
  inventory, equip, attrs, points, waystones, skills, skillPoints, materials) — ถูก validate ตอนโหลด, auto-save ทุก 10 วิ
  เปลี่ยนโครงเซฟ = ต้องคง backward compat หรือ bump key
- ควบคุม: คลิกซ้ายเดิน, คลิกขวาโจมตี, 1/2/3 สกิล, Shift หลบ, Q ยา, I/C กระเป๋า+ตัวละคร, K ต้นไม้ทักษะ, E คุย/ใช้ waystone
- โลกกว้าง 400 ม. หมู่บ้านมอสเวลทิศใต้ (ปลอดภัย) → ทุ่งหญ้า → ป่าสน → ค่ายก็อบลิน → บึง → ซากวิหาร (บอสถูกผนึกจนกว่าจะจบเควสต์ที่ 4)
- remote: https://github.com/worawutinsiri/thornwild.git (branch main)
