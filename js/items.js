/* Thornwild — items: rolling loot, reading item cards, summing equipment bonuses.
   Pure data helpers (no DOM, no THREE) so game.js and ui.js share one source of truth. */
(function () {
  'use strict';
  var TW = window.TW;
  var I = {};
  var nextUid = 1;
  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  var AFFIX_BY_ID = {};
  TW.AFFIXES.forEach(function (a) { AFFIX_BY_ID[a.id] = a; });
  var BASE_BY_ID = {};
  Object.keys(TW.ITEM_BASES).forEach(function (slot) { TW.ITEM_BASES[slot].forEach(function (b) { BASE_BY_ID[b.id] = b; }); });

  /* Weighted rarity roll; boost = minimum tier index (elites 1, bosses 2). */
  I.rollRarity = function (boost) {
    var total = 0;
    TW.RARITY.forEach(function (r) { total += r.weight; });
    var x = Math.random() * total, idx = 0;
    for (var i = 0; i < TW.RARITY.length; i++) { x -= TW.RARITY[i].weight; if (x <= 0) { idx = i; break; } }
    return Math.max(idx, boost || 0);
  };

  I.roll = function (ilvl, boost, slotId, rarityIdx) {
    var slot = slotId || TW.SLOTS[Math.floor(Math.random() * TW.SLOTS.length)].id;
    var rIdx = rarityIdx == null ? I.rollRarity(boost) : rarityIdx;
    var rar = TW.RARITY[rIdx];
    var bases = TW.ITEM_BASES[slot];
    var base = bases[Math.floor(Math.random() * bases.length)];
    var lv = clamp(Math.round(ilvl), 1, 20);
    var item = {
      uid: nextUid++, slot: slot, base: base.id, rarity: rIdx, ilvl: lv,
      name: base.th + (rar.suffix ? rar.suffix : ''),
      main: { stat: base.stat, value: I.round(base.stat, (base.base + base.perLv * lv) * rar.mult * rand(0.92, 1.08)) },
      second: base.second ? { stat: base.second.stat, value: I.round(base.second.stat, (base.second.base + base.second.perLv * lv) * rar.mult) } : null,
      affixes: [],
    };
    var pool = TW.AFFIXES.filter(function (a) { return a.stat !== base.stat && !(base.second && a.stat === base.second.stat); });
    for (var n = 0; n < rar.affixes && pool.length; n++) {
      var k = Math.floor(Math.random() * pool.length), a = pool.splice(k, 1)[0];
      item.affixes.push({ id: a.id, stat: a.stat, value: I.round(a.stat, lerp(a.per[0], a.per[1], lv / 20) * rand(0.8, 1.2)) });
    }
    return item;
  };
  I.round = function (stat, v) { var L = TW.STAT_LABELS[stat]; return L && L.dec ? Math.round(v * 10) / 10 : Math.max(1, Math.round(v)); };
  I.fmt = function (stat, v, signed) {
    var L = TW.STAT_LABELS[stat] || { th: stat };
    var s = (signed && v > 0 ? '+' : '') + (L.dec ? v.toFixed(1) : Math.round(v)) + (L.pct ? '%' : '');
    return s;
  };
  I.label = function (stat) { return (TW.STAT_LABELS[stat] || { th: stat }).th; };
  I.rarity = function (item) { return TW.RARITY[item.rarity]; };
  I.slot = function (id) { return TW.SLOTS.filter(function (s) { return s.id === id; })[0]; };

  /* +N upgrades scale the main and second line. */
  I.plusMult = function (item) { return 1 + TW.UPGRADE.perLevel * (item.plus || 0); };
  I.displayName = function (item) { return item.name + (item.plus ? ' +' + item.plus : ''); };
  /* Every stat line on an item, main first. */
  I.lines = function (item) {
    var pm = I.plusMult(item), plus = item.plus || 0;
    /* percentage growth, but never less than +1 per level on integer stats so low-level gear still moves */
    var up = function (stat, base) {
      var v = I.round(stat, base * pm), L = TW.STAT_LABELS[stat];
      if (plus && !(L && L.dec)) v = Math.max(v, I.round(stat, base) + plus);
      return v;
    };
    var out = [{ stat: item.main.stat, value: up(item.main.stat, item.main.value), main: true }];
    if (item.second) out.push({ stat: item.second.stat, value: up(item.second.stat, item.second.value) });
    item.affixes.forEach(function (a) { out.push({ stat: a.stat, value: a.value }); });
    return out;
  };
  /* Sell price at the merchant. */
  I.value = function (item) {
    var rm = [1, 2, 4, 8, 16][item.rarity] || 1;
    return Math.round((6 + item.ilvl * 3) * rm * (1 + 0.25 * (item.plus || 0)));
  };
  /* What the next upgrade level costs, or null at max. */
  I.upgradeCost = function (item) {
    var U = TW.UPGRADE, next = (item.plus || 0) + 1;
    if (next > U.max) return null;
    var mats = {};
    mats[U.material[item.slot]] = U.matPerLevel * next;
    if (next === U.heartAt) mats.heart = 1;
    return { next: next, gold: Math.round(U.gold * next * (1 + item.ilvl / 5)), mats: mats };
  };
  I.canUpgrade = function (item, gold, materials) {
    var c = I.upgradeCost(item);
    if (!c || gold < c.gold) return false;
    return Object.keys(c.mats).every(function (k) { return (materials[k] || 0) >= c.mats[k]; });
  };
  /* Stat totals for one item, keyed by stat id. */
  I.totals = function (item) {
    var t = {};
    if (!item) return t;
    I.lines(item).forEach(function (l) { t[l.stat] = (t[l.stat] || 0) + l.value; });
    return t;
  };
  var ZERO = { atk: 0, atkPct: 0, hp: 0, def: 0, crit: 0, speedPct: 0, cdr: 0, mpRegen: 0, lifesteal: 0, goldPct: 0, potionPct: 0 };
  /* Sum of everything worn. */
  I.bonus = function (equip) {
    var b = Object.assign({}, ZERO);
    TW.SLOTS.forEach(function (s) {
      var t = I.totals(equip[s.id]);
      Object.keys(t).forEach(function (k) { b[k] = (b[k] || 0) + t[k]; });
    });
    b.cdr = Math.min(40, b.cdr);
    return b;
  };
  /* Differences if `item` replaced `current` (both same slot). */
  I.compare = function (item, current) {
    var a = I.totals(item), c = I.totals(current), keys = {}, out = [];
    Object.keys(a).forEach(function (k) { keys[k] = 1; });
    Object.keys(c).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (k) { var d = (a[k] || 0) - (c[k] || 0); if (Math.abs(d) > 0.001) out.push({ stat: k, diff: Math.round(d * 10) / 10 }); });
    return out;
  };
  /* Revive uids after a save load so new drops never collide. */
  I.adoptUids = function (items) {
    items.forEach(function (it) { if (it && it.uid >= nextUid) nextUid = it.uid + 1; });
  };
  I.valid = function (it) {
    return !!(it && BASE_BY_ID[it.base] && I.slot(it.slot) && TW.RARITY[it.rarity] && it.main && typeof it.main.value === 'number');
  };
  TW.Items = I;
})();
