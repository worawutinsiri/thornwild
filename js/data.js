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
  { id: 'village', th: 'หมู่บ้านมอสเวล', lv: 'เขตปลอดภัย', x: 0, z: 150, r: 26, flat: { r: 36, lift: 0 }, safe: true, spawns: [] },
  { id: 'meadow', th: 'ทุ่งมอส', lv: 'Lv 1–2', x: 0, z: 82, r: 42, spawns: [{ type: 'slime', count: 12 }] },
  { id: 'pines', th: 'ป่าสนเงา', lv: 'Lv 3–4', x: 100, z: 22, r: 46, spawns: [{ type: 'wolf', count: 9, pack: 3 }] },
  { id: 'mud', th: 'ค่ายโคลนก็อบลิน', lv: 'Lv 4–5', x: -102, z: 28, r: 34, flat: { r: 30, lift: 0.5 }, spawns: [{ type: 'goblin', count: 9 }] },
  { id: 'swamp', th: 'หนองสปอร์', lv: 'Lv 5–6', x: -82, z: -92, r: 44, flat: { r: 46, lift: -2.4 }, spawns: [{ type: 'spore', count: 7 }, { type: 'slime', count: 3 }] },
  { id: 'ruins', th: 'ซากวิหารราก', lv: 'Lv 8 · บอส', x: 45, z: -132, r: 30, flat: { r: 30, lift: 1.2 }, spawns: [{ type: 'boss', count: 1, center: true }] },
];
TW.ZONE_BY_ID = {};
TW.ZONES.forEach(function (z) { TW.ZONE_BY_ID[z.id] = z; });

/* The guild's bounty chain, taken and turned in at the guild master in the village, in order.
   brief = tracker text, offer = what he says when handing it out, done = what he says when you return. */
TW.QUESTS = [
  { title: 'ทุ่งมอสล้นทะลัก', target: 'slime', count: 5, zone: 'meadow', brief: 'สไลม์ลามเข้าใกล้หมู่บ้านแล้ว ออกไปกวาดทุ่งให้โล่ง', reward: { exp: 60, gold: 30, potions: 2 },
    offer: 'สไลม์ลามจากทุ่งมอสมาถึงรั้วหมู่บ้านแล้ว ไปกวาดมันสัก 5 ตัว ให้ชาวบ้านออกไปเก็บผักได้',
    done: 'ทุ่งโล่งขึ้นเยอะ ชาวบ้านฝากขอบคุณ นี่ค่าหัวของเจ้า' },
  { title: 'เงาในป่าสน', target: 'wolf', count: 4, zone: 'pines', brief: 'ฝูงหมาป่าเงาดักคนตัดไม้ ล่ามันก่อนมันล่าเรา', reward: { exp: 120, gold: 50, potions: 2 },
    offer: 'คนตัดไม้กลับมาไม่ครบ หมาป่าเงาในป่าสนดักอยู่ ล่าให้ได้ 4 ตัว ระวังมันมาเป็นฝูง',
    done: 'ฝูงหมาป่าถอยลึกเข้าป่าแล้ว คนตัดไม้กลับไปทำงานได้ นี่ส่วนของเจ้า' },
  { title: 'ถอนหอกค่ายโคลน', target: 'goblin', count: 6, zone: 'mud', brief: 'ก็อบลินปักหอกกั้นทางค้า รื้อค่ายมันซะ', reward: { exp: 180, gold: 80, potions: 3 },
    offer: 'ก็อบลินตั้งค่ายโคลนปิดทางค้าฝั่งตะวันตก จัดการมันสัก 6 ตัว ที่เหลือจะแตกหนีเอง',
    done: 'กองคาราวานผ่านได้แล้ว พ่อค้าฝากส่วนแบ่งมาให้เจ้าด้วย' },
  { title: 'สปอร์พิษจากหนอง', target: 'spore', count: 4, zone: 'swamp', brief: 'สปอร์ลอยมาถึงหมู่บ้านแล้ว ตัดต้นตอที่หนองสปอร์', reward: { exp: 220, gold: 100, potions: 3 },
    offer: 'สปอร์พิษลอยมาถึงหมู่บ้านตอนกลางคืน ต้นตออยู่ที่หนองสปอร์ทางตะวันตกเฉียงเหนือ ตัดเห็ดยักษ์ 4 ต้น',
    done: 'อากาศหายใจได้แล้ว หมอบอกว่าไม่มีคนป่วยเพิ่ม เจ้าช่วยทั้งหมู่บ้านไว้' },
  { title: 'หัวใจแห่งหนาม', target: 'boss', count: 1, zone: 'ruins', brief: 'ต้นเหตุทั้งหมดหลับอยู่ในซากวิหาร ปลุกมันแล้วดับหัวใจของมัน', reward: { exp: 600, gold: 300, potions: 0 }, final: true,
    offer: 'ทุกอย่างมาจากซากวิหารรากทางเหนือ ธอร์นฮาร์ตผู้เฒ่าตื่นแล้ว ไม่มีใครในกิลด์กล้าไป นอกจากเจ้า เตรียมยาไปให้พอ',
    done: 'ข้าไม่คิดว่าจะได้เห็นวันนี้ ชื่อของเจ้าจะอยู่บนกระดานนี้ตลอดไป' },
];

/* The guild master who hands out and pays bounties, standing by the board in the village square. */
TW.NPC = {
  id: 'orwin', name: 'ออร์วิน', title: 'หัวหน้ากิลด์นักล่า', x: -7.2, z: 143, facing: 2.3, talkRange: 3.4,
  greet: 'ยินดีต้อนรับสู่มอสเวล นักล่า กระดานนี้มีประกาศค้างอยู่เต็มไปหมด',
  active: 'ยังล่าไม่ครบนี่ กลับไปให้เสร็จก่อน แล้วค่อยมารับรางวัล',
  idle: 'ป่าสงบลงแล้วเพราะเจ้า แต่อสูรจะกลับมาเสมอ ล่าต่อได้ตามสบาย',
};

TW.HUNTER_NAMES = ['คีริน', 'ไลร่า', 'ธาวิน', 'เซเรน', 'โรวาน', 'อลิซา', 'กาเรธ', 'นภัส'];

/* ---------- loot & equipment ---------- */
/* Rarity tiers: drop weight, number of extra affixes, and a multiplier on the main stat. */
TW.RARITY = [
  { id: 'common', th: 'ธรรมดา', suffix: '', color: '#ebe2c9', hex: 0xebe2c9, weight: 60, affixes: 0, mult: 1.0 },
  { id: 'uncommon', th: 'อย่างดี', suffix: 'อย่างดี', color: '#7fd06a', hex: 0x7fd06a, weight: 25, affixes: 1, mult: 1.1 },
  { id: 'rare', th: 'หายาก', suffix: 'ประณีต', color: '#5aa9ff', hex: 0x5aa9ff, weight: 10, affixes: 2, mult: 1.22 },
  { id: 'epic', th: 'มหากาพย์', suffix: 'แห่งหนาม', color: '#b57bff', hex: 0xb57bff, weight: 4, affixes: 3, mult: 1.38 },
  { id: 'legendary', th: 'ตำนาน', suffix: 'แห่งธอร์นไวลด์', color: '#ff9a3c', hex: 0xff9a3c, weight: 1, affixes: 4, mult: 1.6 },
];
TW.SLOTS = [
  { id: 'weapon', th: 'อาวุธ', icon: 'sword' },
  { id: 'armor', th: 'เกราะ', icon: 'armor' },
  { id: 'trinket', th: 'เครื่องประดับ', icon: 'ring' },
];
/* Base items. main = the stat every copy has (base + perLv × item level), second = a fixed bonus line. Any class can wear anything. */
TW.ITEM_BASES = {
  weapon: [
    { id: 'blade', th: 'ดาบนักล่า', stat: 'atk', base: 3, perLv: 1.1 },
    { id: 'axe', th: 'ขวานป่า', stat: 'atk', base: 3.6, perLv: 1.2 },
    { id: 'staff', th: 'ไม้เท้าหนาม', stat: 'atk', base: 2.5, perLv: 1.0, second: { stat: 'mpRegen', base: 0.5, perLv: 0.08 } },
    { id: 'bow', th: 'ธนูไม้สน', stat: 'atk', base: 2.8, perLv: 1.05, second: { stat: 'crit', base: 1, perLv: 0.2 } },
    { id: 'daggers', th: 'มีดคู่เงา', stat: 'atk', base: 2.4, perLv: 0.95, second: { stat: 'crit', base: 2, perLv: 0.3 } },
  ],
  armor: [
    { id: 'leather', th: 'เสื้อหนัง', stat: 'def', base: 1.5, perLv: 0.5, second: { stat: 'hp', base: 8, perLv: 4 } },
    { id: 'chain', th: 'เกราะโซ่', stat: 'def', base: 2.2, perLv: 0.6, second: { stat: 'hp', base: 5, perLv: 3 } },
    { id: 'mosscloak', th: 'เสื้อคลุมมอส', stat: 'def', base: 1.0, perLv: 0.4, second: { stat: 'hp', base: 12, perLv: 5 } },
    { id: 'wolfscale', th: 'เกราะเกล็ดหมาป่า', stat: 'def', base: 2.0, perLv: 0.55, second: { stat: 'speedPct', base: 1, perLv: 0.2 } },
  ],
  trinket: [
    { id: 'ring', th: 'แหวนกิลด์', stat: 'crit', base: 2, perLv: 0.3 },
    { id: 'fangchain', th: 'สร้อยเขี้ยว', stat: 'atkPct', base: 3, perLv: 0.4 },
    { id: 'leafpin', th: 'เข็มกลัดใบไม้', stat: 'mpRegen', base: 0.6, perLv: 0.1 },
    { id: 'thornband', th: 'กำไลหนาม', stat: 'hp', base: 10, perLv: 5 },
    { id: 'sporecharm', th: 'เครื่องรางสปอร์', stat: 'speedPct', base: 2, perLv: 0.3 },
  ],
};
/* Random affixes: value = lerp(per[0], per[1], ilvl/20) × roll 0.8–1.2 */
TW.AFFIXES = [
  { id: 'atkp', stat: 'atkPct', per: [4, 12] },
  { id: 'hp', stat: 'hp', per: [10, 45] },
  { id: 'def', stat: 'def', per: [1, 4] },
  { id: 'crit', stat: 'crit', per: [2, 8] },
  { id: 'speed', stat: 'speedPct', per: [3, 10] },
  { id: 'cdr', stat: 'cdr', per: [4, 12] },
  { id: 'mpregen', stat: 'mpRegen', per: [0.5, 2] },
  { id: 'lifesteal', stat: 'lifesteal', per: [2, 6] },
  { id: 'gold', stat: 'goldPct', per: [10, 30] },
  { id: 'potion', stat: 'potionPct', per: [10, 30] },
];
/* How each stat reads on an item card. pct → shown with %, dec → one decimal. */
TW.STAT_LABELS = {
  atk: { th: 'พลังโจมตี' }, def: { th: 'ป้องกัน' }, hp: { th: 'พลังชีวิต' }, crit: { th: 'โอกาสคริติคอล', pct: true },
  atkPct: { th: 'พลังโจมตี', pct: true }, speedPct: { th: 'ความเร็วเคลื่อนที่', pct: true }, cdr: { th: 'ลดคูลดาวน์', pct: true },
  mpRegen: { th: 'ฟื้นพลังเวท/วิ', dec: true }, lifesteal: { th: 'ดูดเลือด', pct: true }, goldPct: { th: 'เหรียญที่ได้', pct: true }, potionPct: { th: 'ประสิทธิภาพยา', pct: true },
};
TW.BAG_SIZE = 20;
/* Attribute points: POINTS_PER_LEVEL each level-up, spent in the character panel.
   per = what one point gives; RESPEC_COST × level in gold resets them. */
TW.ATTRS = [
  { id: 'str', th: 'พละกำลัง', desc: '+1.2 พลังโจมตี', per: { atk: 1.2 } },
  { id: 'vit', th: 'ความอึด', desc: '+8 พลังชีวิต · +0.4 ป้องกัน', per: { hp: 8, def: 0.4 } },
  { id: 'agi', th: 'ความคล่อง', desc: '+0.6% คริติคอล · +0.8% ความเร็ว', per: { crit: 0.6, speedPct: 0.8 } },
  { id: 'int', th: 'ปัญญา', desc: '+6 พลังเวท · +0.5% ลดคูลดาวน์ · +0.12 ฟื้นเวท/วิ', per: { mp: 6, cdr: 0.5, mpRegen: 0.12 } },
];
TW.POINTS_PER_LEVEL = 3;
TW.RESPEC_COST = 30;

/* Skill trees: 3 branches × 3 tiers per class, one skill point per level, tiers unlock in order.
   skill+mod adds to that skill's numbers at cast time; skill+flag turns on an extra effect for it;
   passive adds character stats; a flag without a skill is a class-wide effect. */
TW.SKILL_POINTS_PER_LEVEL = 1;
TW.TREES = {
  warrior: [
    { id: 'blade', th: 'ดาบหนัก', nodes: [
      { id: 'w-blade-1', th: 'คมดาบ', desc: 'ฟันดาบ แรงขึ้น 20%', skill: 'slash', mod: { mult: 0.2 } },
      { id: 'w-blade-2', th: 'ฟันกว้าง', desc: 'ฟันดาบ กว้างขึ้น 40° ไกลขึ้น 0.4 ม.', skill: 'slash', mod: { arc: 40, range: 0.4 } },
      { id: 'w-blade-3', th: 'พายุเหล็ก', desc: 'หมุนดาบพายุ คูลดาวน์ −2 วิ รัศมี +1.5 ม.', skill: 'whirl', mod: { cd: -2, radius: 1.5 } },
    ] },
    { id: 'bulwark', th: 'ปราการ', nodes: [
      { id: 'w-bul-1', th: 'ผิวหนา', desc: 'พลังชีวิตสูงสุด +8%', passive: { hpPct: 8 } },
      { id: 'w-bul-2', th: 'ป้อมมั่นคง', desc: 'ป้อมปราการเหล็ก ลดความเสียหายเพิ่ม 15% นานขึ้น 2 วิ', skill: 'ironwill', mod: { reduce: 0.15, dur: 2 } },
      { id: 'w-bul-3', th: 'สะท้อนกลับ', desc: 'ขณะป้อมปราการเหล็กทำงาน สะท้อน 30% ของความเสียหายที่ได้รับ', flag: 'ironReflect' },
    ] },
    { id: 'charge', th: 'จู่โจม', nodes: [
      { id: 'w-chg-1', th: 'พุ่งไกล', desc: 'พุ่งทะลวง ไกลขึ้น 5 ม.', skill: 'charge', mod: { dist: 5 } },
      { id: 'w-chg-2', th: 'กระแทกให้มึน', desc: 'พุ่งทะลวง มึนงงนานขึ้น 0.8 วิ', skill: 'charge', mod: { stun: 0.8 } },
      { id: 'w-chg-3', th: 'เลือดนักรบ', desc: 'ดูดเลือด 5% จากทุกการโจมตี', passive: { lifesteal: 5 } },
    ] },
  ],
  mage: [
    { id: 'fire', th: 'เพลิง', nodes: [
      { id: 'm-fire-1', th: 'ไฟลุก', desc: 'ลูกไฟทำให้เป้าหมายไหม้ 3 วิ', skill: 'ember', flag: 'burn' },
      { id: 'm-fire-2', th: 'ลูกไฟใหญ่', desc: 'ลูกไฟ แรงขึ้น 30% ลูกใหญ่ขึ้น', skill: 'ember', mod: { mult: 0.3, radius: 0.35 } },
      { id: 'm-fire-3', th: 'อุกกาบาตยักษ์', desc: 'อุกกาบาตเพลิง แรงขึ้น 40% รัศมี +1 ม.', skill: 'meteor', mod: { mult: 0.4, radius: 1 } },
    ] },
    { id: 'frost', th: 'น้ำแข็ง', nodes: [
      { id: 'm-frost-1', th: 'เยือกแข็งนาน', desc: 'ลมหายใจน้ำแข็ง สโลว์นานขึ้น 2 วิ', skill: 'nova', mod: { slowDur: 2 } },
      { id: 'm-frost-2', th: 'แช่แข็ง', desc: 'ศัตรูที่โดนลมหายใจน้ำแข็งจะมึนงง 1 วิ', skill: 'nova', mod: { stun: 1 } },
      { id: 'm-frost-3', th: 'เกราะน้ำแข็ง', desc: 'ป้องกัน +6 พลังชีวิตสูงสุด +10%', passive: { def: 6, hpPct: 10 } },
    ] },
    { id: 'arcane', th: 'ปัญญาเวท', nodes: [
      { id: 'm-arc-1', th: 'กระแสเวท', desc: 'ฟื้นพลังเวท +2 ต่อวิ', passive: { mpRegen: 2 } },
      { id: 'm-arc-2', th: 'ก้าวมิติระเบิด', desc: 'ก้าวมิติ คูลดาวน์ −2 วิ และระเบิดเวทที่ปลายทาง', skill: 'blink', mod: { cd: -2 }, flag: 'blinkBlast' },
      { id: 'm-arc-3', th: 'ผู้ควบคุมเวท', desc: 'ลดคูลดาวน์ทุกสกิล 10%', passive: { cdr: 10 } },
    ] },
  ],
  ranger: [
    { id: 'marks', th: 'แม่นยำ', nodes: [
      { id: 'r-mark-1', th: 'ลูกศรคม', desc: 'ยิงธนู แรงขึ้น 20%', skill: 'arrow', mod: { mult: 0.2 } },
      { id: 'r-mark-2', th: 'ทะลุทะลวง', desc: 'ลูกศรทะลุผ่านเป้าหมายไปโดนตัวถัดไป', skill: 'arrow', flag: 'pierce' },
      { id: 'r-mark-3', th: 'ตาเหยี่ยว', desc: 'โอกาสคริติคอล +10%', passive: { crit: 10 } },
    ] },
    { id: 'volley', th: 'ห่าธนู', nodes: [
      { id: 'r-vol-1', th: 'พัดกว้าง', desc: 'ธนูพัด ยิงเพิ่ม 2 ดอก', skill: 'fan', mod: { count: 2 } },
      { id: 'r-vol-2', th: 'ฝนยาว', desc: 'ฝนธนู ตกเพิ่ม 2 ระลอก รัศมี +1.5 ม.', skill: 'rain', mod: { ticks: 2, radius: 1.5 } },
      { id: 'r-vol-3', th: 'หัวธนูอาบพิษ', desc: 'ลูกศรทุกดอกทำให้เป็นพิษ 3 วิ', flag: 'arrowPoison' },
    ] },
    { id: 'fleet', th: 'เท้าไว', nodes: [
      { id: 'r-fleet-1', th: 'วิ่งเร็ว', desc: 'ความเร็วเคลื่อนที่ +8%', passive: { speedPct: 8 } },
      { id: 'r-fleet-2', th: 'กระโดดคล่อง', desc: 'กระโดดถอย คูลดาวน์ −2 วิ และรีเซ็ตคูลดาวน์ยิงธนู', skill: 'leap', mod: { cd: -2 }, flag: 'leapReset' },
      { id: 'r-fleet-3', th: 'หลบหลีก', desc: 'กลิ้งหลบ คูลดาวน์ −0.4 วิ', passive: { dodgeCd: -0.4 } },
    ] },
  ],
  assassin: [
    { id: 'blades', th: 'คมมีด', nodes: [
      { id: 'a-bl-1', th: 'แทงลึก', desc: 'แทงคู่ แรงขึ้น 20%', skill: 'stab', mod: { mult: 0.2 } },
      { id: 'a-bl-2', th: 'เลือดไหล', desc: 'แทงคู่ทำให้เลือดไหล 3 วิ', skill: 'stab', flag: 'bleed' },
      { id: 'a-bl-3', th: 'เลือดเย็น', desc: 'ตัวคูณคริติคอล +0.3 เท่า', passive: { critMult: 0.3 } },
    ] },
    { id: 'shadow', th: 'เงา', nodes: [
      { id: 'a-sh-1', th: 'ก้าวเงาไกล', desc: 'ก้าวเงา ระยะ +6 ม.', skill: 'shadowstep', mod: { range: 6 } },
      { id: 'a-sh-2', th: 'ก้าวเงาซ้ำ', desc: 'ก้าวเงา คูลดาวน์ −2.5 วิ', skill: 'shadowstep', mod: { cd: -2.5 } },
      { id: 'a-sh-3', th: 'เงามรณะ', desc: 'อำพรางกาย นานขึ้น 2 วิ การโจมตีถัดไปแรงขึ้นอีก 0.6 เท่า', skill: 'vanish', mod: { dur: 2, bonus: 0.6 } },
    ] },
    { id: 'venom', th: 'พิษ', nodes: [
      { id: 'a-vn-1', th: 'พิษแรง', desc: 'ใบมีดพิษ พิษแรงขึ้น 50%', skill: 'venom', mod: { poisonMult: 0.175 } },
      { id: 'a-vn-2', th: 'มีดมากขึ้น', desc: 'ใบมีดพิษ ปาเพิ่ม 2 เล่ม', skill: 'venom', mod: { count: 2 } },
      { id: 'a-vn-3', th: 'พิษซึม', desc: 'ทุกการโจมตีมีโอกาส 20% ทำให้เป็นพิษ', flag: 'venomTouch' },
    ] },
  ],
};

/* Waystones: one per zone. Walking within 2.6 m wakes a stone; at any lit stone, Space lists the others. */
TW.WAYSTONES = [
  { id: 'village', zone: 'village', th: 'หินเวทมอสเวล', x: 8, z: 140 },
  { id: 'meadow', zone: 'meadow', th: 'หินเวททุ่งมอส', x: 10, z: 70 },
  { id: 'pines', zone: 'pines', th: 'หินเวทป่าสนเงา', x: 92, z: 34 },
  { id: 'mud', zone: 'mud', th: 'หินเวทค่ายโคลน', x: -100, z: 54 },
  { id: 'swamp', zone: 'swamp', th: 'หินเวทหนองสปอร์', x: -44, z: -66 },
  { id: 'ruins', zone: 'ruins', th: 'หินเวทซากวิหาร', x: 54, z: -108 },
];

/* Universal dodge roll: distance, speed (m/s → ~0.35 s of i-frames), cooldown */
TW.DODGE = { dist: 5.5, speed: 16, cd: 1.2 };

/* Elites: any non-boss monster may spawn as one (chance per spawn). Stats multiply the base
   type and one affix is rolled. drop = chance of an item (rarity boosted one tier). */
TW.ELITE = {
  chance: 0.1, hp: 3, atk: 1.6, def: 2, exp: 3, gold: 3, scale: 1.35, drop: 0.6,
  affixes: [
    { id: 'swift', th: 'ว่องไว', desc: 'เคลื่อนที่และโจมตีเร็วขึ้น', color: '#5aa9ff', hex: 0x5aa9ff, speed: 1.4, atkCd: 0.7 },
    { id: 'thorns', th: 'หนาม', desc: 'สะท้อน 25% ของความเสียหายที่ได้รับ', color: '#e4683a', hex: 0xe4683a, reflect: 0.25 },
    { id: 'regen', th: 'ฟื้นตัว', desc: 'ฟื้น 3% ต่อวิเมื่อไม่โดนตี 2 วิ', color: '#7fd06a', hex: 0x7fd06a, regen: 0.03 },
    { id: 'volatile', th: 'ระเบิด', desc: 'ระเบิดหลังตาย 0.8 วิ รัศมี 4 ม.', color: '#ff9a3c', hex: 0xff9a3c, blast: 4, blastMult: 1.5, fuse: 0.8 },
    { id: 'summoner', th: 'ผู้เรียกพวก', desc: 'เรียกพวกอีก 2 ตัวเมื่อเห็นผู้เล่น', color: '#b57bff', hex: 0xb57bff, minions: 2 },
  ],
};
TW.ITEM_DROP = 0.22; /* chance per kill; elites and bosses roll more and better */

TW.expToNext = function (level) { return 50 + (level - 1) * 45; };
TW.MAX_LEVEL = 20;
