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
  var CAMP = TW.ZONE_BY_ID.camp;
  var SPAWN = { x: World.PREVIEW.x, z: World.PREVIEW.z };

  var G = { mode: 'title', paused: false, time: 0, victoryShown: false, quest: { idx: 0, progress: 0 }, stats: { kills: 0, start: 0 }, cls: 'warrior', previewYaw: 0, zone: null };
  var cam = { yaw: 0, pitch: 0.95, dist: 22, shake: 0, target: new T.Vector3() };
  var input = { keys: {}, ndc: new T.Vector2(), mouseDown: false, attackHold: false, rDown: false, lastX: 0, lastY: 0, joy: { x: 0, y: 0, on: false }, touch: false, drag: false, moved: 0 };
  var aim = new T.Vector3();
  var player = null, preview = null;
  var monsters = [], projectiles = [], effects = [], timers = [], zonesFx = [];

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
    };
    p.pos.y = World.heightAt(p.pos.x, p.pos.z);
    recalc(p, true);
    return p;
  }
  function recalc(p, fill) {
    var b = p.cls.base, g = p.cls.grow, L = p.level - 1;
    p.maxHp = Math.round(b.hp + g.hp * L); p.maxMp = Math.round(b.mp + g.mp * L);
    p.atk = b.atk + g.atk * L; p.def = b.def + g.def * L;
    if (fill) { p.hp = p.maxHp; p.mp = p.maxMp; }
  }
  function gainExp(n) {
    var p = player;
    if (p.level >= TW.MAX_LEVEL) return;
    p.exp += n;
    while (p.exp >= TW.expToNext(p.level) && p.level < TW.MAX_LEVEL) {
      p.exp -= TW.expToNext(p.level);
      p.level++;
      recalc(p, true);
      UI.toast('เลื่อนระดับ', 'Lv ' + p.level, 'พลังโจมตี ' + Math.round(p.atk) + ' · ป้องกัน ' + Math.round(p.def) + ' · พลังชีวิตและพลังเวทฟื้นเต็ม', 'level');
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
    p.invuln = Math.max(0, p.invuln - dt);
    for (var k in p.buffs) { p.buffs[k].t -= dt; if (p.buffs[k].t <= 0) endBuff(p, k); }
    var inCamp = dist2(p.pos, CAMP) < CAMP.r;
    var ooc = G.time - p.lastHurt > 5;
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * (inCamp ? 0.06 : (ooc ? 0.012 : 0)) * dt);
    p.mp = Math.min(p.maxMp, p.mp + (p.cls.mpRegen + (inCamp ? p.maxMp * 0.05 : 0)) * dt);
    if (p.buffs.ironwill) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * p.buffs.ironwill.heal / p.buffs.ironwill.dur * dt);

    /* movement relative to the camera */
    var keys = input.keys;
    var fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    var str = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    if (input.joy.on) { fwd = -input.joy.y; str = input.joy.x; }
    var fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    var mx = fx * fwd + rx * str, mz = fz * fwd + rz * str, len = Math.sqrt(mx * mx + mz * mz);
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

    if ((input.mouseDown || input.attackHold || keys.KeyJ) && !UI.anyOverlay()) useSkill(0);

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
      spawnProj({ x: p.pos.x + dir.x * 0.8, z: p.pos.z + dir.z * 0.8, h: 1.4, dx: dir.x, dz: dir.z, speed: s.speed, range: s.range, owner: 'player', kind: 'ember', mult: s.mult, radius: 0.7 });
    },
    nova: function (p, s) {
      act(p, 'raise', 0.4);
      hitCircle(p.pos, s.radius, s.mult, { slow: { t: s.slowDur, f: s.slowF } });
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
      act(p, 'cast', 0.2);
    },
    arrow: function (p, s, dir) {
      act(p, 'bow', 0.25);
      spawnProj({ x: p.pos.x + dir.x * 0.6, z: p.pos.z + dir.z * 0.6, h: 1.4, dx: dir.x, dz: dir.z, speed: s.speed, range: s.range, owner: 'player', kind: 'arrow', mult: s.mult, radius: 0.5 });
    },
    fan: function (p, s, dir) {
      act(p, 'bow', 0.3);
      var base = Math.atan2(dir.x, dir.z), sp = s.spread * Math.PI / 180;
      for (var i = 0; i < s.count; i++) {
        var a = base - sp / 2 + sp * i / (s.count - 1);
        spawnProj({ x: p.pos.x, z: p.pos.z, h: 1.4, dx: Math.sin(a), dz: Math.cos(a), speed: s.speed, range: s.range, owner: 'player', kind: 'arrow', mult: s.mult, radius: 0.5 });
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
      act(p, 'leap', 0.35);
    },
    stab: function (p, s, dir) {
      act(p, 'stab', 0.22);
      after(0.06, function () { if (p.dead) return; hitArc(p, dir, s.range, s.arc, s.mult, {}); fxArc(p.pos.x, p.pos.y, p.pos.z, p.facing, s.range, s.arc, 0xb9a0d0); });
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

  function useSkill(i) {
    var p = player;
    if (!p || p.dead || G.paused || G.mode !== 'game') return;
    var s = p.cls.skills[i];
    if (p.cds[i] > 0 || p.dash) return;
    if (p.mp < s.mp) { if (i > 0) UI.floater(p.pos.x, p.pos.y + 2.4, p.pos.z, 'MP ไม่พอ', 'info'); return; }
    if (i === 0 && p.anim.act && p.anim.act.type === 'raise') return;
    var dir = aimDir(p);
    p.targetFacing = p.facing = Math.atan2(dir.x, dir.z);
    var ok = SKILLS[s.id](p, s, dir);
    if (ok === false) return;
    p.mp -= s.mp;
    p.cds[i] = s.cd;
  }
  function usePotion() {
    var p = player;
    if (!p || p.dead || p.potionCd > 0 || G.paused) return;
    if (p.potions <= 0) { UI.floater(p.pos.x, p.pos.y + 2.4, p.pos.z, 'ไม่มียาแล้ว', 'info'); return; }
    p.potions--; p.potionCd = 1.5;
    var heal = Math.round(p.maxHp * 0.4);
    p.hp = Math.min(p.maxHp, p.hp + heal);
    UI.floater(p.pos.x, p.pos.y + 2.4, p.pos.z, '+' + heal, 'heal');
    Particles.burst(p.pos.x, p.pos.y + 1, p.pos.z, 0x7fd6c0, 30, 3, 0.8, -2, 2);
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
    var p = player, crit = opts.crit || Math.random() < p.crit, mult = 1;
    if (p.buffs.vanish) { crit = true; mult *= p.buffs.vanish.bonus; endBuff(p, 'vanish'); }
    var dmg = raw * rand(0.9, 1.1) * 40 / (40 + m.def.def) * mult;
    if (crit) dmg *= p.cls.critMult;
    dmg = Math.max(1, Math.round(dmg));
    m.hp -= dmg;
    m.flash = 0.12;
    m.lastHit = G.time;
    UI.floater(m.pos.x + rand(-0.4, 0.4), m.pos.y + m.def.height * 0.85, m.pos.z, dmg, crit ? 'crit' : 'hit');
    Particles.burst(m.pos.x, m.pos.y + m.def.height * 0.5, m.pos.z, crit ? 0xd4a64a : 0xebe2c9, crit ? 18 : 8, 4, 0.4, 5);
    if (opts.slow) m.slow = { t: opts.slow.t, f: opts.slow.f };
    if (opts.stun && !m.def.boss) { m.stun = Math.max(m.stun, opts.stun); if (m.state === 'windup') m.state = 'chase'; }
    if (opts.poison) m.poison = { t: opts.poison.t, dps: opts.poison.dps, acc: 0 };
    if (opts.knock && !m.def.boss) { var dx = m.pos.x - p.pos.x, dz = m.pos.z - p.pos.z, l = Math.sqrt(dx * dx + dz * dz) || 1; m.knock = { x: dx / l * 9, z: dz / l * 9, t: 0.25 }; }
    aggro(m);
    if (m.def.boss && !m.enraged && m.hp < m.maxHp * 0.5) { m.enraged = true; UI.toast('', 'ธอร์นฮาร์ตคลั่ง', 'หัวใจของมันเต้นเร็วขึ้น โจมตีถี่ขึ้น และยิงหนามรอบตัว', 'quiet'); Particles.burst(m.pos.x, m.pos.y + 4.5, m.pos.z, 0xff6a2a, 80, 8, 1, 3, 3); }
    if (m.hp <= 0) killMonster(m);
  }
  function dotMonster(m, dmg) {
    if (!m.alive) return;
    dmg = Math.max(1, Math.round(dmg));
    m.hp -= dmg;
    UI.floater(m.pos.x + rand(-0.4, 0.4), m.pos.y + m.def.height * 0.85, m.pos.z, dmg, 'dot');
    Particles.burst(m.pos.x, m.pos.y + m.def.height * 0.5, m.pos.z, 0x9ad14b, 4, 2, 0.5, 0, 2);
    if (m.hp <= 0) killMonster(m);
  }
  function damagePlayer(raw, src) {
    var p = player;
    if (!p || p.dead || p.invuln > 0) return;
    var dmg = raw * rand(0.9, 1.1) * 40 / (40 + p.def);
    if (p.buffs.ironwill) dmg *= 1 - p.buffs.ironwill.reduce;
    dmg = Math.max(1, Math.round(dmg));
    p.hp -= dmg;
    p.lastHurt = G.time;
    p.hurtFlash = 0.12;
    Models.tint(p.model, 0xe4683a, 0.9);
    UI.floater(p.pos.x, p.pos.y + 2.5, p.pos.z, dmg, 'hurt');
    UI.hurt();
    shake(Math.min(0.5, dmg / p.maxHp * 2));
    if (p.hp <= 0) { p.hp = 0; playerDie(); }
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
    p.dead = false; p.hp = p.maxHp; p.mp = p.maxMp;
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
  function spawnMonster(type, zone, x, z) {
    var def = TW.MONSTERS[type];
    var model = Models.monster(type);
    scene.add(model.root);
    var m = {
      type: type, def: def, model: model, bar: def.boss ? null : makeBar(def), zone: zone,
      pos: new T.Vector3(x, World.heightAt(x, z), z), home: { x: x, z: z }, hp: def.hp, maxHp: def.hp, alive: true,
      state: 'idle', wanderT: rand(0, 3), tx: x, tz: z, facing: rand(0, TAU), atkT: rand(0, 1), windT: 0, windMax: 1, attackKind: 'melee', tele: null,
      flash: 0, stun: 0, slow: null, poison: null, knock: null, anim: rand(0, 6), deathT: 0, respawn: 0, tint: '', pattern: 0, enraged: false, lunge: 0, lastHit: -99,
    };
    monsters.push(m);
    return m;
  }
  function populate() {
    TW.ZONES.forEach(function (zone) {
      (zone.spawns || []).forEach(function (sp) {
        if (sp.center) { for (var c = 0; c < sp.count; c++) spawnMonster(sp.type, zone, zone.x, zone.z); return; }
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
    m.alive = true; m.hp = m.maxHp; m.state = 'idle'; m.wanderT = rand(1, 4);
    m.pos.set(m.home.x, World.heightAt(m.home.x, m.home.z), m.home.z);
    m.stun = 0; m.slow = null; m.poison = null; m.knock = null; m.enraged = false; m.pattern = 0; m.flash = 0; m.lunge = 0;
    m.model.root.visible = true; m.model.root.scale.setScalar(1);
    m.model.root.rotation.set(0, m.facing, 0);
    Models.tint(m.model, 0, 0); m.tint = '';
    if (m.bar) m.bar.g.visible = false;
  }
  function aggro(m) {
    if (!m.alive || m.state === 'chase' || m.state === 'windup' || !player || player.dead) return;
    if (m.state === 'return' && m.hp < m.maxHp * 0.5) return;
    m.state = 'chase';
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

  var WINDUP = { smash: 0.85, slam: 1.25, rock: 0.75, nova: 1.0 };
  function chooseAttack(m, dp) {
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
    if (m.attackKind === 'smash') { var fx = m.pos.x + Math.sin(m.facing) * 3.8, fz = m.pos.z + Math.cos(m.facing) * 3.8; m.tele = { x: fx, z: fz, r: 4.3 }; telegraph(fx, fz, 4.3, m.windT, 0xe4683a); }
    else if (m.attackKind === 'slam') { m.tele = { x: m.pos.x, z: m.pos.z, r: 9 }; telegraph(m.pos.x, m.pos.z, 9, m.windT, 0xe4683a); }
    else if (m.attackKind === 'nova') { telegraph(m.pos.x, m.pos.z, 5.5, m.windT, 0xd4a64a); }
    else if (m.attackKind === 'rock') { m.tele = { x: p.pos.x, z: p.pos.z, r: 3.4 }; telegraph(p.pos.x, p.pos.z, 3.4, m.windT + Math.max(0.3, dist2(m.pos, p.pos) / 22), 0xe4683a); }
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
    m.alive = false; m.state = 'dead'; m.deathT = 0; m.respawn = m.def.boss ? 120 : 24;
    m.stun = 0; m.slow = null; m.poison = null;
    if (m.bar) m.bar.g.visible = false;
    G.stats.kills++;
    gainExp(m.def.exp);
    var gold = randi(m.def.gold[0], m.def.gold[1]);
    player.gold += gold;
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
        G.quest.idx = TW.QUESTS.length; G.quest.progress = 0;
        UI.quest(null);
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
        md.root.scale.setScalar(Math.max(0.01, k));
        md.root.position.y = m.pos.y - (1 - k) * 0.6;
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
    if (m.flash > 0) m.flash -= dt;
    if (m.lunge > 0) m.lunge -= dt;
    if (m.poison) {
      m.poison.acc += dt; m.poison.t -= dt;
      if (m.poison.acc >= 0.5) { m.poison.acc -= 0.5; dotMonster(m, m.poison.dps * 0.5); if (!m.alive) return; }
      if (m.poison.t <= 0) m.poison = null;
    }
    var slowF = 1;
    if (m.slow) { m.slow.t -= dt; slowF = m.slow.f; if (m.slow.t <= 0) m.slow = null; }
    var tint = m.flash > 0 ? 'flash' : (m.slow ? 'frost' : (m.poison ? 'poison' : (m.enraged ? 'rage' : '')));
    if (tint !== m.tint) {
      m.tint = tint;
      if (tint === 'flash') Models.tint(md, 0xffffff, 1.4);
      else if (tint === 'frost') Models.tint(md, 0x6fb8e0, 0.7);
      else if (tint === 'poison') Models.tint(md, 0x6fbf3a, 0.5);
      else if (tint === 'rage') Models.tint(md, 0xa02a10, 0.35);
      else Models.tint(md, 0, 0);
    }
    if (m.knock) { m.pos.x += m.knock.x * dt; m.pos.z += m.knock.z * dt; m.knock.t -= dt; if (m.knock.t <= 0) m.knock = null; }

    var pInCamp = p && dist2(p.pos, CAMP) < CAMP.r + 3;
    var moving = false;
    if (m.stun > 0) {
      m.stun -= dt;
      if (Math.random() < dt * 6) Particles.spawn(m.pos.x + rand(-0.5, 0.5), m.pos.y + def.height + 0.3, m.pos.z + rand(-0.5, 0.5), 0, 1, 0, Particles.color.setHex(0xd4a64a), 0.5, 0);
    } else if (!far || m.state === 'return') {
      var reach = def.range + p_radius() + def.radius * 0.3;
      switch (m.state) {
        case 'idle':
          m.wanderT -= dt;
          if (m.wanderT <= 0) { var a = rand(0, TAU), r = rand(2, def.boss ? 4 : 9); m.tx = m.home.x + Math.cos(a) * r; m.tz = m.home.z + Math.sin(a) * r; m.state = 'wander'; }
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
          else if (dp > reach * 0.85) { moving = true; moveToward(m, p.pos.x, p.pos.z, def.speed * slowF, dt); }
          else faceTarget(m, p.pos, dt);
          break;
        case 'windup':
          m.windT -= dt * (def.boss ? 1 : slowF);
          if (!def.boss && canSee) faceTarget(m, p.pos, dt);
          if (m.windT <= 0) { if (canSee) performAttack(m); else m.state = 'return'; }
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
      var engaged = m.state === 'chase' || m.state === 'windup';
      UI.boss(engaged, m.hp / m.maxHp);
      md.heart.material.emissiveIntensity = 2 + Math.sin(G.time * (m.enraged ? 9 : 4)) * 0.8;
      md.light.intensity = 1.2 + Math.sin(G.time * (m.enraged ? 9 : 4)) * 0.5;
    }
  }
  function p_radius() { return player ? player.radius : 0.6; }

  function animateMonster(m, dt, moving, slowF) {
    var md = m.model;
    m.anim += dt * (moving ? 1 : 0.35) * (slowF < 1 ? slowF + 0.15 : 1);
    var t = m.anim, w = m.state === 'windup' ? 1 - m.windT / m.windMax : 0, lunge = m.lunge > 0 ? Math.sin(m.lunge / 0.35 * Math.PI) : 0;
    switch (m.type) {
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
  function questProgress(type) {
    var q = TW.QUESTS[G.quest.idx];
    if (!q || q.target !== type) return;
    G.quest.progress++;
    if (G.quest.progress >= q.count) completeQuest(q);
    else UI.quest(q, G.quest.idx, G.quest.progress);
  }
  function completeQuest(q) {
    var r = q.reward, p = player;
    p.gold += r.gold; p.potions += r.potions;
    var line = '+' + r.exp + ' EXP · +' + r.gold + ' เหรียญ' + (r.potions ? ' · +' + r.potions + ' ยาฟื้นพลัง' : '');
    UI.toast('ประกาศล่าสำเร็จ', q.title, line);
    G.quest.idx++; G.quest.progress = 0;
    gainExp(r.exp);
    var next = TW.QUESTS[G.quest.idx];
    UI.quest(next || null, G.quest.idx, 0);
    if (next) after(3.4, function () { if (G.mode === 'game') UI.toast('ประกาศใหม่จากกิลด์', next.title, next.brief, 'quiet'); });
    saveGame();
  }
  var navT = 0, zoneT = 0;
  function updateQuestNav(dt) {
    navT -= dt;
    if (navT > 0) return;
    navT = 0.25;
    var q = TW.QUESTS[G.quest.idx], p = player;
    if (!q) { UI.questNav(0, null, ''); return; }
    var z = TW.ZONE_BY_ID[q.zone];
    var dx = z.x - p.pos.x, dz = z.z - p.pos.z, d = Math.sqrt(dx * dx + dz * dz);
    var fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    var ang = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
    UI.questNav(ang, Math.max(0, Math.round(d - z.r * 0.6)), z.th);
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
    G.mode = 'title';
    G.paused = false;
    camera.clearViewOffset();
    if (player) { scene.remove(player.model.root); Models.dispose(player.model.root); player = null; }
    clearPreview();
    projectiles.forEach(function (p) { scene.remove(p.mesh); }); projectiles.length = 0;
    effects.forEach(function (e) { scene.remove(e.obj); disposeObj(e.obj); }); effects.length = 0;
    timers.length = 0; zonesFx.length = 0;
    UI.clearFloaters();
    UI.boss(false, 0);
    ['pause', 'death', 'victory', 'howto'].forEach(function (id) { UI.overlay(id, false); });
    resetMonsters();
    World.pedestalRing.visible = false;
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
    G.quest = { idx: 0, progress: 0 };
    G.stats = { kills: 0, start: G.time };
    if (restore) {
      player.level = clamp(restore.level || 1, 1, TW.MAX_LEVEL); recalc(player, true);
      player.exp = restore.exp || 0; player.gold = restore.gold || 0; player.potions = restore.potions == null ? 3 : restore.potions;
      G.quest = restore.quest || G.quest; G.stats.kills = restore.kills || 0; G.stats.start = G.time - (restore.elapsed || 0);
      G.victoryShown = G.quest.idx >= TW.QUESTS.length;
      if (restore.x != null) { player.pos.set(restore.x, 0, restore.z); player.pos.y = World.heightAt(restore.x, restore.z); }
    }
    G.token = (restore && restore.token) || newToken();
    resetMonsters();
    cam.yaw = 0; cam.shake = 0;
    cam.target.set(player.pos.x, player.pos.y + 1.4, player.pos.z);
    UI.setupHUD(player);
    UI.quest(TW.QUESTS[G.quest.idx] || null, G.quest.idx, G.quest.progress);
    UI.zone(World.zoneAt(player.pos.x, player.pos.z));
    UI.screen('game');
    navT = 0; zoneT = 0; saveT = 0;
    var q = TW.QUESTS[G.quest.idx];
    UI.toast('ยินดีต้อนรับ ' + name, restore ? 'กลับมาล่าต่อ' : 'ใบอนุญาตออกแล้ว', q ? (restore ? 'ประกาศปัจจุบัน: ' : 'ประกาศแรก: ') + q.title + ' — ' + q.brief : '');
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
    input.mouseDown = false;
    if (on) saveGame();
  }

  /* =============== input =============== */
  var canvas = renderer.domElement;
  window.addEventListener('keydown', function (e) {
    if (e.target && e.target.tagName === 'INPUT') return;
    input.keys[e.code] = true;
    if (e.code === 'Space' || e.code.indexOf('Arrow') === 0) e.preventDefault();
    if (e.repeat) return;
    if (G.mode === 'game') {
      if (e.code === 'Escape') { if (UI.anyOverlay() && !G.paused) return; togglePause(); }
      if (G.paused || player.dead) return;
      if (e.code === 'Digit1') useSkill(1);
      else if (e.code === 'Digit2') useSkill(2);
      else if (e.code === 'Digit3') useSkill(3);
      else if (e.code === 'KeyF') usePotion();
    } else if (G.mode === 'class' && e.code === 'Escape') showTitle();
    else if (G.mode === 'title' && e.code === 'Enter') showClass();
  });
  window.addEventListener('keyup', function (e) { input.keys[e.code] = false; });
  window.addEventListener('blur', function () { input.keys = {}; input.mouseDown = false; input.rDown = false; });
  document.addEventListener('visibilitychange', function () { if (document.hidden) { saveGame(); if (G.mode === 'game' && !G.paused) togglePause(true); } });
  window.addEventListener('pagehide', saveGame);
  window.addEventListener('beforeunload', saveGame);

  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  /* One touch finger on the empty scene drags the camera (or the hunter on the pedestal);
     the joystick and skill buttons capture their own pointers, so a second finger never interferes. */
  canvas.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'touch') {
      if (input.dragId != null) return;
      input.dragId = e.pointerId; input.drag = true;
      input.lastX = e.clientX; input.lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    input.lastX = e.clientX; input.lastY = e.clientY;
    if (e.button === 0) { if (G.mode === 'class') input.drag = true; else input.mouseDown = true; }
    if (e.button === 2 || e.button === 1) input.rDown = true;
  });
  canvas.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') { if (e.pointerId !== input.dragId) return; }
    else input.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    var dx = e.clientX - input.lastX;
    input.lastX = e.clientX; input.lastY = e.clientY;
    if (G.mode === 'class' && input.drag) G.previewYaw += dx * 0.012;
    else if (G.mode === 'game' && (input.rDown || (input.drag && e.pointerType === 'touch'))) cam.yaw -= dx * 0.006;
  });
  function pointerEnd(e) {
    if (e.pointerType === 'touch') { if (e.pointerId === input.dragId) { input.dragId = null; input.drag = false; } return; }
    input.mouseDown = false; input.rDown = false; input.drag = false;
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
    if (G.paused) dt = 0;
    G.time += dt;
    if (dt > 0) {
      updateTimers(dt);
      if (G.mode === 'game') {
        updateAim();
        debugAuto(dt);
        updatePlayer(dt);
        updateZonesFx(dt);
        if (!player.dead) { updateQuestNav(dt); updateZone(dt); }
        saveT += dt;
        if (saveT >= 10) { saveT = 0; saveGame(); }
      }
      for (var i = 0; i < monsters.length; i++) updateMonster(monsters[i], dt);
      separateMonsters();
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
    if (G.mode === 'game') {
      UI.hud(player, { active: player.buffs });
      hudT -= dt;
      if (hudT <= 0) { hudT = 0.08; UI.minimap(player, monsters, TW.QUESTS[G.quest.idx] ? TW.ZONE_BY_ID[TW.QUESTS[G.quest.idx].zone] : null, G.time); }
    }
    UI.updateFloaters(camera, dt, window.innerWidth, window.innerHeight);
    renderer.render(scene, camera);
  }

  /* =============== boot =============== */
  function snapshot() {
    if (G.mode !== 'game' || !player) return {};
    return { cls: player.cls.id, name: player.name, level: player.level, exp: player.exp, gold: player.gold, potions: player.potions, quest: G.quest, kills: G.stats.kills, x: player.pos.x, z: player.pos.z, elapsed: G.time - G.stats.start };
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
    resize();
    var valid = function (id) { return TW.CLASSES.some(function (c) { return c.id === id; }); };
    if (data && data.cls && valid(data.cls)) startGame(data.cls, data.name || TW.HUNTER_NAMES[0], data);
    else if (qs.class && valid(qs.class)) startGame(qs.class, TW.HUNTER_NAMES[0], qs.auto ? { x: 0, z: 90 } : null);
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
    forceDeath: function () { if (player && !player.dead) { player.hp = 0; playerDie(); } },
    forceBossKill: function () { for (var i = 0; i < monsters.length; i++) if (monsters[i].def.boss && monsters[i].alive) { monsters[i].hp = 0; killMonster(monsters[i]); } },
  };
})();
