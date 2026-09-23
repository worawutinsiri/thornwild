/* Thornwild — procedural low-poly models.
   No external assets: every hero and monster is assembled from primitives.
   Convention: models face +Z with their feet at y = 0. Animated parts are
   exposed as named pivots (armL, legR, head …) for game.js to pose. */
(function () {
  'use strict';
  var T = THREE;
  var TW = window.TW;

  function mk(color, o) {
    return new T.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.82, metalness: 0.04, flatShading: true }, o || {}));
  }
  function glow(color, intensity) {
    return new T.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: intensity == null ? 1 : intensity, roughness: 0.4, flatShading: true });
  }
  function part(geo, mat, x, y, z, parent) {
    var m = new T.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    if (parent) parent.add(m);
    return m;
  }
  function pivot(x, y, z, parent) {
    var g = new T.Group();
    g.position.set(x || 0, y || 0, z || 0);
    if (parent) parent.add(g);
    return g;
  }
  function box(w, h, d) { return new T.BoxGeometry(w, h, d); }
  function cyl(rt, rb, h, s) { return new T.CylinderGeometry(rt, rb, h, s || 8); }
  function sph(r, w, h) { return new T.SphereGeometry(r, w || 10, h || 8); }
  function cone(r, h, s) { return new T.ConeGeometry(r, h, s || 6); }
  function ico(r, d) { return new T.IcosahedronGeometry(r, d || 0); }
  function dod(r) { return new T.DodecahedronGeometry(r, 0); }
  function steel() { return mk(0xb9b6ab, { metalness: 0.55, roughness: 0.35 }); }

  /* ---------- shared humanoid rig ---------- */
  function humanoid(c) {
    var root = new T.Group();
    var body = pivot(0, 0, 0, root);
    var legL = pivot(-0.19, 1.0, 0, body);
    var legR = pivot(0.19, 1.0, 0, body);
    [legL, legR].forEach(function (leg) {
      part(box(0.25, 0.9, 0.28), mk(c.legs), 0, -0.45, 0, leg);
      part(box(0.28, 0.2, 0.38), mk(c.boots || 0x3a2c22), 0, -0.9, 0.05, leg);
    });
    var torso = part(box(0.7, 0.82, 0.4), mk(c.torso), 0, 1.42, 0, body);
    part(box(0.74, 0.12, 0.44), mk(c.belt || 0x4a3526), 0, 1.06, 0, body);
    var head = pivot(0, 1.86, 0, body);
    part(sph(0.29, 12, 10), mk(c.skin), 0, 0.26, 0, head);
    var eyeM = mk(0x1b1a17);
    part(sph(0.045, 6, 5), eyeM, -0.1, 0.3, 0.26, head);
    part(sph(0.045, 6, 5), eyeM, 0.1, 0.3, 0.26, head);
    var armL = pivot(-0.47, 1.78, 0, body);
    var armR = pivot(0.47, 1.78, 0, body);
    [armL, armR].forEach(function (arm) {
      part(box(0.2, 0.72, 0.22), mk(c.arms || c.torso), 0, -0.34, 0, arm);
      part(sph(0.12, 8, 6), mk(c.skin), 0, -0.76, 0, arm);
    });
    var handL = pivot(0, -0.78, 0.04, armL);
    var handR = pivot(0, -0.78, 0.04, armR);
    return { root: root, body: body, legL: legL, legR: legR, armL: armL, armR: armR, head: head, torso: torso, handL: handL, handR: handR };
  }

  function hood(h, color) {
    var m = mk(color);
    var hd = part(new T.SphereGeometry(0.35, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), m, 0, 0.28, -0.03, h.head);
    hd.rotation.x = -0.28;
    return m;
  }

  /* ---------- heroes ---------- */
  var HEROES = {
    warrior: function () {
      var h = humanoid({ skin: 0xd6a47c, torso: 0x8a3a2c, legs: 0x4b4035, arms: 0x9a9a92 });
      var st = steel();
      part(cyl(0.31, 0.33, 0.3, 10), st, 0, 0.42, 0, h.head);
      part(box(0.06, 0.24, 0.42), mk(0xa8322a), 0, 0.66, -0.02, h.head);
      part(box(0.06, 0.18, 0.05), st, 0, 0.24, 0.3, h.head);
      part(box(0.36, 0.18, 0.42), st, 0, 0.04, 0, h.armL);
      part(box(0.36, 0.18, 0.42), st, 0, 0.04, 0, h.armR);
      part(box(0.46, 0.64, 0.04), mk(0xa8322a), 0, 1.2, 0.22, h.body);
      var sword = pivot(0, 0, 0, h.handR);
      sword.rotation.x = 1.55;
      part(box(0.07, 0.3, 0.07), mk(0x4a3526), 0, 0, 0, sword);
      part(box(0.42, 0.06, 0.1), mk(0xd4a64a, { metalness: 0.6, roughness: 0.3 }), 0, 0.17, 0, sword);
      part(box(0.1, 1.25, 0.035), st, 0, 0.82, 0, sword);
      var shield = part(cyl(0.46, 0.46, 0.07, 10), mk(0x7a2f25), -0.16, -0.42, 0.05, h.armL);
      shield.rotation.z = Math.PI / 2;
      part(sph(0.1, 8, 6), st, -0.21, -0.42, 0.05, h.armL);
      h.weapon = sword;
      return h;
    },
    mage: function () {
      var h = humanoid({ skin: 0xe0b494, torso: 0x2e4a66, legs: 0x2e4a66, belt: 0xc9a24a });
      part(cyl(0.36, 0.62, 1.3, 9), mk(0x2a4461), 0, 0.64, 0, h.body);
      var hatM = mk(0x223a55);
      part(cyl(0.58, 0.6, 0.05, 12), hatM, 0, 0.44, 0, h.head);
      part(cyl(0.31, 0.31, 0.09, 12), mk(0xd4a64a), 0, 0.5, 0, h.head);
      var tip = part(cone(0.3, 0.95, 9), hatM, 0.04, 0.92, -0.04, h.head);
      tip.rotation.set(-0.14, 0, -0.2);
      var staff = pivot(0, 0, 0, h.handR);
      staff.rotation.x = 0.15;
      part(cyl(0.04, 0.05, 2.1, 6), mk(0x5a3e28), 0, 0.35, 0, staff);
      part(cyl(0.09, 0.06, 0.18, 6), mk(0xd4a64a), 0, 1.36, 0, staff);
      var orb = part(ico(0.17, 0), glow(0x7fd6c0, 1.5), 0, 1.56, 0, staff);
      h.weapon = staff;
      h.orb = orb;
      return h;
    },
    ranger: function () {
      var h = humanoid({ skin: 0xc99a74, torso: 0x4b6a3a, legs: 0x5a4632 });
      var cloakM = hood(h, 0x3e5a31);
      var cloak = part(box(0.72, 1.25, 0.05), cloakM, 0, 1.22, -0.25, h.body);
      cloak.rotation.x = 0.1;
      var quiver = part(cyl(0.12, 0.11, 0.78, 8), mk(0x6e4c30), 0.2, 1.5, -0.32, h.body);
      quiver.rotation.z = -0.35;
      for (var i = 0; i < 3; i++) part(box(0.06, 0.18, 0.02), mk(0xe8dcc0), -0.05 + i * 0.05, 0.46, 0, quiver);
      var bow = pivot(0, 0, 0.02, h.handL);
      bow.rotation.y = -Math.PI / 2;
      var arc = part(new T.TorusGeometry(0.72, 0.035, 5, 18, Math.PI), mk(0x6e4c30), 0, 0, 0, bow);
      arc.rotation.z = -Math.PI / 2;
      part(cyl(0.008, 0.008, 1.44, 3), mk(0xebe2c9), 0, 0, 0, bow);
      h.bow = bow;
      return h;
    },
    assassin: function () {
      var h = humanoid({ skin: 0xc8956e, torso: 0x2d2935, legs: 0x25222b, boots: 0x1d1a20 });
      hood(h, 0x3a2e48);
      part(box(0.44, 0.17, 0.14), mk(0x1d1a20), 0, 0.17, 0.22, h.head);
      var scarfM = mk(0x8e2f2f);
      part(box(0.62, 0.14, 0.46), scarfM, 0, 1.84, 0, h.body);
      var tail = part(box(0.16, 0.62, 0.04), scarfM, 0.14, 1.52, -0.27, h.body);
      tail.rotation.x = 0.28;
      var st = steel();
      [h.handL, h.handR].forEach(function (hand) {
        var d = pivot(0, 0, 0, hand);
        d.rotation.x = 1.45;
        part(box(0.06, 0.18, 0.06), mk(0x3a2c22), 0, 0, 0, d);
        part(box(0.2, 0.04, 0.06), st, 0, 0.1, 0, d);
        part(box(0.06, 0.55, 0.02), st, 0, 0.38, 0, d);
      });
      return h;
    },
  };

  /* ---------- monsters ---------- */
  var MONSTERS = {
    slime: function () {
      var root = new T.Group();
      var body = pivot(0, 0, 0, root);
      var jelly = part(sph(0.95, 14, 10), mk(0x86b25a, { roughness: 0.3, transparent: true, opacity: 0.86 }), 0, 0.78, 0, body);
      jelly.scale.set(1, 0.82, 1);
      part(sph(0.4, 8, 6), mk(0x4f7330), 0, 0.72, 0, body);
      var eye = mk(0x141a12);
      part(sph(0.1, 6, 5), eye, -0.28, 1.0, 0.8, body);
      part(sph(0.1, 6, 5), eye, 0.28, 1.0, 0.8, body);
      var moss = mk(0x3f5f2a);
      for (var i = 0; i < 4; i++) {
        var t = part(cone(0.12, 0.36, 4), moss, Math.cos(i * 1.7) * 0.35, 1.5, Math.sin(i * 1.7) * 0.3, body);
        t.rotation.z = (i - 1.5) * 0.25;
      }
      return { root: root, body: body, jelly: jelly };
    },
    wolf: function () {
      var root = new T.Group();
      var body = pivot(0, 0, 0, root);
      var fur = mk(0x3b4350), furLight = mk(0x56606e), dark = mk(0x23272e);
      part(box(0.72, 0.7, 1.6), fur, 0, 1.05, -0.05, body);
      part(box(0.84, 0.82, 0.62), furLight, 0, 1.15, 0.55, body);
      var head = pivot(0, 1.38, 0.9, body);
      part(box(0.56, 0.5, 0.62), fur, 0, 0, 0.18, head);
      part(box(0.3, 0.26, 0.46), furLight, 0, -0.1, 0.6, head);
      part(box(0.12, 0.1, 0.08), dark, 0, -0.02, 0.85, head);
      part(cone(0.11, 0.32, 4), fur, -0.18, 0.36, 0.05, head);
      part(cone(0.11, 0.32, 4), fur, 0.18, 0.36, 0.05, head);
      var eyeM = glow(0xffb347, 1.6);
      part(sph(0.06, 6, 5), eyeM, -0.16, 0.08, 0.49, head);
      part(sph(0.06, 6, 5), eyeM, 0.16, 0.08, 0.49, head);
      var legs = [];
      [[-0.26, 0.55], [0.26, 0.55], [-0.26, -0.6], [0.26, -0.6]].forEach(function (p) {
        var l = pivot(p[0], 0.82, p[1], body);
        part(box(0.18, 0.84, 0.2), fur, 0, -0.42, 0, l);
        legs.push(l);
      });
      var tail = pivot(0, 1.25, -0.85, body);
      var tm = part(cone(0.14, 0.95, 5), fur, 0, -0.24, -0.4, tail);
      tm.rotation.x = -2.1;
      return { root: root, body: body, head: head, legs: legs, tail: tail };
    },
    goblin: function () {
      var h = humanoid({ skin: 0x6f8a3a, torso: 0x5a4630, legs: 0x4a3a28, arms: 0x6f8a3a, boots: 0x2e2418, belt: 0x3a2c1e });
      h.body.scale.setScalar(0.82);
      var skin = mk(0x6f8a3a);
      var e1 = part(cone(0.09, 0.44, 4), skin, -0.34, 0.3, 0, h.head); e1.rotation.z = 1.3;
      var e2 = part(cone(0.09, 0.44, 4), skin, 0.34, 0.3, 0, h.head); e2.rotation.z = -1.3;
      var nose = part(cone(0.07, 0.22, 4), skin, 0, 0.22, 0.33, h.head); nose.rotation.x = Math.PI / 2;
      var eyeM = glow(0xf2d24b, 1.3);
      part(sph(0.055, 6, 5), eyeM, -0.1, 0.31, 0.27, h.head);
      part(sph(0.055, 6, 5), eyeM, 0.1, 0.31, 0.27, h.head);
      part(box(0.5, 0.36, 0.05), mk(0x6b5438), 0, 0.84, 0.21, h.body);
      var spear = pivot(0, 0, 0, h.handR);
      spear.rotation.x = 1.5;
      part(cyl(0.035, 0.035, 2.4, 5), mk(0x5a4028), 0, 0.5, 0, spear);
      part(cone(0.09, 0.38, 4), mk(0x8a8272, { metalness: 0.4 }), 0, 1.88, 0, spear);
      h.weapon = spear;
      return h;
    },
    spore: function () {
      var root = new T.Group();
      var body = pivot(0, 0, 0, root);
      part(cyl(0.38, 0.55, 1.5, 9), mk(0xd9ccb0), 0, 0.75, 0, body);
      var cap = pivot(0, 1.45, 0, body);
      var capMesh = part(new T.SphereGeometry(1.15, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mk(0x8a3f73, { emissive: 0x3a1030, emissiveIntensity: 0.5 }), 0, 0, 0, cap);
      capMesh.scale.y = 0.75;
      part(cyl(1.12, 0.9, 0.12, 14), mk(0xc59ab0), 0, 0, 0, cap);
      var spot = mk(0xefe4cf);
      for (var i = 0; i < 7; i++) {
        var a = i / 7 * Math.PI * 2 + 0.3, r = i % 2 ? 0.55 : 0.82;
        var yy = Math.sqrt(Math.max(0, 1 - (r / 1.15) * (r / 1.15))) * 1.15 * 0.75;
        part(sph(0.13, 6, 4), spot, Math.cos(a) * r, yy, Math.sin(a) * r, cap);
      }
      part(sph(0.14, 6, 4), spot, 0, 0.86, 0, cap);
      var eyeM = glow(0xe9f28a, 1.4);
      part(sph(0.07, 6, 5), eyeM, -0.14, 1.08, 0.45, body);
      part(sph(0.07, 6, 5), eyeM, 0.14, 1.08, 0.45, body);
      return { root: root, body: body, cap: cap };
    },
    boss: function () {
      var root = new T.Group();
      var body = pivot(0, 0, 0, root);
      var stone = mk(0x7a776b), stoneDark = mk(0x5f5d54), moss = mk(0x4f6b35), wood = mk(0x3b2a1e);
      var legs = [];
      [-1.15, 1.15].forEach(function (x) {
        var l = pivot(x, 2.3, 0, body);
        part(cyl(0.72, 0.9, 2.3, 7), stoneDark, 0, -1.15, 0, l);
        part(box(1.3, 0.5, 1.7), stone, 0, -2.05, 0.2, l);
        legs.push(l);
      });
      part(dod(1.35), stoneDark, 0, 2.7, 0, body);
      var chest = part(dod(2.05), stone, 0, 4.5, 0, body);
      chest.scale.set(1.25, 1, 0.9);
      part(dod(0.95), moss, -1.4, 5.6, -0.5, body);
      part(dod(0.8), moss, 1.5, 5.5, -0.4, body);
      part(dod(1.0), moss, 0, 5.2, -1.3, body);
      var head = pivot(0, 6.15, 0.35, body);
      part(box(1.25, 0.95, 1.05), stone, 0, 0.1, 0, head);
      part(box(1.4, 0.25, 1.1), stoneDark, 0, 0.55, 0.05, head);
      var eyeM = glow(0xffa040, 2.2);
      part(box(0.26, 0.09, 0.06), eyeM, -0.3, 0.15, 0.53, head);
      part(box(0.26, 0.09, 0.06), eyeM, 0.3, 0.15, 0.53, head);
      var heart = part(ico(0.55, 0), glow(0xff9a3c, 2.4), 0, 4.55, 1.62, body);
      for (var i = 0; i < 5; i++) {
        var a = i / 5 * Math.PI * 2;
        var rb = part(box(0.14, 1.2, 0.14), wood, Math.cos(a) * 0.62, 4.55 + Math.sin(a) * 0.62, 1.66, body);
        rb.rotation.z = a + Math.PI / 2;
      }
      var arms = [];
      [-1, 1].forEach(function (s) {
        var ar = pivot(s * 2.45, 5.35, 0, body);
        part(dod(0.9), stone, 0, -0.5, 0, ar);
        part(box(1.05, 1.9, 1.05), stoneDark, 0, -1.95, 0, ar);
        part(dod(1.05), stone, 0, -3.2, 0.1, ar);
        part(dod(0.55), moss, s * 0.3, -0.2, -0.4, ar);
        arms.push(ar);
      });
      var thornM = mk(0x3b2a1e, { emissive: 0x5a1e0a, emissiveIntensity: 0.45 });
      for (var k = 0; k < 11; k++) {
        var th = -1.3 + k * 0.26;
        var t = part(cone(0.2, 1.3, 5), thornM, Math.sin(th) * 2.0, 4.7 + (k % 3) * 0.55, -Math.cos(th) * 1.5, body);
        t.rotation.x = -1.0;
        t.rotation.z = -th * 0.9;
      }
      [-1, 1].forEach(function (s) {
        for (var n = 0; n < 3; n++) {
          var tt = part(cone(0.16, 1.0, 5), thornM, s * (2.2 + n * 0.25), 6.1 + n * 0.1, -0.3 + n * 0.3, body);
          tt.rotation.z = -s * 0.5;
        }
      });
      var light = new T.PointLight(0xff9a3c, 1.4, 16, 2);
      light.position.set(0, 4.6, 2.4);
      body.add(light);
      return { root: root, body: body, legs: legs, arms: arms, head: head, heart: heart, light: light };
    },
  };

  /* Collect every material once so hits can tint the whole model. */
  function finish(h) {
    var mats = [];
    h.root.traverse(function (o) { if (o.isMesh && mats.indexOf(o.material) < 0) mats.push(o.material); });
    mats.forEach(function (m) {
      m.userData.baseEmissive = m.emissive.clone();
      m.userData.baseEI = m.emissiveIntensity;
    });
    h.mats = mats;
    return h;
  }

  var M = {};
  M.hero = function (id) { var h = finish(HEROES[id]()); h.kind = 'hero'; h.cls = id; return h; };
  M.monster = function (type) { var h = finish(MONSTERS[type]()); h.kind = type; return h; };

  /* Tint all materials (hit flash, frost, poison). amount 0 restores. */
  M.tint = function (h, hex, amount) {
    for (var i = 0; i < h.mats.length; i++) {
      var m = h.mats[i];
      if (amount > 0) { m.emissive.setHex(hex); m.emissiveIntensity = amount; }
      else { m.emissive.copy(m.userData.baseEmissive); m.emissiveIntensity = m.userData.baseEI; }
    }
  };

  M.setOpacity = function (h, a) {
    for (var i = 0; i < h.mats.length; i++) {
      var m = h.mats[i];
      if (m.userData.xray) continue;
      var want = a < 1;
      if (m.transparent !== want && !m.userData.alwaysTransparent) { m.transparent = want; m.needsUpdate = true; }
      m.opacity = a;
    }
  };

  /* X-ray silhouette: draws the hero where terrain or trees hide it.
     The hero stamps the stencil buffer where it is visible (drawn late via
     renderOrder), and the silhouette only fills occluded pixels that are
     not already covered by the visible hero. */
  M.addXray = function (h, color) {
    var sil = new T.MeshBasicMaterial({
      color: color, transparent: true, opacity: 0.42, depthWrite: false, depthFunc: T.GreaterDepth,
      stencilWrite: true, stencilRef: 1, stencilFunc: T.NotEqualStencilFunc,
      stencilFail: T.KeepStencilOp, stencilZFail: T.KeepStencilOp, stencilZPass: T.KeepStencilOp,
    });
    sil.userData.xray = true;
    var meshes = [];
    h.root.traverse(function (o) { if (o.isMesh) meshes.push(o); });
    meshes.forEach(function (o) {
      o.renderOrder = 5;
      var m = o.material;
      m.stencilWrite = true;
      m.stencilRef = 1;
      m.stencilFunc = T.AlwaysStencilFunc;
      m.stencilZPass = T.ReplaceStencilOp;
      var g = new T.Mesh(o.geometry, sil);
      g.renderOrder = 10;
      g.castShadow = false;
      o.add(g);
    });
  };

  M.dispose = function (root) {
    root.traverse(function (o) {
      if (o.isMesh) {
        o.geometry.dispose();
        if (o.material && !o.material.userData.shared) o.material.dispose();
      }
    });
  };

  M.helpers = { mk: mk, glow: glow, part: part, pivot: pivot, box: box, cyl: cyl, sph: sph, cone: cone, ico: ico, dod: dod };
  TW.Models = M;
})();
