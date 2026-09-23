/* Thornwild — game data.
   All balance numbers live here so they can be tuned without touching the engine.
   Distances are in metres (1 world unit = 1 m), times in seconds. */
window.TW = window.TW || {};

TW.RATING_LABELS = [
  ['power', 'พลังโจมตี'],
  ['tough', 'ความอึด'],
  ['agility', 'ความคล่องตัว'],
  ['reach', 'ระยะโจมตี'],
  ['difficulty', 'ความยาก'],
];

TW.CLASSES = [
  {
    id: 'warrior', th: 'นักรบ', latin: 'Vanguard', role: 'แนวหน้า · ประชิดตัว',
    oath: 'ข้าจะยืนอยู่ตรงนี้ จนกว่าสิ่งสุดท้ายจะล้มลง',
    desc: 'ดาบใหญ่กับโล่เหล็ก ทนทานที่สุดในกิลด์ บุกเข้ากลางฝูงแล้วหมุนดาบกวาดทีเดียวหลายตัว',
    base: { hp: 190, mp: 60, atk: 16, def: 9, speed: 8.0, crit: 0.06 },
    grow: { hp: 26, mp: 5, atk: 3.0, def: 1.6 },
    mpRegen: 2.4, critMult: 1.8,
    rating: { power: 4, tough: 5, agility: 2, reach: 1, difficulty: 1 },
    skills: [
      { id: 'slash', key: 'คลิก', icon: 'slash', name: 'ฟันดาบ', desc: 'ฟันเป็นวงโค้งกว้างด้านหน้า', mp: 0, cd: 0.55, mult: 1.0, range: 3.6, arc: 140 },
      { id: 'whirl', key: '1', icon: 'whirl', name: 'หมุนดาบพายุ', desc: 'หมุนตัวฟันทุกตัวที่อยู่รอบกาย', mp: 20, cd: 6, mult: 1.7, radius: 5.4 },
      { id: 'charge', key: '2', icon: 'charge', name: 'พุ่งทะลวง', desc: 'พุ่งไปข้างหน้า 13 ม. ชนศัตรูตลอดทางให้มึนงง', mp: 15, cd: 8, mult: 1.4, dist: 13, stun: 1.2 },
      { id: 'ironwill', key: '3', icon: 'shield', name: 'ป้อมปราการเหล็ก', desc: 'รับความเสียหายลดลง 60% และฟื้นพลังชีวิต 20% ภายใน 5 วินาที', mp: 25, cd: 18, dur: 5, reduce: 0.6, heal: 0.2 },
    ],
  },
  {
    id: 'mage', th: 'จอมเวท', latin: 'Arcanist', role: 'เวทระยะไกล · คุมพื้นที่',
    oath: 'ไฟที่ข้าจุด จะไม่มีวันเผาผิดตัว',
    desc: 'ตัวบางแต่ความเสียหายสูงสุด ยิงลูกไฟจากระยะไกล แช่แข็งฝูงอสูร แล้วปิดท้ายด้วยอุกกาบาต',
    base: { hp: 115, mp: 140, atk: 19, def: 3, speed: 7.6, crit: 0.08 },
    grow: { hp: 15, mp: 14, atk: 3.6, def: 0.7 },
    mpRegen: 5.5, critMult: 1.8,
    rating: { power: 5, tough: 1, agility: 3, reach: 5, difficulty: 4 },
    skills: [
      { id: 'ember', key: 'คลิก', icon: 'ember', name: 'ลูกไฟ', desc: 'ยิงลูกไฟตรงไปยังเป้าหมาย', mp: 0, cd: 0.6, mult: 1.0, speed: 30, range: 28 },
      { id: 'nova', key: '1', icon: 'nova', name: 'ลมหายใจน้ำแข็ง', desc: 'ระเบิดความเย็นรอบตัว ศัตรูเคลื่อนที่ช้าลงมาก 3 วินาที', mp: 25, cd: 9, mult: 1.1, radius: 7.5, slowDur: 3, slowF: 0.15 },
      { id: 'meteor', key: '2', icon: 'meteor', name: 'อุกกาบาตเพลิง', desc: 'เรียกอุกกาบาตลงตรงจุดที่เล็ง ความเสียหายรุนแรงเป็นวงกว้าง', mp: 35, cd: 10, mult: 3.2, radius: 5.5, delay: 0.9, range: 22 },
      { id: 'blink', key: '3', icon: 'blink', name: 'ก้าวมิติ', desc: 'เคลื่อนย้ายตัวเองไปข้างหน้าได้ไกลสุด 11 ม. ทันที', mp: 12, cd: 5, dist: 11 },
    ],
  },
  {
    id: 'ranger', th: 'นักธนู', latin: 'Warden', role: 'ยิงระยะไกล · เคลื่อนที่เร็ว',
    oath: 'ลูกศรทุกดอกมีชื่อเจ้าของ และข้าไม่เคยลืมชื่อใคร',
    desc: 'ยิงไว วิ่งไว รักษาระยะห่างให้ดี แล้วอสูรจะไม่มีวันเข้าถึงตัว',
    base: { hp: 140, mp: 90, atk: 17, def: 5, speed: 8.7, crit: 0.12 },
    grow: { hp: 19, mp: 8, atk: 3.2, def: 1.0 },
    mpRegen: 3.4, critMult: 1.9,
    rating: { power: 3, tough: 2, agility: 4, reach: 5, difficulty: 3 },
    skills: [
      { id: 'arrow', key: 'คลิก', icon: 'arrow', name: 'ยิงธนู', desc: 'ยิงลูกศรความเร็วสูง', mp: 0, cd: 0.42, mult: 0.9, speed: 46, range: 34 },
      { id: 'fan', key: '1', icon: 'fan', name: 'ธนูพัด', desc: 'ยิงลูกศร 7 ดอกกระจายเป็นรูปพัด', mp: 18, cd: 5, mult: 0.75, count: 7, spread: 60, speed: 42, range: 26 },
      { id: 'rain', key: '2', icon: 'rain', name: 'ฝนธนู', desc: 'ห่าธนูตกใส่พื้นที่เป้าหมายต่อเนื่อง 3 วินาที', mp: 30, cd: 11, mult: 0.6, radius: 6, ticks: 6, dur: 3, range: 26 },
      { id: 'leap', key: '3', icon: 'leap', name: 'กระโดดถอย', desc: 'กระโดดถอยหลังหนีจากเป้า 10 ม. ไม่รับความเสียหายระหว่างกระโดด', mp: 10, cd: 6, dist: 10 },
    ],
  },
  {
    id: 'assassin', th: 'นักฆ่า', latin: 'Shade', role: 'ลอบโจมตี · คริติคอล',
    oath: 'ข้าไม่ต้องการให้ใครจดจำ ขอแค่เป้าหมายไม่ได้ตื่นมาอีก',
    desc: 'มีดคู่ที่แทงเร็วที่สุดในกิลด์ วาร์ปไปด้านหลังเป้าหมาย ซ่อนตัว แล้วปลิดชีพด้วยคริติคอล',
    base: { hp: 135, mp: 90, atk: 15, def: 4, speed: 9.3, crit: 0.22 },
    grow: { hp: 18, mp: 8, atk: 3.1, def: 0.9 },
    mpRegen: 3.4, critMult: 2.1,
    rating: { power: 4, tough: 2, agility: 5, reach: 2, difficulty: 5 },
    skills: [
      { id: 'stab', key: 'คลิก', icon: 'stab', name: 'แทงคู่', desc: 'แทงมีดคู่อย่างรวดเร็ว โอกาสคริติคอลสูง', mp: 0, cd: 0.34, mult: 0.72, range: 2.9, arc: 100 },
      { id: 'shadowstep', key: '1', icon: 'moon', name: 'ก้าวเงา', desc: 'วาร์ปไปด้านหลังศัตรูที่ใกล้จุดเล็งที่สุด แล้วแทงคริติคอลทันที', mp: 20, cd: 7, mult: 2.2, range: 16 },
      { id: 'venom', key: '2', icon: 'venom', name: 'ใบมีดพิษ', desc: 'ปามีดอาบพิษ 5 เล่ม ศัตรูที่โดนเสียพลังชีวิตต่อเนื่อง 4 วินาที', mp: 22, cd: 8, mult: 0.6, count: 5, spread: 40, speed: 34, range: 20, poisonMult: 0.35, poisonDur: 4 },
      { id: 'vanish', key: '3', icon: 'vanish', name: 'อำพรางกาย', desc: 'หายตัว 4 วินาที อสูรเลิกไล่ วิ่งเร็วขึ้น และการโจมตีถัดไปแรงขึ้น 2.6 เท่า', mp: 25, cd: 16, dur: 4, bonus: 2.6 },
    ],
  },
];

/* Bestiary. rank follows the guild's threat scale E (lowest) → A. */
TW.MONSTERS = {
  slime: {
    th: 'มอสสไลม์', latin: 'Moss Slime', rank: 'E', lv: 1, zone: 'ทุ่งมอส',
    hp: 42, atk: 6, def: 1, speed: 3.4, range: 1.5, aggro: 11, atkCd: 1.6, windup: 0.45,
    exp: 14, gold: [1, 4], radius: 0.9, height: 1.9,
  },
  wolf: {
    th: 'หมาป่าเงา', latin: 'Shade Wolf', rank: 'D', lv: 3, zone: 'ป่าสนเงา',
    hp: 88, atk: 11, def: 3, speed: 7.6, range: 1.9, aggro: 17, atkCd: 1.15, windup: 0.35,
    exp: 30, gold: [3, 8], radius: 1.0, height: 2.0, pack: true,
  },
  goblin: {
    th: 'ก็อบลินหอก', latin: 'Mudstake Goblin', rank: 'D', lv: 4, zone: 'ค่ายโคลนก็อบลิน',
    hp: 115, atk: 14, def: 4, speed: 5.4, range: 2.7, aggro: 16, atkCd: 1.45, windup: 0.45,
    exp: 40, gold: [5, 12], radius: 0.8, height: 2.1, pack: true,
  },
  spore: {
    th: 'เห็ดสปอร์', latin: 'Sporecap', rank: 'C', lv: 5, zone: 'หนองสปอร์',
    hp: 100, atk: 13, def: 2, speed: 2.2, range: 15, aggro: 19, atkCd: 2.3, windup: 0.6,
    exp: 48, gold: [6, 14], radius: 1.0, height: 2.7, ranged: true,
  },
  boss: {
    th: 'ธอร์นฮาร์ตผู้เฒ่า', latin: 'Old Thornheart', rank: 'A', lv: 8, zone: 'ซากวิหารราก',
    hp: 1300, atk: 26, def: 8, speed: 4.0, range: 5.0, aggro: 24, atkCd: 2.4, windup: 0.8,
    exp: 600, gold: [120, 160], radius: 2.6, height: 8.2, boss: true,
  },
};

/* Map regions. x/z = centre (north is −z), r = radius in metres.
   flat = terrain levelling for built areas (lift raises or sinks it). */
TW.ZONES = [
  { id: 'camp', th: 'ค่ายกิลด์ชายป่า', lv: 'เขตปลอดภัย', x: 0, z: 150, r: 22, flat: { r: 32, lift: 0 }, safe: true, spawns: [] },
  { id: 'meadow', th: 'ทุ่งมอส', lv: 'Lv 1–2', x: 0, z: 82, r: 42, spawns: [{ type: 'slime', count: 12 }] },
  { id: 'pines', th: 'ป่าสนเงา', lv: 'Lv 3–4', x: 100, z: 22, r: 46, spawns: [{ type: 'wolf', count: 9, pack: 3 }] },
  { id: 'mud', th: 'ค่ายโคลนก็อบลิน', lv: 'Lv 4–5', x: -102, z: 28, r: 34, flat: { r: 30, lift: 0.5 }, spawns: [{ type: 'goblin', count: 9 }] },
  { id: 'swamp', th: 'หนองสปอร์', lv: 'Lv 5–6', x: -82, z: -92, r: 44, flat: { r: 46, lift: -2.4 }, spawns: [{ type: 'spore', count: 7 }, { type: 'slime', count: 3 }] },
  { id: 'ruins', th: 'ซากวิหารราก', lv: 'Lv 8 · บอส', x: 45, z: -132, r: 30, flat: { r: 30, lift: 1.2 }, spawns: [{ type: 'boss', count: 1, center: true }] },
];
TW.ZONE_BY_ID = {};
TW.ZONES.forEach(function (z) { TW.ZONE_BY_ID[z.id] = z; });

/* The guild's bounty chain, completed in order. */
TW.QUESTS = [
  { title: 'ทุ่งมอสล้นทะลัก', target: 'slime', count: 5, zone: 'meadow', brief: 'สไลม์ลามเข้าใกล้ค่ายแล้ว ออกไปกวาดทุ่งให้โล่ง', reward: { exp: 60, gold: 30, potions: 2 } },
  { title: 'เงาในป่าสน', target: 'wolf', count: 4, zone: 'pines', brief: 'ฝูงหมาป่าเงาดักคนตัดไม้ ล่ามันก่อนมันล่าเรา', reward: { exp: 120, gold: 50, potions: 2 } },
  { title: 'ถอนหอกค่ายโคลน', target: 'goblin', count: 6, zone: 'mud', brief: 'ก็อบลินปักหอกกั้นทางค้า รื้อค่ายมันซะ', reward: { exp: 180, gold: 80, potions: 3 } },
  { title: 'สปอร์พิษจากหนอง', target: 'spore', count: 4, zone: 'swamp', brief: 'สปอร์ลอยมาถึงค่ายแล้ว ตัดต้นตอที่หนองสปอร์', reward: { exp: 220, gold: 100, potions: 3 } },
  { title: 'หัวใจแห่งหนาม', target: 'boss', count: 1, zone: 'ruins', brief: 'ต้นเหตุทั้งหมดหลับอยู่ในซากวิหาร ปลุกมันแล้วดับหัวใจของมัน', reward: { exp: 600, gold: 300, potions: 0 }, final: true },
];

TW.HUNTER_NAMES = ['คีริน', 'ไลร่า', 'ธาวิน', 'เซเรน', 'โรวาน', 'อลิซา', 'กาเรธ', 'นภัส'];

TW.expToNext = function (level) { return 50 + (level - 1) * 45; };
TW.MAX_LEVEL = 20;
