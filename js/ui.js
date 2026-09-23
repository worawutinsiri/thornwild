/* Thornwild — DOM interface: screens, HUD, floating combat text, minimap, touch.
   Talks to the game only through UI.on(event, fn) hooks so the two stay separate. */
(function () {
  'use strict';
  var TW = window.TW;
  var $ = function (id) { return document.getElementById(id); };
  var UI = {};
  var hooks = {};
  function emit(name) { var f = hooks[name]; if (f) f.apply(null, Array.prototype.slice.call(arguments, 1)); }
  UI.on = function (name, fn) { hooks[name] = fn; };

  /* ---------- icons (24×24 stroke) ---------- */
  var ICONS = {
    slash: '<path d="M5 19Q17 17 19 5"/><path d="M9 20Q18 18 20 11"/>',
    whirl: '<path d="M12 4a8 8 0 1 1-7.4 5"/><path d="M4 4v5h5"/>',
    charge: '<path d="M4 6l6 6-6 6"/><path d="M11 6l6 6-6 6"/><path d="M19 6v12"/>',
    shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>',
    ember: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-6 1 1 1.5 2 1.5 3 1-2 1.5-4 1.5-7z"/>',
    nova: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9 4.5l3 2 3-2M9 19.5l3-2 3 2M4 10l3 1 0 3M20 10l-3 1 0 3"/>',
    meteor: '<path d="M14 4l-6 6M20 4L10 14M20 10l-6 6"/><circle cx="7" cy="17" r="3.5"/>',
    blink: '<path d="M3 12h2M8 12h2M13 12h6"/><path d="M16 8l4 4-4 4"/>',
    arrow: '<path d="M4 20L20 4M20 4h-6M20 4v6M4 20v-4M4 20h4"/>',
    fan: '<path d="M12 20L5 6M12 20V4M12 20l7-14"/><path d="M4 9l1-3 3 0M9 6l3-2 3 2M16 6l3 0 1 3"/>',
    rain: '<path d="M6 3v7M12 3v9M18 3v7M9 13v8M15 13v8"/>',
    leap: '<path d="M19 18C19 8 9 6 5 12"/><path d="M5 12V7M5 12h5"/>',
    stab: '<path d="M5 19l10-10"/><path d="M15 9l4-5-5 4"/><path d="M7 13l4 4M4 20l2-2"/>',
    moon: '<path d="M15 4a8 8 0 1 0 5 13 6 6 0 1 1-5-13z"/>',
    venom: '<path d="M12 3s-7 8-7 12a7 7 0 0 0 14 0c0-4-7-12-7-12z"/><path d="M9 15a3 3 0 0 0 3 3"/>',
    vanish: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><path d="M4 20L20 4"/>',
    potion: '<path d="M9 3h6M10 3v5l-4 6a5 5 0 0 0 4.3 7h3.4A5 5 0 0 0 18 14l-4-6V3"/><path d="M7.5 14h9"/>',
    sword: '<path d="M12 2v14M8 16h8M12 16v5M10 4l2-2 2 2"/>',
    star: '<path d="M12 10v12M12 2l2 3-2 3-2-3z"/><path d="M6 5h2M16 5h2M8 9l-1 1M16 9l1 1"/>',
    bow: '<path d="M7 3c10 4 10 14 0 18M7 3v18M4 12h14M18 12l-3-2M18 12l-3 2"/>',
    daggers: '<path d="M5 3l9 11M19 3l-9 11M8 13l3 3M16 13l-3 3M12 16l-3 5M12 16l3 5"/>',
    fist: '<path d="M7 12V8.5a1.5 1.5 0 0 1 3 0V11M10 11V6.5a1.5 1.5 0 0 1 3 0V11M13 11V7.5a1.5 1.5 0 0 1 3 0V12"/><path d="M16 12a2 2 0 0 1 4 0v3c0 4-3 6-7 6h-1c-3 0-5-2-6-5l-1.5-3a1.5 1.5 0 0 1 2.6-1.5L8 13"/>',
    beam: '<path d="M3 12h12M15 8l5 4-5 4"/><path d="M4 8l2 1.2M4 16l2-1.2"/>',
    gravity: '<circle cx="12" cy="12" r="2.5"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.5 5.5L8 8M18.5 5.5L16 8M5.5 18.5L8 16M18.5 18.5L16 16"/>',
    snap: '<path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5L19 19M19 5l-3.5 3.5M8.5 15.5L5 19"/>',
  };
  function svg(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }
  UI.svg = svg;
  var SIGILS = { warrior: 'sword', mage: 'star', ranger: 'bow', assassin: 'daggers', thanos: 'fist' };
  function hex(c) { return '#' + ('000000' + c.toString(16)).slice(-6); }

  var state = { cls: 'warrior', touch: false };
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  /* ---------- init ---------- */
  UI.init = function () {
    var html = '';
    Object.keys(TW.MONSTERS).forEach(function (k) {
      var m = TW.MONSTERS[k];
      html += '<li><span class="rank" data-rank="' + m.rank + '">' + m.rank + '</span>' +
        '<span class="bounty-name"><b>' + m.th + '</b><small>' + m.latin + ' · ' + m.zone + '</small></span>' +
        '<span class="bounty-lv">Lv ' + m.lv + '</span></li>';
    });
    $('bounty-list').innerHTML = html;

    html = '';
    TW.CLASSES.forEach(function (c) {
      html += '<button type="button" class="license" role="radio" aria-checked="false" data-cls="' + c.id + '">' +
        '<span class="sigil">' + svg(SIGILS[c.id]) + '</span>' +
        '<span class="license-text"><span class="latin">' + c.latin + '</span><span class="th">' + c.th + '</span><span class="role">' + c.role + '</span></span></button>';
    });
    var cl = $('class-list');
    cl.innerHTML = html;
    cl.addEventListener('click', function (e) {
      var b = e.target.closest('.license');
      if (!b) return;
      UI.selectClass(b.dataset.cls);
      emit('select', b.dataset.cls);
    });
    cl.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      var ids = TW.CLASSES.map(function (c) { return c.id; });
      var i = ids.indexOf(state.cls);
      var next = ids[(i + ((e.key === 'ArrowDown' || e.key === 'ArrowRight') ? 1 : ids.length - 1)) % ids.length];
      UI.selectClass(next);
      emit('select', next);
      cl.querySelector('[data-cls="' + next + '"]').focus();
      e.preventDefault();
    });

    $('hunter-name').value = pick(TW.HUNTER_NAMES);
    $('oath-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('hunter-name').value.trim() || pick(TW.HUNTER_NAMES);
      emit('confirm', state.cls, name);
    });
    $('btn-start').addEventListener('click', function () { emit('start'); });
    $('btn-howto').addEventListener('click', function () { UI.overlay('howto', true); });
    $('btn-back').addEventListener('click', function () { emit('back'); });
    $('btn-pause').addEventListener('click', function () { emit('pause'); });
    $('btn-resume').addEventListener('click', function () { emit('resume'); });
    $('btn-quit').addEventListener('click', function () { emit('quit'); });
    $('btn-respawn').addEventListener('click', function () { emit('respawn'); });
    $('btn-continue').addEventListener('click', function () { emit('continue'); });
    $('btn-home').addEventListener('click', function () { emit('quit'); });
    $('opt-shadows').addEventListener('change', function () { emit('shadows', $('opt-shadows').checked); });
    $('btn-fullscreen').addEventListener('click', function () { emit('fullscreen'); });
    $('btn-continue-save').addEventListener('click', function () { emit('continue-save'); });
    var armed = false;
    $('btn-new-save').addEventListener('click', function () {
      var b = $('btn-new-save');
      if (!armed) {
        armed = true;
        b.textContent = 'แตะอีกครั้งเพื่อยืนยันลบ';
        b.classList.add('danger');
        setTimeout(function () { armed = false; b.textContent = 'ลบแล้วเริ่มใหม่'; b.classList.remove('danger'); }, 4000);
        return;
      }
      armed = false;
      emit('delete-save');
    });
    document.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () { b.closest('.overlay').hidden = true; emit('overlayClosed'); });
    });

    /* touch: joystick pad */
    var pad = $('touch-pad'), knob = $('touch-knob'), padId = null, R = 42;
    function padVec(e) {
      var r = pad.getBoundingClientRect();
      var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      var d = Math.sqrt(dx * dx + dy * dy) || 1, k = Math.min(1, d / R);
      dx = dx / d * k; dy = dy / d * k;
      knob.style.transform = 'translate(' + (dx * R) + 'px,' + (dy * R) + 'px)';
      emit('joy', dx, dy, true);
    }
    pad.addEventListener('pointerdown', function (e) { padId = e.pointerId; pad.setPointerCapture(padId); padVec(e); e.preventDefault(); });
    pad.addEventListener('pointermove', function (e) { if (e.pointerId === padId) padVec(e); });
    function padEnd(e) { if (e.pointerId !== padId) return; padId = null; knob.style.transform = ''; emit('joy', 0, 0, false); }
    pad.addEventListener('pointerup', padEnd);
    pad.addEventListener('pointercancel', padEnd);

    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches) UI.setTouch(true);
    window.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch' && !state.touch) UI.setTouch(true);
      else if (e.pointerType === 'mouse' && state.touch) UI.setTouch(false);
    }, { passive: true });

    UI.selectClass(state.cls);
  };

  UI.setTouch = function (on) {
    state.touch = on;
    document.body.classList.toggle('touch-on', on);
    emit('touch', on);
  };
  UI.isTouch = function () { return state.touch; };

  UI.screen = function (name) {
    $('screen-title').hidden = name !== 'title';
    $('screen-class').hidden = name !== 'class';
    $('hud').hidden = name !== 'game';
    if (name === 'class' && !state.touch) setTimeout(function () { $('hunter-name').focus({ preventScroll: true }); }, 50);
  };

  /* ---------- class select ---------- */
  UI.selectClass = function (id) {
    state.cls = id;
    document.querySelectorAll('.license').forEach(function (b) { b.setAttribute('aria-checked', b.dataset.cls === id ? 'true' : 'false'); });
    var c = TW.CLASSES.filter(function (x) { return x.id === id; })[0];
    var h = '<p class="eyebrow">ใบอนุญาตนักล่า · ระดับ F · กิลด์ธอร์นไวลด์</p>';
    h += '<div class="cd-title"><h3>' + c.th + '</h3><span class="latin">' + c.latin + '</span></div>';
    h += '<p class="cd-role">' + c.role + ' · HP ' + c.base.hp + ' · MP ' + c.base.mp + '</p>';
    h += '<p class="cd-oath">“' + c.oath + '”</p><p class="cd-desc">' + c.desc + '</p>';
    h += '<div class="ratings">';
    TW.RATING_LABELS.forEach(function (r) {
      var v = c.rating[r[0]];
      h += '<div class="rating" data-k="' + r[0] + '"><span>' + r[1] + '</span><span class="pips" aria-label="' + v + ' จาก 5">';
      for (var i = 1; i <= 5; i++) h += '<i class="' + (i <= v ? 'on' : '') + '"></i>';
      h += '</span></div>';
    });
    h += '</div><p class="skills-head">ทักษะ</p><ul class="skill-list">';
    c.skills.forEach(function (s) {
      h += '<li><span class="skill-ico">' + svg(s.icon) + '</span><div class="skill-body"><div class="skill-top"><kbd>' + s.key + '</kbd><b>' + s.name + '</b>' +
        '<span class="skill-meta">' + (s.mp ? 'MP ' + s.mp + ' · ' : '') + 'คูลดาวน์ ' + s.cd + ' วิ</span></div><p>' + s.desc + '</p></div></li>';
    });
    h += '</ul>';
    $('class-info').innerHTML = h;
  };
  UI.stageCenter = function () {
    var r = $('class-stage').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height * 0.5, h: r.height };
  };

  /* ---------- HUD ---------- */
  var slots = [], last = {};
  function setText(id, v) { if (last[id] !== v) { last[id] = v; $(id).textContent = v; } }
  function setW(id, v) { v = Math.round(Math.max(0, Math.min(1, v)) * 1000) / 10; if (last[id] !== v) { last[id] = v; $(id).style.width = v + '%'; } }

  UI.setupHUD = function (p) {
    last = {};
    $('pf-name').textContent = p.name;
    $('pf-class').textContent = p.cls.th + ' · ' + p.cls.latin;
    var h = '';
    p.cls.skills.forEach(function (s, i) {
      h += '<button type="button" class="slot' + (i === 0 ? ' basic' : '') + (s.unique ? ' unique' : '') + '" data-slot="' + i + '" aria-label="' + s.name + '">' +
        '<span class="key">' + (i === 0 ? 'LMB' : s.key) + '</span>' + svg(s.icon) +
        (s.unique ? '<span class="mp" id="unique-count">0/' + TW.GEMS.length + '</span>' : (s.mp ? '<span class="mp">' + s.mp + '</span>' : '')) +
        '<span class="cd" style="--p:0"></span><span class="cdt"></span></button>';
    });
    var gemRow = $('gem-row');
    gemRow.hidden = !p.cls.gems;
    gemRow.innerHTML = p.cls.gems ? TW.GEMS.map(function (g) { return '<i class="gem" data-gem="' + g.id + '" style="--gem:' + hex(g.color) + '" title="' + g.th + '"></i>'; }).join('') : '';
    h += '<button type="button" class="slot potion" data-slot="potion" aria-label="ยาฟื้นพลัง"><span class="key">F</span>' + svg('potion') +
      '<span class="mp" id="potion-count">0</span><span class="cd" style="--p:0"></span><span class="cdt"></span></button>';
    var bar = $('skillbar');
    bar.innerHTML = h;
    slots = Array.prototype.map.call(bar.querySelectorAll('.slot'), function (el) {
      return { el: el, cd: el.querySelector('.cd'), cdt: el.querySelector('.cdt'), p: -1, t: '', nomp: false, active: false, ready: true };
    });
    slots.forEach(function (s) {
      var el = s.el, key = el.dataset.slot;
      el.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        if (key === 'potion') emit('potion');
        else if (key === '0') emit('attackHold', true);
        else emit('skill', +key);
      });
      var release = function () { if (key === '0') emit('attackHold', false); };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('pointerleave', release);
      el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });
    $('hud-boss').hidden = true;
    $('hud-quest').classList.remove('done');
  };

  UI.hud = function (p, info) {
    setText('pf-lv', p.level);
    setW('hp-fill', p.hp / p.maxHp);
    setText('hp-text', Math.ceil(p.hp) + ' / ' + p.maxHp);
    setW('mp-fill', p.mp / p.maxMp);
    setText('mp-text', Math.floor(p.mp) + ' / ' + p.maxMp);
    setW('xp-fill', p.exp / TW.expToNext(p.level));
    setText('gold', p.gold);
    setText('potion-count', p.potions);
    var low = p.hp / p.maxHp < 0.3;
    if (last.low !== low) { last.low = low; $('hud-player').classList.toggle('low', low); }
    if (p.cls.gems) {
      var gemKey = p.gems.join(',');
      if (last.gems !== gemKey) {
        last.gems = gemKey;
        var socks = $('gem-row').querySelectorAll('.gem');
        for (var g = 0; g < socks.length; g++) socks[g].classList.toggle('on', p.gems.indexOf(socks[g].dataset.gem) >= 0);
        setText('unique-count', p.gems.length + '/' + TW.GEMS.length);
        var full = p.gems.length >= TW.GEMS.length, uslot = $('skillbar').querySelector('.slot.unique');
        if (uslot) { uslot.classList.toggle('locked', !full); uslot.classList.toggle('charged', full); }
      }
    }
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i], cd, total, nomp, active = false;
      if (i < 4) { cd = p.cds[i]; total = p.cls.skills[i].cd; nomp = p.mp < p.cls.skills[i].mp; active = !!info.active[p.cls.skills[i].id]; }
      else { cd = p.potionCd; total = 1.5; nomp = p.potions <= 0; }
      var pr = total > 0 ? Math.round(cd / total * 50) / 50 : 0;
      if (s.p !== pr) { s.p = pr; s.cd.style.setProperty('--p', pr); }
      var t = cd > 0.05 ? (cd < 1 ? cd.toFixed(1) : Math.ceil(cd)) : '';
      if (s.t !== t) { s.t = t; s.cdt.textContent = t; }
      if (s.nomp !== nomp) { s.nomp = nomp; s.el.classList.toggle('nomp', nomp); }
      if (s.active !== active) { s.active = active; s.el.classList.toggle('active', active); }
      var ready = cd <= 0;
      if (ready && !s.ready && total > 1) { s.el.classList.remove('ready-flash'); void s.el.offsetWidth; s.el.classList.add('ready-flash'); }
      s.ready = ready;
    }
  };

  UI.quest = function (q, idx, progress) {
    var box = $('hud-quest');
    if (!q) {
      setText('q-eyebrow', 'ประกาศล่า · ครบทุกใบ');
      setText('q-title', 'ป่าสงบลงแล้ว');
      setText('q-brief', 'ล่าต่อได้ตามใจ อสูรจะกลับมาใหม่เรื่อย ๆ');
      setText('q-target', 'ไม่มีเป้าหมาย');
      setText('q-count', '');
      setW('q-fill', 1);
      box.classList.add('done');
      return;
    }
    box.classList.remove('done');
    setText('q-eyebrow', 'ประกาศล่า ' + (idx + 1) + '/' + TW.QUESTS.length);
    setText('q-title', q.title);
    setText('q-brief', q.brief);
    setText('q-target', TW.MONSTERS[q.target].th);
    setText('q-count', progress + ' / ' + q.count);
    setW('q-fill', progress / q.count);
  };
  UI.questNav = function (angle, dist, zoneTh) {
    var a = Math.round(angle * 100) / 100;
    if (last.qa !== a) { last.qa = a; $('q-arrow').style.transform = 'rotate(' + a + 'rad)'; }
    setText('q-dist', dist == null ? '' : (dist < 5 ? 'ถึงแล้ว · ' : dist + ' ม. · ') + zoneTh);
  };

  UI.zone = function (zn) {
    setText('zone-name', zn ? zn.th : 'ป่าลึก');
    setText('zone-lv', zn ? zn.lv : 'ไม่มีใครสำรวจ');
  };

  UI.boss = function (show, ratio) {
    var el = $('hud-boss');
    if (el.hidden === show) el.hidden = !show;
    if (show) setW('boss-fill', ratio);
  };

  UI.hurt = function () {
    var el = $('hurt');
    el.classList.add('on');
    setTimeout(function () { el.classList.remove('on'); }, 70);
  };
  UI.snapFlash = function () {
    var el = $('snapflash');
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    setTimeout(function () { el.classList.remove('on'); }, 1300);
  };

  /* ---------- toasts ---------- */
  UI.toast = function (eyebrow, title, sub, kind) {
    var wrap = $('toasts');
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.innerHTML = (eyebrow ? '<span class="eyebrow"></span>' : '') + '<h4></h4>' + (sub ? '<p></p>' : '');
    if (eyebrow) el.querySelector('.eyebrow').textContent = eyebrow;
    el.querySelector('h4').textContent = title;
    if (sub) el.querySelector('p').textContent = sub;
    wrap.appendChild(el);
    while (wrap.children.length > 3) wrap.removeChild(wrap.firstChild);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 3300);
  };

  /* ---------- floating combat text ---------- */
  var floaters = [], V = new THREE.Vector3();
  UI.floater = function (x, y, z, text, kind) {
    if (floaters.length > 44) { var old = floaters.shift(); old.el.remove(); }
    var el = document.createElement('span');
    el.className = 'floater ' + (kind || '');
    el.textContent = text;
    $('floaters').appendChild(el);
    floaters.push({ el: el, x: x, y: y, z: z, t: 0, life: kind === 'crit' ? 1.15 : 0.95, dx: (Math.random() - 0.5) * 36, kind: kind });
  };
  UI.updateFloaters = function (camera, dt, w, h) {
    for (var i = floaters.length - 1; i >= 0; i--) {
      var f = floaters[i];
      f.t += dt;
      var k = f.t / f.life;
      if (k >= 1) { f.el.remove(); floaters.splice(i, 1); continue; }
      V.set(f.x, f.y, f.z).project(camera);
      if (V.z > 1) { f.el.style.opacity = '0'; continue; }
      var sx = (V.x + 1) / 2 * w + f.dx * k, sy = (1 - V.y) / 2 * h - k * 64;
      var sc = f.kind === 'crit' ? 1 + 0.5 * (1 - Math.min(1, k * 4)) : 1;
      f.el.style.transform = 'translate(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px) translate(-50%,-50%) scale(' + sc.toFixed(2) + ')';
      f.el.style.opacity = k < 0.65 ? '1' : (1 - (k - 0.65) / 0.35).toFixed(2);
    }
  };
  UI.clearFloaters = function () { floaters.forEach(function (f) { f.el.remove(); }); floaters = []; };

  /* ---------- minimap ---------- */
  var mm = { base: null, ctx: null, extent: 200, size: 176 };
  UI.initMinimap = function (image, extent) { mm.base = image; mm.extent = extent; mm.ctx = $('minimap').getContext('2d'); };
  UI.minimap = function (p, monsters, questZone, time, extras) {
    var ctx = mm.ctx, S = mm.size, k = S / (mm.extent * 2);
    var tx = function (x) { return (x + mm.extent) * k; }, tz = function (z) { return (z + mm.extent) * k; };
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(mm.base, 0, 0, S, S);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(235,226,201,0.16)';
    for (var i = 0; i < TW.ZONES.length; i++) {
      var z = TW.ZONES[i];
      ctx.beginPath(); ctx.arc(tx(z.x), tz(z.z), z.r * k, 0, 6.283); ctx.stroke();
    }
    var camp = TW.ZONE_BY_ID.camp;
    ctx.fillStyle = '#d4a64a';
    ctx.save(); ctx.translate(tx(camp.x), tz(camp.z)); ctx.rotate(Math.PI / 4); ctx.fillRect(-3, -3, 6, 6); ctx.restore();
    if (questZone) {
      ctx.strokeStyle = 'rgba(212,166,74,0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(tx(questZone.x), tz(questZone.z), questZone.r * k * (0.85 + Math.sin(time * 3) * 0.1), 0, 6.283); ctx.stroke();
    }
    for (var j = 0; j < monsters.length; j++) {
      var m = monsters[j];
      if (!m.alive) continue;
      if (m.def.boss) {
        ctx.fillStyle = '#e4683a';
        ctx.beginPath(); ctx.arc(tx(m.pos.x), tz(m.pos.z), 3.2, 0, 6.283); ctx.fill();
        ctx.strokeStyle = '#ebe2c9'; ctx.lineWidth = 1; ctx.stroke();
      } else {
        ctx.fillStyle = m.state === 'chase' || m.state === 'windup' ? '#ff7a4a' : 'rgba(228,104,58,0.75)';
        ctx.fillRect(tx(m.pos.x) - 1.3, tz(m.pos.z) - 1.3, 2.6, 2.6);
      }
    }
    if (extras) {
      for (var e = 0; e < extras.length; e++) {
        ctx.fillStyle = extras[e].color;
        ctx.beginPath(); ctx.arc(tx(extras[e].x), tz(extras[e].z), 2.6 + Math.sin(time * 5) * 0.8, 0, 6.283); ctx.fill();
      }
    }
    if (p) {
      ctx.save();
      ctx.translate(tx(p.pos.x), tz(p.pos.z));
      ctx.rotate(Math.atan2(Math.sin(p.facing), -Math.cos(p.facing)));
      ctx.fillStyle = '#6cc2ab';
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.5, 4.5); ctx.lineTo(0, 2.5); ctx.lineTo(-4.5, 4.5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  };

  /* ---------- overlays ---------- */
  UI.overlay = function (id, show, data) {
    var el = $('ov-' + id);
    if (!el) return;
    if (show && data) {
      if (id === 'death') $('death-loss').textContent = data.loss;
      if (id === 'victory') {
        var tally = $('victory-tally');
        tally.innerHTML = '';
        [['เวลาล่า', data.time], ['อสูรที่ล่า', data.kills], ['เลเวล', data.level], ['เหรียญ', data.gold]].forEach(function (r) {
          var d = document.createElement('div');
          d.innerHTML = '<dd></dd><dt></dt>';
          d.querySelector('dd').textContent = r[1];
          d.querySelector('dt').textContent = r[0];
          tally.appendChild(d);
        });
      }
    }
    el.hidden = !show;
    if (show) { var b = el.querySelector('.btn'); if (b) setTimeout(function () { b.focus({ preventScroll: true }); }, 30); }
  };
  UI.anyOverlay = function () {
    return !!document.querySelector('.overlay:not([hidden])');
  };

  /* ---------- saved hunter card & settings ---------- */
  function timeAgo(ms) {
    var m = Math.round(ms / 60000);
    if (m < 1) return 'เมื่อสักครู่';
    if (m < 60) return m + ' นาทีที่แล้ว';
    var h = Math.round(m / 60);
    if (h < 24) return h + ' ชั่วโมงที่แล้ว';
    return Math.round(h / 24) + ' วันที่แล้ว';
  }
  UI.showSave = function (save) {
    $('continue-card').hidden = !save;
    $('btn-start').textContent = save ? 'นักล่าคนใหม่' : 'รับใบอนุญาตนักล่า';
    $('btn-start').className = 'btn ' + (save ? 'btn-ghost' : 'btn-primary');
    if (!save) return;
    var cls = TW.CLASSES.filter(function (c) { return c.id === save.cls; })[0];
    var qi = save.quest ? save.quest.idx : 0, q = TW.QUESTS[qi];
    $('cc-name').textContent = save.name;
    $('cc-meta').textContent = (cls ? cls.th + ' · ' : '') + 'Lv ' + save.level + ' · ' + (save.gold || 0) + ' เหรียญ';
    $('cc-quest').textContent = (q ? 'ประกาศล่า ' + (qi + 1) + '/' + TW.QUESTS.length + ' · ' + q.title + ' ' + (save.quest.progress || 0) + '/' + q.count : 'ล่าครบทุกประกาศแล้ว') +
      (save.savedAt ? ' · บันทึก' + timeAgo(Date.now() - save.savedAt) : '');
    $('btn-new-save').textContent = 'ลบแล้วเริ่มใหม่';
    $('btn-new-save').classList.remove('danger');
  };
  UI.setShadows = function (on) { $('opt-shadows').checked = !!on; };

  TW.UI = UI;
})();
