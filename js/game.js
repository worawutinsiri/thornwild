/* Thornwild — runtime: loop, camera, player, monsters, combat, quests.
   Modes: 'title' (camera orbits the valley) → 'class' (hunter on the camp
   pedestal) → 'game'. Everything here reads balance from TW data. */
(function () {
  'use strict';
  var TW = window.TW, UI = TW.UI, Models = TW.Models, World = TW.World;
  var $ = function (id) { return document.getElementById(id); };

  if (!window.THREE) { $('boot-error').hidden = false; return; }
  var T = THREE;
  var renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas: $('scene'), antialias: true, powerPreference: 'high-performance', stencil: true });
  } catch (e) { $('boot-error').hidden = false; return; }

  var TAU = Math.PI * 2;
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randi(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOut(k) { return 1 - (1 - k) * (1 - k); }
  function angLerp(a, b, t) { var d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return a + d * t; }
  function dist2(a, b) { var dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* URL flags — ?class=mage skips the menus, &auto=1 fires skills on a timer (smoke testing),
     &lite=1 turns shadows off for weak machines. */
  var qs = {};
  (window.location.search || '').replace(/^\?/, '').split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) qs[p[0]] = decodeURIComponent(p[1] || '1'); });

  /* Phones default to the light renderer (no shadows, lower pixel ratio); the pause menu can turn shadows back on. */
  var MOBILE = !!(window.matchMedia && window.matchMedia('(pointer: coarse) and (hover: none)').matches);
  var settings = { shadows: !(qs.lite || MOBILE) };
  try { var lsShadow = window.localStorage.getItem('tw.shadows'); if (lsShadow === '1') settings.shadows = true; else if (lsShadow === '0') settings.shadows = false; } catch (e) {}
  if (qs.lite) settings.shadows = false;
  renderer.setPixelRatio(qs.lite ? 1 : Math.min(window.devicePixelRatio || 1, MOBILE ? 1.25 : 1.75));
  renderer.shadowMap.enabled = settings.shadows;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  var scene = new T.Scene();
  var camera = new T.PerspectiveCamera(50, 1, 0.1, 1500);
  var world = World.build(scene);
  world.sun.castShadow = settings.shadows;
  if (MOBILE) { scene.fog.near = 50; scene.fog.far = 230; }
  var FAR_CULL = MOBILE ? 115 : 150;
  function applyShadows(on) {
    settings.shadows = !!on;
    renderer.shadowMap.enabled = settings.shadows;
    world.sun.castShadow = settings.shadows;
    scene.traverse(function (o) { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; });
    try { window.localStorage.setItem('tw.shadows', settings.shadows ? '1' : '0'); } catch (e) {}
    UI.setShadows(settings.shadows);
  }
  var VILLAGE = TW.ZONE_BY_ID.village;
  var SPAWN = { x: World.PREVIEW.x, z: World.PREVIEW.z };

  var G = { mode: 'title', paused: false, time: 0, victoryShown: false, quest: { idx: 0, progress: 0, state: 'available' }, stats: { kills: 0, start: 0 }, cls: 'warrior', previewYaw: 0, zone: null, dialogOpen: false, panel: null, invSel: null, hitstop: 0, waystones: {}, dialogKind: '', panelTab: 'char', shopSel: null, smithSel: null, wallOpen: null };
  var cam = { yaw: 0, pitch: 0.95, dist: 22, shake: 0, target: new T.Vector3() };
  /* mouse: left = walk to the cursor, right = basic attack toward it, middle drag (or Q/E) = camera */
  var input = { keys: {}, ndc: new T.Vector2(), lDown: false, rDown: false, mDown: false, attackHold: false, lastX: 0, lastY: 0, joy: { x: 0, y: 0, on: false }, touch: false, drag: false, dragId: null, tapX: 0, tapY: 0, tapT: 0, tapMoved: 0 };
  var aim = new T.Vector3();
  var player = null, preview = null;
  var monsters = [], projectiles = [], effects = [], timers = [], zonesFx = [], pickups = [];

  /* =============== particles =============== */
  var Particles = (function () {
    var N = 1000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), vel = new Float32Array(N * 3);
    var life = new Float32Array(N), max = new Float32Array(N), base = new Float32Array(N * 3), grav = new Float32Array(N);
    for (var i = 0; i < N; i++) pos[i * 3 + 1] = -9999;
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    var cv = document.createElement('canvas'); cv.width = cv.height = 64;
    var cx = cv.getContext('2d'), gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
    var tex = new T.CanvasTexture(cv);
    var mat = new T.PointsMaterial({ size: 0.55, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
    var pts = new T.Points(geo, mat); pts.frustumCulled = false; scene.add(pts);
    var cursor = 0, tmp = new T.Color();
    function spawn(x, y, z, vx, vy, vz, c, lifeT, g) {
      var i = cursor; cursor = (cursor + 1) % N;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
      life[i] = max[i] = lifeT; grav[i] = g || 0;
      base[i * 3] = c.r; base[i * 3 + 1] = c.g; base[i * 3 + 2] = c.b;
    }
    function burst(x, y, z, hex, count, speed, lifeT, g, up) {
      tmp.setHex(hex);
      for (var n = 0; n < count; n++) {
        var a = Math.random() * TAU, e = (Math.random() - 0.5) * Math.PI, s = speed * (0.4 + Math.random() * 0.6);
        spawn(x, y, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + (up || 0), Math.sin(a) * Math.cos(e) * s, tmp, lifeT * (0.6 + Math.random() * 0.6), g);
      }
    }
    function update(dt) {
      for (var i = 0; i < N; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) { pos[i * 3 + 1] = -9999; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; continue; }
        vel[i * 3 + 1] -= grav[i] * dt;
        var dr = 1 - 1.6 * dt;
        vel[i * 3] *= dr; vel[i * 3 + 2] *= dr;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        var k = life[i] / max[i];
        col[i * 3] = base[i * 3] * k; col[i * 3 + 1] = base[i * 3 + 1] * k; col[i * 3 + 2] = base[i * 3 + 2] * k;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    }
    return { spawn: spawn, burst: burst, update: update, color: tmp };
  })();

  /* ambient motes drifting around the focus point */
  var motes = (function () {
    var N = 180, arr = new Float32Array(N * 3), seeds = new Float32Array(N);
    for (var i = 0; i < N; i++) { arr[i * 3] = rand(-40, 40); arr[i * 3 + 1] = rand(0.5, 9); arr[i * 3 + 2] = rand(-40, 40); seeds[i] = Math.random() * TAU; }
    var geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(arr, 3));
    var m = new T.Points(geo, new T.PointsMaterial({ size: 0.28, color: 0xffd08a, transparent: true, opacity: 0.75, depthWrite: false, blending: T.AdditiveBlending }));
    m.frustumCulled = false; scene.add(m);
    return {
      update: function (dt, t, f) {
        for (var i = 0; i < N; i++) {
          var o = i * 3, x = arr[o] - f.x, z = arr[o + 2] - f.z;
          if (x > 40) arr[o] -= 80; else if (x < -40) arr[o] += 80;
          if (z > 40) arr[o + 2] -= 80; else if (z < -40) arr[o + 2] += 80;
          arr[o] += Math.sin(t * 0.7 + seeds[i]) * dt * 0.8;
          arr[o + 1] = World.heightAt(arr[o], arr[o + 2]) + 1.2 + Math.sin(t * 0.5 + seeds[i] * 2) * 1.5 + 2.5 + (seeds[i] / TAU) * 4;
          arr[o + 2] += Math.cos(t * 0.5 + seeds[i]) * dt * 0.8;
        }
        geo.attributes.position.needsUpdate = true;
      },
    };
  })();

  /* =============== effects / timers =============== */
  function addEffect(obj, life, update, onEnd) { scene.add(obj); effects.push({ obj: obj, t: 0, life: life, update: update, onEnd: onEnd }); }
  function disposeObj(o) {
    o.traverse(function (c) {
      if (c.isMesh) {
        if (c.geometry && !c.geometry.userData.shared) c.geometry.dispose();
        if (c.material && !c.material.userData.shared) c.material.dispose();
      }
    });
  }
  function updateEffects(dt) {
    for (var i = effects.length - 1; i >= 0; i--) {
      var e = effects[i];
      e.t += dt;
      var k = e.t / e.life;
      if (e.update) e.update(e, Math.min(1, k), dt);
      if (k >= 1) { scene.remove(e.obj); disposeObj(e.obj); effects.splice(i, 1); if (e.onEnd) e.onEnd(); }
    }
  }
  function after(t, fn) { timers.push({ t: t, fn: fn }); }
  function updateTimers(dt) {
    for (var i = timers.length - 1; i >= 0; i--) {
      timers[i].t -= dt;
      if (timers[i].t <= 0) { var f = timers[i].fn; timers.splice(i, 1); f(); }
    }
  }
  function shake(k) { if (!REDUCED) cam.shake = Math.max(cam.shake, k); }

  var RING_GEO = new T.RingGeometry(0.82, 1, 48); RING_GEO.rotateX(-Math.PI / 2); RING_GEO.userData.shared = true;
  function fxRing(x, y, z, radius, hex, life) {
    var m = new T.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.85, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false });
    var mesh = new T.Mesh(RING_GEO, m);
    mesh.position.set(x, y + 0.25, z);
    addEffect(mesh, life || 0.45, function (e, k) { var s = 0.3 + (radius - 0.3) * easeOut(k); mesh.scale.set(s, 1, s); m.opacity = 0.85 * (1 - k); });
  }
  function fxArc(x, y, z, facing, range, arcDeg, hex) {
    var arc = arcDeg * Math.PI / 180;
    var g = new T.RingGeometry(range * 0.3, range, 22, 1, -Math.PI / 2 - arc / 2, arc);
    var m = new T.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.75, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false });
    var mesh = new T.Mesh(g, m);
    mesh.rotation.x = -Math.PI / 2;
    var grp = new T.Group(); grp.add(mesh);
    grp.position.set(x, y + 1.1, z); grp.rotation.y = facing;
    addEffect(grp, 0.2, function (e, k) { m.opacity = 0.75 * (1 - k); mesh.scale.setScalar(0.8 + k * 0.3); });
  }
  function fxShield(target, dur, hex) {
    var mesh = new T.Mesh(new T.IcosahedronGeometry(1.7, 1), new T.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.25, wireframe: true, depthWrite: false }));
    addEffect(mesh, dur, function (e, k) { mesh.position.set(target.pos.x, target.pos.y + 1.2, target.pos.z); mesh.rotation.y += 0.02; mesh.material.opacity = 0.25 * (k > 0.8 ? (1 - k) / 0.2 : 1); });
  }
  /* ground telegraph, conformed to the terrain so it reads on slopes */
  function telegraph(x, z, radius, life, hex) {
    var grp = new T.Group();
    function conform(g) {
      g.rotateX(-Math.PI / 2);
      var p = g.attributes.position;
      for (var i = 0; i < p.count; i++) p.setY(i, World.heightAt(x + p.getX(i), z + p.getZ(i)) + 0.14);
      return g;
    }
    var disc = new T.Mesh(conform(new T.RingGeometry(0.01, radius, 40, 5)), new T.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.12, depthWrite: false, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
    var edge = new T.Mesh(conform(new T.RingGeometry(radius * 0.93, radius, 48, 1)), new T.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.8, depthWrite: false, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
    disc.renderOrder = edge.renderOrder = 2;
    grp.add(disc, edge);
    grp.position.set(x, 0, z);
    addEffect(grp, life, function (e, k) { disc.material.opacity = 0.1 + 0.4 * k; edge.material.opacity = 0.55 + Math.sin(k * 24) * 0.3; });
  }
  function fxMeteor(x, z, delay, onLand) {
    var y0 = World.heightAt(x, z);
    var rock = new T.Mesh(new T.DodecahedronGeometry(1.0, 0), new T.MeshStandardMaterial({ color: 0x3a2a22, emissive: 0xff7a2a, emissiveIntensity: 1.6, flatShading: true }));
    addEffect(rock, delay, function (e, k) {
      rock.position.set(x + (1 - k) * 8, y0 + 1 + (1 - k) * (1 - k) * 40, z - (1 - k) * 6);
      rock.rotation.x += 0.2; rock.rotation.y += 0.15;
      Particles.spawn(rock.position.x, rock.position.y, rock.position.z, rand(-1, 1), rand(1, 3), rand(-1, 1), Particles.color.setHex(0xff9a3c), 0.5, 0);
    }, onLand);
  }

  /* =============== projectiles =============== */
  var PGEO = {
    ember: new T.IcosahedronGeometry(0.3, 0), arrow: new T.BoxGeometry(0.07, 0.07, 1.0), dagger: new T.BoxGeometry(0.1, 0.03, 0.6),
    spore: new T.IcosahedronGeometry(0.4, 1), rock: new T.DodecahedronGeometry(0.8, 0), thorn: new T.ConeGeometry(0.16, 1.0, 5),
  };
  PGEO.thorn.rotateX(Math.PI / 2);
  var PMAT = {
    ember: new T.MeshBasicMaterial({ color: 0xffb35c }),
    arrow: new T.MeshStandardMaterial({ color: 0xd8c9a3, flatShading: true }),
    dagger: new T.MeshStandardMaterial({ color: 0xa6e06a, emissive: 0x3f6a1a, emissiveIntensity: 0.6, flatShading: true }),
    spore: new T.MeshBasicMaterial({ color: 0xc77fb5 }),
    rock: new T.MeshStandardMaterial({ color: 0x7d7a6e, flatShading: true }),
    thorn: new T.MeshStandardMaterial({ color: 0x5a2e20, emissive: 0x7a2a14, emissiveIntensity: 0.5, flatShading: true }),
  };
  Object.keys(PGEO).forEach(function (k) { PGEO[k].userData.shared = true; PMAT[k].userData.shared = true; });
  var TRAIL = { ember: 0xff8a3c, spore: 0xb56fb0, dagger: 0, arrow: 0, rock: 0, thorn: 0x8a3a1a };

  function spawnProj(o) {
    var mesh = new T.Mesh(PGEO[o.kind], PMAT[o.kind]);
    mesh.castShadow = o.kind === 'rock';
    o.mesh = mesh; o.traveled = 0; o.hit = []; o.radius = o.radius || 0.6; o.h = o.h == null ? 1.3 : o.h;
    mesh.position.set(o.x, World.heightAt(o.x, o.z) + o.h, o.z);
    mesh.lookAt(o.x + o.dx, mesh.position.y, o.z + o.dz);
    scene.add(mesh);
    projectiles.push(o);
  }
  function updateProjectiles(dt) {
    for (var i = projectiles.length - 1; i >= 0; i--) {
      var p = projectiles[i], step = p.speed * dt;
      p.x += p.dx * step; p.z += p.dz * step; p.traveled += step;
      var k = Math.min(1, p.traveled / p.range);
      var y = World.heightAt(p.x, p.z) + p.h + (p.arc ? Math.sin(k * Math.PI) * p.arc : 0);
      p.mesh.position.set(p.x, y, p.z);
      if (p.kind === 'ember' || p.kind === 'spore' || p.kind === 'rock') { p.mesh.rotation.x += dt * 7; p.mesh.rotation.z += dt * 5; }
      if (p.kind === 'dagger') p.mesh.rotateZ(dt * 22);
      if (TRAIL[p.kind]) Particles.spawn(p.x, y, p.z, rand(-1, 1), rand(-0.5, 1.5), rand(-1, 1), Particles.color.setHex(TRAIL[p.kind]), 0.35, 0);
      var dead = p.traveled >= p.range;
      if (p.owner === 'player') {
        for (var j = 0; j < monsters.length; j++) {
          var m = monsters[j];
          if (!m.alive || p.hit.indexOf(m) >= 0) continue;
          var rr = m.def.radius + p.radius, dx = m.pos.x - p.x, dz = m.pos.z - p.z;
          if (dx * dx + dz * dz < rr * rr) {
            p.hit.push(m);
            damageMonster(m, player.atk * p.mult, p.opts);
            Particles.burst(p.x, y, p.z, TRAIL[p.kind] || 0xebe2c9, 8, 5, 0.4, 6);
            if (!p.pierce) { dead = true; break; }
          }
        }
      } else if (!p.noHit && player && !player.dead) {
        var pr = player.radius + p.radius, ddx = player.pos.x - p.x, ddz = player.pos.z - p.z;
        if (ddx * ddx + ddz * ddz < pr * pr) { damagePlayer(p.dmg, p); Particles.burst(p.x, y, p.z, TRAIL[p.kind] || 0xe4683a, 8, 5, 0.4, 6); dead = true; }
      }
      if (dead) {
        if (p.onEnd) p.onEnd(p);
        scene.remove(p.mesh);
        projectiles.splice(i, 1);
      }
    }
  }

  /* =============== player =============== */
  function createPlayer(clsId, name) {
    var cls = TW.CLASSES.filter(function (c) { return c.id === clsId; })[0];
    var model = Models.hero(clsId);
    Models.addXray(model, 0x6cc2ab);
    scene.add(model.root);
    var p = {
      cls: cls, name: name, model: model, pos: new T.Vector3(SPAWN.x, 0, SPAWN.z), facing: Math.PI, targetFacing: Math.PI,
      level: 1, exp: 0, gold: 0, potions: 3, hp: 0, mp: 0, maxHp: 0, maxMp: 0, atk: 0, def: 0, speed: cls.base.speed, crit: cls.base.crit,
      cds: [0, 0, 0, 0], potionCd: 0, anim: { walk: 0, move: 0, act: null }, dash: null, hopY: 0, buffs: {}, lastHurt: -99, dead: false, deathT: 0,
      radius: 0.6, invuln: 0, knock: null, hurtFlash: 0,
      inventory: [], equip: { weapon: null, armor: null, trinket: null }, bonus: TW.Items.bonus({}), dodgeCd: 0,
      attrs: { str: 0, vit: 0, agi: 0, int: 0 }, points: 0, cdr: 0, mpRegenBonus: 0,
      skills: { unlocked: {} }, skillPoints: 0, flags: {}, critMult: cls.critMult, lifesteal: 0, dodgeCdMax: TW.DODGE.cd,
      materials: {}, dot: null,
    };
    p.pos.y = World.heightAt(p.pos.x, p.pos.z);
    recalc(p, true);
    return p;
  }
  /* class base + level growth + everything worn. fill = refill hp/mp (level up, respawn) */
  function recalc(p, fill) {
    var b = p.cls.base, g = p.cls.grow, L = p.level - 1, e = p.bonus = TW.Items.bonus(p.equip);
    var a = { atk: 0, hp: 0, hpPct: 0, def: 0, crit: 0, speedPct: 0, mp: 0, cdr: 0, mpRegen: 0, lifesteal: 0, critMult: 0, dodgeCd: 0, atkPct: 0 };
    TW.ATTRS.forEach(function (at) { var n = p.attrs[at.id] || 0; Object.keys(at.per).forEach(function (k) { a[k] += at.per[k] * n; }); });
    /* skill-tree passives and class-wide flags */
    p.flags = {};
    nodeList(p).forEach(function (n) {
      if (n.passive) Object.keys(n.passive).forEach(function (k) { a[k] = (a[k] || 0) + n.passive[k]; });
      if (n.flag && !n.skill) p.flags[n.flag] = true;
    });
    var oldMax = p.maxHp || 1, ratio = p.hp / oldMax;
    p.maxHp = Math.round((b.hp + g.hp * L + e.hp + a.hp) * (1 + a.hpPct / 100)); p.maxMp = Math.round(b.mp + g.mp * L + a.mp);
    p.atk = (b.atk + g.atk * L + e.atk + a.atk) * (1 + (e.atkPct + a.atkPct) / 100);
    p.def = b.def + g.def * L + e.def + a.def;
    p.crit = b.crit + (e.crit + a.crit) / 100;
    p.speed = b.speed * (1 + (e.speedPct + a.speedPct) / 100);
    p.cdr = Math.min(40, e.cdr + a.cdr);
    p.mpRegenBonus = e.mpRegen + a.mpRegen;
    p.lifesteal = e.lifesteal + a.lifesteal;
    p.critMult = p.cls.critMult + a.critMult;
    p.dodgeCdMax = Math.max(0.4, TW.DODGE.cd + a.dodgeCd);
    if (fill) { p.hp = p.maxHp; p.mp = p.maxMp; }
    else { p.hp = Math.min(p.maxHp, Math.max(1, Math.round(ratio * p.maxHp))); p.mp = Math.min(p.mp, p.maxMp); }
  }
  function gainExp(n) {
    var p = player;
    if (p.level >= TW.MAX_LEVEL) return;
    p.exp += n;
    while (p.exp >= TW.expToNext(p.level) && p.level < TW.MAX_LEVEL) {
      p.exp -= TW.expToNext(p.level);
      p.level++;
      p.points += TW.POINTS_PER_LEVEL;
      p.skillPoints += TW.SKILL_POINTS_PER_LEVEL;
      recalc(p, true);
      UI.setPoints(p.points + p.skillPoints);
      UI.toast('เลื่อนระดับ', 'Lv ' + p.level, '+' + TW.POINTS_PER_LEVEL + ' แต้มคุณสมบัติ (I) · +' + TW.SKILL_POINTS_PER_LEVEL + ' แต้มทักษะ (K) · พลังชีวิตและพลังเวทฟื้นเต็ม', 'level');
      fxRing(p.pos.x, p.pos.y, p.pos.z, 4, 0xd4a64a, 0.7);
      Particles.burst(p.pos.x, p.pos.y + 1, p.pos.z, 0xd4a64a, 60, 6, 1.1, 4, 4);
    }
  }
  function addBuff(p, id, dur, data) { p.buffs[id] = Object.assign({ t: dur }, data || {}); }
  function endBuff(p, id) {
    if (id === 'vanish') Models.setOpacity(p.model, 1);
    delete p.buffs[id];
  }

  function updateAim() {
    var p = player;
    if (input.touch) {
      var best = null, bd = 22;
      for (var i = 0; i < monsters.length; i++) {
        var m = monsters[i];
        if (!m.alive) continue;
        var d = dist2(p.pos, m.pos);
        if (d < bd) { bd = d; best = m; }
      }
      if (best) aim.set(best.pos.x, p.pos.y, best.pos.z);
      else aim.set(p.pos.x + Math.sin(p.facing) * 8, p.pos.y, p.pos.z + Math.cos(p.facing) * 8);
      return;
    }
    plane.constant = -(p.pos.y + 0.6);
    ray.setFromCamera(input.ndc, camera);
    if (!ray.ray.intersectPlane(plane, aim)) aim.set(p.pos.x + Math.sin(p.facing) * 8, p.pos.y, p.pos.z + Math.cos(p.facing) * 8);
  }
  var ray = new T.Raycaster(), plane = new T.Plane(new T.Vector3(0, 1, 0), 0);

  function updatePlayer(dt) {
    var p = player;
    if (p.dead) {
      p.deathT += dt;
      p.model.root.rotation.x = -Math.min(1, p.deathT * 2.5) * Math.PI / 2;
      p.model.root.position.y = p.pos.y + Math.min(1, p.deathT * 2.5) * 0.4;
      return;
    }
    for (var i = 0; i < 4; i++) p.cds[i] = Math.max(0, p.cds[i] - dt);
    p.potionCd = Math.max(0, p.potionCd - dt);
    p.dodgeCd = Math.max(0, p.dodgeCd - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    if (p.dot) {
      p.dot.t -= dt; p.dot.acc += dt;
      if (p.dot.acc >= 0.5) { p.dot.acc -= 0.5; damagePlayer(p.dot.dps * 0.5, null, true); }
      if (p.dot.t <= 0 || p.dead) p.dot = null;
    }
    for (var k in p.buffs) { p.buffs[k].t -= dt; if (p.buffs[k].t <= 0) endBuff(p, k); }
    var inVillage = dist2(p.pos, VILLAGE) < VILLAGE.r;
    var ooc = G.time - p.lastHurt > 5;
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * (inVillage ? 0.06 : (ooc ? 0.012 : 0)) * dt);
    p.mp = Math.min(p.maxMp, p.mp + (p.cls.mpRegen + p.mpRegenBonus + (inVillage ? p.maxMp * 0.05 : 0)) * dt);
    if (p.buffs.ironwill) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * p.buffs.ironwill.heal / p.buffs.ironwill.dur * dt);

    /* movement relative to the camera */
    var keys = input.keys;
    var fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    var str = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    if (input.joy.on) { fwd = -input.joy.y; str = input.joy.x; }
    var fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    var mx = fx * fwd + rx * str, mz = fz * fwd + rz * str, len = Math.sqrt(mx * mx + mz * mz);
    /* click-to-move target: keys/joystick override it; arriving, or getting stuck on scenery, clears it */
    if (len > 0.08) p.moveTo = null;
    else if (p.moveTo && !p.dash) {
      var tdx = p.moveTo.x - p.pos.x, tdz = p.moveTo.z - p.pos.z, td = Math.sqrt(tdx * tdx + tdz * tdz);
      if (td < 0.45) { var talk = p.moveTo.talk, travel = p.moveTo.travel; p.moveTo = null; if (talk && inRangeOf(talk)) interactWith(talk); else if (travel) openTravel(); }
      else {
        if (td < p.moveTo.best - 0.02) { p.moveTo.best = td; p.moveTo.stuckT = 0; }
        else { p.moveTo.stuckT += dt; if (p.moveTo.stuckT > 0.6) p.moveTo = null; }
        if (p.moveTo) { len = Math.min(1, td / 0.8); mx = tdx / td * len; mz = tdz / td * len; }
      }
    }
    var moving = false;
    if (p.dash) {
      var d = p.dash, step = Math.min(d.left, d.speed * dt);
      p.pos.x += d.dx * step; p.pos.z += d.dz * step; d.left -= step;
      p.invuln = Math.max(p.invuln, 0.05);
      if (!d.noHit) {
        for (var j = 0; j < monsters.length; j++) {
          var m = monsters[j];
          if (!m.alive || d.hit.indexOf(m) >= 0) continue;
          if (dist2(p.pos, m.pos) < m.def.radius + 1.5) { d.hit.push(m); damageMonster(m, p.atk * d.mult, { stun: d.stun, knock: 1 }); }
        }
      }
      Particles.spawn(p.pos.x, p.pos.y + 0.8, p.pos.z, rand(-1, 1), rand(0, 2), rand(-1, 1), Particles.color.setHex(d.color), 0.4, 0);
      if (d.hop) p.hopY = Math.sin((1 - d.left / d.total) * Math.PI) * 2.4;
      if (d.left <= 0.001) { p.dash = null; p.hopY = 0; }
      moving = true;
    } else if (len > 0.08) {
      var casting = p.anim.act && (p.anim.act.type === 'raise' || p.anim.act.type === 'cast');
      var sp = p.speed * (p.buffs.vanish ? 1.45 : 1) * (casting ? 0.4 : 1) * Math.min(1, len);
      mx /= len; mz /= len;
      p.pos.x += mx * sp * dt; p.pos.z += mz * sp * dt;
      moving = true;
      if (!p.anim.act) p.targetFacing = Math.atan2(mx, mz);
    }
    if (p.knock) {
      p.pos.x += p.knock.x * dt; p.pos.z += p.knock.z * dt;
      p.knock.t -= dt; p.knock.x *= 1 - 6 * dt; p.knock.z *= 1 - 6 * dt;
      if (p.knock.t <= 0) p.knock = null;
    }
    World.collide(p.pos, p.radius);
    for (var n = 0; n < monsters.length; n++) {
      var mo = monsters[n];
      if (!mo.alive) continue;
      var dx = p.pos.x - mo.pos.x, dz = p.pos.z - mo.pos.z, dd = Math.sqrt(dx * dx + dz * dz), min = p.radius + mo.def.radius * 0.9;
      if (dd < min && dd > 0.001) { var push = min - dd; p.pos.x += dx / dd * push * 0.6; p.pos.z += dz / dd * push * 0.6; mo.pos.x -= dx / dd * push * 0.4; mo.pos.z -= dz / dd * push * 0.4; }
    }
    var r = Math.sqrt(p.pos.x * p.pos.x + p.pos.z * p.pos.z);
    if (r > World.PLAY_R) { p.pos.x *= World.PLAY_R / r; p.pos.z *= World.PLAY_R / r; }
    p.pos.y = World.heightAt(p.pos.x, p.pos.z);
    p.facing = angLerp(p.facing, p.targetFacing, Math.min(1, dt * 16));

    if ((input.rDown || input.attackHold || keys.KeyJ) && !UI.anyOverlay()) useSkill(0);

    if (p.hurtFlash > 0) { p.hurtFlash -= dt; if (p.hurtFlash <= 0) Models.tint(p.model, 0, 0); }
    animateHero(p.model, p, dt, moving);
    p.model.root.position.set(p.pos.x, p.pos.y + p.hopY, p.pos.z);
    p.model.root.rotation.set(0, p.facing, 0);
  }

  function animateHero(h, p, dt, moving) {
    var a = p.anim;
    a.move = lerp(a.move, moving ? 1 : 0, Math.min(1, dt * 10));
    a.walk += dt * (moving ? 11 : 0);
    var s = Math.sin(a.walk) * 0.8 * a.move;
    h.legL.rotation.x = s; h.legR.rotation.x = -s;
    var armL = -s * 0.6, armR = s * 0.6, armLz = 0, armRz = 0, twist = 0, lean = a.move * 0.12;
    var bodyY = Math.abs(Math.cos(a.walk)) * 0.07 * a.move + (moving ? 0 : Math.sin(G.time * 2) * 0.015);
    if (a.act) {
      a.act.t += dt;
      var e = clamp(a.act.t / a.act.dur, 0, 1);
      switch (a.act.type) {
        case 'swing': armR = lerp(-2.6, 0.5, easeOut(e)); armRz = lerp(0.9, -0.5, e); twist = lerp(0.55, -0.5, easeOut(e)); break;
        case 'spin': twist = e * TAU; armR = -1.3; armRz = 1.3; armL = -1.3; armLz = -1.3; break;
        case 'thrust': armR = -1.6; twist = -0.4; lean = 0.35; break;
        case 'cast': armR = -1.4; armL = -0.9; break;
        case 'raise': armR = -2.8; armL = -2.8; break;
        case 'bow': armL = -1.55; armR = lerp(-1.55, -1.2, e); armRz = 0.4; twist = 0.35; break;
        case 'stab': var w = Math.sin(e * Math.PI); armR = -1.5 * w; armL = -1.5 * (1 - w); twist = (0.5 - e) * 0.5; break;
        case 'leap': armR = 1.0; armL = 1.0; lean = -0.3; break;
        case 'wave': armR = -2.7 + Math.sin(e * Math.PI * 4) * 0.35; armRz = -0.3; break;
        case 'roll': lean = e * TAU; armL = armR = -1.3; armLz = 0.5; armRz = -0.5; bodyY = 0.35 * Math.sin(e * Math.PI); break;
      }
      if (e >= 1) a.act = null;
    }
    h.armL.rotation.set(armL, 0, armLz); h.armR.rotation.set(armR, 0, armRz);
    h.body.rotation.set(lean, twist, 0);
    h.body.position.y = bodyY;
    if (h.bow) h.bow.rotation.x = -h.armL.rotation.x;
  }
  function act(p, type, dur) { p.anim.act = { type: type, dur: dur, t: 0 }; }

  /* ---- skills ---- */
  function aimDir(p) {
    var dx = aim.x - p.pos.x, dz = aim.z - p.pos.z, l = Math.sqrt(dx * dx + dz * dz) || 1;
    return { x: dx / l, z: dz / l, len: l };
  }
  var SKILLS = {
    slash: function (p, s, dir) {
      act(p, 'swing', 0.3);
      after(0.1, function () { if (p.dead) return; hitArc(p, dir, s.range, s.arc, s.mult, {}); fxArc(p.pos.x, p.pos.y, p.pos.z, p.facing, s.range, s.arc, 0xebe2c9); });
    },
    whirl: function (p, s) {
      act(p, 'spin', 0.45);
      hitCircle(p.pos, s.radius, s.mult, { knock: 1 });
      fxRing(p.pos.x, p.pos.y, p.pos.z, s.radius, 0xd4a64a, 0.4);
      shake(0.25);
    },
    charge: function (p, s, dir) {
      p.dash = { dx: dir.x, dz: dir.z, left: s.dist, total: s.dist, speed: 46, hit: [], mult: s.mult, stun: s.stun, color: 0xd4a64a };
      act(p, 'thrust', 0.35);
    },
    ironwill: function (p, s) {
      addBuff(p, 'ironwill', s.dur, { reduce: s.reduce, heal: s.heal, dur: s.dur });
      act(p, 'raise', 0.4);
      fxShield(p, s.dur, 0xd4a64a);
      Particles.burst(p.pos.x, p.pos.y + 1, p.pos.z, 0xd4a64a, 30, 3, 0.8, 2, 3);
    },
    ember: function (p, s, dir) {
      act(p, 'cast', 0.25);
      spawnProj({ x: p.pos.x + dir.x * 0.8, z: p.pos.z + dir.z * 0.8, h: 1.4, dx: dir.x, dz: dir.z, speed: s.speed, range: s.range, owner: 'player', kind: 'ember', mult: s.mult, radius: 0.7 + (s.radius || 0),
        opts: s.burn ? { poison: { t: 3, dps: p.atk * 0.25, kind: 'burn' } } : undefined });
    },
    nova: function (p, s) {
      act(p, 'raise', 0.4);
      hitCircle(p.pos, s.radius, s.mult, { slow: { t: s.slowDur, f: s.slowF }, stun: s.stun || 0 });
      fxRing(p.pos.x, p.pos.y, p.pos.z, s.radius, 0x9fd4e8, 0.55);
      Particles.burst(p.pos.x, p.pos.y + 0.5, p.pos.z, 0xbfe8f5, 70, 9, 0.9, 3, 2);
    },
    meteor: function (p, s, dir) {
      var d = Math.min(dir.len, s.range), tx = p.pos.x + dir.x * d, tz = p.pos.z + dir.z * d;
      act(p, 'raise', 0.5);
      telegraph(tx, tz, s.radius, s.delay, 0xe4683a);
      fxMeteor(tx, tz, s.delay, function () {
        hitCircle({ x: tx, z: tz }, s.radius, s.mult, { knock: 1 });
        var y = World.heightAt(tx, tz);
        fxRing(tx, y, tz, s.radius, 0xff9a3c, 0.5);
        Particles.burst(tx, y + 0.5, tz, 0xff8a3c, 90, 10, 0.9, 6, 4);
        Particles.burst(tx, y + 0.5, tz, 0x4a3a2a, 40, 6, 1.2, 4, 3);
        shake(0.6);
      });
    },
    blink: function (p, s, dir) {
      var d = clamp(dir.len, 3, s.dist);
      Particles.burst(p.pos.x, p.pos.y + 1, p.pos.z, 0x7fd6c0, 30, 4, 0.5, 0, 1);
      p.pos.x += dir.x * d; p.pos.z += dir.z * d;
      World.collide(p.pos, p.radius);
      p.pos.y = World.heightAt(p.pos.x, p.pos.z);
      cam.target.set(p.pos.x, p.pos.y + 1.4, p.pos.z);
      Particles.burst(p.pos.x, p.pos.y + 1, p.pos.z, 0x7fd6c0, 30, 4, 0.5, 0, 1);
      if (s.blinkBlast) { hitCircle(p.pos, 3, 1.0, { knock: 1 }); fxRing(p.pos.x, p.pos.y, p.pos.z, 3, 0xb57bff, 0.4); }
      act(p, 'cast', 0.2);
    },
    arrow: function (p, s, dir) {
      act(p, 'bow', 0.25);
      spawnProj({ x: p.pos.x + dir.x * 0.6, z: p.pos.z + dir.z * 0.6, h: 1.4, dx: dir.x, dz: dir.z, speed: s.speed, range: s.range, owner: 'player', kind: 'arrow', mult: s.mult, radius: 0.5,
        pierce: !!s.pierce, opts: p.flags.arrowPoison ? { poison: { t: 3, dps: p.atk * 0.2 } } : undefined });
    },
    fan: function (p, s, dir) {
      act(p, 'bow', 0.3);
      var base = Math.atan2(dir.x, dir.z), sp = s.spread * Math.PI / 180;
      for (var i = 0; i < s.count; i++) {
        var a = base - sp / 2 + sp * i / (s.count - 1);
        spawnProj({ x: p.pos.x, z: p.pos.z, h: 1.4, dx: Math.sin(a), dz: Math.cos(a), speed: s.speed, range: s.range, owner: 'player', kind: 'arrow', mult: s.mult, radius: 0.5,
          opts: p.flags.arrowPoison ? { poison: { t: 3, dps: p.atk * 0.2 } } : undefined });
      }
    },
    rain: function (p, s, dir) {
      var d = Math.min(dir.len, s.range), tx = p.pos.x + dir.x * d, tz = p.pos.z + dir.z * d;
      act(p, 'bow', 0.3);
      telegraph(tx, tz, s.radius, s.dur, 0xd4a64a);
      zonesFx.push({ x: tx, z: tz, r: s.radius, ticks: s.ticks, every: s.dur / s.ticks, t: 0.3, mult: s.mult });
    },
    leap: function (p, s, dir) {
      p.dash = { dx: -dir.x, dz: -dir.z, left: s.dist, total: s.dist, speed: 30, hit: [], noHit: true, hop: true, color: 0x9fd4e8 };
      if (s.leapReset) p.cds[0] = 0;
      act(p, 'leap', 0.35);
    },
    stab: function (p, s, dir) {
      act(p, 'stab', 0.22);
      after(0.06, function () { if (p.dead) return; hitArc(p, dir, s.range, s.arc, s.mult, s.bleed ? { poison: { t: 3, dps: p.atk * 0.2, kind: 'bleed' } } : {}); fxArc(p.pos.x, p.pos.y, p.pos.z, p.facing, s.range, s.arc, 0xb9a0d0); });
    },
    shadowstep: function (p, s) {
      var best = null, bd = 1e9;
      for (var i = 0; i < monsters.length; i++) {
        var m = monsters[i];
        if (!m.alive || dist2(p.pos, m.pos) > s.range) continue;
        var d = dist2(aim, m.pos);
        if (d < bd) { bd = d; best = m; }
      }
      if (!best) { UI.floater(p.pos.x, p.pos.y + 2.4, p.pos.z, 'ไม่มีเป้าหมายในระยะ', 'info'); return false; }
      Particles.burst(p.pos.x, p.pos.y + 1, p.pos.z, 0x7a5aa0, 30, 4, 0.5, 0, 1);
      var bx = best.pos.x - p.pos.x, bz = best.pos.z - p.pos.z, bl = Math.sqrt(bx * bx + bz * bz) || 1;
      p.pos.x = best.pos.x + bx / bl * (best.def.radius + 0.9); p.pos.z = best.pos.z + bz / bl * (best.def.radius + 0.9);
      World.collide(p.pos, p.radius);
      p.pos.y = World.heightAt(p.pos.x, p.pos.z);
      p.targetFacing = p.facing = Math.atan2(best.pos.x - p.pos.x, best.pos.z - p.pos.z);
      cam.target.set(p.pos.x, p.pos.y + 1.4, p.pos.z);
      Particles.burst(p.pos.x, p.pos.y + 1, p.pos.z, 0x7a5aa0, 30, 4, 0.5, 0, 1);
      act(p, 'stab', 0.25);
      damageMonster(best, p.atk * s.mult, { crit: true });
      return true;
    },
    venom: function (p, s, dir) {
      act(p, 'stab', 0.25);
      var base = Math.atan2(dir.x, dir.z), sp = s.spread * Math.PI / 180;
      for (var i = 0; i < s.count; i++) {
        var a = base - sp / 2 + sp * i / (s.count - 1);
        spawnProj({ x: p.pos.x, z: p.pos.z, h: 1.3, dx: Math.sin(a), dz: Math.cos(a), speed: s.speed, range: s.range, owner: 'player', kind: 'dagger', mult: s.mult, radius: 0.5, opts: { poison: { t: s.poisonDur, dps: p.atk * s.poisonMult } } });
      }
    },
    vanish: function (p, s) {
      addBuff(p, 'vanish', s.dur, { bonus: s.bonus });
      Models.setOpacity(p.model, 0.3);
      Particles.burst(p.pos.x, p.pos.y + 1, p.pos.z, 0x5a4a7a, 40, 3, 0.7, 0, 2);
      for (var i = 0; i < monsters.length; i++) if (monsters[i].state === 'chase' || monsters[i].state === 'windup') { monsters[i].state = 'return'; }
      act(p, 'cast', 0.2);
    },
  };

  /* ---- skill tree: unlocked nodes, effective skill numbers ---- */
  function nodeList(p) {
    var out = [], tree = TW.TREES[p.cls.id] || [];
    for (var b = 0; b < tree.length; b++) for (var t = 0; t < tree[b].nodes.length; t++) if (p.skills.unlocked[tree[b].nodes[t].id]) out.push(tree[b].nodes[t]);
    return out;
  }
  /* a copy of the skill with every unlocked node's mod added and its flags set */
  function eff(p, s) {
    var o = Object.assign({}, s), nodes = nodeList(p);
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.skill !== s.id) continue;
      if (n.mod) Object.keys(n.mod).forEach(function (k) { o[k] = (o[k] || 0) + n.mod[k]; });
      if (n.flag) o[n.flag] = true;
    }
    if (o.cd != null) o.cd = Math.max(0.2, o.cd);
    return o;
  }
  function useSkill(i) {
    var p = player;
    if (!p || p.dead || G.paused || G.panel || G.mode !== 'game' || G.dialogOpen) return;
    var s = eff(p, p.cls.skills[i]);
    if (p.cds[i] > 0 || p.dash) return;
    if (p.mp < s.mp) { if (i > 0) UI.floater(p.pos.x, p.pos.y + 2.4, p.pos.z, 'MP ไม่พอ', 'info'); return; }
    if (i === 0 && p.anim.act && p.anim.act.type === 'raise') return;
    var dir = aimDir(p);
    p.targetFacing = p.facing = Math.atan2(dir.x, dir.z);
    var ok = SKILLS[s.id](p, s, dir);
    if (ok === false) return;
    p.mp -= s.mp;
    p.cds[i] = s.cd * (1 - p.cdr / 100);
    p.moveTo = null;
  }
  function usePotion() {
    var p = player;
    if (!p || p.dead || p.potionCd > 0 || G.paused || G.panel || G.dialogOpen) return;
    if (p.potions <= 0) { UI.floater(p.pos.x, p.pos.y + 2.4, p.pos.z, 'ไม่มียาแล้ว', 'info'); return; }
    p.potions--; p.potionCd = 1.5;
    var heal = Math.round(p.maxHp * 0.4 * (1 + p.bonus.potionPct / 100));
    p.hp = Math.min(p.maxHp, p.hp + heal);
    UI.floater(p.pos.x, p.pos.y + 2.4, p.pos.z, '+' + heal, 'heal');
    Particles.burst(p.pos.x, p.pos.y + 1, p.pos.z, 0x7fd6c0, 30, 3, 0.8, -2, 2);
  }
  /* Universal dodge roll: toward the movement input, else toward the walk target, else where the hunter faces. */
  function dodge() {
    var p = player, D = TW.DODGE;
    if (!p || p.dead || G.paused || G.panel || G.mode !== 'game' || G.dialogOpen || p.dash || p.dodgeCd > 0) return;
    var keys = input.keys;
    var fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    var str = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    if (input.joy.on) { fwd = -input.joy.y; str = input.joy.x; }
    var dx = -Math.sin(cam.yaw) * fwd + Math.cos(cam.yaw) * str, dz = -Math.cos(cam.yaw) * fwd - Math.sin(cam.yaw) * str;
    var l = Math.sqrt(dx * dx + dz * dz);
    if (l < 0.08 && p.moveTo) { dx = p.moveTo.x - p.pos.x; dz = p.moveTo.z - p.pos.z; l = Math.sqrt(dx * dx + dz * dz); }
    if (l < 0.08) { dx = Math.sin(p.facing); dz = Math.cos(p.facing); l = 1; }
    dx /= l; dz /= l;
    p.dash = { dx: dx, dz: dz, left: D.dist, total: D.dist, speed: D.speed, hit: [], noHit: true, color: 0xebe2c9 };
    p.dodgeCd = p.dodgeCdMax || D.cd;
    p.targetFacing = p.facing = Math.atan2(dx, dz);
    act(p, 'roll', D.dist / D.speed);
    Particles.burst(p.pos.x, p.pos.y + 0.3, p.pos.z, 0x9a948a, 14, 3, 0.5, 2, 1);
  }

  /* ---- damage ---- */
  function hitArc(p, dir, range, arcDeg, mult, opts) {
    var cosHalf = Math.cos(arcDeg * Math.PI / 360), hits = 0;
    for (var i = 0; i < monsters.length; i++) {
      var m = monsters[i];
      if (!m.alive) continue;
      var dx = m.pos.x - p.pos.x, dz = m.pos.z - p.pos.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d > range + m.def.radius) continue;
      if (d > 0.6 && (dx * dir.x + dz * dir.z) / d < cosHalf) continue;
      damageMonster(m, p.atk * mult, opts);
      hits++;
    }
    if (hits) shake(0.08);
    return hits;
  }
  function hitCircle(c, radius, mult, opts) {
    var hits = 0;
    for (var i = 0; i < monsters.length; i++) {
      var m = monsters[i];
      if (!m.alive) continue;
      if (dist2(c, m.pos) <= radius + m.def.radius * 0.5) { damageMonster(m, player.atk * mult, opts); hits++; }
    }
    return hits;
  }
  function damageMonster(m, raw, opts) {
    if (!m.alive) return;
    opts = opts || {};
    if (m.def.boss && bossSealed()) {
      if (G.time - (m.sealMsg || -9) > 2.5) {
        m.sealMsg = G.time;
        UI.floater(m.pos.x, m.pos.y + m.def.height * 0.85, m.pos.z, 'หลับใหล', 'info');
        UI.toast('', 'ธอร์นฮาร์ตยังหลับใหล', 'รับประกาศ "' + TW.QUESTS[TW.BOSS_UNLOCK_QUEST].title + '" จาก' + TW.NPC.name + 'ก่อน จึงจะปลุกมันได้', 'quiet');
      }
      return;
    }
    var p = player, crit = opts.crit || Math.random() < p.crit, mult = 1;
    if (p.buffs.vanish) { crit = true; mult *= p.buffs.vanish.bonus; endBuff(p, 'vanish'); }
    var dmg = raw * rand(0.9, 1.1) * 40 / (40 + m.def.def) * mult;
    if (crit) dmg *= p.critMult;
    dmg = Math.max(1, Math.round(dmg));
    m.hp -= dmg;
    m.flash = 0.12;
    m.lastHit = G.time;
    if (p.lifesteal > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + dmg * p.lifesteal / 100);
    if (crit) G.hitstop = Math.max(G.hitstop, 0.04);
    if (m.elite && m.elite.reflect && !opts.dot) damagePlayer(dmg * m.elite.reflect, m, true);
    UI.floater(m.pos.x + rand(-0.4, 0.4), m.pos.y + m.def.height * 0.85, m.pos.z, dmg, crit ? 'crit' : 'hit');
    Particles.burst(m.pos.x, m.pos.y + m.def.height * 0.5, m.pos.z, crit ? 0xd4a64a : 0xebe2c9, crit ? 18 : 8, 4, 0.4, 5);
    if (opts.slow) m.slow = { t: opts.slow.t, f: opts.slow.f };
    if (opts.stun && !m.def.boss) { m.stun = Math.max(m.stun, opts.stun); if (m.state === 'windup') m.state = 'chase'; }
    if (opts.poison) m.poison = { t: opts.poison.t, dps: opts.poison.dps, acc: 0, kind: opts.poison.kind || 'poison' };
    else if (p.flags.venomTouch && !opts.dot && Math.random() < 0.2) m.poison = { t: 3, dps: p.atk * 0.25, acc: 0, kind: 'poison' };
    if (opts.knock && !m.def.boss) { var dx = m.pos.x - p.pos.x, dz = m.pos.z - p.pos.z, l = Math.sqrt(dx * dx + dz * dz) || 1; m.knock = { x: dx / l * 9, z: dz / l * 9, t: 0.25 }; }
    aggro(m);
    if (m.def.summon && !m.summoned && m.alive && m.hp > 0 && m.hp < m.maxHp * m.def.summonAt) {
      summonMinions(m, m.def.summon.type, m.def.summon.n);
      UI.toast('', m.def.th + 'เรียกพวก', '', 'quiet');
    }
    if (m.def.boss && !m.enraged && m.hp < m.maxHp * 0.5) { m.enraged = true; UI.toast('', 'ธอร์นฮาร์ตคลั่ง', 'หัวใจของมันเต้นเร็วขึ้น โจมตีถี่ขึ้น และยิงหนามรอบตัว', 'quiet'); Particles.burst(m.pos.x, m.pos.y + 4.5, m.pos.z, 0xff6a2a, 80, 8, 1, 3, 3); }
    if (m.hp <= 0) killMonster(m);
  }
  var DOT_COLOR = { poison: 0x9ad14b, burn: 0xff8a3c, bleed: 0xe4683a };
  function dotMonster(m, dmg, kind) {
    if (!m.alive) return;
    dmg = Math.max(1, Math.round(dmg));
    m.hp -= dmg;
    m.lastHit = G.time;
    var col = DOT_COLOR[kind] || DOT_COLOR.poison;
    UI.floater(m.pos.x + rand(-0.4, 0.4), m.pos.y + m.def.height * 0.85, m.pos.z, dmg, 'dot', '#' + ('000000' + col.toString(16)).slice(-6));
    Particles.burst(m.pos.x, m.pos.y + m.def.height * 0.5, m.pos.z, col, 4, 2, 0.5, 0, 2);
    if (m.hp <= 0) killMonster(m);
  }
  /* flat = skip the defence formula (reflected damage) */
  function damagePlayer(raw, src, flat) {
    var p = player;
    if (!p || p.dead || p.invuln > 0) return;
    var dmg = flat ? raw : raw * rand(0.9, 1.1) * 40 / (40 + p.def);
    if (p.buffs.ironwill) dmg *= 1 - p.buffs.ironwill.reduce;
    dmg = Math.max(1, Math.round(dmg));
    p.hp -= dmg;
    p.lastHurt = G.time;
    p.hurtFlash = 0.12;
    if (!flat && p.buffs.ironwill && p.flags.ironReflect && src && src.model && src.alive) dotMonster(src, dmg * 0.3, 'bleed');
    Models.tint(p.model, 0xe4683a, 0.9);
    UI.floater(p.pos.x, p.pos.y + 2.5, p.pos.z, dmg, 'hurt');
    UI.hurt();
    shake(Math.min(0.5, dmg / p.maxHp * 2));
    if (p.hp <= 0) { p.hp = 0; playerDie(); }
  }
  /* a damage-over-time on the hunter (spore cloud); the stronger of two overlapping ones wins */
  function applyPlayerDot(t, dps) {
    var p = player;
    if (!p || p.dead) return;
    if (!p.dot || p.dot.dps <= dps) p.dot = { t: t, dps: dps, acc: 0 };
    else p.dot.t = Math.max(p.dot.t, t);
  }
  function knockPlayer(from, force) {
    var p = player, dx = p.pos.x - from.x, dz = p.pos.z - from.z, l = Math.sqrt(dx * dx + dz * dz) || 1;
    p.knock = { x: dx / l * force, z: dz / l * force, t: 0.3 };
  }
  function playerDie() {
    var p = player;
    p.dead = true; p.deathT = 0; p.dash = null; p.anim.act = null;
    for (var k in p.buffs) endBuff(p, k);
    Models.tint(p.model, 0, 0);
    for (var i = 0; i < monsters.length; i++) if (monsters[i].state === 'chase' || monsters[i].state === 'windup') monsters[i].state = 'return';
    UI.boss(false, 0);
    var loss = Math.floor(p.gold * 0.1);
    after(1.4, function () { UI.overlay('death', true, { loss: loss }); });
  }
  function respawn() {
    var p = player;
    p.gold -= Math.floor(p.gold * 0.1);
    p.dead = false; p.hp = p.maxHp; p.mp = p.maxMp; p.dot = null;
    p.pos.set(SPAWN.x, World.heightAt(SPAWN.x, SPAWN.z), SPAWN.z);
    p.facing = p.targetFacing = Math.PI;
    p.model.root.rotation.set(0, Math.PI, 0);
    cam.target.set(p.pos.x, p.pos.y + 1.4, p.pos.z);
    cam.yaw = 0;
    UI.overlay('death', false);
    UI.clearFloaters();
    saveGame();
  }

  /* =============== monsters =============== */
  var BAR_GEO = new T.PlaneGeometry(1, 1); BAR_GEO.userData.shared = true;
  var BAR_BG = new T.MeshBasicMaterial({ color: 0x0e1613, transparent: true, opacity: 0.75, depthTest: false }); BAR_BG.userData.shared = true;
  var BAR_FG = new T.MeshBasicMaterial({ color: 0xe4683a, transparent: true, depthTest: false }); BAR_FG.userData.shared = true;
  function makeBar(def) {
    var w = def.radius * 1.8 + 0.6;
    var g = new T.Group();
    var bg = new T.Mesh(BAR_GEO, BAR_BG); bg.scale.set(w + 0.1, 0.22, 1); bg.renderOrder = 20;
    var fg = new T.Mesh(BAR_GEO, BAR_FG); fg.scale.set(w, 0.13, 1); fg.position.z = 0.01; fg.renderOrder = 21;
    g.add(bg); g.add(fg);
    g.visible = false;
    scene.add(g);
    return { g: g, fg: fg, w: w };
  }
  /* ---- elites: a stat layer plus one affix on top of a normal monster ---- */
  var ELITE_FG = new T.MeshBasicMaterial({ color: 0xb57bff, transparent: true, depthTest: false }); ELITE_FG.userData.shared = true;
  var AURA_GEO = new T.RingGeometry(0.75, 1.0, 36); AURA_GEO.rotateX(-Math.PI / 2); AURA_GEO.userData.shared = true;
  function makeElite(m, affixId) {
    var E = TW.ELITE, base = m.baseDef;
    var affix = affixId ? E.affixes.filter(function (a) { return a.id === affixId; })[0] : E.affixes[Math.floor(Math.random() * E.affixes.length)];
    m.elite = affix;
    m.def = Object.assign({}, base, {
      hp: Math.round(base.hp * E.hp), atk: base.atk * E.atk, def: base.def + E.def, exp: base.exp * E.exp,
      gold: [base.gold[0] * E.gold, base.gold[1] * E.gold], speed: base.speed * (affix.speed || 1), atkCd: base.atkCd * (affix.atkCd || 1),
    });
    m.maxHp = m.def.hp; m.hp = m.maxHp;
    m.eliteName = base.th + affix.th;
    m.summoned = false;
    m.model.root.scale.setScalar(E.scale);
    if (m.bar) m.bar.fg.material = ELITE_FG;
    var aura = new T.Mesh(AURA_GEO, new T.MeshBasicMaterial({ color: affix.hex, transparent: true, opacity: 0.6, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    aura.scale.setScalar(base.radius * 1.6 + 0.6);
    scene.add(aura);
    m.aura = aura;
  }
  function clearElite(m) {
    if (m.aura) { scene.remove(m.aura); m.aura.material.dispose(); m.aura = null; }
    if (m.bar) m.bar.fg.material = BAR_FG;
    m.elite = null; m.eliteName = ''; m.def = m.baseDef; m.maxHp = m.baseDef.hp;
    m.model.root.scale.setScalar(m.baseDef.scale || 1);
  }
  function spawnMonster(type, zone, x, z, temp) {
    var def = TW.MONSTERS[type];
    var model = Models.monster(def.base || type);
    if (def.scale) model.root.scale.setScalar(def.scale);
    scene.add(model.root);
    var m = {
      type: type, def: def, baseDef: def, elite: null, aura: null, eliteName: '', temp: !!temp, summoned: false, gone: false,
      model: model, bar: def.boss ? null : makeBar(def), zone: zone,
      pos: new T.Vector3(x, World.heightAt(x, z), z), home: { x: x, z: z }, hp: def.hp, maxHp: def.hp, alive: true,
      state: 'idle', wanderT: rand(0, 3), tx: x, tz: z, facing: rand(0, TAU), atkT: rand(0, 1), windT: 0, windMax: 1, attackKind: 'melee', tele: null,
      flash: 0, stun: 0, slow: null, poison: null, knock: null, anim: rand(0, 6), deathT: 0, respawn: 0, tint: '', pattern: 0, enraged: false, lunge: 0, lastHit: -99,
    };
    monsters.push(m);
    if (!temp && !def.boss && !def.mini && Math.random() < TW.ELITE.chance) makeElite(m);
    return m;
  }
  function populate() {
    TW.ZONES.forEach(function (zone) {
      (zone.spawns || []).forEach(function (sp) {
        if (sp.center) { for (var c = 0; c < sp.count; c++) spawnMonster(sp.type, zone, zone.x, zone.z); return; }
        if (sp.at) { spawnMonster(sp.type, zone, sp.at[0], sp.at[1]); return; }
        var packs = sp.pack ? Math.ceil(sp.count / sp.pack) : sp.count, made = 0;
        for (var i = 0; i < packs && made < sp.count; i++) {
          var a = rand(0, TAU), r = rand(zone.r * 0.15, zone.r * 0.72);
          var cx = zone.x + Math.cos(a) * r, cz = zone.z + Math.sin(a) * r;
          var n = sp.pack ? Math.min(sp.pack, sp.count - made) : 1;
          for (var k = 0; k < n; k++) {
            var x = cx + rand(-3, 3), z = cz + rand(-3, 3), tries = 0;
            while (World.isBlocked(x, z, 1.2) && tries++ < 8) { x = cx + rand(-5, 5); z = cz + rand(-5, 5); }
            spawnMonster(sp.type, zone, x, z);
            made++;
          }
        }
      });
    });
  }
  function resetMonsters() { monsters.forEach(function (m) { respawnMonster(m); }); }
  function respawnMonster(m) {
    clearElite(m);
    if (!m.baseDef.boss && !m.baseDef.mini && !m.temp && Math.random() < TW.ELITE.chance) makeElite(m);
    m.alive = true; m.hp = m.maxHp; m.state = 'idle'; m.wanderT = rand(1, 4);
    m.pos.set(m.home.x, World.heightAt(m.home.x, m.home.z), m.home.z);
    m.stun = 0; m.slow = null; m.poison = null; m.knock = null; m.enraged = false; m.pattern = 0; m.flash = 0; m.lunge = 0; m.summoned = false; m.rallyT = 0;
    m.model.root.visible = true; m.model.root.scale.setScalar(m.elite ? TW.ELITE.scale : (m.def.scale || 1));
    if (m.aura) m.aura.visible = true;
    m.model.root.rotation.set(0, m.facing, 0);
    Models.tint(m.model, 0, 0); m.tint = '';
    if (m.bar) m.bar.g.visible = false;
  }
  /* temporary minions around m (elite summoners, mini-bosses at half health) */
  function summonMinions(m, type, n) {
    m.summoned = true;
    for (var k = 0; k < n; k++) {
      var a = rand(0, TAU), mm = spawnMonster(type, m.zone, m.pos.x + Math.cos(a) * 2.5, m.pos.z + Math.sin(a) * 2.5, true);
      mm.state = 'chase';
      Particles.burst(mm.pos.x, mm.pos.y + 1, mm.pos.z, m.elite ? m.elite.hex : 0xff9a3c, 24, 3, 0.6, 0, 2);
    }
  }
  function aggro(m) {
    if (!m.alive || m.state === 'chase' || m.state === 'windup' || m.state === 'lunge' || !player || player.dead) return;
    if (m.def.boss && bossSealed()) return;
    if (m.state === 'return' && m.hp < m.maxHp * 0.5) return;
    m.state = 'chase';
    if (m.elite && m.elite.minions && !m.summoned) {
      summonMinions(m, m.type, m.elite.minions);
      UI.toast('', m.eliteName + 'เรียกพวก', '', 'quiet');
    }
    if (m.def.pack) {
      for (var i = 0; i < monsters.length; i++) {
        var o = monsters[i];
        if (o !== m && o.alive && o.type === m.type && (o.state === 'idle' || o.state === 'wander') && dist2(o.pos, m.pos) < 12) o.state = 'chase';
      }
    }
  }
  function moveToward(m, tx, tz, speed, dt) {
    var dx = tx - m.pos.x, dz = tz - m.pos.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.05) return true;
    var step = Math.min(d, speed * dt);
    m.pos.x += dx / d * step; m.pos.z += dz / d * step;
    m.facing = angLerp(m.facing, Math.atan2(dx, dz), Math.min(1, dt * 8));
    return d - step < 0.3;
  }
  function faceTarget(m, t, dt) { m.facing = angLerp(m.facing, Math.atan2(t.x - m.pos.x, t.z - m.pos.z), Math.min(1, dt * 10)); }

  var WINDUP = { smash: 0.85, slam: 1.25, rock: 0.75, nova: 1.0, lunge: 0.7, spear: 0.6, rally: 0.8, cloud: 1.0 };
  function chooseAttack(m, dp) {
    if (m.def.mini) {
      m.pattern = (m.pattern + 1) % m.def.attacks.length;
      var k = m.def.attacks[m.pattern];
      if (k === 'lunge' && dp < 4) k = 'melee';
      return k;
    }
    if (!m.def.boss) return m.def.ranged ? 'spit' : 'melee';
    if (dp > 9) return 'rock';
    var seq = m.enraged ? ['smash', 'slam', 'nova', 'smash'] : ['smash', 'smash', 'slam'];
    m.pattern = (m.pattern + 1) % seq.length;
    return seq[m.pattern];
  }
  function startWindup(m, dp) {
    var p = player;
    m.attackKind = chooseAttack(m, dp);
    m.windMax = m.windT = WINDUP[m.attackKind] || m.def.windup;
    m.state = 'windup';
    /* ordinary monsters telegraph with a red ring under them (bosses paint the real hit area below) */
    if (!m.def.boss) fxRing(m.pos.x, m.pos.y, m.pos.z, m.def.radius + 1.1, 0xe4683a, m.windT);
    if (m.attackKind === 'smash') { var fx = m.pos.x + Math.sin(m.facing) * 3.8, fz = m.pos.z + Math.cos(m.facing) * 3.8; m.tele = { x: fx, z: fz, r: 4.3 }; telegraph(fx, fz, 4.3, m.windT, 0xe4683a); }
    else if (m.attackKind === 'slam') { m.tele = { x: m.pos.x, z: m.pos.z, r: 9 }; telegraph(m.pos.x, m.pos.z, 9, m.windT, 0xe4683a); }
    else if (m.attackKind === 'nova') { telegraph(m.pos.x, m.pos.z, 5.5, m.windT, 0xd4a64a); }
    else if (m.attackKind === 'rock') { m.tele = { x: p.pos.x, z: p.pos.z, r: 3.4 }; telegraph(p.pos.x, p.pos.z, 3.4, m.windT + Math.max(0.3, dist2(m.pos, p.pos) / 22), 0xe4683a); }
    else if (m.attackKind === 'lunge') { m.tele = { x: p.pos.x, z: p.pos.z, r: 2.8 }; telegraph(p.pos.x, p.pos.z, 2.8, m.windT + 0.45, 0xe4683a); }
    else if (m.attackKind === 'cloud') { m.tele = { x: m.pos.x, z: m.pos.z, r: 6 }; telegraph(m.pos.x, m.pos.z, 6, m.windT, 0xb56fb0); }
  }
  function performAttack(m) {
    var p = player, def = m.def, kind = m.attackKind;
    var dp = p && !p.dead ? dist2(m.pos, p.pos) : 1e9;
    var dx, dz, l;
    switch (kind) {
      case 'melee':
        if (dp <= def.range + p.radius + def.radius * 0.3 + 0.8) damagePlayer(def.atk, m);
        m.lunge = 0.25;
        break;
      case 'spit':
        dx = p.pos.x - m.pos.x; dz = p.pos.z - m.pos.z; l = Math.sqrt(dx * dx + dz * dz) || 1;
        spawnProj({ x: m.pos.x, z: m.pos.z, h: 2.2, dx: dx / l, dz: dz / l, speed: 15, range: def.range + 8, owner: 'monster', kind: 'spore', radius: 0.6, dmg: def.atk });
        Particles.burst(m.pos.x, m.pos.y + 2.4, m.pos.z, 0xb56fb0, 16, 3, 0.6, 0, 2);
        m.lunge = 0.3;
        break;
      case 'smash':
        if (p && !p.dead && dist2(m.tele, p.pos) < m.tele.r + p.radius) damagePlayer(def.atk * 1.3, m);
        Particles.burst(m.tele.x, World.heightAt(m.tele.x, m.tele.z) + 0.5, m.tele.z, 0x8a7a5a, 40, 7, 0.8, 5, 3);
        shake(0.45); m.lunge = 0.35;
        break;
      case 'slam':
        if (p && !p.dead && dp < m.tele.r + p.radius) { damagePlayer(def.atk * 1.7, m); knockPlayer(m.pos, 16); }
        fxRing(m.pos.x, m.pos.y, m.pos.z, m.tele.r, 0xe4683a, 0.5);
        Particles.burst(m.pos.x, m.pos.y + 0.5, m.pos.z, 0x8a7a5a, 80, 12, 0.9, 5, 3);
        shake(0.9); m.lunge = 0.4;
        break;
      case 'rock':
        dx = m.tele.x - m.pos.x; dz = m.tele.z - m.pos.z; l = Math.sqrt(dx * dx + dz * dz) || 1;
        spawnProj({ x: m.pos.x, z: m.pos.z, h: 5, dx: dx / l, dz: dz / l, speed: 22, range: Math.max(4, l), arc: 7, owner: 'monster', kind: 'rock', radius: 0.8, noHit: true, dmg: def.atk * 1.2,
          onEnd: function (pr) {
            var y = World.heightAt(pr.x, pr.z);
            if (player && !player.dead && dist2(pr, player.pos) < 3.4 + player.radius) damagePlayer(pr.dmg, m);
            Particles.burst(pr.x, y + 0.4, pr.z, 0x8a7a5a, 40, 8, 0.8, 5, 3);
            fxRing(pr.x, y, pr.z, 3.4, 0xe4683a, 0.35);
            shake(0.3);
          } });
        m.lunge = 0.3;
        break;
      case 'lunge':
        /* dash to where the hunter stood when the wind-up began; resolved in the 'lunge' state */
        m.state = 'lunge'; m.lungeT = 0; m.atkT = def.atkCd;
        return;
      case 'spear':
        dx = p.pos.x - m.pos.x; dz = p.pos.z - m.pos.z; l = Math.sqrt(dx * dx + dz * dz) || 1;
        spawnProj({ x: m.pos.x, z: m.pos.z, h: 1.8, dx: dx / l, dz: dz / l, speed: 26, range: 22, owner: 'monster', kind: 'thorn', radius: 0.6, dmg: def.atk * 1.2 });
        m.lunge = 0.3;
        break;
      case 'rally':
        for (var ri = 0; ri < monsters.length; ri++) {
          var rm = monsters[ri];
          if (rm.alive && rm !== m && rm.type === 'goblin' && dist2(rm.pos, m.pos) < 22) { rm.rallyT = 6; if (rm.state === 'idle' || rm.state === 'wander' || rm.state === 'return') rm.state = 'chase'; }
        }
        UI.toast('', def.th + 'สั่งการ', 'ก็อบลินรอบตัวรุมเข้ามาและวิ่งเร็วขึ้น', 'quiet');
        Particles.burst(m.pos.x, m.pos.y + 2, m.pos.z, 0xf2d24b, 40, 5, 0.8, 0, 3);
        break;
      case 'cloud':
        fxRing(m.pos.x, m.pos.y, m.pos.z, m.tele.r, 0xb56fb0, 0.7);
        Particles.burst(m.pos.x, m.pos.y + 1.5, m.pos.z, 0xb56fb0, 90, 7, 1.2, 0, 2);
        if (p && !p.dead && dp < m.tele.r + p.radius) { damagePlayer(def.atk * 0.6, m); applyPlayerDot(4, def.atk * 0.25); }
        break;
      case 'nova':
        for (var i = 0; i < 14; i++) {
          var a = i / 14 * TAU;
          spawnProj({ x: m.pos.x + Math.sin(a) * 2.5, z: m.pos.z + Math.cos(a) * 2.5, h: 1.2, dx: Math.sin(a), dz: Math.cos(a), speed: 15, range: 24, owner: 'monster', kind: 'thorn', radius: 0.55, dmg: def.atk * 0.65 });
        }
        Particles.burst(m.pos.x, m.pos.y + 4.5, m.pos.z, 0xff6a2a, 60, 8, 0.8, 2, 2);
        shake(0.3);
        break;
    }
    m.state = 'chase';
    m.atkT = def.atkCd * (m.enraged ? 0.7 : 1);
  }
  function killMonster(m) {
    m.alive = false; m.state = 'dead'; m.deathT = 0; m.respawn = m.def.boss ? 120 : (m.def.mini ? 90 : 24);
    m.stun = 0; m.slow = null; m.poison = null;
    if (m.bar) m.bar.g.visible = false;
    if (m.aura) m.aura.visible = false;
    G.stats.kills++;
    G.hitstop = Math.max(G.hitstop, m.def.boss ? 0.22 : 0.06);
    if (m.elite && m.elite.blast) {
      /* volatile elites: a fuse, a red ring, then a blast where the corpse fell */
      var bx = m.pos.x, bz = m.pos.z, br = m.elite.blast, bdmg = m.def.atk * m.elite.blastMult;
      telegraph(bx, bz, br, m.elite.fuse, 0xff9a3c);
      after(m.elite.fuse, function () {
        var y = World.heightAt(bx, bz);
        fxRing(bx, y, bz, br, 0xff9a3c, 0.5);
        Particles.burst(bx, y + 0.6, bz, 0xff9a3c, 70, 9, 0.8, 5, 4);
        shake(0.4);
        if (player && !player.dead && dist2(player.pos, { x: bx, z: bz }) < br + player.radius) damagePlayer(bdmg, m);
      });
    }
    gainExp(m.def.exp);
    var gold = Math.round(randi(m.def.gold[0], m.def.gold[1]) * (1 + player.bonus.goldPct / 100));
    player.gold += gold;
    maybeDropItem(m);
    var matD = TW.MATERIALS.filter(function (x) { return x.from === (m.def.base || m.type); })[0];
    if (matD && (m.def.boss || m.def.mini || Math.random() < TW.MATERIAL_DROP)) {
      var mn = m.def.mini ? 3 : (m.elite ? 2 : 1);
      addMaterial(matD.id, mn);
      UI.floater(m.pos.x, m.pos.y + m.def.height * 0.5 + 0.7, m.pos.z, '+' + mn + ' ' + matD.th, 'item', matD.color);
    }
    UI.floater(m.pos.x, m.pos.y + m.def.height * 0.6, m.pos.z, '+' + gold + ' เหรียญ', 'gold');
    if (Math.random() < (m.def.boss ? 1 : 0.12)) {
      player.potions += m.def.boss ? 3 : 1;
      after(0.35, function () { UI.floater(m.pos.x, m.pos.y + m.def.height * 0.6, m.pos.z, m.def.boss ? '+3 ยาฟื้นพลัง' : '+1 ยาฟื้นพลัง', 'heal'); });
    }
    Particles.burst(m.pos.x, m.pos.y + m.def.height * 0.4, m.pos.z, m.def.boss ? 0xff8a3c : 0xebe2c9, m.def.boss ? 160 : 26, m.def.boss ? 9 : 5, 0.9, 4, 3);
    questProgress(m.type);
    if (m.def.boss) {
      UI.boss(false, 0);
      shake(1.2);
      if (!G.victoryShown) {
        G.victoryShown = true;
        saveGame();
        after(2.6, function () {
          var t = Math.round(G.time - G.stats.start), mm = Math.floor(t / 60), ss = t % 60;
          UI.overlay('victory', true, { time: mm + ':' + (ss < 10 ? '0' : '') + ss, kills: G.stats.kills, level: player.level, gold: player.gold });
        });
      }
    }
  }

  function updateMonster(m, dt) {
    var md = m.model, def = m.def;
    if (!m.alive) {
      m.deathT += dt;
      if (m.deathT < 0.7) {
        var k = 1 - m.deathT / 0.7;
        md.root.scale.setScalar(Math.max(0.01, k) * (m.elite ? TW.ELITE.scale : (m.def.scale || 1)));
        md.root.position.y = m.pos.y - (1 - k) * 0.6;
      } else if (m.temp) {
        /* summoned minions never come back */
        if (!m.gone) { m.gone = true; scene.remove(md.root); Models.dispose(md.root); if (m.bar) scene.remove(m.bar.g); clearElite(m); }
        return;
      } else md.root.visible = false;
      m.respawn -= dt;
      if (m.respawn <= 0) respawnMonster(m);
      return;
    }
    var p = player, canSee = p && !p.dead && !p.buffs.vanish && G.mode === 'game';
    var dp = canSee ? dist2(m.pos, p.pos) : 1e9;
    var far = p ? dist2(m.pos, p.pos) > FAR_CULL : dist2(m.pos, cam.target) > 170;
    md.root.visible = !far;
    if (far && m.state !== 'idle') m.state = m.state === 'wander' ? 'wander' : 'return';

    m.atkT = Math.max(0, m.atkT - dt);
    if (m.rallyT > 0) m.rallyT -= dt;
    if (m.flash > 0) m.flash -= dt;
    if (m.lunge > 0) m.lunge -= dt;
    if (m.poison) {
      m.poison.acc += dt; m.poison.t -= dt;
      if (m.poison.acc >= 0.5) { m.poison.acc -= 0.5; dotMonster(m, m.poison.dps * 0.5, m.poison.kind); if (!m.alive) return; }
      if (m.poison.t <= 0) m.poison = null;
    }
    var slowF = 1;
    if (m.slow) { m.slow.t -= dt; slowF = m.slow.f; if (m.slow.t <= 0) m.slow = null; }
    var tint = m.flash > 0 ? 'flash' : (m.slow ? 'frost' : (m.poison ? 'poison' : (m.state === 'windup' && !def.boss ? 'warn' : (m.enraged ? 'rage' : ''))));
    if (tint !== m.tint) {
      m.tint = tint;
      if (tint === 'flash') Models.tint(md, 0xffffff, 1.4);
      else if (tint === 'frost') Models.tint(md, 0x6fb8e0, 0.7);
      else if (tint === 'poison') Models.tint(md, 0x6fbf3a, 0.5);
      else if (tint === 'warn') Models.tint(md, 0xffb070, 0.55);
      else if (tint === 'rage') Models.tint(md, 0xa02a10, 0.35);
      else Models.tint(md, 0, 0);
    }
    if (m.knock) { m.pos.x += m.knock.x * dt; m.pos.z += m.knock.z * dt; m.knock.t -= dt; if (m.knock.t <= 0) m.knock = null; }

    var pInCamp = p && dist2(p.pos, VILLAGE) < VILLAGE.r + 3;
    var moving = false;
    if (m.stun > 0) {
      m.stun -= dt;
      if (Math.random() < dt * 6) Particles.spawn(m.pos.x + rand(-0.5, 0.5), m.pos.y + def.height + 0.3, m.pos.z + rand(-0.5, 0.5), 0, 1, 0, Particles.color.setHex(0xd4a64a), 0.5, 0);
    } else if (!far || m.state === 'return') {
      var reach = def.range + p_radius() + def.radius * 0.3;
      switch (m.state) {
        case 'idle':
          m.wanderT -= dt;
          if (m.wanderT <= 0 && !(def.boss && bossSealed())) { var a = rand(0, TAU), r = rand(2, def.boss ? 4 : 9); m.tx = m.home.x + Math.cos(a) * r; m.tz = m.home.z + Math.sin(a) * r; m.state = 'wander'; }
          if (canSee && dp < def.aggro && !pInCamp) aggro(m);
          break;
        case 'wander':
          moving = true;
          if (moveToward(m, m.tx, m.tz, def.speed * 0.35, dt)) { m.state = 'idle'; m.wanderT = rand(2, 6); }
          if (canSee && dp < def.aggro && !pInCamp) aggro(m);
          break;
        case 'chase':
          if (!canSee || pInCamp || dist2(m.pos, m.home) > (def.boss ? 34 : 52)) { m.state = 'return'; break; }
          if (dp <= reach && m.atkT <= 0) { startWindup(m, dp); break; }
          if (def.ranged && dp < def.range * 0.8) { faceTarget(m, p.pos, dt); if (m.atkT <= 0) startWindup(m, dp); }
          else if (dp > reach * 0.85) { moving = true; moveToward(m, p.pos.x, p.pos.z, def.speed * slowF * (m.rallyT > 0 ? 1.3 : 1), dt); }
          else faceTarget(m, p.pos, dt);
          break;
        case 'windup':
          m.windT -= dt * (def.boss ? 1 : slowF);
          if (!def.boss && canSee) faceTarget(m, p.pos, dt);
          if (m.windT <= 0) { if (canSee) performAttack(m); else m.state = 'return'; }
          break;
        case 'lunge':
          moving = true;
          m.lungeT += dt;
          if (moveToward(m, m.tele.x, m.tele.z, 22, dt) || m.lungeT > 1.2) {
            if (p && !p.dead && dist2(m.pos, p.pos) < m.tele.r + p.radius + 0.5) { damagePlayer(def.atk * 1.4, m); knockPlayer(m.pos, 10); }
            Particles.burst(m.pos.x, m.pos.y + 0.4, m.pos.z, 0x8a7a5a, 30, 6, 0.7, 5, 2);
            shake(0.3);
            m.lunge = 0.3;
            m.state = 'chase';
          }
          break;
        case 'return':
          moving = true;
          m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.25 * dt);
          if (moveToward(m, m.home.x, m.home.z, def.speed * 1.1, dt)) { m.state = 'idle'; m.wanderT = rand(1, 3); m.hp = m.maxHp; }
          break;
      }
    }
    World.collide(m.pos, def.radius * 0.8);
    var rr = Math.sqrt(m.pos.x * m.pos.x + m.pos.z * m.pos.z);
    if (rr > World.PLAY_R) { m.pos.x *= World.PLAY_R / rr; m.pos.z *= World.PLAY_R / rr; }
    m.pos.y = World.heightAt(m.pos.x, m.pos.z);
    if (far) return;

    animateMonster(m, dt, moving, slowF);
    md.root.position.copy(m.pos);
    md.root.rotation.set(0, m.facing, 0);
    if (m.elite) {
      m.aura.position.set(m.pos.x, m.pos.y + 0.12, m.pos.z);
      m.aura.rotation.y += dt * 1.5;
      if (m.elite.regen && m.hp < m.maxHp && G.time - m.lastHit > 2) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * m.elite.regen * dt);
    }
    if (m.bar) {
      var show = (m.hp < m.maxHp || m.state === 'chase' || m.state === 'windup') && dp < 70;
      m.bar.g.visible = show;
      if (show) {
        m.bar.g.position.set(m.pos.x, m.pos.y + def.height + 0.35, m.pos.z);
        m.bar.g.quaternion.copy(camera.quaternion);
        var ratio = Math.max(0, m.hp / m.maxHp);
        m.bar.fg.scale.x = m.bar.w * ratio;
        m.bar.fg.position.x = -(m.bar.w - m.bar.w * ratio) / 2;
      }
    }
    if (def.boss) {
      var asleep = bossSealed();
      md.heart.material.emissiveIntensity = asleep ? 0.35 : 2 + Math.sin(G.time * (m.enraged ? 9 : 4)) * 0.8;
      md.light.intensity = asleep ? 0.25 : 1.2 + Math.sin(G.time * (m.enraged ? 9 : 4)) * 0.5;
    }
  }
  function p_radius() { return player ? player.radius : 0.6; }
  /* the top bar follows whichever boss or mini-boss is fighting the hunter, nearest first */
  function updateBossBar() {
    if (G.mode !== 'game' || !player) { UI.boss(false, 0); return; }
    var best = null, bd = 1e9;
    for (var i = 0; i < monsters.length; i++) {
      var m = monsters[i];
      if (!m.alive || !(m.def.boss || m.def.mini) || !(m.state === 'chase' || m.state === 'windup' || m.state === 'lunge')) continue;
      var d = dist2(m.pos, player.pos);
      if (d < bd) { bd = d; best = m; }
    }
    if (best) UI.boss(true, best.hp / best.maxHp, best.def.latin, best.def.th + ' · ภัยระดับ ' + best.def.rank);
    else UI.boss(false, 0);
  }
  /* Old Thornheart sleeps (and the ruins arch is walled by thorns) until the final bounty is reached */
  function bossSealed() { return G.quest.idx < TW.BOSS_UNLOCK_QUEST; }
  function updateGate() {
    var open = !bossSealed();
    if (G.wallOpen === open) return;
    G.wallOpen = open;
    World.thornWall.set(!open);
    if (open && G.mode === 'game') {
      var w = World.thornWall;
      Particles.burst(w.x, w.y + 2, w.z, 0xff9a3c, 80, 6, 1.2, 2, 3);
      UI.toast('', 'รากหนามที่ซุ้มวิหารถอนตัวออกไป', 'ธอร์นฮาร์ตผู้เฒ่าตื่นแล้ว ระวังตัวเมื่อเข้าซากวิหาร', 'quiet');
    }
  }

  function animateMonster(m, dt, moving, slowF) {
    var md = m.model;
    m.anim += dt * (moving ? 1 : 0.35) * (slowF < 1 ? slowF + 0.15 : 1);
    var t = m.anim, w = m.state === 'windup' ? 1 - m.windT / m.windMax : 0, lunge = m.lunge > 0 ? Math.sin(m.lunge / 0.35 * Math.PI) : 0;
    switch (m.def.base || m.type) {
      case 'slime': {
        var hop = moving ? Math.abs(Math.sin(t * 6)) : Math.abs(Math.sin(t * 2)) * 0.15;
        md.body.position.y = hop * 0.7 + lunge * 0.5;
        var sq = 1 - w * 0.3;
        md.body.scale.set(1 + (1 - hop) * 0.1 + w * 0.2, (1 - (1 - hop) * 0.12 + hop * 0.1) * sq, 1 + (1 - hop) * 0.1 + w * 0.2);
        md.body.position.z = lunge * 0.8;
        break;
      }
      case 'wolf': {
        var s = moving ? Math.sin(t * 11) * 0.7 : Math.sin(t * 2) * 0.05;
        md.legs[0].rotation.x = s; md.legs[3].rotation.x = s; md.legs[1].rotation.x = -s; md.legs[2].rotation.x = -s;
        md.body.position.y = moving ? Math.abs(Math.cos(t * 11)) * 0.12 : 0;
        md.body.rotation.x = -w * 0.35 + lunge * 0.3;
        md.body.position.z = lunge * 1.1;
        md.head.rotation.x = Math.sin(t * 2) * 0.05 - w * 0.4 + lunge * 0.3;
        md.tail.rotation.y = Math.sin(t * 6) * 0.35;
        break;
      }
      case 'goblin': {
        var g = moving ? Math.sin(t * 10) * 0.75 : 0;
        md.legL.rotation.x = g; md.legR.rotation.x = -g;
        md.armL.rotation.x = -g * 0.6;
        md.armR.rotation.x = w > 0 ? -2.2 * w : (lunge > 0 ? -1.6 + lunge * 0.6 : g * 0.6);
        md.body.position.y = moving ? Math.abs(Math.cos(t * 10)) * 0.06 : Math.sin(t * 2) * 0.01;
        md.body.rotation.x = lunge * 0.3;
        md.body.position.z = lunge * 0.8;
        break;
      }
      case 'spore': {
        md.cap.rotation.z = Math.sin(t * 1.7) * 0.08;
        md.cap.rotation.x = Math.sin(t * 1.3) * 0.06;
        var puff = 1 + w * 0.35 - lunge * 0.25;
        md.cap.scale.set(puff, 1 - w * 0.25 + lunge * 0.2, puff);
        md.body.position.y = moving ? Math.abs(Math.sin(t * 5)) * 0.25 : 0;
        md.body.rotation.z = moving ? Math.sin(t * 5) * 0.1 : 0;
        break;
      }
      case 'boss': {
        var b = moving ? Math.sin(t * 4) * 0.45 : 0;
        md.legs[0].rotation.x = b; md.legs[1].rotation.x = -b;
        md.body.position.y = moving ? Math.abs(Math.cos(t * 4)) * 0.25 : Math.sin(t * 1.2) * 0.05;
        var k = m.attackKind;
        if (m.state === 'windup' && (k === 'smash' || k === 'slam' || k === 'nova')) {
          md.arms[0].rotation.x = md.arms[1].rotation.x = -2.6 * w;
          md.arms[0].rotation.z = k === 'slam' ? 0.9 * w : 0.2; md.arms[1].rotation.z = k === 'slam' ? -0.9 * w : -0.2;
          md.body.rotation.x = -0.25 * w;
        } else if (m.state === 'windup' && k === 'rock') {
          md.arms[1].rotation.x = -2.8 * w; md.arms[0].rotation.x = 0.3; md.arms[0].rotation.z = 0.2; md.arms[1].rotation.z = -0.4;
        } else if (lunge > 0) {
          md.arms[0].rotation.x = md.arms[1].rotation.x = 0.7 * lunge; md.body.rotation.x = 0.35 * lunge;
          md.arms[0].rotation.z = 0.2; md.arms[1].rotation.z = -0.2;
        } else {
          md.arms[0].rotation.x = -b * 0.5; md.arms[1].rotation.x = b * 0.5; md.arms[0].rotation.z = 0.2; md.arms[1].rotation.z = -0.2;
          md.body.rotation.x = 0;
        }
        md.head.rotation.y = Math.sin(t * 0.7) * 0.15;
        break;
      }
    }
  }
  function separateMonsters() {
    for (var i = 0; i < monsters.length; i++) {
      var a = monsters[i];
      if (!a.alive || !a.model.root.visible) continue;
      for (var j = i + 1; j < monsters.length; j++) {
        var b = monsters[j];
        if (!b.alive || !b.model.root.visible) continue;
        var dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d2 = dx * dx + dz * dz, min = (a.def.radius + b.def.radius) * 0.9;
        if (d2 < min * min && d2 > 1e-4) {
          var d = Math.sqrt(d2), push = (min - d) * 0.5;
          a.pos.x -= dx / d * push; a.pos.z -= dz / d * push; b.pos.x += dx / d * push; b.pos.z += dz / d * push;
        }
      }
    }
  }
  function updateZonesFx(dt) {
    for (var i = zonesFx.length - 1; i >= 0; i--) {
      var z = zonesFx[i];
      z.t -= dt;
      if (z.t <= 0) {
        z.t += z.every; z.ticks--;
        hitCircle(z, z.r, z.mult, {});
        var y = World.heightAt(z.x, z.z);
        for (var n = 0; n < 7; n++) {
          var a = rand(0, TAU), r = Math.sqrt(Math.random()) * z.r;
          spawnArrowDrop(z.x + Math.cos(a) * r, z.z + Math.sin(a) * r);
        }
        Particles.burst(z.x, y + 0.3, z.z, 0xd4a64a, 14, 4, 0.4, 3, 1);
        if (z.ticks <= 0) zonesFx.splice(i, 1);
      }
    }
  }
  function spawnArrowDrop(x, z) {
    var y0 = World.heightAt(x, z);
    var mesh = new T.Mesh(PGEO.arrow, PMAT.arrow);
    mesh.rotation.x = Math.PI / 2;
    addEffect(mesh, 0.5, function (e, k) { mesh.position.set(x, y0 + 0.4 + (1 - Math.min(1, k * 1.6)) * 14, z); if (k > 0.62) mesh.visible = k < 0.9; });
  }

  /* =============== quests =============== */
  /* Bounties are taken and paid at the guild master: available → active → complete (turn in) → next. */
  function refreshQuestHud() { UI.quest(TW.QUESTS[G.quest.idx] || null, G.quest.idx, G.quest.progress, G.quest.state); }
  function questProgress(type) {
    var q = TW.QUESTS[G.quest.idx];
    if (!q || q.target !== type || G.quest.state !== 'active') return;
    G.quest.progress++;
    if (G.quest.progress >= q.count) {
      G.quest.state = 'complete';
      UI.toast('ประกาศล่าครบแล้ว', q.title, 'กลับไปส่งมอบกับ' + TW.NPC.name + 'ที่หมู่บ้านเพื่อรับรางวัล');
      saveGame();
    }
    refreshQuestHud();
  }
  function acceptQuest() {
    var q = TW.QUESTS[G.quest.idx];
    if (!q || G.quest.state !== 'available') return;
    G.quest.state = 'active'; G.quest.progress = 0;
    UI.toast('รับประกาศล่าแล้ว', q.title, TW.MONSTERS[q.target].th + ' ' + q.count + ' ตัว · ' + TW.ZONE_BY_ID[q.zone].th, 'quiet');
    refreshQuestHud();
    saveGame();
  }
  function turnInQuest() {
    var q = TW.QUESTS[G.quest.idx];
    if (!q || G.quest.state !== 'complete') return;
    var r = q.reward, p = player;
    p.gold += r.gold; p.potions += r.potions;
    UI.toast('รับค่าหัวแล้ว', q.title, '+' + r.exp + ' EXP · +' + r.gold + ' เหรียญ' + (r.potions ? ' · +' + r.potions + ' ยาฟื้นพลัง' : ''), 'level');
    Particles.burst(p.pos.x, p.pos.y + 1.2, p.pos.z, 0xd4a64a, 40, 4, 0.9, 3, 3);
    G.quest.idx++; G.quest.progress = 0; G.quest.state = 'available';
    gainExp(r.exp);
    refreshQuestHud();
    saveGame();
  }
  var navT = 0, zoneT = 0;
  function updateQuestNav(dt) {
    navT -= dt;
    if (navT > 0) return;
    navT = 0.25;
    var q = TW.QUESTS[G.quest.idx], p = player;
    if (!q) { UI.questNav(0, null, ''); return; }
    var toNpc = G.quest.state !== 'active';
    var tx = toNpc ? TW.NPC.x : TW.ZONE_BY_ID[q.zone].x, tz = toNpc ? TW.NPC.z : TW.ZONE_BY_ID[q.zone].z;
    var dx = tx - p.pos.x, dz = tz - p.pos.z, d = Math.sqrt(dx * dx + dz * dz);
    var fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    var ang = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
    UI.questNav(ang, Math.max(0, Math.round(d - (toNpc ? 2 : TW.ZONE_BY_ID[q.zone].r * 0.6))), toNpc ? TW.NPC.name + ' · หมู่บ้าน' : TW.ZONE_BY_ID[q.zone].th);
  }

  /* ---- the guild master ---- */
  var npcs = [], npc = null; /* npc = the guild master (bounties); npcs = everyone you can talk to */
  function createNpcs() {
    TW.NPCS.forEach(function (d) {
      var model = Models.npc(d.role), y = World.heightAt(d.x, d.z);
      model.root.position.set(d.x, y, d.z);
      model.root.rotation.y = d.facing;
      scene.add(model.root);
      World.addCollider(d.x, d.z, 0.7);
      npcs.push({ model: model, def: d, pos: new T.Vector3(d.x, y, d.z), facing: d.facing, anim: { walk: 0, move: 0, act: null }, waveT: rand(4, 9), wasNear: false });
    });
    npc = npcs[0];
  }
  function inRangeOf(n) { return !!(n && player && !player.dead && dist2(player.pos, n.pos) < n.def.talkRange); }
  function nearestNpc(maxD) {
    var best = null, bd = maxD || 1e9;
    if (!player) return null;
    for (var i = 0; i < npcs.length; i++) { var d = dist2(player.pos, npcs[i].pos); if (d < bd) { bd = d; best = npcs[i]; } }
    return best;
  }
  /* Space / tap / click on a villager: what happens depends on who they are */
  function interactWith(n) {
    if (!n || !inRangeOf(n)) return;
    if (n.def.role === 'merchant') openShop();
    else if (n.def.role === 'smith') openSmith();
    else openDialog();
  }
  function updateNpc(dt) {
    for (var i = 0; i < npcs.length; i++) {
      var n = npcs[i];
      var near = G.mode === 'game' && player && !player.dead && dist2(player.pos, n.pos) < 7;
      var target = near ? Math.atan2(player.pos.x - n.pos.x, player.pos.z - n.pos.z) : n.def.facing;
      n.facing = angLerp(n.facing, target, Math.min(1, dt * 4));
      n.model.root.rotation.y = n.facing;
      n.waveT -= dt;
      if ((near && !n.wasNear) || (!near && n.waveT <= 0)) { n.anim.act = { type: 'wave', dur: 1.2, t: 0 }; n.waveT = rand(6, 12); }
      n.wasNear = near;
      animateHero(n.model, { anim: n.anim }, dt, false);
    }
  }
  function npcInRange() { return inRangeOf(npc); }
  var labelV = new T.Vector3();
  function updateNpcLabel() {
    var n = G.mode === 'game' && player ? nearestNpc(34) : null;
    if (!n) { UI.npcLabel(false); return; }
    labelV.set(n.pos.x, n.pos.y + 2.55, n.pos.z).project(camera);
    if (labelV.z > 1) { UI.npcLabel(false); return; }
    UI.npcLabel(true, (labelV.x + 1) / 2 * window.innerWidth, (1 - labelV.y) / 2 * window.innerHeight, inRangeOf(n), n.def);
  }
  function dialogData() {
    var d = TW.NPC, q = TW.QUESTS[G.quest.idx], base = { name: d.name, title: d.title };
    if (!q) return Object.assign(base, { text: d.idle, buttons: [{ act: 'close', label: 'ลาก่อน' }] });
    if (G.quest.state === 'available') return Object.assign(base, { text: (G.quest.idx === 0 ? d.greet + ' ' : '') + q.offer, quest: q, buttons: [{ act: 'accept', label: 'รับประกาศ', primary: true }, { act: 'close', label: 'ไว้ก่อน' }] });
    if (G.quest.state === 'active') return Object.assign(base, { text: d.active, quest: q, progress: G.quest.progress, buttons: [{ act: 'close', label: 'ปิด' }] });
    return Object.assign(base, { text: q.done, quest: q, buttons: [{ act: 'turnin', label: 'รับรางวัล', primary: true }] });
  }
  function openDialog() {
    if (G.mode !== 'game' || G.paused || !npcInRange()) return;
    G.dialogOpen = true;
    input.rDown = false; input.lDown = false; input.attackHold = false;
    player.moveTo = null;
    UI.dialog(true, dialogData());
  }
  function closeDialog() { G.dialogOpen = false; G.dialogKind = ''; UI.dialog(false); }
  function dialogAction(act) {
    if (act.indexOf('travel:') === 0) { travelTo(act.slice(7)); return; }
    if (act === 'accept') { acceptQuest(); UI.dialog(true, dialogData()); }
    else if (act === 'turnin') { turnInQuest(); UI.dialog(true, dialogData()); }
    else closeDialog();
  }
  function updateZone(dt) {
    zoneT -= dt;
    if (zoneT > 0) return;
    zoneT = 0.5;
    var zn = World.zoneAt(player.pos.x, player.pos.z);
    if (zn !== G.zone) {
      G.zone = zn;
      UI.zone(zn);
      if (zn) UI.toast(zn.lv, zn.th, zn.safe ? 'พักฟื้นได้ที่นี่ อสูรจะไม่ตามเข้ามา' : '', 'quiet');
    }
  }

  /* =============== camera =============== */
  var tmpV = new T.Vector3();
  function updateCamera(dt) {
    if (G.mode === 'title') {
      var t = G.time * 0.04, r = 125;
      camera.position.set(Math.sin(t) * r, 64 + Math.sin(t * 0.7) * 6, 30 + Math.cos(t) * r);
      camera.lookAt(0, 4, 20);
      return;
    }
    if (G.mode === 'class') {
      var P = World.PREVIEW, y = World.heightAt(P.x, P.z), D = G.previewDist || 6.6;
      camera.position.set(P.x, y + 1.2 + D * 0.14, P.z + D);
      camera.lookAt(P.x, y + 1.2, P.z);
      return;
    }
    var p = player;
    if (input.keys.KeyQ) cam.yaw += dt * 1.8;
    if (input.keys.KeyE) cam.yaw -= dt * 1.8;
    tmpV.set(p.pos.x, p.pos.y + 1.4, p.pos.z);
    cam.target.lerp(tmpV, 1 - Math.pow(0.0005, dt));
    var cp = Math.cos(cam.pitch) * cam.dist, sp = Math.sin(cam.pitch) * cam.dist;
    var cx = cam.target.x + Math.sin(cam.yaw) * cp, cz = cam.target.z + Math.cos(cam.yaw) * cp, cy = cam.target.y + sp;
    var gh = World.heightAt(cx, cz) + 2.5;
    if (cy < gh) cy = gh;
    camera.position.set(cx, cy, cz);
    if (cam.shake > 0) {
      camera.position.x += rand(-1, 1) * cam.shake * 0.5; camera.position.y += rand(-1, 1) * cam.shake * 0.5;
      cam.shake = Math.max(0, cam.shake - dt * 2.2);
    }
    camera.lookAt(cam.target);
  }
  function applyStageOffset() {
    var w = window.innerWidth, h = window.innerHeight;
    if (G.mode !== 'class') { camera.clearViewOffset(); return; }
    var c = UI.stageCenter();
    /* pull the camera back until the hunter (≈2.6 m tall) fits inside the stage column */
    G.previewDist = clamp(3.3 * h / Math.max(100, c.h || h), 5.5, 13);
    camera.setViewOffset(w, h, Math.round(w / 2 - c.x), Math.round(h / 2 - c.y), w, h);
  }
  function focusPoint() {
    if (G.mode === 'game' && player) return player.pos;
    if (G.mode === 'class') return tmpV.set(World.PREVIEW.x, World.heightAt(World.PREVIEW.x, World.PREVIEW.z), World.PREVIEW.z);
    return tmpV.set(0, 0, 40);
  }

  /* =============== modes =============== */
  function showTitle() {
    saveGame();
    closeDialog();
    UI.npcLabel(false);
    G.mode = 'title';
    G.paused = false;
    camera.clearViewOffset();
    if (player) { scene.remove(player.model.root); Models.dispose(player.model.root); player = null; }
    clearPreview();
    projectiles.forEach(function (p) { scene.remove(p.mesh); }); projectiles.length = 0;
    effects.forEach(function (e) { scene.remove(e.obj); disposeObj(e.obj); }); effects.length = 0;
    timers.length = 0; zonesFx.length = 0;
    clearPickups();
    G.panel = null; G.invSel = null;
    UI.inventory(false);
    UI.setBagNew(false);
    UI.clearFloaters();
    UI.boss(false, 0);
    ['pause', 'death', 'victory', 'howto'].forEach(function (id) { UI.overlay(id, false); });
    resetMonsters();
    World.pedestalRing.visible = false;
    World.thornWall.set(true);
    G.wallOpen = null;
    UI.showSave(loadSave());
    UI.screen('title');
  }
  function showClass() {
    G.mode = 'class';
    G.previewYaw = 0;
    World.pedestalRing.visible = true;
    UI.screen('class');
    UI.selectClass(G.cls);
    setPreview(G.cls);
    applyStageOffset();
  }
  function clearPreview() {
    if (preview) { scene.remove(preview.root); Models.dispose(preview.root); preview = null; }
  }
  function setPreview(clsId) {
    clearPreview();
    G.cls = clsId;
    preview = Models.hero(clsId);
    var P = World.PREVIEW, y = World.heightAt(P.x, P.z);
    preview.root.position.set(P.x, y, P.z);
    preview.anim = { walk: 0, move: 0, act: null };
    var flourish = { warrior: 'swing', mage: 'raise', ranger: 'bow', assassin: 'stab' }[clsId];
    preview.anim.act = { type: flourish, dur: 0.6, t: -0.2 };
    scene.add(preview.root);
    Particles.burst(P.x, y + 1, P.z, 0x6cc2ab, 40, 3, 0.8, 0, 2);
  }
  function startGame(clsId, name, restore) {
    clearPreview();
    camera.clearViewOffset();
    World.pedestalRing.visible = false;
    if (player) { scene.remove(player.model.root); Models.dispose(player.model.root); }
    player = createPlayer(clsId, name);
    G.mode = 'game';
    G.paused = false;
    G.victoryShown = false;
    G.zone = null;
    G.dialogOpen = false;
    UI.dialog(false);
    G.quest = { idx: 0, progress: 0, state: 'available' };
    G.stats = { kills: 0, start: G.time };
    if (restore) {
      player.level = clamp(restore.level || 1, 1, TW.MAX_LEVEL); recalc(player, true);
      player.exp = restore.exp || 0; player.gold = restore.gold || 0; player.potions = restore.potions == null ? 3 : restore.potions;
      if (restore.quest) {
        G.quest.idx = clamp(restore.quest.idx || 0, 0, TW.QUESTS.length);
        G.quest.progress = restore.quest.progress || 0;
        G.quest.state = restore.quest.state || (G.quest.progress > 0 ? 'active' : 'available');
      }
      G.stats.kills = restore.kills || 0; G.stats.start = G.time - (restore.elapsed || 0);
      if (Array.isArray(restore.inventory)) player.inventory = restore.inventory.filter(TW.Items.valid).slice(0, TW.BAG_SIZE);
      if (restore.equip) TW.SLOTS.forEach(function (s) { var it = restore.equip[s.id]; player.equip[s.id] = TW.Items.valid(it) && it.slot === s.id ? it : null; });
      TW.Items.adoptUids(player.inventory.concat(TW.SLOTS.map(function (s) { return player.equip[s.id]; })));
      /* attribute points: trust the save, but never let spent + unspent exceed what the level grants */
      var budget = (player.level - 1) * TW.POINTS_PER_LEVEL, spent = 0;
      TW.ATTRS.forEach(function (a) { var n = restore.attrs && restore.attrs[a.id] > 0 ? Math.floor(restore.attrs[a.id]) : 0; player.attrs[a.id] = n; spent += n; });
      if (spent > budget) { TW.ATTRS.forEach(function (a) { player.attrs[a.id] = 0; }); spent = 0; }
      player.points = Math.max(0, budget - spent);
      /* skill nodes: keep only real ids in tier order, within the level's budget */
      var skillBudget = (player.level - 1) * TW.SKILL_POINTS_PER_LEVEL, savedNodes = Array.isArray(restore.skills) ? restore.skills : [], used = 0;
      player.skills.unlocked = {};
      (TW.TREES[player.cls.id] || []).forEach(function (br) {
        for (var t = 0; t < br.nodes.length; t++) {
          if (savedNodes.indexOf(br.nodes[t].id) < 0 || used >= skillBudget) break;
          player.skills.unlocked[br.nodes[t].id] = true; used++;
        }
      });
      player.skillPoints = Math.max(0, skillBudget - used);
      player.materials = {};
      if (restore.materials && typeof restore.materials === 'object') TW.MATERIALS.forEach(function (md) { var n = Math.floor(restore.materials[md.id]); if (n > 0) player.materials[md.id] = Math.min(999, n); });
      player.inventory.concat(TW.SLOTS.map(function (s) { return player.equip[s.id]; })).forEach(function (it) { if (it) it.plus = clamp(Math.floor(it.plus || 0), 0, TW.UPGRADE.max); });
      recalc(player, true);
      G.victoryShown = G.quest.idx >= TW.QUESTS.length;
      if (restore.x != null) { player.pos.set(restore.x, 0, restore.z); player.pos.y = World.heightAt(restore.x, restore.z); }
    }
    G.token = (restore && restore.token) || newToken();
    clearPickups();
    /* waystones: the village stone is always known; the rest come back from the save */
    G.waystones = {};
    World.waystones.forEach(function (w) { w.set(false); });
    var savedStones = restore && Array.isArray(restore.waystones) ? restore.waystones : [];
    World.waystones.forEach(function (w) { if (w.def.id === 'village' || savedStones.indexOf(w.def.id) >= 0) lightWaystone(w, true); });
    resetMonsters();
    G.wallOpen = null;
    cam.yaw = 0; cam.shake = 0;
    cam.target.set(player.pos.x, player.pos.y + 1.4, player.pos.z);
    UI.setupHUD(player);
    UI.setPoints(player.points + player.skillPoints);
    refreshQuestHud();
    UI.zone(World.zoneAt(player.pos.x, player.pos.z));
    UI.screen('game');
    navT = 0; zoneT = 0; saveT = 0;
    var q = TW.QUESTS[G.quest.idx];
    var hint = !q ? 'ป่าสงบแล้ว ล่าต่อได้ตามใจ' :
      G.quest.state === 'available' ? 'ไปคุยกับ' + TW.NPC.name + 'ที่กระดานประกาศกลางหมู่บ้านเพื่อรับประกาศล่า' :
      G.quest.state === 'complete' ? 'ประกาศ "' + q.title + '" ครบแล้ว กลับไปส่งมอบกับ' + TW.NPC.name :
      'ประกาศปัจจุบัน: ' + q.title + ' — ' + q.brief;
    UI.toast('ยินดีต้อนรับ ' + name, restore ? 'กลับมาล่าต่อที่มอสเวล' : 'ยินดีต้อนรับสู่หมู่บ้านมอสเวล', hint);
    if (input.touch && window.innerHeight > window.innerWidth) after(2.8, function () { if (G.mode === 'game') UI.toast('', 'หมุนจอเป็นแนวนอน', 'จะเห็นสนามกว้างขึ้นและกดสกิลถนัดกว่า', 'quiet'); });
    saveGame();
  }
  function togglePause(on) {
    if (G.mode !== 'game') return;
    if (on == null) on = !G.paused;
    if (on && (player.dead || UI.anyOverlay())) return;
    G.paused = on;
    UI.overlay('pause', on);
    input.keys = {};
    input.lDown = false; input.rDown = false;
    if (on) saveGame();
  }

  /* =============== loot on the ground & the bag =============== */
  var PICK_GEO = new T.IcosahedronGeometry(0.32, 0); PICK_GEO.userData.shared = true;
  var PICK_BEAM = new T.CylinderGeometry(0.1, 0.28, 6, 8); PICK_BEAM.userData.shared = true;
  function spawnItemPickup(item, x, z) {
    var rar = TW.Items.rarity(item);
    var g = new T.Group();
    var stone = new T.Mesh(PICK_GEO, new T.MeshStandardMaterial({ color: rar.hex, emissive: rar.hex, emissiveIntensity: 0.9 + item.rarity * 0.2, roughness: 0.35, flatShading: true }));
    stone.position.y = 0.9;
    var beam = new T.Mesh(PICK_BEAM, new T.MeshBasicMaterial({ color: rar.hex, transparent: true, opacity: 0.12 + item.rarity * 0.06, blending: T.AdditiveBlending, depthWrite: false }));
    beam.position.y = 3.0;
    g.add(stone); g.add(beam);
    g.position.set(x, World.heightAt(x, z), z);
    scene.add(g);
    pickups.push({ kind: 'item', item: item, g: g, stone: stone, x: x, z: z, t: rand(0, 6), warned: false });
    if (item.rarity >= 3) UI.toast('', TW.Items.rarity(item).th + '!', item.name + ' ตกลงมา', 'quiet');
  }
  function maybeDropItem(m) {
    var n = (m.def.boss || m.def.mini) ? 2 : (Math.random() < TW.ITEM_DROP ? 1 : 0);
    for (var k = 0; k < n; k++) {
      var item = TW.Items.roll(m.def.lv + (Math.random() < 0.5 ? 1 : 0), m.def.boss ? 2 : (m.elite || m.def.mini ? 1 : 0));
      spawnItemPickup(item, m.pos.x + rand(-1.3, 1.3), m.pos.z + rand(-1.3, 1.3));
    }
  }
  function updatePickups(dt) {
    for (var i = pickups.length - 1; i >= 0; i--) {
      var pk = pickups[i];
      pk.t += dt;
      pk.stone.rotation.y += dt * 2.2;
      pk.stone.position.y = 0.9 + Math.sin(pk.t * 3) * 0.18;
      if (Math.random() < dt * 2.5) Particles.spawn(pk.x + rand(-0.3, 0.3), pk.g.position.y + 0.4, pk.z + rand(-0.3, 0.3), 0, 1.6, 0, Particles.color.setHex(TW.Items.rarity(pk.item).hex), 0.8, -0.8);
      if (!player || player.dead || dist2(player.pos, pk) > 1.9) continue;
      if (player.inventory.length >= TW.BAG_SIZE) {
        if (!pk.warned) { pk.warned = true; UI.floater(pk.x, pk.g.position.y + 2, pk.z, 'กระเป๋าเต็ม', 'info'); }
        continue;
      }
      var rar = TW.Items.rarity(pk.item);
      player.inventory.push(pk.item);
      UI.floater(pk.x, pk.g.position.y + 2.2, pk.z, pk.item.name, 'item', rar.color);
      Particles.burst(pk.x, pk.g.position.y + 1, pk.z, rar.hex, 24, 3, 0.7, 0, 2);
      scene.remove(pk.g); disposeObj(pk.g); pickups.splice(i, 1);
      UI.setBagNew(true);
      saveGame();
    }
  }
  function clearPickups() { pickups.forEach(function (pk) { scene.remove(pk.g); disposeObj(pk.g); }); pickups.length = 0; UI.lootLabels([]); }
  var lootV = new T.Vector3(), lootList = [];
  function updateLootLabels() {
    lootList.length = 0;
    if (G.mode === 'game' && player) {
      /* waystones show their name; a lit one nearby also shows the travel key */
      var nearW = nearWaystone();
      for (var wi = 0; wi < World.waystones.length && lootList.length < 4; wi++) {
        var ws = World.waystones[wi];
        if (dist2(player.pos, ws.def) > 34) continue;
        lootV.set(ws.def.x, ws.group.position.y + 4.9, ws.def.z).project(camera);
        if (lootV.z > 1) continue;
        var tag = ws.lit ? ws.def.th + (ws === nearW ? (input.touch ? ' · แตะเพื่อเดินทาง' : ' · Space เดินทาง') : '') : ws.def.th + ' · ยังไม่ปลุก';
        lootList.push({ x: (lootV.x + 1) / 2 * window.innerWidth, y: (1 - lootV.y) / 2 * window.innerHeight, name: tag, color: ws.lit ? '#6cc2ab' : '#86836f' });
      }
      /* elites wear their name and affix over their heads */
      for (var e = 0; e < monsters.length && lootList.length < 6; e++) {
        var em = monsters[e], tag = em.elite ? em.eliteName : (em.def.mini ? em.def.th + ' · ภัยระดับ ' + em.def.rank : null);
        if (!em.alive || !tag || dist2(player.pos, em.pos) > 34) continue;
        lootV.set(em.pos.x, em.pos.y + em.def.height * (em.elite ? TW.ELITE.scale : 1) + 0.6, em.pos.z).project(camera);
        if (lootV.z > 1) continue;
        lootList.push({ x: (lootV.x + 1) / 2 * window.innerWidth, y: (1 - lootV.y) / 2 * window.innerHeight, name: tag, color: em.elite ? em.elite.color : '#ff9a3c' });
      }
      for (var i = 0; i < pickups.length && lootList.length < 8; i++) {
        var pk = pickups[i];
        if (dist2(player.pos, pk) > 24) continue;
        lootV.set(pk.x, pk.g.position.y + 1.6, pk.z).project(camera);
        if (lootV.z > 1) continue;
        lootList.push({ x: (lootV.x + 1) / 2 * window.innerWidth, y: (1 - lootV.y) / 2 * window.innerHeight, name: pk.item.name, color: TW.Items.rarity(pk.item).color });
      }
    }
    UI.lootLabels(lootList);
  }

  /* ---- inventory panel ---- */
  function statLines(p) {
    var e = p.bonus, out = [
      { label: 'พลังโจมตี', value: Math.round(p.atk) }, { label: 'ป้องกัน', value: Math.round(p.def) },
      { label: 'พลังชีวิต', value: p.maxHp }, { label: 'พลังเวท', value: p.maxMp },
      { label: 'คริติคอล', value: Math.round(p.crit * 100) + '%' }, { label: 'ความเร็ว', value: p.speed.toFixed(1) + ' ม./วิ' },
    ];
    if (p.cdr) out.push({ label: 'ลดคูลดาวน์', value: Math.round(p.cdr) + '%' });
    if (p.mpRegenBonus) out.push({ label: 'ฟื้นพลังเวทเพิ่ม', value: '+' + p.mpRegenBonus.toFixed(1) + '/วิ' });
    if (e.lifesteal) out.push({ label: 'ดูดเลือด', value: Math.round(e.lifesteal) + '%' });
    if (e.goldPct) out.push({ label: 'เหรียญที่ได้', value: '+' + Math.round(e.goldPct) + '%' });
    if (e.potionPct) out.push({ label: 'ประสิทธิภาพยา', value: '+' + Math.round(e.potionPct) + '%' });
    return out;
  }
  function findItem(uid) { for (var i = 0; i < player.inventory.length; i++) if (player.inventory[i].uid === uid) return i; return -1; }
  function renderInventory() {
    var p = player, sel = null, equipped = false;
    if (G.invSel && G.invSel.uid != null) { var i = findItem(G.invSel.uid); sel = i >= 0 ? p.inventory[i] : null; }
    else if (G.invSel && G.invSel.slot) { sel = p.equip[G.invSel.slot]; equipped = !!sel; }
    if (!sel) G.invSel = null;
    var cost = TW.RESPEC_COST * p.level, spent = 0;
    TW.ATTRS.forEach(function (a) { spent += p.attrs[a.id] || 0; });
    UI.inventory(true, {
      equip: p.equip, items: p.inventory, stats: statLines(p), selected: sel, equipped: equipped, compare: sel ? p.equip[sel.slot] : null,
      attrs: TW.ATTRS.map(function (a) { return { id: a.id, th: a.th, desc: a.desc, value: p.attrs[a.id] || 0 }; }),
      points: p.points, respecCost: cost, canRespec: spent > 0 && p.gold >= cost,
      materials: matList(),
    });
    renderSkillTree();
    UI.panelTab(G.panelTab);
  }
  /* ---- skill tree panel ---- */
  function nodeState(p, br, t) {
    var n = br.nodes[t];
    if (p.skills.unlocked[n.id]) return 'unlocked';
    if (t === 0 || p.skills.unlocked[br.nodes[t - 1].id]) return 'available';
    return 'locked';
  }
  function renderSkillTree() {
    var p = player, tree = TW.TREES[p.cls.id] || [], cost = TW.RESPEC_COST * p.level, spent = nodeList(p).length;
    UI.skillTree({
      branches: tree.map(function (br) { return { th: br.th, nodes: br.nodes.map(function (n, t) { return { id: n.id, th: n.th, desc: n.desc, state: nodeState(p, br, t) }; }) }; }),
      points: p.skillPoints, respecCost: cost, canRespec: spent > 0 && p.gold >= cost,
    });
  }
  function unlockNode(id) {
    var p = player, tree = TW.TREES[p.cls.id] || [];
    if (p.skillPoints <= 0) return;
    for (var b = 0; b < tree.length; b++) for (var t = 0; t < tree[b].nodes.length; t++) {
      if (tree[b].nodes[t].id !== id) continue;
      if (nodeState(p, tree[b], t) !== 'available') return;
      p.skills.unlocked[id] = true;
      p.skillPoints--;
      recalc(p, false);
      UI.setPoints(p.points + p.skillPoints);
      UI.toast('', tree[b].nodes[t].th, tree[b].nodes[t].desc, 'quiet');
      renderInventory();
      saveGame();
      return;
    }
  }
  function respecSkills() {
    var p = player, cost = TW.RESPEC_COST * p.level, spent = nodeList(p).length;
    if (!spent || p.gold < cost) return;
    p.gold -= cost;
    p.skillPoints += spent;
    p.skills.unlocked = {};
    recalc(p, false);
    UI.setPoints(p.points + p.skillPoints);
    UI.toast('', 'ล้างทักษะแล้ว', 'ได้แต้มทักษะคืน ' + spent + ' แต้ม', 'quiet');
    renderInventory();
    saveGame();
  }
  function addAttr(id) {
    var p = player;
    if (!p || p.points <= 0 || !TW.ATTRS.some(function (a) { return a.id === id; })) return;
    p.attrs[id] = (p.attrs[id] || 0) + 1;
    p.points--;
    recalc(p, false);
    UI.setPoints(p.points + p.skillPoints);
    renderInventory();
    saveGame();
  }
  function respecAttrs() {
    var p = player, cost = TW.RESPEC_COST * p.level, spent = 0;
    TW.ATTRS.forEach(function (a) { spent += p.attrs[a.id] || 0; });
    if (!spent || p.gold < cost) return;
    p.gold -= cost;
    p.points += spent;
    TW.ATTRS.forEach(function (a) { p.attrs[a.id] = 0; });
    recalc(p, false);
    UI.setPoints(p.points + p.skillPoints);
    UI.toast('', 'ล้างแต้มแล้ว', 'ได้แต้มคืน ' + spent + ' แต้ม', 'quiet');
    renderInventory();
    saveGame();
  }
  /* tab = 'char' | 'skills'; pressing the other tab's key while open just switches tabs */
  function toggleInventory(on, tab) {
    if (G.mode !== 'game' || !player) return;
    if (G.panel && G.panel !== 'inventory') { closePanel(); if (on === false) return; on = true; }
    if (G.panel && on == null && tab && tab !== G.panelTab) { G.panelTab = tab; renderInventory(); return; }
    if (on == null) on = !G.panel;
    if (on && (player.dead || G.paused || UI.anyOverlay())) return;
    G.panel = on ? 'inventory' : null;
    if (tab) G.panelTab = tab;
    input.keys = {}; input.lDown = false; input.rDown = false; input.attackHold = false;
    if (on) { G.invSel = null; UI.setBagNew(false); if (G.dialogOpen) closeDialog(); renderInventory(); }
    else UI.inventory(false);
  }
  function equipItem(uid) {
    var p = player, i = findItem(uid);
    if (i < 0) return;
    var item = p.inventory[i], cur = p.equip[item.slot];
    p.inventory.splice(i, 1);
    p.equip[item.slot] = item;
    if (cur) p.inventory.push(cur);
    recalc(p, false);
    G.invSel = { slot: item.slot };
    renderInventory();
    saveGame();
  }
  function unequipItem(slot) {
    var p = player, item = p.equip[slot];
    if (!item) return;
    if (p.inventory.length >= TW.BAG_SIZE) { UI.toast('', 'กระเป๋าเต็ม', 'ทิ้งหรือสวมของอื่นก่อน', 'quiet'); return; }
    p.equip[slot] = null;
    p.inventory.push(item);
    recalc(p, false);
    G.invSel = { uid: item.uid };
    renderInventory();
    saveGame();
  }
  function discardItem(uid) {
    var i = findItem(uid);
    if (i < 0) return;
    player.inventory.splice(i, 1);
    G.invSel = null;
    renderInventory();
    saveGame();
  }

  /* =============== waystones (fast travel) =============== */
  var wayT = 0;
  function nearWaystone() {
    var p = player, best = null, bd = 2.6;
    if (!p) return null;
    for (var i = 0; i < World.waystones.length; i++) { var d = dist2(p.pos, World.waystones[i].def); if (d < bd) { bd = d; best = World.waystones[i]; } }
    return best;
  }
  function lightWaystone(w, quiet) {
    if (w.lit) return;
    w.set(true);
    G.waystones[w.def.id] = true;
    if (!quiet) {
      UI.toast('ปลุกหินเวทแล้ว', w.def.th, 'ยืนใกล้หินเวทที่ปลุกแล้วกด Space เพื่อเดินทางไปหินก้อนอื่น', 'quiet');
      Particles.burst(w.def.x, w.group.position.y + 2, w.def.z, 0x6cc2ab, 60, 5, 1, 0, 3);
      saveGame();
    }
  }
  function updateWaystones(dt) {
    wayT -= dt;
    if (wayT > 0 || !player || player.dead) return;
    wayT = 0.25;
    var w = nearWaystone();
    if (w && !w.lit) lightWaystone(w);
  }
  function openTravel() {
    var w = nearWaystone();
    if (!w || !w.lit || G.mode !== 'game' || G.paused || G.panel) return;
    var dests = World.waystones.filter(function (o) { return o.lit && o !== w; });
    var buttons = dests.map(function (o) { return { act: 'travel:' + o.def.id, label: o.def.th.replace('หินเวท', '') }; });
    buttons.push({ act: 'close', label: 'ปิด' });
    G.dialogOpen = true; G.dialogKind = 'travel';
    input.rDown = false; input.lDown = false; input.attackHold = false;
    player.moveTo = null;
    UI.dialog(true, {
      name: w.def.th, title: 'หินเวท · เดินทางด่วน',
      text: dests.length ? 'เลือกหินเวทปลายทางที่เคยปลุกไว้' : 'ยังไม่มีหินเวทก้อนอื่นที่ปลุกไว้ ออกสำรวจให้เจอหินก้อนถัดไปก่อน',
      buttons: buttons,
    });
  }
  function travelTo(id) {
    var w = World.waystones.filter(function (o) { return o.def.id === id && o.lit; })[0], p = player;
    if (!w || !p) return;
    Particles.burst(p.pos.x, p.pos.y + 1, p.pos.z, 0x6cc2ab, 40, 4, 0.7, 0, 2);
    UI.flash('#6cc2ab');
    p.pos.set(w.def.x, 0, w.def.z + 2.6);
    p.pos.y = World.heightAt(p.pos.x, p.pos.z);
    p.moveTo = null; p.dash = null; p.knock = null;
    p.facing = p.targetFacing = Math.PI;
    cam.target.set(p.pos.x, p.pos.y + 1.4, p.pos.z);
    Particles.burst(p.pos.x, p.pos.y + 1, p.pos.z, 0x6cc2ab, 40, 4, 0.7, 0, 2);
    closeDialog();
    for (var i = 0; i < monsters.length; i++) if (monsters[i].state === 'chase' || monsters[i].state === 'windup') monsters[i].state = 'return';
    UI.toast('', w.def.th, 'เดินทางถึงแล้ว', 'quiet');
    saveGame();
  }

  /* =============== merchant & smith =============== */
  function addMaterial(id, n) { player.materials[id] = (player.materials[id] || 0) + n; }
  function matList() { return TW.MATERIALS.map(function (m) { return { id: m.id, th: m.th, color: m.color, count: player.materials[m.id] || 0 }; }); }
  function closePanel() {
    if (!G.panel) return;
    G.panel = null; G.shopSel = null; G.smithSel = null;
    UI.inventory(false); UI.shop(false); UI.smith(false);
  }
  function openPanel(kind) {
    if (G.mode !== 'game' || G.paused || !player || player.dead || UI.anyOverlay()) return false;
    if (G.dialogOpen) closeDialog();
    if (G.panel) closePanel();
    G.panel = kind;
    input.keys = {}; input.lDown = false; input.rDown = false; input.attackHold = false;
    player.moveTo = null;
    return true;
  }
  function openShop() { if (openPanel('shop')) { G.shopSel = null; renderShop(); } }
  function renderShop() {
    var p = player, i = G.shopSel != null ? findItem(G.shopSel) : -1;
    var commons = p.inventory.filter(function (it) { return it.rarity === 0; });
    UI.shop(true, {
      npc: TW.NPCS[1], gold: p.gold, potions: p.potions, potionPrice: TW.SHOP.potionPrice, brewJelly: TW.SHOP.brewJelly, jelly: p.materials.jelly || 0,
      items: p.inventory, selected: i >= 0 ? p.inventory[i] : null,
      commonCount: commons.length, commonValue: commons.reduce(function (s, it) { return s + TW.Items.value(it); }, 0),
    });
  }
  function shopAction(act, id) {
    var p = player;
    if (act === 'close') { closePanel(); return; }
    if (act === 'buy-potion') { if (p.gold < TW.SHOP.potionPrice) return; p.gold -= TW.SHOP.potionPrice; p.potions++; }
    else if (act === 'brew') { if ((p.materials.jelly || 0) < TW.SHOP.brewJelly) return; p.materials.jelly -= TW.SHOP.brewJelly; p.potions++; }
    else if (act === 'sell') { var i = findItem(id); if (i < 0) return; p.gold += TW.Items.value(p.inventory[i]); p.inventory.splice(i, 1); G.shopSel = null; }
    else if (act === 'sell-common') {
      for (var k = p.inventory.length - 1; k >= 0; k--) if (p.inventory[k].rarity === 0) { p.gold += TW.Items.value(p.inventory[k]); p.inventory.splice(k, 1); }
      G.shopSel = null;
    }
    renderShop();
    saveGame();
  }
  function openSmith() { if (openPanel('smith')) { G.smithSel = null; renderSmith(); } }
  function smithSelected() {
    var p = player, s = G.smithSel;
    if (!s) return null;
    if (s.slot) return p.equip[s.slot] || null;
    var i = findItem(s.uid);
    return i >= 0 ? p.inventory[i] : null;
  }
  function renderSmith() {
    var p = player, sel = smithSelected(), cost = sel ? TW.Items.upgradeCost(sel) : null, cands = [];
    TW.SLOTS.forEach(function (s) { if (p.equip[s.id]) cands.push({ item: p.equip[s.id], worn: true }); });
    p.inventory.forEach(function (it) { cands.push({ item: it, worn: false }); });
    UI.smith(true, {
      npc: TW.NPCS[2], gold: p.gold, materials: matList(), candidates: cands, selected: sel, worn: !!(sel && G.smithSel.slot), cost: cost,
      canUpgrade: !!(sel && TW.Items.canUpgrade(sel, p.gold, p.materials)),
      preview: sel && cost ? TW.Items.lines(Object.assign({}, sel, { plus: cost.next })) : null,
    });
  }
  function smithAction(act) {
    var p = player;
    if (act === 'close') { closePanel(); return; }
    if (act === 'upgrade') {
      var sel = smithSelected();
      if (!sel || !TW.Items.canUpgrade(sel, p.gold, p.materials)) return;
      var cost = TW.Items.upgradeCost(sel);
      p.gold -= cost.gold;
      Object.keys(cost.mats).forEach(function (k) { p.materials[k] -= cost.mats[k]; });
      sel.plus = cost.next;
      if (G.smithSel.slot) recalc(p, false);
      UI.toast('', TW.Items.displayName(sel), 'ตีบวกสำเร็จ', 'level');
      Particles.burst(p.pos.x, p.pos.y + 1.2, p.pos.z, 0xffb35c, 30, 4, 0.8, 3, 3);
    }
    renderSmith();
    saveGame();
  }

  /* ---- click-to-move ---- */
  var gpV = new T.Vector3();
  /* March the cursor ray against the height field until it dips under the terrain. */
  function groundPoint(ndc) {
    ray.setFromCamera(ndc, camera);
    var o = ray.ray.origin, d = ray.ray.direction;
    if (d.y >= -0.02) return null;
    var t = 0, prev = 0, step = 1.5;
    for (var i = 0; i < 160; i++) {
      t += step;
      gpV.copy(o).addScaledVector(d, t);
      if (gpV.y <= World.heightAt(gpV.x, gpV.z)) {
        var lo = prev, hi = t;
        for (var k = 0; k < 6; k++) { var mid = (lo + hi) / 2; gpV.copy(o).addScaledVector(d, mid); if (gpV.y <= World.heightAt(gpV.x, gpV.z)) hi = mid; else lo = mid; }
        gpV.copy(o).addScaledVector(d, hi);
        var r = Math.sqrt(gpV.x * gpV.x + gpV.z * gpV.z);
        if (r > World.PLAY_R) { gpV.x *= World.PLAY_R / r; gpV.z *= World.PLAY_R / r; }
        gpV.y = World.heightAt(gpV.x, gpV.z);
        return gpV;
      }
      prev = t;
    }
    return null;
  }
  /* fresh = a new press (drops a marker, may target the villager); false = held button following the cursor */
  function clickMove(fresh) {
    var p = player;
    if (!p || p.dead || G.paused || G.panel || G.mode !== 'game' || UI.anyOverlay()) return;
    if (fresh) {
      ray.setFromCamera(input.ndc, camera);
      for (var ni = 0; ni < npcs.length; ni++) {
        var n = npcs[ni];
        if (!ray.intersectObject(n.model.root, true).length) continue;
        if (inRangeOf(n)) { p.moveTo = null; if (!G.dialogOpen) interactWith(n); return; }
        var dx = n.pos.x - p.pos.x, dz = n.pos.z - p.pos.z, l = Math.sqrt(dx * dx + dz * dz) || 1;
        p.moveTo = { x: n.pos.x - dx / l * 2.2, z: n.pos.z - dz / l * 2.2, talk: n, best: 1e9, stuckT: 0 };
        fxRing(n.pos.x, n.pos.y, n.pos.z, 1.2, 0xd4a64a, 0.45);
        return;
      }
    }
    if (fresh) {
      ray.setFromCamera(input.ndc, camera);
      for (var wi = 0; wi < World.waystones.length; wi++) {
        var ws = World.waystones[wi];
        if (!ray.intersectObject(ws.group, true).length) continue;
        var near = nearWaystone();
        if (near === ws && ws.lit) { p.moveTo = null; if (!G.dialogOpen) openTravel(); return; }
        var wdx = ws.def.x - p.pos.x, wdz = ws.def.z - p.pos.z, wl = Math.sqrt(wdx * wdx + wdz * wdz) || 1;
        p.moveTo = { x: ws.def.x - wdx / wl * 2.0, z: ws.def.z - wdz / wl * 2.0, travel: true, best: 1e9, stuckT: 0 };
        fxRing(ws.def.x, ws.group.position.y, ws.def.z, 1.6, 0x6cc2ab, 0.45);
        return;
      }
    }
    var g = groundPoint(input.ndc);
    if (!g) return;
    p.moveTo = { x: g.x, z: g.z, talk: false, best: 1e9, stuckT: 0 };
    if (G.dialogOpen) closeDialog();
    if (fresh) fxRing(g.x, g.y, g.z, 0.9, 0x6cc2ab, 0.45);
  }

  /* =============== input =============== */
  var canvas = renderer.domElement;
  window.addEventListener('keydown', function (e) {
    if (e.target && e.target.tagName === 'INPUT') return;
    input.keys[e.code] = true;
    if (e.code === 'Space' || e.code.indexOf('Arrow') === 0) e.preventDefault();
    if (e.repeat) return;
    if (G.mode === 'game') {
      if (e.code === 'Escape') { if (G.panel) { closePanel(); return; } if (G.dialogOpen) { closeDialog(); return; } if (UI.anyOverlay() && !G.paused) return; togglePause(); }
      if (e.code === 'KeyI' || e.code === 'KeyC') { toggleInventory(undefined, 'char'); return; }
      if (e.code === 'KeyK') { toggleInventory(undefined, 'skills'); return; }
      if (G.paused || G.panel || player.dead) return;
      if (e.code === 'Space') { if (G.dialogOpen) closeDialog(); else { var nn = nearestNpc(); if (nn && inRangeOf(nn)) interactWith(nn); else openTravel(); } return; }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { dodge(); return; }
      if (e.code === 'Digit1') useSkill(1);
      else if (e.code === 'Digit2') useSkill(2);
      else if (e.code === 'Digit3') useSkill(3);
      else if (e.code === 'KeyF') usePotion();
    } else if (G.mode === 'class' && e.code === 'Escape') showTitle();
    else if (G.mode === 'title' && e.code === 'Enter') showClass();
  });
  window.addEventListener('keyup', function (e) { input.keys[e.code] = false; });
  window.addEventListener('blur', function () { input.keys = {}; input.lDown = false; input.rDown = false; input.mDown = false; });
  document.addEventListener('visibilitychange', function () { if (document.hidden) { saveGame(); if (G.mode === 'game' && !G.paused) togglePause(true); } });
  window.addEventListener('pagehide', saveGame);
  window.addEventListener('beforeunload', saveGame);

  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  /* One touch finger on the empty scene drags the camera (or the hunter on the pedestal);
     the joystick and skill buttons capture their own pointers, so a second finger never interferes. */
  function setNdc(x, y) { input.ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1); }
  canvas.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'touch') {
      if (input.dragId != null) return;
      input.dragId = e.pointerId; input.drag = true;
      input.lastX = input.tapX = e.clientX; input.lastY = input.tapY = e.clientY;
      input.tapT = performance.now(); input.tapMoved = 0;
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    input.lastX = e.clientX; input.lastY = e.clientY;
    setNdc(e.clientX, e.clientY);
    if (e.button === 0) { if (G.mode === 'class') input.drag = true; else if (G.mode === 'game') { input.lDown = true; clickMove(true); } }
    if (e.button === 2) input.rDown = true;
    if (e.button === 1) input.mDown = true;
  });
  canvas.addEventListener('pointermove', function (e) {
    var dx = e.clientX - input.lastX, dy = e.clientY - input.lastY;
    if (e.pointerType === 'touch') {
      if (e.pointerId !== input.dragId) return;
      input.tapMoved += Math.abs(dx) + Math.abs(dy);
      input.lastX = e.clientX; input.lastY = e.clientY;
      if (G.mode === 'class') G.previewYaw += dx * 0.012;
      else if (G.mode === 'game') cam.yaw -= dx * 0.006;
      return;
    }
    setNdc(e.clientX, e.clientY);
    input.lastX = e.clientX; input.lastY = e.clientY;
    if (G.mode === 'class' && input.drag) G.previewYaw += dx * 0.012;
    else if (G.mode === 'game') {
      if (input.mDown) cam.yaw -= dx * 0.006;
      if (input.lDown) clickMove(false);
    }
  });
  function pointerEnd(e) {
    if (e.pointerType === 'touch') {
      if (e.pointerId !== input.dragId) return;
      input.dragId = null; input.drag = false;
      /* a short tap on the scene walks there */
      if (G.mode === 'game' && input.tapMoved < 12 && performance.now() - input.tapT < 350) { setNdc(input.tapX, input.tapY); clickMove(true); }
      return;
    }
    input.lDown = false; input.rDown = false; input.mDown = false; input.drag = false;
  }
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', pointerEnd);
  canvas.addEventListener('wheel', function (e) { if (G.mode === 'game') cam.dist = clamp(cam.dist + e.deltaY * 0.015, 12, 34); e.preventDefault(); }, { passive: false });

  /* =============== save / continue (this browser only) =============== */
  var SAVE_KEY = 'tw.save.v1', saveT = 0;
  function newToken() {
    try { if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID(); } catch (e) {}
    return 'tw-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }
  function saveGame() {
    if (G.mode !== 'game' || !player) return;
    var s = snapshot();
    s.v = 1; s.token = G.token; s.savedAt = Date.now();
    if (player.dead) { s.x = SPAWN.x; s.z = SPAWN.z; }
    try { window.localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) {}
  }
  function loadSave() {
    try {
      var raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || !s.cls || !TW.CLASSES.some(function (c) { return c.id === s.cls; })) return null;
      return s;
    } catch (e) { return null; }
  }
  function deleteSave() { try { window.localStorage.removeItem(SAVE_KEY); } catch (e) {} }

  UI.on('talk', function () { if (G.dialogOpen) closeDialog(); else interactWith(nearestNpc()); });
  UI.on('dialog', dialogAction);
  UI.on('inventory', function (on) { toggleInventory(on === false ? false : undefined); });
  UI.on('dodge', dodge);
  UI.on('panel-tab', function (tab) { if (G.panel === 'inventory') { G.panelTab = tab; renderInventory(); } });
  UI.on('shop-act', shopAction);
  UI.on('shop-select', function (s) { G.shopSel = s.uid; renderShop(); });
  UI.on('smith-act', smithAction);
  UI.on('smith-select', function (s) { G.smithSel = s; renderSmith(); });
  UI.on('inv-select', function (uid) { G.invSel = { uid: uid }; renderInventory(); });
  UI.on('inv-select-equip', function (slot) { G.invSel = { slot: slot }; renderInventory(); });
  UI.on('inv-act', function (act, id) {
    if (act === 'equip') equipItem(id);
    else if (act === 'unequip') unequipItem(id);
    else if (act === 'drop') discardItem(id);
    else if (act === 'attr') addAttr(id);
    else if (act === 'respec') respecAttrs();
    else if (act === 'node') unlockNode(id);
    else if (act === 'respec-skills') respecSkills();
  });
  UI.on('start', showClass);
  UI.on('back', showTitle);
  UI.on('continue-save', function () { var s = loadSave(); if (s) startGame(s.cls, s.name || TW.HUNTER_NAMES[0], s); });
  UI.on('delete-save', function () { deleteSave(); UI.showSave(null); });
  UI.on('shadows', applyShadows);
  UI.on('fullscreen', function () {
    var el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
    try {
      var pr = req && req.call(el);
      if (pr && pr.then) pr.then(function () {
        try { if (window.screen && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {}); } catch (e2) {}
      }).catch(function () {});
    } catch (e) {}
  });
  UI.on('select', function (id) { if (G.mode === 'class') setPreview(id); });
  UI.on('confirm', function (cls, name) { startGame(cls, name); });
  UI.on('pause', function () { togglePause(true); });
  UI.on('resume', function () { togglePause(false); });
  UI.on('quit', showTitle);
  UI.on('respawn', respawn);
  UI.on('continue', function () { UI.overlay('victory', false); });
  UI.on('skill', useSkill);
  UI.on('potion', usePotion);
  UI.on('attackHold', function (on) { input.attackHold = on; });
  UI.on('joy', function (x, y, on) { input.joy.x = x; input.joy.y = y; input.joy.on = on; });
  UI.on('touch', function (on) { input.touch = on; });
  UI.on('overlayClosed', function () {});

  /* =============== loop =============== */
  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    applyStageOffset();
  }
  window.addEventListener('resize', resize);

  var last = performance.now(), hudT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (G.paused || G.panel) dt = 0;
    /* hit-stop: a few frozen frames on crits and kills give hits weight */
    if (G.hitstop > 0) { G.hitstop -= dt; dt = 0; }
    G.time += dt;
    if (dt > 0) {
      updateTimers(dt);
      if (G.mode === 'game') {
        updateAim();
        debugAuto(dt);
        updatePlayer(dt);
        updateZonesFx(dt);
        updatePickups(dt);
        updateWaystones(dt);
        if (!player.dead) { updateQuestNav(dt); updateZone(dt); }
        if (G.dialogOpen && (G.dialogKind === 'travel' ? !nearWaystone() : !npcInRange())) closeDialog();
        saveT += dt;
        if (saveT >= 10) { saveT = 0; saveGame(); }
      }
      for (var i = 0; i < monsters.length; i++) updateMonster(monsters[i], dt);
      for (var gi = monsters.length - 1; gi >= 0; gi--) if (monsters[gi].gone) monsters.splice(gi, 1);
      separateMonsters();
      updateNpc(dt);
      if (G.mode === 'game') { updateBossBar(); updateGate(); }
      updateProjectiles(dt);
      updateEffects(dt);
      Particles.update(dt);
      if (preview) {
        animateHero(preview, { anim: preview.anim }, dt, false);
        preview.root.rotation.y = G.previewYaw + (input.drag ? 0 : Math.sin(G.time * 0.6) * 0.25);
      }
      var f = focusPoint();
      world.update(dt, G.time, f);
      motes.update(dt, G.time, f);
    }
    updateCamera(dt);
    world.sky.position.copy(camera.position);
    updateNpcLabel();
    updateLootLabels();
    if (G.mode === 'game') {
      UI.hud(player, { active: player.buffs });
      hudT -= dt;
      if (hudT <= 0) {
        hudT = 0.08;
        var marks = [];
        for (var wi = 0; wi < World.waystones.length; wi++) if (World.waystones[wi].lit) marks.push({ x: World.waystones[wi].def.x, z: World.waystones[wi].def.z, color: '#6cc2ab', shape: 'diamond' });
        for (var pi = 0; pi < pickups.length; pi++) marks.push({ x: pickups[pi].x, z: pickups[pi].z, color: TW.Items.rarity(pickups[pi].item).color });
        UI.minimap(player, monsters, TW.QUESTS[G.quest.idx] ? TW.ZONE_BY_ID[TW.QUESTS[G.quest.idx].zone] : null, G.time, marks);
      }
    }
    UI.updateFloaters(camera, dt, window.innerWidth, window.innerHeight);
    renderer.render(scene, camera);
  }

  /* =============== boot =============== */
  function snapshot() {
    if (G.mode !== 'game' || !player) return {};
    return { cls: player.cls.id, name: player.name, level: player.level, exp: player.exp, gold: player.gold, potions: player.potions, quest: G.quest, kills: G.stats.kills, x: player.pos.x, z: player.pos.z, elapsed: G.time - G.stats.start, inventory: player.inventory, equip: player.equip, attrs: player.attrs, points: player.points, waystones: Object.keys(G.waystones), skills: Object.keys(player.skills.unlocked), skillPoints: player.skillPoints, materials: player.materials };
  }
  var autoT = 0;
  function debugAuto(dt) {
    if (!(qs.auto || G.debugAuto) || G.mode !== 'game' || player.dead || G.paused) return;
    autoT -= dt;
    if (autoT > 0) return;
    autoT = 0.7;
    aim.set(player.pos.x + rand(-8, 8), player.pos.y, player.pos.z - rand(2, 10));
    useSkill(randi(0, 3));
    if (Math.random() < 0.2) usePotion();
  }
  function start(data) {
    UI.init();
    if (qs.touch) UI.setTouch(true);
    UI.setShadows(settings.shadows);
    UI.initMinimap(World.minimapImage(176, 200), 200);
    populate();
    createNpcs();
    resize();
    var valid = function (id) { return TW.CLASSES.some(function (c) { return c.id === id; }); };
    if (data && data.cls && valid(data.cls)) startGame(data.cls, data.name || TW.HUNTER_NAMES[0], data);
    else if (qs.class && valid(qs.class)) startGame(qs.class, TW.HUNTER_NAMES[0], qs.auto ? { x: 0, z: 90 } : null);
    else if (qs.screen === 'class') { showTitle(); showClass(); }
    else showTitle();
    requestAnimationFrame(frame);
  }
  var hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(snapshot);
  if (hot && hot.ready) hot.ready(start); else start(hot && hot.data ? hot.data : {});

  TW.Game = {
    useSkill: useSkill, usePotion: usePotion, showTitle: showTitle, state: G,
    /* test hooks used by tools/smoke.mjs */
    player: function () { return player; },
    monsters: function () { return monsters; },
    teleport: function (x, z) { if (player) { player.pos.set(x, 0, z); player.pos.y = World.heightAt(x, z); cam.target.set(x, player.pos.y + 1.4, z); } },
    npc: function () { return npc; },
    npcs: function () { return npcs; },
    materials: function () { return player ? player.materials : {}; },
    debugMaterial: function (id, n) { if (player) addMaterial(id, n); },
    pickups: function () { return pickups; },
    inventory: function () { return player ? player.inventory : []; },
    equip: function () { return player ? player.equip : {}; },
    debugDrop: function (x, z, ilvl, rarity) { spawnItemPickup(TW.Items.roll(ilvl || 3, 0, null, rarity), x, z); },
    dodge: dodge,
    makeElite: function (m, affixId) { clearElite(m); makeElite(m, affixId); m.hp = m.maxHp; },
    hit: function (m, amount) { damageMonster(m, amount, {}); },
    waystones: function () { return World.waystones; },
    openTravel: openTravel,
    travelTo: travelTo,
    eff: function (i) { return player ? eff(player, player.cls.skills[i]) : null; },
    unlockNode: unlockNode,
    forceQuestComplete: function () { var q = TW.QUESTS[G.quest.idx]; if (q && G.quest.state === 'active') { G.quest.progress = q.count - 1; questProgress(q.target); } },
    forceDeath: function () { if (player && !player.dead) { player.hp = 0; playerDie(); } },
    forceBossKill: function () { for (var i = 0; i < monsters.length; i++) if (monsters[i].def.boss && monsters[i].alive) { monsters[i].hp = 0; killMonster(monsters[i]); } },
  };
})();
