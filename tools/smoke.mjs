// Headless smoke test: runs the whole game (data → models → world → ui → game) in Node
// against a tiny fake DOM and a stubbed WebGLRenderer, so runtime exceptions in the
// game loop surface in seconds instead of needing a browser.
//
//   node tools/smoke.mjs            # title → class select → every class plays ~40 s with auto skills
//   node tools/smoke.mjs mage 900   # one class straight into the game for 900 frames
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const cache = new URL('.cache/three.min.js', root);
if (!existsSync(cache)) {
  mkdirSync(new URL('.cache/', root), { recursive: true });
  const r = await fetch('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
  if (!r.ok) throw new Error('could not download three.js: ' + r.status);
  writeFileSync(cache, await r.text());
}

/* ---------------- fake DOM ---------------- */
const byId = new Map();
function makeCtx2d() {
  const base = {
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
    measureText: () => ({ width: 1 }),
  };
  return new Proxy(base, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
}
class ClassList {
  constructor() { this.s = new Set(); }
  add(...c) { c.forEach((x) => this.s.add(x)); }
  remove(...c) { c.forEach((x) => this.s.delete(x)); }
  toggle(c, f) { if (f === undefined) f = !this.s.has(c); f ? this.s.add(c) : this.s.delete(c); return f; }
  contains(c) { return this.s.has(c); }
}
class El {
  constructor(tag, attrs = {}) {
    this.tagName = tag.toUpperCase();
    this.attrs = attrs;
    this.id = attrs.id || '';
    this.classList = new ClassList();
    (attrs.class || '').split(/\s+/).filter(Boolean).forEach((c) => this.classList.add(c));
    const self = this;
    this.dataset = new Proxy({}, { set(t, k, v) { t[k] = String(v); self.attrs['data-' + String(k).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())] = String(v); return true; } });
    for (const k in attrs) if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = attrs[k];
    this.hidden = 'hidden' in attrs;
    this.children = [];
    this.parentNode = null;
    this.listeners = {};
    this.style = new Proxy({}, { get: (t, k) => (k === 'setProperty' ? (n, v) => { t[n] = v; } : t[k]), set: (t, k, v) => { t[k] = v; return true; } });
    this.value = attrs.value || '';
    this._text = '';
    this.width = +attrs.width || 176; this.height = +attrs.height || 176; this.offsetWidth = 100;
    if (this.id) byId.set(this.id, this);
  }
  get textContent() { return this._text; } set textContent(v) { this._text = String(v); }
  get innerHTML() { return this._html || ''; }
  set innerHTML(v) { this._html = String(v); this.children.forEach(unregister); this.children = []; parseInto(this, this._html); }
  appendChild(c) { c.parentNode = this; this.children.push(c); register(c); return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; unregister(c); }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  get firstChild() { return this.children[0] || null; }
  addEventListener(n, f) { (this.listeners[n] ||= []).push(f); }
  removeEventListener() {}
  dispatch(n, ev = {}) { ev.target ||= this; ev.preventDefault ||= () => {}; (this.listeners[n] || []).forEach((f) => f(ev)); }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'hidden') this.hidden = true; }
  getAttribute(k) { return this.attrs[k]; }
  matches(sel) { return matchSel(this, sel); }
  closest(sel) { let e = this; while (e) { if (e instanceof El && matchSel(e, sel)) return e; e = e.parentNode; } return null; }
  querySelector(sel) { return query(this, sel)[0] || null; }
  querySelectorAll(sel) { return query(this, sel); }
  getBoundingClientRect() { return { left: 300, top: 80, width: 640, height: 560 }; }
  getContext() { return makeCtx2d(); }
  setPointerCapture() {} releasePointerCapture() {} focus() {} blur() {} contains() { return false; }
}
function register(e) { if (e.id) byId.set(e.id, e); e.children.forEach(register); }
function unregister(e) { if (e.id && byId.get(e.id) === e) byId.delete(e.id); e.children.forEach(unregister); }
function matchSel(el, sel) {
  return sel.split(',').some((s) => {
    s = s.trim();
    let ok = true;
    s.replace(/(#[\w-]+)|(\.[\w-]+)|(\[[^\]]+\])|(:not\(\[hidden\]\))|(^[a-z0-9]+)/gi, (m, id, cls, attr, nothidden, tag) => {
      if (id && el.id !== id.slice(1)) ok = false;
      if (cls && !el.classList.contains(cls.slice(1))) ok = false;
      if (attr) { const [, k, v] = attr.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/) || []; if (!(k in el.attrs) || (v !== undefined && el.attrs[k] !== v)) ok = false; }
      if (nothidden && el.hidden) ok = false;
      if (tag && el.tagName !== tag.toUpperCase()) ok = false;
      return '';
    });
    return ok;
  });
}
function query(rootEl, sel) {
  const out = [];
  (function walk(e) { e.children.forEach((c) => { if (matchSel(c, sel)) out.push(c); walk(c); }); })(rootEl);
  return out;
}
const VOID = new Set(['meta', 'link', 'input', 'br', 'img', 'path', 'circle']);
function parseInto(parent, html) {
  const re = /<(\/?)([a-zA-Z0-9]+)([^>]*?)(\/?)>/g;
  const stack = [parent];
  let m;
  while ((m = re.exec(html))) {
    const [, close, tag, rawAttrs, selfClose] = m;
    if (close) { if (stack.length > 1) stack.pop(); continue; }
    const attrs = {};
    rawAttrs.replace(/([\w:-]+)(?:="([^"]*)")?/g, (_, k, v) => { attrs[k] = v === undefined ? '' : v; return ''; });
    const el = new El(tag, attrs);
    stack[stack.length - 1].appendChild(el);
    const closesItself = selfClose || (VOID.has(tag.toLowerCase()) && !html.slice(re.lastIndex, re.lastIndex + 8).match(/^\s*<\/i>/));
    if (!closesItself) stack.push(el);
  }
}

let now = 0;
const rafQueue = [], timers = [];
const body = new El('body');
const html = new El('html');
html.appendChild(body);
const indexHtml = read('index.html');
parseInto(body, indexHtml.match(/<!-- BUILD:BODY START -->([\s\S]*?)<script/)[1]);
const store = new Map();
const document = {
  body, documentElement: html, hidden: false,
  getElementById: (id) => byId.get(id) || null,
  createElement: (tag) => new El(tag),
  querySelector: (s) => query(html, s)[0] || null,
  querySelectorAll: (s) => query(html, s),
  addEventListener() {}, removeEventListener() {},
};
const sandbox = {
  console, document,
  performance: { now: () => now },
  requestAnimationFrame: (cb) => rafQueue.push(cb),
  setTimeout: (fn, ms) => timers.push({ t: now + (ms || 0), fn }),
  clearTimeout() {},
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  addEventListener(n, f) { (sandbox.__l[n] ||= []).push(f); }, removeEventListener() {}, __l: {},
  location: { search: '' },
  localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
  navigator: { userAgent: 'node', hardwareConcurrency: 8 },
  screen: { orientation: { lock: () => Promise.resolve() } },
  crypto: { randomUUID: () => 'smoke-uuid' },
};
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
const run = (name, src) => vm.runInContext(src, sandbox, { filename: name });

run('three.min.js', readFileSync(cache, 'utf8'));
sandbox.THREE.WebGLRenderer = function () {
  this.domElement = byId.get('scene');
  this.shadowMap = { enabled: false, type: 0 };
  this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; this.getContext = () => ({});
};

/* ---------------- drive ---------------- */
const failures = [];
function frame(n, label) {
  for (let i = 0; i < n; i++) {
    now += 16.7;
    const cbs = rafQueue.splice(0);
    for (const cb of cbs) { try { cb(now); } catch (e) { failures.push(label + ' frame ' + i + ': ' + (e.stack || e)); rafQueue.push(cb); if (failures.length > 8) return; } }
    for (let t = timers.length - 1; t >= 0; t--) if (timers[t].t <= now) { const fn = timers.splice(t, 1)[0].fn; try { fn(); } catch (e) { failures.push(label + ' timer: ' + (e.stack || e)); } }
  }
}
function key(code, up) { (sandbox.__l[up ? 'keyup' : 'keydown'] || []).forEach((f) => f({ code, key: code, target: body, preventDefault() {}, repeat: false })); }
function click(id) { const el = byId.get(id); if (!el) throw new Error('no element #' + id); el.dispatch('click', { target: el }); }
const acts = () => byId.get('dlg-actions').children.map((c) => c.dataset.act);
function dlg(act) {
  const box = byId.get('dlg-actions');
  const b = box.children.find((c) => c.dataset.act === act);
  if (!b) throw new Error('no dialog button "' + act + '" (have: ' + acts().join(',') + ')');
  box.dispatch('click', { target: b });
}

const onlyClass = process.argv[2], onlyFrames = +(process.argv[3] || 900);
if (onlyClass && onlyClass !== 'flow') sandbox.location.search = '?class=' + onlyClass + '&auto=1';
for (const f of ['js/data.js', 'js/items.js', 'js/models.js', 'js/world.js', 'js/ui.js', 'js/game.js']) run(f, read(f));

const G = sandbox.TW.Game;
const expect = (cond, msg) => { if (!cond) failures.push('assert: ' + msg); };
try {
  if (onlyClass && onlyClass !== 'flow') {
    frame(onlyFrames, onlyClass);
    expect(G.state.mode === 'game', 'autostart entered the game');
    expect(G.state.stats.kills > 0, 'auto-play killed at least one monster (kills=' + G.state.stats.kills + ')');
    expect(G.player().level >= 1 && G.player().hp > 0, 'player alive with hp ' + G.player().hp);
  } else {
    frame(120, 'title');
    expect(G.state.mode === 'title', 'boots to title');
    click('btn-howto'); frame(5, 'howto'); document.querySelector('[data-close]').dispatch('click');
    click('btn-start'); frame(60, 'class');
    expect(G.state.mode === 'class', 'start button opens class select');
    for (const c of sandbox.TW.CLASSES) {
      const lic = document.querySelector('[data-cls="' + c.id + '"]');
      byId.get('class-list').dispatch('click', { target: lic });
      frame(40, 'preview ' + c.id);
      expect(G.state.cls === c.id, 'preview switched to ' + c.id);
      byId.get('hunter-name').value = 'ทดสอบ ' + c.id;
      byId.get('oath-form').dispatch('submit');
      expect(G.state.mode === 'game' && G.player().cls.id === c.id, 'oath form starts the game as ' + c.id);
      const p = G.player(), npc = G.npc();
      G.state.debugAuto = false;
      /* bounties come from the guild master: walk up, talk, accept */
      expect(G.state.quest.state === 'available', 'quest starts unaccepted');
      G.teleport(npc.pos.x + 1.6, npc.pos.z + 1.6); frame(3, 'to npc');
      expect(byId.get('npc-label').classList.contains('near'), 'name tag turns into a talk prompt in range');
      key('Space'); frame(3, 'talk');
      expect(!byId.get('dialog').hidden, 'Space opens the guild master dialog');
      dlg('accept'); frame(3, 'accept');
      expect(G.state.quest.state === 'active' && G.state.quest.idx === 0, 'accepting makes the first bounty active');
      dlg('close'); frame(2, 'close');
      expect(byId.get('dialog').hidden, 'dialog closes');
      G.teleport(2, 142); frame(2, 'back to the square');
      /* loot: a rare drop on the ground → walk over → bag → equip → stats move */
      G.debugDrop(p.pos.x + 4, p.pos.z, 3, 2); frame(2, 'drop');
      expect(G.pickups().length === 1, 'an item pickup spawned (' + G.pickups().length + ')');
      G.teleport(p.pos.x + 4, p.pos.z); frame(5, 'pick up');
      expect(G.inventory().length === 1 && G.pickups().length === 0, 'walking over loot puts it in the bag');
      key('KeyI'); frame(2, 'open bag');
      expect(!byId.get('inv').hidden && G.state.panel === 'inventory', 'I opens the inventory and pauses');
      const it = G.inventory()[0];
      const statsBefore = JSON.stringify([p.atk, p.maxHp, p.def, p.crit, p.speed, p.bonus]);
      byId.get('inv').dispatch('click', { target: query(byId.get('bag-grid'), '[data-uid="' + it.uid + '"]')[0] }); frame(1, 'select');
      const equipBtn = query(byId.get('item-card'), '[data-act="equip"]')[0];
      expect(!!equipBtn, 'selecting a bag item shows the equip button');
      byId.get('inv').dispatch('click', { target: equipBtn }); frame(1, 'equip');
      expect(G.equip()[it.slot] && G.equip()[it.slot].uid === it.uid && G.inventory().length === 0, 'equip moves the item into its slot');
      expect(JSON.stringify([p.atk, p.maxHp, p.def, p.crit, p.speed, p.bonus]) !== statsBefore, 'equipping changes the hunter stats');
      byId.get('inv').dispatch('click', { target: query(byId.get('equip-slots'), '[data-equip="' + it.slot + '"]')[0] }); frame(1, 'select worn');
      const unequipBtn = query(byId.get('item-card'), '[data-act="unequip"]')[0];
      expect(!!unequipBtn, 'selecting a worn item shows the unequip button');
      /* attribute points: spend on strength, then buy them back */
      p.points = 3; p.gold = 500; byId.get('inv').dispatch('click', { target: query(byId.get('equip-slots'), '[data-equip="' + it.slot + '"]')[0] }); frame(1, 'rerender');
      const atkBeforePts = p.atk;
      byId.get('inv').dispatch('click', { target: query(byId.get('attrs'), '[data-attr="str"]')[0] }); frame(1, 'spend');
      expect(p.attrs.str === 1 && p.points === 2 && p.atk > atkBeforePts, 'a strength point raises attack and spends a point');
      byId.get('inv').dispatch('click', { target: query(byId.get('attrs'), '[data-act="respec"]')[0] }); frame(1, 'respec');
      expect(p.attrs.str === 0 && p.points === 3 && p.gold === 500 - sandbox.TW.RESPEC_COST * p.level, 'respec refunds points for gold');
      expect(JSON.parse(store.get('tw.save.v1')).points === 3, 'points are saved');
      /* skill tree: K switches tabs, tier 1 unlocks and changes the skill numbers, tier 3 stays locked, respec refunds */
      p.skillPoints = 2;
      key('KeyK'); frame(1, 'skills tab');
      expect(!byId.get('tab-skills').hidden && byId.get('tab-char').hidden && G.state.panelTab === 'skills', 'K switches the open panel to the skill tree');
      const tree = sandbox.TW.TREES[c.id], first = tree[0].nodes[0], third = tree[0].nodes[2];
      const skillOf = (id) => c.skills.findIndex((s) => s.id === id);
      const baseSkill = first.skill ? JSON.stringify(G.eff(skillOf(first.skill))) : null;
      byId.get('inv').dispatch('click', { target: query(byId.get('skill-tree'), '[data-node="' + first.id + '"]')[0] }); frame(1, 'unlock');
      expect(p.skills.unlocked[first.id] && p.skillPoints === 1, 'tier-1 node unlocks for one point');
      if (baseSkill) expect(JSON.stringify(G.eff(skillOf(first.skill))) !== baseSkill, 'the unlocked node changes the effective skill');
      expect(query(byId.get('skill-tree'), '[data-node="' + third.id + '"]').length === 0, 'tier 3 has no unlock button while tier 2 is locked');
      G.unlockNode(third.id); frame(1, 'illegal unlock');
      expect(!p.skills.unlocked[third.id] && p.skillPoints === 1, 'unlocking out of order is refused');
      p.gold = 500;
      byId.get('inv').dispatch('click', { target: query(byId.get('tab-skills'), '[data-act="respec-skills"]')[0] }); frame(1, 'respec skills');
      expect(!p.skills.unlocked[first.id] && p.skillPoints === 2, 'skill respec refunds the point');
      expect(JSON.parse(store.get('tw.save.v1')).skillPoints === 2, 'skill points are saved');
      key('KeyI'); frame(1, 'char tab');
      expect(!byId.get('tab-char').hidden, 'I switches back to the character tab');
      key('KeyI'); frame(2, 'close bag');
      expect(byId.get('inv').hidden && !G.state.panel, 'I closes the inventory');
      /* mouse: left click walks to the cursor, right click attacks */
      const scene = byId.get('scene');
      scene.dispatch('pointerdown', { button: 0, pointerType: 'mouse', pointerId: 1, clientX: 640, clientY: 120 });
      scene.dispatch('pointerup', { button: 0, pointerType: 'mouse', pointerId: 1, clientX: 640, clientY: 120 });
      expect(!!p.moveTo, 'left click sets a walk target');
      const zBefore = p.pos.z; frame(90, 'walk by click');
      expect(p.pos.z < zBefore - 3, 'hunter walks toward the clicked ground (z ' + zBefore.toFixed(1) + ' → ' + p.pos.z.toFixed(1) + ')');
      scene.dispatch('pointerdown', { button: 2, pointerType: 'mouse', pointerId: 1, clientX: 640, clientY: 200 }); frame(3, 'right click');
      expect(p.cds[0] > 0 && !p.moveTo, 'right click fires the basic attack and stops walking');
      scene.dispatch('pointerup', { button: 2, pointerType: 'mouse', pointerId: 1, clientX: 640, clientY: 200 });
      G.teleport(2, 142); frame(2, 'reset');
      /* dodge roll: Shift dashes with i-frames and starts a cooldown */
      key('KeyW'); key('ShiftLeft'); frame(1, 'dodge');
      expect(!!p.dash && p.dodgeCd > 0, 'Shift starts a dodge roll with a cooldown');
      const rollFrom = p.pos.z; frame(25, 'rolling'); key('KeyW', true);
      expect(!p.dash && rollFrom - p.pos.z > 4, 'the roll carried the hunter ~5 m (' + (rollFrom - p.pos.z).toFixed(1) + ')');
      key('ShiftLeft'); frame(1, 'dodge again');
      expect(!p.dash, 'a second Shift during cooldown does nothing');
      G.teleport(2, 142); frame(80, 'cooldown');
      /* elites: thorns reflect, volatile explodes after death, summoner calls minions */
      const el = G.monsters().find((m) => m.type === 'slime' && m.alive && !m.elite);
      G.makeElite(el, 'thorns'); frame(1, 'elite');
      expect(el.elite && el.def.hp === Math.round(sandbox.TW.MONSTERS.slime.hp * sandbox.TW.ELITE.hp) && el.eliteName.length > 0, 'elite slime gets tripled hp and a name');
      G.teleport(el.pos.x + 1.5, el.pos.z); frame(2, 'beside elite');
      const hpBefore = p.hp;
      G.hit(el, 20); frame(2, 'hit thorns');
      expect(p.hp < hpBefore, 'thorns reflected damage to the hunter');
      G.makeElite(el, 'volatile'); G.hit(el, 99999); frame(3, 'kill volatile');
      const hpBeforeBlast = p.hp; frame(70, 'fuse');
      expect(p.hp < hpBeforeBlast, 'volatile elite blast hurt the hunter standing on it');
      const el2 = G.monsters().find((m) => m.type === 'slime' && m.alive && !m.elite && m !== el);
      const countBefore = G.monsters().length;
      G.makeElite(el2, 'summoner'); el2.state = 'idle'; G.teleport(el2.pos.x + 3, el2.pos.z); frame(30, 'summon');
      expect(G.monsters().length >= countBefore + 2 && el2.summoned, 'summoner elite called two minions (' + (G.monsters().length - countBefore) + ' new)');
      G.hit(el2, 99999); frame(2, 'kill summoner');
      G.teleport(2, 142); frame(60, 'settle');
      /* waystones: the village stone is known, walking to the meadow stone wakes it, Space travels back */
      const stones = G.waystones();
      const villageStone = stones.find((w) => w.def.id === 'village'), meadowStone = stones.find((w) => w.def.id === 'meadow');
      expect(villageStone.lit && !meadowStone.lit, 'only the village waystone starts lit');
      G.teleport(meadowStone.def.x + 1.5, meadowStone.def.z); frame(20, 'wake stone');
      expect(meadowStone.lit && G.state.waystones.meadow, 'walking up to a waystone wakes it');
      key('Space'); frame(2, 'travel dialog');
      expect(!byId.get('dialog').hidden && acts().includes('travel:village'), 'Space at a lit stone lists the other lit stones');
      dlg('travel:village'); frame(3, 'travel');
      expect(byId.get('dialog').hidden && Math.hypot(p.pos.x - villageStone.def.x, p.pos.z - villageStone.def.z) < 4, 'travelling lands beside the village stone');
      expect((JSON.parse(store.get('tw.save.v1')).waystones || []).includes('meadow'), 'lit waystones are saved');
      G.teleport(2, 142); frame(10, 'back');
      /* merchant: sell a common drop, buy a potion, brew one from jelly */
      const mara = G.npcs()[1];
      G.debugDrop(p.pos.x + 4, p.pos.z, 2, 0); frame(2, 'drop common'); G.teleport(p.pos.x + 4, p.pos.z); frame(4, 'pick common');
      expect(G.inventory().some((it) => it.rarity === 0), 'a common item is in the bag');
      G.teleport(mara.pos.x + 1.5, mara.pos.z); frame(2, 'to merchant'); key('Space'); frame(2, 'shop');
      expect(G.state.panel === 'shop' && !byId.get('shop').hidden, 'Space at the merchant opens the shop');
      const goldB = p.gold, potB = p.potions;
      byId.get('shop').dispatch('click', { target: query(byId.get('shop-actions'), '[data-act="sell-common"]')[0] }); frame(1, 'sell');
      expect(p.gold > goldB && !G.inventory().some((it) => it.rarity === 0), 'selling commons pays gold and empties them from the bag');
      p.gold = 1000;
      byId.get('shop').dispatch('click', { target: query(byId.get('shop-offers'), '[data-act="buy-potion"]')[0] }); frame(1, 'buy');
      expect(p.potions === potB + 1 && p.gold === 1000 - sandbox.TW.SHOP.potionPrice, 'buying a potion costs its price');
      const jellyB = G.materials().jelly || 0;
      G.debugMaterial('jelly', 3);
      byId.get('shop').dispatch('click', { target: query(byId.get('shop-offers'), '[data-act="brew"]')[0] }); frame(1, 'brew');
      expect(p.potions === potB + 2 && (G.materials().jelly || 0) === jellyB, 'brewing turns three jelly into a potion');
      key('Escape'); frame(1, 'close shop');
      expect(!G.state.panel && byId.get('shop').hidden, 'Escape closes the shop');
      /* smith: upgrade the worn item to +1 */
      const goth = G.npcs()[2];
      G.teleport(goth.pos.x + 1.5, goth.pos.z); frame(2, 'to smith'); key('Space'); frame(2, 'smith');
      expect(G.state.panel === 'smith' && !byId.get('smith').hidden, 'Space at the smith opens the forge');
      const wornSlot = Object.keys(G.equip()).find((k) => G.equip()[k]);
      const need = sandbox.TW.Items.upgradeCost(G.equip()[wornSlot]);
      Object.keys(need.mats).forEach((k) => G.debugMaterial(k, need.mats[k])); p.gold = 5000;
      byId.get('smith').dispatch('click', { target: query(byId.get('smith-grid'), '[data-equip="' + wornSlot + '"]')[0] }); frame(1, 'select worn');
      expect(query(byId.get('smith-card'), '[data-act="upgrade"]').length === 1, 'selecting a worn item shows the upgrade button');
      const statB = JSON.stringify([p.atk, p.maxHp, p.def, p.crit, p.speed]);
      byId.get('smith').dispatch('click', { target: query(byId.get('smith-card'), '[data-act="upgrade"]')[0] }); frame(1, 'upgrade');
      expect(G.equip()[wornSlot].plus === 1 && JSON.stringify([p.atk, p.maxHp, p.def, p.crit, p.speed]) !== statB, 'upgrading a worn item to +1 raises its stats');
      expect(JSON.parse(store.get('tw.save.v1')).equip[wornSlot].plus === 1, 'the upgrade is saved');
      key('Escape'); frame(1, 'close smith');
      G.teleport(2, 142); frame(5, 'back');
      G.state.debugAuto = true;
      key('KeyW'); frame(240, 'play ' + c.id); key('KeyW', true);
      expect(p.pos.z < 140, c.id + ' walked north (z=' + p.pos.z.toFixed(1) + ')');
      /* spawns are random, so put the hunter beside a slime before judging combat */
      const slime = G.monsters().find((m) => m.type === 'slime' && m.alive && m.zone.id === 'meadow');
      G.teleport(slime.pos.x + 3.5, slime.pos.z + 3.5);
      key('KeyA'); key('Digit1'); frame(120, 'play ' + c.id); key('KeyA', true);
      key('Digit2'); key('Digit3'); frame(10, 'play ' + c.id);
      const potBeforeF = p.potions; key('KeyF'); frame(2, 'potion');
      expect(p.potions === potBeforeF - 1 && p.potionCd > 0, c.id + ' F drinks a potion');
      frame(388, 'play ' + c.id);
      const engaged = G.monsters().some((m) => m.state === 'chase' || m.state === 'windup' || m.hp < m.maxHp || !m.alive);
      const nearest = Math.min(...G.monsters().filter((m) => m.alive).map((m) => Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z)));
      expect(engaged, c.id + ' monsters reacted to the player (player at ' + p.pos.x.toFixed(1) + ',' + p.pos.z.toFixed(1) + ', nearest monster ' + nearest.toFixed(1) + ' m, kills ' + G.state.stats.kills + ')');
      key('Escape'); frame(10, 'pause ' + c.id);
      expect(G.state.paused && !byId.get('ov-pause').hidden, 'escape pauses');
      click('btn-resume'); frame(30, 'resume ' + c.id);
      expect(!G.state.paused, 'resume unpauses');
      /* finish the bounty and hand it in at the guild master */
      G.state.debugAuto = false;
      G.forceQuestComplete(); frame(2, 'complete');
      expect(G.state.quest.state === 'complete', 'bounty marked complete once the count is reached');
      const goldBefore = p.gold, idxBefore = G.state.quest.idx;
      G.teleport(npc.pos.x + 1.6, npc.pos.z + 1.6); frame(2, 'to npc'); key('Space'); frame(3, 'talk'); dlg('turnin'); frame(3, 'turn in');
      expect(G.state.quest.idx === idxBefore + 1 && G.state.quest.state === 'available' && p.gold > goldBefore, 'turn-in pays and offers the next bounty');
      expect(!byId.get('dialog').hidden && acts().includes('accept'), 'the next bounty is offered in the same conversation');
      dlg('close'); frame(2, 'close');
      G.state.debugAuto = true;
      G.state.debugAuto = false;
      G.forceDeath(); frame(120, 'death ' + c.id);
      expect(p.dead && !byId.get('ov-death').hidden, 'death overlay shows');
      click('btn-respawn'); frame(60, 'respawn ' + c.id);
      expect(!p.dead && p.hp === p.maxHp && Math.abs(p.pos.z - 144) < 3, 'respawn at camp with full hp (z=' + p.pos.z.toFixed(1) + ' hp=' + p.hp + ')');
      G.state.debugAuto = true;
      G.forceBossKill(); frame(240, 'victory ' + c.id);
      expect(!byId.get('ov-victory').hidden, 'boss kill shows victory');
      click('btn-continue'); frame(30, 'continue ' + c.id);
      const saved = JSON.parse(store.get('tw.save.v1') || 'null');
      expect(saved && saved.cls === c.id && saved.name === 'ทดสอบ ' + c.id && saved.token, c.id + ': save written with class, name, token');
      click('btn-pause'); click('btn-quit'); frame(30, 'title again');
      expect(G.state.mode === 'title' && !byId.get('continue-card').hidden, 'title shows the continue card');
      click('btn-continue-save'); frame(120, 'continue-save ' + c.id);
      expect(G.state.mode === 'game' && G.player().name === 'ทดสอบ ' + c.id && G.player().level === saved.level, 'continue restores the saved hunter');
      click('btn-pause'); click('btn-quit'); frame(30, 'title again');
      click('btn-new-save'); click('btn-new-save'); frame(5, 'delete save');
      expect(!store.has('tw.save.v1') && byId.get('continue-card').hidden, 'double-tap deletes the save');
      click('btn-start'); frame(20, 'class again');
    }
  }
} catch (e) { failures.push('driver: ' + (e.stack || e)); }

if (failures.length) { console.error('SMOKE FAILED\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
console.log('smoke ok:', onlyClass ? onlyClass + ' ' + onlyFrames + ' frames' : 'full flow, all classes');
