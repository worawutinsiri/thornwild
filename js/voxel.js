/* Thornwild — voxel heroes (experimental art style).
   Turned on with ?style=voxel or the "ตัวละครแบบ Voxel" switch (class screen / pause menu);
   the choice is remembered in localStorage "tw.style". Classes without a voxel model fall
   back to the classic low-poly hero.

   Each hero is drawn in one voxel grid: x right, y up, z forward (the model faces +Z),
   1 voxel = VS metres, feet on y = 0. Every voxel belongs to a rig part, so the result
   exposes the same pivots (body, head, armL/R, legL/R, handL/R) that game.js animates.
   Meshing keeps only faces not covered by a voxel of the same part and bakes ambient
   occlusion plus a small per-voxel colour jitter into vertex colours (the "pixel" look). */
(function () {
  'use strict';
  var T = THREE;
  var TW = window.TW;
  var M = TW.Models;
  var VS = 0.08;

  /* rig pivots in voxel units, shared by every voxel humanoid */
  var RIG = {
    body: [0, 0, 0],
    legL: [-1.5, 11, 0.5], legR: [1.5, 11, 0.5],
    armL: [-5.5, 19, 0.5], armR: [5.5, 19, 0.5],
    head: [0, 20, 0],
  };
  var HAND_Y = -8;   /* hand pivot below the shoulder, voxels */

  /* ---------------- voxel grid ---------------- */
  function key(x, y, z) { return (x + 512) * 1048576 + (y + 512) * 1024 + (z + 512); }
  function Grid() { this.parts = {}; this.cur = null; }
  var P = Grid.prototype;
  P.part = function (name) { this.cur = name; if (!this.parts[name]) this.parts[name] = new Map(); return this; };
  P.map = function () { return this.parts[this.cur]; };
  /* c is a hex colour; mat is 'm' (cloth/skin), 's' (polished metal) or 'g' (glows in c) */
  P.set = function (x, y, z, c, mat) { this.map().set(key(x, y, z), { x: x, y: y, z: z, c: c, m: mat || 'm' }); return this; };
  P.del = function (x, y, z) { this.map().delete(key(x, y, z)); return this; };
  P.has = function (x, y, z) { return this.map().has(key(x, y, z)); };
  P.box = function (x0, y0, z0, x1, y1, z1, c, mat) {
    for (var x = x0; x <= x1; x++) for (var y = y0; y <= y1; y++) for (var z = z0; z <= z1; z++) this.set(x, y, z, c, mat);
    return this;
  };
  /* stacked elliptic discs around (cx, cz): r(y) is the radius in voxels, sz squashes depth */
  P.lathe = function (cx, cz, y0, y1, rFn, c, mat, sz) {
    sz = sz || 1;
    for (var y = y0; y <= y1; y++) {
      var r = rFn(y), col = typeof c === 'function' ? c(y) : c;
      for (var x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        for (var z = Math.floor(cz - r * sz - 1); z <= Math.ceil(cz + r * sz + 1); z++) {
          var dx = x + 0.5 - cx, dz = (z + 0.5 - cz) / sz;
          if (dx * dx + dz * dz <= r * r) this.set(x, y, z, col, mat);
        }
      }
    }
    return this;
  };
  /* recolour every voxel of the current part that passes test(v) */
  P.paint = function (test, c, mat) {
    this.map().forEach(function (v) { if (test(v)) { v.c = c; if (mat) v.m = mat; } });
    return this;
  };
  function swatch(pal, ch) { var s = pal[ch]; return Array.isArray(s) ? s : [s, 'm']; }
  /* decal on the front of the current part: rows run top (yTop) to bottom, column 0 is x0.
     Each character recolours the front-most voxel of that (x, y) column; '.' skips. */
  P.front = function (x0, yTop, rows, pal) {
    var map = this.map();
    for (var j = 0; j < rows.length; j++) {
      for (var i = 0; i < rows[j].length; i++) {
        var ch = rows[j][i];
        if (ch === '.' || ch === ' ') continue;
        var x = x0 + i, y = yTop - j, best = null;
        map.forEach(function (v) { if (v.x === x && v.y === y && (!best || v.z > best.z)) best = v; });
        if (best) { var s = swatch(pal, ch); best.c = s[0]; best.m = s[1]; }
      }
    }
    return this;
  };
  /* a flat sprite in the plane z (column 0 is x0, rows top to bottom); '.' leaves a hole */
  P.sprite = function (x0, yTop, z, rows, pal) {
    for (var j = 0; j < rows.length; j++) {
      for (var i = 0; i < rows[j].length; i++) {
        var ch = rows[j][i];
        if (ch === '.' || ch === ' ') continue;
        var s = swatch(pal, ch);
        this.set(x0 + i, yTop - j, z, s[0], s[1]);
      }
    }
    return this;
  };

  /* ---------------- meshing ---------------- */
  /* per face: normal n and in-plane axes u, v with u × v = n (so base, +u, +u+v, +v winds CCW) */
  var FACES = [
    { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { n: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0] },
  ];
  var AO = [0.52, 0.7, 0.86, 1];
  function jitter(x, y, z) {
    var h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
    return 1 + (h - Math.floor(h) - 0.5) * 0.1;
  }

  /* returns { matKey: BufferGeometry } for one part, positioned relative to its pivot (voxels) */
  function meshPart(map, pivot) {
    var buckets = {};
    function solid(x, y, z) { return map.has(key(x, y, z)) ? 1 : 0; }
    map.forEach(function (vx) {
      for (var f = 0; f < 6; f++) {
        var F = FACES[f], n = F.n, u = F.u, w = F.v;
        var fx = vx.x + n[0], fy = vx.y + n[1], fz = vx.z + n[2];
        if (solid(fx, fy, fz)) continue;
        var mk = vx.m === 'g' ? 'g' + vx.c : vx.m;
        var b = buckets[mk] || (buckets[mk] = { pos: [], nor: [], col: [] });
        /* face base corner: the far side of the voxel when the normal is positive */
        var bx = vx.x + (n[0] > 0 ? 1 : 0), by = vx.y + (n[1] > 0 ? 1 : 0), bz = vx.z + (n[2] > 0 ? 1 : 0);
        var corners = [], ao = [];
        for (var c = 0; c < 4; c++) {
          var a = (c === 1 || c === 2) ? 1 : 0, bb = (c >= 2) ? 1 : 0;
          var su = a ? 1 : -1, sv = bb ? 1 : -1;
          var s1 = solid(fx + u[0] * su, fy + u[1] * su, fz + u[2] * su);
          var s2 = solid(fx + w[0] * sv, fy + w[1] * sv, fz + w[2] * sv);
          var cc = solid(fx + u[0] * su + w[0] * sv, fy + u[1] * su + w[1] * sv, fz + u[2] * su + w[2] * sv);
          ao.push(s1 && s2 ? 0 : 3 - (s1 + s2 + cc));
          corners.push([bx + u[0] * a + w[0] * bb, by + u[1] * a + w[1] * bb, bz + u[2] * a + w[2] * bb]);
        }
        /* split the quad along the diagonal through the darker corners (no AO streaks) */
        var order = ao[0] + ao[2] < ao[1] + ao[3] ? [0, 1, 2, 0, 2, 3] : [1, 2, 3, 1, 3, 0];
        var j = jitter(vx.x, vx.y, vx.z);
        var r = ((vx.c >> 16) & 255) / 255, g = ((vx.c >> 8) & 255) / 255, bl = (vx.c & 255) / 255;
        for (var k = 0; k < 6; k++) {
          var ci = order[k], p = corners[ci], sh = AO[ao[ci]] * j;
          b.pos.push((p[0] - pivot[0]) * VS, (p[1] - pivot[1]) * VS, (p[2] - pivot[2]) * VS);
          b.nor.push(n[0], n[1], n[2]);
          b.col.push(Math.min(1, r * sh), Math.min(1, g * sh), Math.min(1, bl * sh));
        }
      }
    });
    var out = {};
    Object.keys(buckets).forEach(function (mk) {
      var b = buckets[mk], geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute('normal', new T.Float32BufferAttribute(b.nor, 3));
      geo.setAttribute('color', new T.Float32BufferAttribute(b.col, 3));
      geo.computeBoundingSphere();
      out[mk] = geo;
    });
    return out;
  }

  function materials() {
    var cache = {};
    return function (mk) {
      if (cache[mk]) return cache[mk];
      var m;
      if (mk === 's') m = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.1 });
      else if (mk[0] === 'g') {
        var hex = +mk.slice(1);
        m = new T.MeshStandardMaterial({ vertexColors: true, emissive: hex, emissiveIntensity: 0.9, roughness: 0.4 });
      } else m = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.02 });
      return (cache[mk] = m);
    };
  }

  /* draw → rig with the same pivot names as Models.hero */
  function build(draw, id) {
    var g = new Grid();
    var extra = draw(g) || {};
    var mat = materials();
    var root = new T.Group();
    var h = { root: root };
    function pv(name, parent) {
      var p = RIG[name], grp = new T.Group();
      var pp = parent === root ? [0, 0, 0] : RIG.body;
      grp.position.set((p[0] - pp[0]) * VS, (p[1] - pp[1]) * VS, (p[2] - pp[2]) * VS);
      parent.add(grp);
      h[name] = grp;
      var map = g.parts[name];
      if (map) {
        var geos = meshPart(map, p);
        Object.keys(geos).forEach(function (mk) {
          var mesh = new T.Mesh(geos[mk], mat(mk));
          mesh.castShadow = true;
          grp.add(mesh);
          if (name === 'body' && !h.torso) h.torso = mesh;
        });
      }
      return grp;
    }
    pv('body', root);
    ['legL', 'legR', 'head', 'armL', 'armR'].forEach(function (n) { pv(n, h.body); });
    h.handL = new T.Group(); h.handL.position.set(0, HAND_Y * VS, 0); h.armL.add(h.handL);
    h.handR = new T.Group(); h.handR.position.set(0, HAND_Y * VS, 0); h.armR.add(h.handR);
    var mats = [];
    root.traverse(function (o) { if (o.isMesh && mats.indexOf(o.material) < 0) mats.push(o.material); });
    mats.forEach(function (m) { m.userData.baseEmissive = m.emissive.clone(); m.userData.baseEI = m.emissiveIntensity; });
    h.mats = mats;
    h.kind = 'hero'; h.cls = id; h.style = 'voxel';
    h.stride = extra.stride || 1;
    return h;
  }

  function rep(s, n) { var a = []; for (var i = 0; i < n; i++) a.push(s); return a; }
  var SKIN = 0xe8b896, SKIN_D = 0xc98f72, EYE = 0x1b1a17;

  /* ---------------- heroes ---------------- */
  var HEROES = {
    /* Wizard: violet robe with gold trim, tall bent hat, long white beard, staff with a sun-orb */
    mage: function (g) {
      var robe = 0x5d3a8f, robeD = 0x43286b, robeL = 0x7350a8, gold = 0xd9a93a, goldD = 0xa77a22;
      var beard = 0xeeebe4, beardD = 0xcdc6ba, hat = 0x56357f, hatD = 0x3f2560;
      var wood = 0x7a5232, woodD = 0x553821, boot = 0x4a3426;

      /* legs: mostly hidden under the robe, only the boots step out */
      [['legL', -3], ['legR', 0]].forEach(function (L) {
        g.part(L[0]).box(L[1], 2, -1, L[1] + 2, 10, 1, robeD);
        g.box(L[1], 0, -1, L[1] + 2, 1, 2, boot);
      });

      g.part('body');
      g.box(-4, 11, -2, 3, 19, 1, robe);
      g.lathe(0, 0, 2, 10, function (y) { return 4.3 + (10 - y) * 0.42; }, robe, 'm', 0.7);
      g.paint(function (v) { return v.y === 2; }, gold);
      g.paint(function (v) { return v.y === 3; }, goldD);
      g.paint(function (v) { return v.y === 11; }, robeD);
      /* gold placket down the front, folds, buckle */
      g.front(-1, 19, rep('GG', 16), { G: gold });
      g.front(-3, 9, rep('d....d', 6), { d: robeD });
      g.front(-1, 11, ['BB'], { B: goldD });
      g.front(-4, 19, ['LLL..LLL', 'L......L'], { L: robeL });

      g.part('head');
      g.box(-4, 20, -4, 3, 25, 3, SKIN);
      /* long white hair: strands down the back to the shoulder blades */
      g.box(-4, 20, -4, 3, 25, -2, beard);
      g.box(-4, 20, -4, -4, 25, 1, beard);
      g.box(3, 20, -4, 3, 25, 1, beard);
      g.box(-4, 16, -4, 3, 19, -3, beard);
      g.paint(function (v) { return v.z <= -3 && (v.x & 1) && v.c === beard; }, beardD);
      g.front(-4, 25, [
        'hWWssWWh',
        'hsEssEsh',
        'hssnnssh',
        'hWWnnWWh',
        'bWWWWWWb',
        'bWbWWbWb',
      ], { W: beard, b: beardD, h: beard, s: SKIN, E: EYE, n: SKIN_D });
      /* beard hangs over the chest */
      for (var y = 12; y <= 19; y++) {
        var w = y >= 17 ? 3 : y >= 15 ? 2 : 1;
        g.box(-w, y, 2, w - 1, y, 3, (y + 1) % 3 ? beard : beardD);
      }
      /* hat: wide brim, gold band, cone that bends over at the tip */
      g.lathe(0, 0, 26, 26, function () { return 6.3; }, hat);
      g.lathe(0, 0, 27, 27, function () { return 4.5; }, gold);
      for (var hy = 28; hy <= 38; hy++) {
        var t = (hy - 28) / 10;
        g.lathe(t * t * 3.4, -t * t * 1.2, hy, hy, function () { return 4.2 * (1 - t) + 0.6; }, hy % 4 === 1 ? hatD : hat);
      }
      g.front(-1, 31, ['.S.', 'SSS', '.S.'], { S: [0xffd860, 'g'] });

      [['armL', -7], ['armR', 4]].forEach(function (A) {
        var x0 = A[1];
        g.part(A[0]).box(x0, 12, -1, x0 + 2, 19, 1, robe);
        g.box(x0, 19, -1, x0 + 2, 19, 1, robeL);
        g.box(x0, 12, -2, x0 + 2, 13, 2, gold);
        g.box(x0, 10, -1, x0 + 2, 11, 1, SKIN);
      });
      /* staff in the right hand, held in front of the fist */
      g.part('armR');
      for (var sy = 1; sy <= 29; sy++) g.set(5, sy, 2, sy % 5 === 0 ? woodD : wood);
      g.box(4, 10, 2, 6, 11, 2, SKIN);
      /* claw head cradling a round sun-orb, sparks drifting to the outside (clear of the hat) */
      g.box(4, 29, 2, 6, 29, 2, woodD);
      g.set(3, 30, 2, woodD); g.set(7, 30, 2, woodD); g.set(3, 31, 2, woodD); g.set(7, 31, 2, woodD);
      g.box(4, 30, 1, 6, 32, 3, 0xffb43c, 'g');
      [4, 6].forEach(function (x) { [30, 32].forEach(function (y) { [1, 3].forEach(function (z) { g.del(x, y, z); }); }); });
      g.box(5, 30, 2, 5, 32, 2, 0xfff0b0, 'g');
      g.set(9, 33, 2, 0xfff3a8, 'g');
      g.set(8, 35, 1, 0xfff3a8, 'g');
      g.set(10, 30, 3, 0xfff3a8, 'g');
      return { stride: 0.55 };
    },

    /* Knight: polished plate, visored helm with a red plume, heater shield with a gold lion, longsword */
    warrior: function (g) {
      var st = 0xd0d4da, stL = 0xf0f3f6, stM = 0xa6adb8, stD = 0x737b87;
      var gold = 0xd9a93a, red = 0xd8362c, redD = 0xa02822, leather = 0x6a4528, slit = 0x16161b;
      var blade = 0xe6eaee, bladeD = 0xaab2bc, wood = 0x5a3a24;
      var S = [st, 's'], L = [stL, 's'], Mm = [stM, 's'], D = [stD, 's'];

      [['legL', -3], ['legR', 0]].forEach(function (Lg) {
        var x0 = Lg[1];
        g.part(Lg[0]).box(x0, 2, -1, x0 + 2, 10, 1, st, 's');
        g.box(x0, 6, -1, x0 + 2, 6, 1, stM, 's');
        g.set(x0 + 1, 6, 2, stM, 's');
        g.box(x0, 0, -1, x0 + 2, 1, 2, stD, 's');
      });

      g.part('body');
      g.box(-4, 13, -2, 3, 19, 1, st, 's');
      g.box(-4, 11, -2, 3, 12, 1, leather);
      g.box(-4, 8, -2, 3, 10, 1, stM, 's');
      g.paint(function (v) { return v.y === 8; }, stD, 's');
      g.front(-4, 19, [
        'GGGGGGGG',
        'SSSLLSSS',
        'SSSLLSSS',
        'DSSLLSSD',
        'DSSSSSSD',
        'DDSSSSDD',
        'DDDDDDDD',
      ], { G: gold, S: S, L: L, D: Mm });
      g.box(-1, 11, 2, 0, 12, 2, gold);

      g.part('head');
      g.box(-4, 20, -4, 3, 27, 3, st, 's');
      for (var i = -4; i <= 3; i++) { g.del(i, 27, -4); g.del(i, 27, 3); g.del(-4, 27, i); g.del(3, 27, i); }
      g.front(-4, 26, [
        'SSSSSSSS',
        'MMMMMMMM',
        'MkkkkkkM',
        'SSSkkSSS',
        'SSSkkSSS',
        'SkSSSSkS',
        'SSSSSSSS',
      ], { S: S, M: Mm, k: slit });
      g.paint(function (v) { return v.y === 27 && (v.x === -1 || v.x === 0); }, gold);
      /* plume: rises from the crest and falls down the back */
      var plume = [[2, 28, 28], [1, 28, 29], [0, 28, 30], [-1, 28, 31], [-2, 28, 31], [-3, 28, 31],
        [-4, 27, 30], [-5, 23, 29], [-6, 21, 27], [-7, 20, 24]];
      plume.forEach(function (p) { g.box(-1, p[1], p[0], 0, p[2], p[0], (p[0] & 1) ? redD : red); });

      [['armL', -7, -8, -5], ['armR', 4, 4, 7]].forEach(function (A) {
        var x0 = A[1];
        g.part(A[0]).box(x0, 12, -1, x0 + 2, 18, 1, st, 's');
        g.box(x0, 15, -1, x0 + 2, 15, 1, stD, 's');
        g.box(x0, 10, -1, x0 + 2, 11, 1, stD, 's');
        g.box(A[2], 17, -2, A[3], 20, 2, st, 's');
        g.box(A[2], 20, -1, A[3], 20, 1, stL, 's');
        g.box(A[2], 17, -2, A[3], 17, 2, gold);
      });

      /* longsword pointing forward out of the right fist */
      g.part('armR');
      g.box(5, 10, -2, 5, 11, 1, leather);
      g.box(5, 10, -3, 5, 11, -3, gold);
      g.box(3, 10, 2, 7, 11, 2, gold);
      g.box(5, 11, 3, 5, 11, 16, blade, 's');
      g.box(5, 10, 3, 5, 10, 16, bladeD, 's');
      g.del(5, 11, 16);

      /* heater shield on the left arm, facing forward */
      g.part('armL');
      var shape = [
        'GGGGGGGGGG',
        'GRRRRRRRRG',
        'GRRLLRRRRG',
        'GRLLLLRLRG',
        'GRRLLLLLRG',
        'GRRRLLLRRG',
        'GRRRLLLRRG',
        'GRRLLLLRRG',
        '.GRLRRLLG.',
        '.GRLRRRLG.',
        '..GRRRRG..',
        '...GRRG...',
        '....GG....',
      ];
      g.sprite(-10, 18, 2, shape.map(function (r) { return r.replace(/[GRL]/g, 'W'); }), { W: wood });
      g.sprite(-10, 18, 3, shape, { G: gold, R: red, L: 0xf0c040 });
      return { stride: 1 };
    },
  };

  /* ---------------- style switch ---------------- */
  function readStyle() {
    var m = /[?&]style=([a-z]+)/.exec((window.location && window.location.search) || '');
    if (m) return m[1] === 'voxel' ? 'voxel' : 'classic';
    try { return window.localStorage.getItem('tw.style') === 'voxel' ? 'voxel' : 'classic'; } catch (e) { return 'classic'; }
  }
  var classicHero = M.hero;
  M.style = readStyle();
  M.voxelClasses = Object.keys(HEROES);
  M.hero = function (id) {
    if (M.style === 'voxel' && HEROES[id]) return build(HEROES[id], id);
    return classicHero(id);
  };
  M.setStyle = function (s) {
    M.style = s === 'voxel' ? 'voxel' : 'classic';
    try { window.localStorage.setItem('tw.style', M.style); } catch (e) {}
    return M.style;
  };
  M.voxel = { build: build, Grid: Grid, VS: VS };
})();
