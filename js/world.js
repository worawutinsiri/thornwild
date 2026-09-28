/* Thornwild — the valley: terrain, sky, forests, camps and collision.
   Terrain height is a pure function of (x, z) so entities can be placed
   without reading the mesh back. North is −z; the guild camp sits south. */
(function () {
  'use strict';
  var T = THREE;
  var TW = window.TW;
  var H = TW.Models.helpers;
  var W = {};

  var SIZE = 520, SEG = 170, PLAY_R = 200;
  var SUN_DIR = new T.Vector3(-0.6, 0.5, 0.55).normalize();
  W.PLAY_R = PLAY_R;
  W.SUN_DIR = SUN_DIR;

  /* ---------- noise ---------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function smooth(e0, e1, x) { var t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
  function hash(ix, iz) {
    var h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, z) {
    var ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
    var a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
    var ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
  }
  function fbm(x, z, o) {
    o = o || 4;
    var s = 0, amp = 1, f = 1, n = 0;
    for (var i = 0; i < o; i++) { s += amp * vnoise(x * f, z * f); n += amp; amp *= 0.5; f *= 2.03; }
    return s / n;
  }
  var seed = 1337;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  W.smooth = smooth;

  /* ---------- height field ---------- */
  var FLATS = [];
  function bigAt(x, z) { return (fbm(x * 0.011 + 10, z * 0.011 - 4) - 0.5) * 18; }
  function heightAt(x, z) {
    var big = bigAt(x, z);
    var flatK = 0, target = 0;
    for (var i = 0; i < FLATS.length; i++) {
      var f = FLATS[i], dx = x - f.x, dz = z - f.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d > f.r) continue;
      var t = 1 - smooth(f.r * 0.55, f.r, d);
      if (t > flatK) { flatK = t; target = f.h; }
    }
    big += (target - big) * flatK;
    var small = (fbm(x * 0.06 + 3, z * 0.06 + 7, 3) - 0.5) * 2.2 * (1 - flatK * 0.85);
    var r = Math.sqrt(x * x + z * z);
    var h = big + small;
    if (r > 172) {
      var edge = smooth(172, 232, r);
      h += edge * edge * (20 + fbm(x * 0.03, z * 0.03, 3) * 30);
    }
    return h;
  }
  W.heightAt = heightAt;

  /* ---------- zones & paths ---------- */
  function zoneW(id, x, z, mul) {
    var zn = TW.ZONE_BY_ID[id], r = zn.r * (mul || 1);
    var dx = x - zn.x, dz = z - zn.z, d = Math.sqrt(dx * dx + dz * dz);
    return 1 - smooth(r * 0.6, r, d);
  }
  W.zoneW = zoneW;
  W.zoneAt = function (x, z) {
    for (var i = 0; i < TW.ZONES.length; i++) {
      var zn = TW.ZONES[i], dx = x - zn.x, dz = z - zn.z;
      if (dx * dx + dz * dz < zn.r * zn.r) return zn;
    }
    return null;
  };

  var PATHS = [[[0, 146], [0, 84]], [[0, 84], [12, 20]], [[12, 20], [40, -108]], [[0, 84], [96, 26]], [[12, 20], [-92, 30]], [[-100, 22], [-84, -66]]];
  function segDist(px, pz, ax, az, bx, bz) {
    var vx = bx - ax, vz = bz - az, wx = px - ax, wz = pz - az;
    var t = clamp((vx * wx + vz * wz) / (vx * vx + vz * vz), 0, 1);
    var dx = px - (ax + vx * t), dz = pz - (az + vz * t);
    return Math.sqrt(dx * dx + dz * dz);
  }
  function pathDist(x, z) {
    var m = 1e9;
    for (var i = 0; i < PATHS.length; i++) { var p = PATHS[i]; var d = segDist(x, z, p[0][0], p[0][1], p[1][0], p[1][1]); if (d < m) m = d; }
    return m + (vnoise(x * 0.09, z * 0.09) - 0.5) * 2.5;
  }
  function forestMask(x, z) {
    var f = smooth(0.5, 0.66, fbm(x * 0.016 + 100, z * 0.016 + 100, 3));
    f = Math.max(f, zoneW('pines', x, z) * 0.95);
    f *= 1 - zoneW('meadow', x, z) * 0.9;
    f *= 1 - zoneW('camp', x, z, 1.5);
    f *= 1 - zoneW('mud', x, z);
    f *= 1 - zoneW('ruins', x, z);
    f *= 1 - zoneW('swamp', x, z) * 0.85;
    f *= smooth(2.2, 6.5, pathDist(x, z));
    return f;
  }

  /* ---------- ground colour ---------- */
  var C = {};
  function col(hex) { var c = new T.Color(hex); return [c.r, c.g, c.b]; }
  C.grassA = col(0x5f7838); C.grassB = col(0x8a9648); C.forest = col(0x35482c); C.swamp = col(0x3c4a36);
  C.dirt = col(0x7a6448); C.path = col(0x907a55); C.stone = col(0x807d6c); C.rock = col(0x6a655a); C.rockLight = col(0x9b9585);
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function colorAt(x, z, h) {
    var n = fbm(x * 0.08 + 50, z * 0.08 - 20, 3);
    var c = mix(C.grassA, C.grassB, n);
    c = mix(c, C.forest, forestMask(x, z) * 0.75);
    c = mix(c, C.swamp, zoneW('swamp', x, z, 1.05));
    c = mix(c, C.dirt, zoneW('mud', x, z, 0.8) * 0.9);
    c = mix(c, C.dirt, zoneW('camp', x, z, 0.9) * 0.8);
    var ru = zoneW('ruins', x, z, 0.85);
    if (ru > 0) c = mix(c, C.stone, ru * (0.35 + n * 0.5));
    var pd = pathDist(x, z);
    if (pd < 3.2) c = mix(c, C.path, (1 - pd / 3.2) * 0.85);
    var r = Math.sqrt(x * x + z * z);
    if (r > 168) c = mix(c, C.rock, smooth(168, 200, r));
    if (h > 20) c = mix(c, C.rockLight, smooth(20, 36, h));
    return c;
  }

  /* ---------- collision (static props) ---------- */
  var CELL = 8, grid = {};
  function cellKey(cx, cz) { return cx + ',' + cz; }
  function addCollider(x, z, r) {
    var k = cellKey(Math.floor(x / CELL), Math.floor(z / CELL));
    (grid[k] || (grid[k] = [])).push({ x: x, z: z, r: r });
  }
  W.addCollider = addCollider;
  W.collide = function (pos, radius) {
    var cx = Math.floor(pos.x / CELL), cz = Math.floor(pos.z / CELL);
    for (var i = -1; i <= 1; i++) for (var j = -1; j <= 1; j++) {
      var list = grid[cellKey(cx + i, cz + j)];
      if (!list) continue;
      for (var k = 0; k < list.length; k++) {
        var c = list[k], dx = pos.x - c.x, dz = pos.z - c.z, d = Math.sqrt(dx * dx + dz * dz), min = c.r + radius;
        if (d < min) {
          if (d < 1e-4) { dx = 1; dz = 0; d = 1; }
          pos.x += dx / d * (min - d);
          pos.z += dz / d * (min - d);
        }
      }
    }
  };
  W.isBlocked = function (x, z, radius) {
    var cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (var i = -1; i <= 1; i++) for (var j = -1; j <= 1; j++) {
      var list = grid[cellKey(cx + i, cz + j)];
      if (!list) continue;
      for (var k = 0; k < list.length; k++) {
        var c = list[k], dx = x - c.x, dz = z - c.z;
        if (dx * dx + dz * dz < (c.r + radius) * (c.r + radius)) return true;
      }
    }
    return false;
  };

  /* ---------- build ---------- */
  W.build = function (scene) {
    FLATS = [];
    TW.ZONES.forEach(function (z) {
      if (!z.flat) return;
      FLATS.push({ x: z.x, z: z.z, r: z.flat.r, h: bigAt(z.x, z.z) + z.flat.lift });
    });

    scene.fog = new T.Fog(0xcfa874, 70, 330);

    /* sky dome with a sun glow */
    var sky = new T.Mesh(new T.SphereGeometry(1000, 32, 16), new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new T.Color(0x2c5a66) }, mid: { value: new T.Color(0xcfa874) }, bottom: { value: new T.Color(0x7d6d55) },
        sunDir: { value: SUN_DIR }, sunColor: { value: new T.Color(0xffd79a) },
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; varying vec3 vDir;',
        'void main(){',
        '  float h = vDir.y;',
        '  vec3 c = h > 0.0 ? mix(mid, top, pow(smoothstep(0.0, 0.6, h), 0.75)) : mix(mid, bottom, smoothstep(0.0, -0.25, h));',
        '  float s = max(dot(vDir, normalize(sunDir)), 0.0);',
        '  c += sunColor * (pow(s, 90.0) * 1.3 + pow(s, 5.0) * 0.28);',
        '  gl_FragColor = vec4(c, 1.0);',
        '}'].join('\n'),
    }));
    sky.frustumCulled = false;
    scene.add(sky);

    /* light: low golden sun, teal sky fill */
    scene.add(new T.HemisphereLight(0xbcd3cf, 0x4a4a2e, 0.6));
    var sun = new T.DirectionalLight(0xffd6a0, 1.1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    var sc = sun.shadow.camera;
    sc.left = -50; sc.right = 50; sc.top = 50; sc.bottom = -50; sc.near = 1; sc.far = 300;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.05;
    scene.add(sun);
    scene.add(sun.target);

    /* terrain */
    var geo = new T.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    var pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), z = pos.getZ(i), h = heightAt(x, z);
      pos.setY(i, h);
      var c = colorAt(x, z, h);
      colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
    }
    geo.setAttribute('color', new T.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    var terrain = new T.Mesh(geo, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true }));
    terrain.receiveShadow = true;
    scene.add(terrain);

    var anim = [];
    buildVegetation(scene);
    buildRocks(scene);
    buildCamp(scene, anim);
    buildMudCamp(scene);
    buildSwamp(scene, anim);
    buildRuins(scene, anim);

    var focus = new T.Vector3();
    return {
      sky: sky, sun: sun,
      update: function (dt, t, f) {
        focus.copy(f);
        sun.position.set(f.x + SUN_DIR.x * 140, f.y + SUN_DIR.y * 140, f.z + SUN_DIR.z * 140);
        sun.target.position.copy(f);
        for (var i = 0; i < anim.length; i++) anim[i](dt, t);
        for (var w = 0; w < windUniforms.length; w++) windUniforms[w].value = t;
      },
      sunTo: function (cameraPos) { sky.position.copy(cameraPos); },
    };
  };

  /* ---------- vegetation ---------- */
  function instanced(geo, mat, items, colorFn) {
    if (!items.length) return new T.Group();
    var m = new T.InstancedMesh(geo, mat, items.length);
    var d = new T.Object3D(), c = new T.Color();
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      d.position.set(it.x, it.y, it.z);
      d.rotation.set(it.tx || 0, it.rot || 0, it.tz || 0);
      d.scale.set(it.sx || it.s || 1, it.sy || it.s || 1, it.sz || it.s || 1);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      if (colorFn) m.setColorAt(i, colorFn(it, c));
    }
    m.castShadow = true;
    m.receiveShadow = false;
    return m;
  }

  /* Concatenate several primitives into one geometry so a whole canopy or boulder
     is a single instanced draw. Flat shading recomputes normals per face anyway. */
  function merge(list) {
    var parts = list.map(function (g) { return g.index ? g.toNonIndexed() : g; });
    var n = 0;
    parts.forEach(function (g) { n += g.attributes.position.array.length; });
    var P = new Float32Array(n), N = new Float32Array(n), o = 0;
    parts.forEach(function (g) { P.set(g.attributes.position.array, o); N.set(g.attributes.normal.array, o); o += g.attributes.position.array.length; });
    var out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(P, 3));
    out.setAttribute('normal', new T.BufferAttribute(N, 3));
    return out;
  }
  function at(geo, x, y, z, rx, ry, rz, s) {
    if (s) geo.scale(s[0], s[1], s[2]);
    if (rx || ry || rz) { geo.rotateX(rx || 0); geo.rotateY(ry || 0); geo.rotateZ(rz || 0); }
    geo.translate(x, y, z);
    return geo;
  }

  /* Wind: sways vertices in proportion to their height, phased by instance position. */
  var windUniforms = [];
  W.wind = windUniforms;
  function windy(mat, strength) {
    mat.onBeforeCompile = function (shader) {
      shader.uniforms.uTime = { value: 0 };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', [
          '#include <begin_vertex>',
          '{',
          '  #ifdef USE_INSTANCING',
          '  vec3 wp = instanceMatrix[3].xyz;',
          '  #else',
          '  vec3 wp = vec3(0.0);',
          '  #endif',
          '  float sw = sin(uTime * 1.4 + wp.x * 0.35 + wp.z * 0.25) * ' + strength.toFixed(3) + ' * max(0.0, position.y);',
          '  transformed.x += sw; transformed.z += sw * 0.6;',
          '}'].join('\n'));
      windUniforms.push(shader.uniforms.uTime);
    };
    mat.customProgramCacheKey = function () { return 'wind' + strength; };
    return mat;
  }
  function leafMat(strength) {
    return windy(new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), strength);
  }

  function buildVegetation(scene) {
    var pines = [], broads = [], deads = [], bushes = [], stumps = [], logs = [], shrooms = [];
    for (var gx = -232; gx <= 232; gx += 6) for (var gz = -232; gz <= 232; gz += 6) {
      var x = gx + (rnd() - 0.5) * 5.5, z = gz + (rnd() - 0.5) * 5.5;
      var r = Math.sqrt(x * x + z * z);
      if (r > 222) continue;
      var edge = smooth(172, 205, r);
      var sw = zoneW('swamp', x, z, 0.95);
      if (sw > 0.35) {
        if (rnd() < 0.12) deads.push({ x: x, z: z, y: heightAt(x, z) - 0.3, s: 0.8 + rnd() * 0.6, rot: rnd() * 6.28, tx: (rnd() - 0.5) * 0.2, tz: (rnd() - 0.5) * 0.2 });
        continue;
      }
      var fm = forestMask(x, z);
      var p = fm * 0.85 + 0.035 + edge * 0.3;
      var h = heightAt(x, z);
      if (rnd() > p) {
        /* no tree here: maybe undergrowth at the forest edge or a stump/log inside the wood */
        if (fm > 0.12 && fm < 0.7 && rnd() < 0.35 && h < 30) bushes.push({ x: x + (rnd() - 0.5) * 3, z: z + (rnd() - 0.5) * 3, y: h - 0.1, s: 0.7 + rnd() * 0.8, rot: rnd() * 6.28 });
        else if (fm > 0.4 && rnd() < 0.12 && h < 30) {
          if (rnd() < 0.5) stumps.push({ x: x, z: z, y: h - 0.1, s: 0.8 + rnd() * 0.6, rot: rnd() * 6.28 });
          else { logs.push({ x: x, z: z, y: h + 0.28, s: 0.8 + rnd() * 0.5, rot: rnd() * 6.28, tz: Math.PI / 2, tx: (rnd() - 0.5) * 0.15 }); addCollider(x, z, 1.2); }
        }
        continue;
      }
      if (h > 32) continue;
      var pine = zoneW('pines', x, z) > 0.2 || edge > 0.25 || fbm(x * 0.02, z * 0.02, 2) > 0.52;
      var s = 0.75 + rnd() * 0.75;
      (pine && rnd() < 0.85 ? pines : broads).push({ x: x, z: z, y: h - 0.2, s: s, rot: rnd() * 6.28 });
      addCollider(x, z, 0.55 * s + 0.15);
      if (pine && rnd() < 0.22) {
        var n = 1 + Math.floor(rnd() * 3);
        for (var k = 0; k < n; k++) { var mx = x + (rnd() - 0.5) * 2.4, mz = z + (rnd() - 0.5) * 2.4; shrooms.push({ x: mx, z: mz, y: heightAt(mx, mz), s: 0.6 + rnd() * 0.8, rot: rnd() * 6.28 }); }
      }
    }
    var trunkM = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, flatShading: true });
    var barkCol = function (it, c) { return c.setHSL(0.07 + (it.rot % 1) * 0.02, 0.35, 0.2 + ((it.rot * 7) % 1) * 0.08); };

    /* pines: tall trunk, three offset tiers */
    var pineTrunk = at(new T.CylinderGeometry(0.17, 0.4, 3.2, 6), 0, 1.6, 0);
    var pineCanopy = merge([
      at(new T.ConeGeometry(2.2, 3.0, 7), 0.05, 3.3, -0.05),
      at(new T.ConeGeometry(1.65, 2.7, 7), -0.08, 4.9, 0.06, 0, 0.45, 0),
      at(new T.ConeGeometry(1.1, 2.3, 7), 0.04, 6.3, 0.02, 0, 0.9, 0),
    ]);
    var pineCol = function (it, c) { var k = it.rot % 1; return c.setHSL(k < 0.25 ? 0.42 : 0.34 + k * 0.05, 0.36 + k * 0.1, 0.17 + (it.s - 0.75) * 0.09 + k * 0.03); };
    scene.add(instanced(pineTrunk, trunkM, pines, barkCol));
    scene.add(instanced(pineCanopy, leafMat(0.03), pines, pineCol));

    /* broadleaf: a canopy of four blobs, lighter towards the crown */
    var broadTrunk = merge([
      at(new T.CylinderGeometry(0.26, 0.48, 3.0, 6), 0, 1.5, 0),
      at(new T.CylinderGeometry(0.1, 0.16, 1.6, 5), 0.55, 3.2, 0.1, 0, 0, -0.7),
      at(new T.CylinderGeometry(0.09, 0.15, 1.5, 5), -0.5, 3.3, -0.2, 0.5, 0, 0.7),
    ]);
    var broadCanopy = merge([
      at(new T.IcosahedronGeometry(1.95, 1), 0, 4.2, 0, 0, 0, 0, [1, 0.88, 1]),
      at(new T.IcosahedronGeometry(1.35, 1), 1.05, 4.9, 0.45),
      at(new T.IcosahedronGeometry(1.25, 1), -1.0, 4.7, -0.55),
      at(new T.IcosahedronGeometry(1.05, 1), 0.2, 5.75, -0.25),
      at(new T.IcosahedronGeometry(0.95, 1), -0.3, 4.4, 1.15),
    ]);
    var broadCol = function (it, c) {
      var k = it.rot % 1;
      if (k < 0.16) return c.setHSL(0.06 + k * 0.25, 0.6, 0.42);
      return c.setHSL(0.21 + k * 0.09, 0.48, 0.3 + ((it.rot * 3) % 1) * 0.1);
    };
    scene.add(instanced(broadTrunk, trunkM, broads, barkCol));
    scene.add(instanced(broadCanopy, leafMat(0.035), broads, broadCol));

    /* dead swamp trees with two bare branches */
    var deadTree = merge([
      at(new T.CylinderGeometry(0.1, 0.45, 6, 5), 0, 2.9, 0),
      at(new T.CylinderGeometry(0.04, 0.12, 2.4, 4), 0.6, 4.6, 0.1, 0, 0, -0.9),
      at(new T.CylinderGeometry(0.04, 0.1, 1.9, 4), -0.45, 3.9, -0.2, 0.6, 0, 0.8),
    ]);
    scene.add(instanced(deadTree, new T.MeshStandardMaterial({ color: 0x3b3128, roughness: 0.95, flatShading: true }), deads));
    deads.forEach(function (d) { addCollider(d.x, d.z, 0.5); });

    /* undergrowth, stumps, logs, mushrooms */
    var bush = merge([
      at(new T.IcosahedronGeometry(0.8, 1), 0, 0.6, 0, 0, 0, 0, [1, 0.8, 1]),
      at(new T.IcosahedronGeometry(0.6, 1), 0.55, 0.5, 0.35),
      at(new T.IcosahedronGeometry(0.55, 1), -0.5, 0.55, -0.25),
    ]);
    var bushMesh = instanced(bush, leafMat(0.06), bushes, function (it, c) { return c.setHSL(0.24 + (it.rot % 1) * 0.08, 0.45, 0.27 + ((it.rot * 5) % 1) * 0.08); });
    scene.add(bushMesh);
    var stumpGeo = merge([at(new T.CylinderGeometry(0.42, 0.6, 0.7, 7), 0, 0.35, 0), at(new T.CylinderGeometry(0.34, 0.34, 0.06, 7), 0, 0.72, 0)]);
    scene.add(instanced(stumpGeo, trunkM, stumps, function (it, c) { return c.setHSL(0.08, 0.3, 0.26); }));
    var logGeo = at(new T.CylinderGeometry(0.3, 0.36, 3.4, 6), 0, 0, 0);
    scene.add(instanced(logGeo, trunkM, logs, function (it, c) { return c.setHSL(0.07, 0.32, 0.22); }));
    var stemGeo = at(new T.CylinderGeometry(0.07, 0.1, 0.34, 5), 0, 0.17, 0);
    var capGeo = at(new T.SphereGeometry(0.24, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.3, 0, 0, 0, 0, [1, 0.7, 1]);
    var stemMesh = instanced(stemGeo, new T.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9, flatShading: true }), shrooms);
    stemMesh.castShadow = false;
    scene.add(stemMesh);
    var capMesh = instanced(capGeo, new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, flatShading: true }), shrooms, function (it, c) { var k = it.rot % 1; return k < 0.6 ? c.setHSL(0.01 + k * 0.03, 0.7, 0.42) : c.setHSL(0.08, 0.45, 0.55); });
    capMesh.castShadow = false;
    scene.add(capMesh);

    /* grass tufts (three blades each), reeds, meadow flowers */
    var tufts = [], flowers = [], reeds = [];
    var tries = 0;
    while (tufts.length < 4200 && tries++ < 20000) {
      var a = rnd() * 6.283, rr = Math.sqrt(rnd()) * 170;
      var x2 = Math.cos(a) * rr, z2 = Math.sin(a) * rr;
      if (forestMask(x2, z2) > 0.45 || pathDist(x2, z2) < 2 || zoneW('camp', x2, z2, 0.75) > 0.3 || zoneW('mud', x2, z2, 0.8) > 0.3 || zoneW('ruins', x2, z2, 0.75) > 0.3) continue;
      var swk = zoneW('swamp', x2, z2, 0.95);
      if (swk > 0.6) continue;
      var item = { x: x2, z: z2, y: heightAt(x2, z2), s: 0.7 + rnd() * 0.8, rot: rnd() * 6.28, tx: (rnd() - 0.5) * 0.3, tz: (rnd() - 0.5) * 0.3 };
      if (swk > 0.15) reeds.push(item); else tufts.push(item);
    }
    var tuftGeo = merge([
      at(new T.ConeGeometry(0.13, 0.8, 3), 0, 0.4, 0),
      at(new T.ConeGeometry(0.1, 0.62, 3), 0.17, 0.3, 0.05, 0, 0, -0.35),
      at(new T.ConeGeometry(0.1, 0.68, 3), -0.14, 0.33, -0.09, 0, 0, 0.32),
    ]);
    var tuft = instanced(tuftGeo, leafMat(0.1), tufts, function (it, c) { return c.setHSL(0.2 + (it.rot % 1) * 0.07, 0.5, 0.3 + ((it.rot * 3) % 1) * 0.06); });
    tuft.castShadow = false;
    scene.add(tuft);
    var reedGeo = merge([at(new T.ConeGeometry(0.09, 2.2, 3), 0, 1.1, 0), at(new T.ConeGeometry(0.07, 1.7, 3), 0.14, 0.85, 0.06, 0, 0, -0.15)]);
    var reed = instanced(reedGeo, leafMat(0.08), reeds, function (it, c) { return c.setHSL(0.19, 0.35, 0.28); });
    reed.castShadow = false;
    scene.add(reed);

    tries = 0;
    while (flowers.length < 700 && tries++ < 6000) {
      var a2 = rnd() * 6.283, r2 = Math.sqrt(rnd()) * 60;
      var fx = Math.cos(a2) * r2, fz = 82 + Math.sin(a2) * r2;
      if (pathDist(fx, fz) < 2.5 || zoneW('camp', fx, fz, 0.9) > 0.2 || forestMask(fx, fz) > 0.3) continue;
      flowers.push({ x: fx, z: fz, y: heightAt(fx, fz), s: 0.8 + rnd() * 0.6, rot: rnd() * 6.28 });
    }
    var flowerGeo = merge([at(new T.CylinderGeometry(0.02, 0.03, 0.4, 3), 0, 0.2, 0), at(new T.IcosahedronGeometry(0.15, 0), 0, 0.45, 0)]);
    var flowerM = windy(new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, emissive: 0x222222, flatShading: true }), 0.12);
    var palette = [0xe8d9a8, 0xd9a441, 0xc9583a, 0xb9a0d0, 0xf0f0e0];
    var fl = instanced(flowerGeo, flowerM, flowers, function (it, c) { return c.setHex(palette[Math.floor((it.rot % 1) * palette.length)]); });
    fl.castShadow = false;
    scene.add(fl);
  }

  /* boulders: two fused lumps, random tilt; about half carry a moss cap (those stay upright) */
  function buildRocks(scene) {
    var rocks = [], mossy = [], pebbles = [];
    for (var i = 0; i < 340; i++) {
      var a = rnd() * 6.283, r = 20 + Math.sqrt(rnd()) * 200;
      var x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (pathDist(x, z) < 3 || zoneW('camp', x, z, 0.9) > 0.2 || zoneW('mud', x, z, 0.8) > 0.2 || zoneW('swamp', x, z, 0.9) > 0.3) continue;
      var edge = smooth(160, 215, r);
      var s = 0.4 + rnd() * (1.2 + edge * 2.5);
      var moss = edge < 0.3 && rnd() < 0.5;
      var it = { x: x, z: z, y: heightAt(x, z) - s * 0.22, sx: s * (0.8 + rnd() * 0.6), sy: s * (0.6 + rnd() * 0.5), sz: s * (0.8 + rnd() * 0.6), rot: rnd() * 6.28, tx: moss ? 0 : (rnd() - 0.5) * 0.6, tz: moss ? 0 : (rnd() - 0.5) * 0.6 };
      rocks.push(it);
      if (moss) mossy.push(it);
      if (s > 0.9) addCollider(x, z, s * 0.75);
      if (rnd() < 0.6) for (var k = 0; k < 3; k++) { var px = x + (rnd() - 0.5) * 4 * s, pz = z + (rnd() - 0.5) * 4 * s; pebbles.push({ x: px, z: pz, y: heightAt(px, pz), s: 0.15 + rnd() * 0.25, rot: rnd() * 6.28, tx: rnd(), tz: rnd() }); }
    }
    var rockGeo = merge([
      new T.DodecahedronGeometry(1, 0),
      at(new T.DodecahedronGeometry(0.62, 0), 0.72, -0.12, 0.4, 0.4, 0.3, 0),
      at(new T.DodecahedronGeometry(0.5, 0), -0.6, -0.2, -0.45, 0, 0.7, 0.3),
    ]);
    var rockM = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, flatShading: true });
    var rockCol = function (it, c) { var k = it.rot % 1; return c.setHSL(0.08 + k * 0.04, 0.07 + k * 0.05, 0.34 + ((it.rot * 3) % 1) * 0.16); };
    scene.add(instanced(rockGeo, rockM, rocks, rockCol));
    var mossGeo = at(new T.IcosahedronGeometry(0.95, 1), 0, 0.55, 0, 0, 0, 0, [1.15, 0.38, 1.15]);
    var mossMesh = instanced(mossGeo, new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), mossy, function (it, c) { return c.setHSL(0.27 + (it.rot % 1) * 0.06, 0.4, 0.3); });
    mossMesh.castShadow = false;
    scene.add(mossMesh);
    var pebbleMesh = instanced(new T.DodecahedronGeometry(1, 0), rockM, pebbles, rockCol);
    pebbleMesh.castShadow = false;
    scene.add(pebbleMesh);
  }

  /* ---------- guild camp (south) ---------- */
  function buildCamp(scene, anim) {
    var zn = TW.ZONE_BY_ID.camp;
    var g = new T.Group();
    scene.add(g);
    var at = function (x, z) { return heightAt(x, z); };

    /* campfire */
    var fx = -4, fz = 152, fy = at(fx, fz);
    var stoneM = H.mk(0x6c675c);
    for (var i = 0; i < 9; i++) {
      var a = i / 9 * 6.283;
      var s = H.part(H.dod(0.32), stoneM, fx + Math.cos(a) * 1.15, fy + 0.15, fz + Math.sin(a) * 1.15, g);
      s.rotation.set(rnd(), rnd(), rnd());
    }
    var logM = H.mk(0x4a3420);
    for (var l = 0; l < 3; l++) { var lg = H.part(H.cyl(0.14, 0.14, 1.6, 6), logM, fx, fy + 0.3, fz, g); lg.rotation.set(1.2, l * 1.05, 0.3); }
    var flameM1 = new T.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false });
    var flameM2 = new T.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false });
    var f1 = H.part(H.cone(0.65, 1.7, 6), flameM1, fx, fy + 1.0, fz, g); f1.castShadow = false;
    var f2 = H.part(H.cone(0.35, 1.1, 5), flameM2, fx, fy + 0.8, fz, g); f2.castShadow = false;
    var fire = new T.PointLight(0xff9a4a, 1.6, 34, 2);
    fire.position.set(fx, fy + 1.8, fz);
    g.add(fire);
    anim.push(function (dt, t) {
      var k = 0.85 + Math.sin(t * 17) * 0.08 + Math.sin(t * 29 + 1) * 0.07;
      f1.scale.set(k, 0.9 + Math.sin(t * 13) * 0.18, k);
      f2.scale.set(1, 0.9 + Math.sin(t * 21 + 2) * 0.25, 1);
      f1.rotation.y += dt * 2; f2.rotation.y -= dt * 3;
      fire.intensity = 1.5 + Math.sin(t * 23) * 0.2 + Math.sin(t * 7) * 0.15;
    });
    addCollider(fx, fz, 1.5);

    /* tents facing the fire */
    var tentM = H.mk(0xc7b28a), tentDark = H.mk(0x2b241c);
    [[-12, 156], [10, 158], [-6, 165]].forEach(function (p) {
      var y = at(p[0], p[1]);
      var t = H.part(H.cone(2.7, 3.4, 4), tentM, p[0], y + 1.6, p[1], g);
      t.rotation.y = Math.atan2(fx - p[0], fz - p[1]) + Math.PI / 4;
      var door = H.part(H.cone(0.9, 1.7, 3), tentDark, p[0] + Math.sin(t.rotation.y - Math.PI / 4) * 1.5, y + 0.8, p[1] + Math.cos(t.rotation.y - Math.PI / 4) * 1.5, g);
      door.rotation.y = t.rotation.y - Math.PI / 4;
      addCollider(p[0], p[1], 2.4);
    });

    /* bounty board */
    var bx = 10, bz = 146, by = at(bx, bz);
    var woodM = H.mk(0x6b4a2e), paperM = H.mk(0xe8dcc0);
    H.part(H.box(0.2, 2.8, 0.2), woodM, bx - 1.2, by + 1.4, bz, g);
    H.part(H.box(0.2, 2.8, 0.2), woodM, bx + 1.2, by + 1.4, bz, g);
    H.part(H.box(2.8, 1.7, 0.14), woodM, bx, by + 2.0, bz, g);
    H.part(H.box(3.1, 0.12, 0.6), woodM, bx, by + 2.95, bz + 0.1, g);
    [[-0.85, 2.15], [0.1, 1.95], [0.9, 2.3], [-0.2, 1.55]].forEach(function (n) { H.part(H.box(0.55, 0.7, 0.03), paperM, bx + n[0], by + n[1], bz + 0.09, g); });
    addCollider(bx, bz, 1.2);

    /* guild banners at the north gate */
    var poleM = H.mk(0x4a3526), flagM = H.mk(0x3f8a78);
    [[-5, 130], [5, 130]].forEach(function (p) {
      var y = at(p[0], p[1]);
      H.part(H.cyl(0.08, 0.1, 6.5, 6), poleM, p[0], y + 3.2, p[1], g);
      var flag = H.part(H.box(1.6, 1.0, 0.04), flagM, p[0] + 0.85, y + 5.8, p[1], g);
      flag.geometry.translate(0.8, 0, 0);
      flag.position.x = p[0];
      anim.push(function (dt, t) { flag.rotation.y = Math.sin(t * 2.1 + p[0]) * 0.35 + 0.3; });
      addCollider(p[0], p[1], 0.35);
    });

    /* crates & barrels */
    var crateM = H.mk(0x7a5a3a);
    [[-9.5, 151.5], [-8.6, 151.2], [12, 154]].forEach(function (p, i) {
      var y = at(p[0], p[1]);
      var c = H.part(H.box(1.0, 1.0, 1.0), crateM, p[0], y + 0.5 + (i === 1 ? 1 : 0), p[1], g);
      c.rotation.y = i * 0.5;
    });
    var barrel = H.part(H.cyl(0.5, 0.45, 1.1, 8), crateM, 13.5, at(13.5, 153) + 0.55, 153, g);
    addCollider(-9, 151.5, 1.2); addCollider(12.5, 153.5, 1.3);

    /* pedestal ring — where the chosen hunter stands during class select */
    var ring = new T.Mesh(new T.RingGeometry(1.3, 1.5, 40), new T.MeshBasicMaterial({ color: 0x6cc2ab, transparent: true, opacity: 0.55, side: T.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(W.PREVIEW.x, at(W.PREVIEW.x, W.PREVIEW.z) + 0.08, W.PREVIEW.z);
    ring.visible = false;
    g.add(ring);
    W.pedestalRing = ring;
  }
  W.PREVIEW = { x: 2, z: 144 };

  /* ---------- goblin camp (west) ---------- */
  function buildMudCamp(scene) {
    var zn = TW.ZONE_BY_ID.mud;
    var g = new T.Group();
    scene.add(g);
    var logs = [], tips = [];
    for (var a = 0; a < Math.PI * 2; a += 0.15) {
      var gap = Math.abs(a - 0) < 0.3 || Math.abs(a - Math.PI * 2) < 0.3 || Math.abs(a - Math.PI / 2) < 0.32;
      if (gap) continue;
      var x = zn.x + Math.cos(a) * 18, z = zn.z + Math.sin(a) * 18, y = heightAt(x, z);
      var hgt = 3 + rnd() * 1.2;
      logs.push({ x: x, z: z, y: y - 0.4, sy: hgt / 3, tx: (rnd() - 0.5) * 0.14, tz: (rnd() - 0.5) * 0.14, rot: rnd() * 6 });
      tips.push({ x: x, z: z, y: y - 0.4 + hgt - 0.05, tx: 0, tz: 0, rot: rnd() * 6 });
      addCollider(x, z, 0.55);
    }
    var logGeo = new T.CylinderGeometry(0.3, 0.36, 3, 6); logGeo.translate(0, 1.5, 0);
    var logM = new T.MeshStandardMaterial({ color: 0x5b4028, roughness: 0.95, flatShading: true });
    scene.add(instanced(logGeo, logM, logs));
    var tipGeo = new T.ConeGeometry(0.3, 0.7, 6); tipGeo.translate(0, 0.35, 0);
    scene.add(instanced(tipGeo, logM, tips));

    var mudM = H.mk(0x6f5a40), thatchM = H.mk(0x8f7a3e), darkM = H.mk(0x2b241c);
    [[-9, -6], [8, -8], [6, 9]].forEach(function (o) {
      var x = zn.x + o[0], z = zn.z + o[1], y = heightAt(x, z);
      H.part(H.cyl(2.2, 2.4, 2.2, 8), mudM, x, y + 1.0, z, g);
      H.part(H.cone(3.0, 2.3, 8), thatchM, x, y + 3.2, z, g);
      var door = H.part(H.box(1.0, 1.4, 0.2), darkM, x + Math.sign(-o[0]) * 2.2, y + 0.7, z, g);
      door.rotation.y = Math.PI / 2;
      addCollider(x, z, 2.6);
    });
    /* totem */
    var tx = zn.x, tz = zn.z, ty = heightAt(tx, tz);
    H.part(H.box(1.1, 3.4, 1.1), H.mk(0x5b4028), tx, ty + 1.7, tz, g);
    H.part(H.sph(0.6, 8, 6), H.mk(0xe8dcc0), tx, ty + 3.9, tz, g);
    var hornM = H.mk(0xd9ccb0);
    var h1 = H.part(H.cone(0.14, 0.9, 4), hornM, tx - 0.5, ty + 4.3, tz, g); h1.rotation.z = 0.6;
    var h2 = H.part(H.cone(0.14, 0.9, 4), hornM, tx + 0.5, ty + 4.3, tz, g); h2.rotation.z = -0.6;
    addCollider(tx, tz, 1.0);
    /* stakes with skulls near the gates */
    [[15, 2], [15, -2], [2, 15], [-2, 15]].forEach(function (o) {
      var x = zn.x + o[0], z = zn.z + o[1], y = heightAt(x, z);
      H.part(H.cyl(0.08, 0.1, 2.6, 5), H.mk(0x5b4028), x, y + 1.3, z, g);
      H.part(H.sph(0.28, 7, 5), H.mk(0xe8dcc0), x, y + 2.75, z, g);
    });
  }

  /* ---------- swamp (north-west) ---------- */
  function buildSwamp(scene, anim) {
    var zn = TW.ZONE_BY_ID.swamp;
    var g = new T.Group();
    scene.add(g);
    var level = bigAt(zn.x, zn.z) + zn.flat.lift + 0.55;
    var water = new T.Mesh(new T.CircleGeometry(40, 48), new T.MeshStandardMaterial({ color: 0x2c4a45, roughness: 0.15, metalness: 0.25, transparent: true, opacity: 0.84 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(zn.x, level, zn.z);
    water.receiveShadow = true;
    g.add(water);
    W.waterLevel = level;
    anim.push(function (dt, t) { water.position.y = level + Math.sin(t * 0.8) * 0.04; });

    var padM = H.mk(0x4f7a3a);
    for (var i = 0; i < 46; i++) {
      var a = rnd() * 6.283, r = 6 + rnd() * 30;
      var p = H.part(H.cyl(0.5 + rnd() * 0.5, 0.5, 0.06, 7), padM, zn.x + Math.cos(a) * r, level + 0.04, zn.z + Math.sin(a) * r, g);
      p.castShadow = false;
    }
    var stemM = H.mk(0xd9ccb0), capM = H.mk(0x6e3a63, { emissive: 0x3a1733, emissiveIntensity: 0.55 }), spotM = H.mk(0xefe4cf);
    for (var k = 0; k < 8; k++) {
      var a2 = k / 8 * 6.283 + 0.4, r2 = 24 + rnd() * 12;
      var x = zn.x + Math.cos(a2) * r2, z = zn.z + Math.sin(a2) * r2, y = heightAt(x, z);
      var s = 1.4 + rnd() * 1.2;
      H.part(H.cyl(0.5 * s, 0.72 * s, 3.4 * s, 8), stemM, x, y + 1.7 * s, z, g);
      var cap = H.part(new T.SphereGeometry(2.2 * s, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), capM, x, y + 3.3 * s, z, g);
      cap.scale.y = 0.65;
      for (var d = 0; d < 5; d++) { var aa = d * 1.3; H.part(H.sph(0.25 * s, 6, 4), spotM, x + Math.cos(aa) * 1.3 * s, y + 3.3 * s + 0.9 * s, z + Math.sin(aa) * 1.3 * s, g); }
      addCollider(x, z, 0.8 * s);
    }
  }

  /* ---------- ruins (north-east) ---------- */
  function buildRuins(scene, anim) {
    var zn = TW.ZONE_BY_ID.ruins;
    var g = new T.Group();
    scene.add(g);
    var cx = zn.x, cz = zn.z, base = heightAt(cx, cz);
    var stoneM = H.mk(0x8a8676), darkM = H.mk(0x6a665a);
    var floor = H.part(H.cyl(19.5, 20.5, 1.2, 8), stoneM, cx, base - 0.35, cz, g);
    floor.receiveShadow = true;
    var sigil = new T.Mesh(new T.RingGeometry(8.6, 9.2, 56), new T.MeshBasicMaterial({ color: 0xd4a64a, transparent: true, opacity: 0.35, depthWrite: false, side: T.DoubleSide }));
    sigil.rotation.x = -Math.PI / 2;
    sigil.position.set(cx, base + 0.27, cz);
    g.add(sigil);
    anim.push(function (dt, t) { sigil.material.opacity = 0.25 + Math.sin(t * 1.5) * 0.12; });

    var heights = [7, 3.5, 6.2, 2.2, 7, 5, 1.8, 6.5, 4, 7.2];
    for (var i = 0; i < 10; i++) {
      var a = i / 10 * Math.PI * 2 + 0.31;
      if (Math.abs(a - Math.PI / 2) < 0.4) continue; // south gate
      var x = cx + Math.cos(a) * 15.5, z = cz + Math.sin(a) * 15.5, hh = heights[i];
      H.part(H.cyl(1.0, 1.15, hh, 8), stoneM, x, base + hh / 2, z, g);
      if (hh > 6) H.part(H.box(2.6, 0.6, 2.6), darkM, x, base + hh + 0.3, z, g);
      addCollider(x, z, 1.3);
      if (hh < 4) {
        var fallen = H.part(H.cyl(0.95, 1.0, 5, 8), darkM, x + Math.cos(a + 1.3) * 3, base + 0.9, z + Math.sin(a + 1.3) * 3, g);
        fallen.rotation.set(Math.PI / 2 - 0.05, 0, a + 0.4);
      }
    }
    /* south arch */
    var ax = cx, az = cz + 21, ay = heightAt(ax, az);
    H.part(H.cyl(0.9, 1.0, 7.5, 8), stoneM, ax - 3.6, ay + 3.7, az, g);
    H.part(H.cyl(0.9, 1.0, 7.5, 8), stoneM, ax + 3.6, ay + 3.7, az, g);
    H.part(H.box(9.6, 1.2, 2.2), darkM, ax, ay + 7.9, az, g);
    addCollider(ax - 3.6, az, 1.2); addCollider(ax + 3.6, az, 1.2);

    /* the heart-root stump behind the arena */
    var sx = cx, sz = cz - 13, sy = heightAt(sx, sz);
    var woodM = H.mk(0x3b2a1e), thornM = H.mk(0x3b2a1e, { emissive: 0x6a2410, emissiveIntensity: 0.45 });
    H.part(H.cyl(3.4, 4.6, 5.5, 9), woodM, sx, sy + 2.5, sz, g);
    for (var r = 0; r < 7; r++) {
      var ra = r / 7 * Math.PI * 2;
      var root = H.part(H.cyl(0.5, 1.1, 8, 6), woodM, sx + Math.cos(ra) * 6, sy + 0.6, sz + Math.sin(ra) * 6, g);
      root.rotation.set(Math.PI / 2 - 0.25, 0, -ra + Math.PI / 2);
      root.rotation.order = 'ZXY';
    }
    for (var t2 = 0; t2 < 9; t2++) {
      var ta = t2 / 9 * Math.PI * 2;
      var th = H.part(H.cone(0.35, 2.4, 5), thornM, sx + Math.cos(ta) * 3.2, sy + 5.4 + (t2 % 2) * 0.8, sz + Math.sin(ta) * 3.2, g);
      th.rotation.set(Math.sin(ta) * 0.5, 0, -Math.cos(ta) * 0.5);
    }
    addCollider(sx, sz, 5.0);
  }

  /* ---------- minimap base image ---------- */
  W.minimapImage = function (px, extent) {
    var c = document.createElement('canvas');
    c.width = c.height = px;
    var ctx = c.getContext('2d');
    var img = ctx.createImageData(px, px);
    var d = img.data, k = extent * 2 / px;
    for (var j = 0; j < px; j++) for (var i = 0; i < px; i++) {
      var x = -extent + (i + 0.5) * k, z = -extent + (j + 0.5) * k;
      var r = Math.sqrt(x * x + z * z), o = (j * px + i) * 4;
      if (r > extent) { d[o + 3] = 0; continue; }
      var h = heightAt(x, z);
      var col2 = colorAt(x, z, h);
      var shade = 0.75 + smooth(-8, 12, h) * 0.45;
      if (zoneW('swamp', x, z, 0.8) > 0.5 && h < W.waterLevel) { col2 = [0.17, 0.29, 0.27]; shade = 1; }
      d[o] = col2[0] * 255 * shade; d[o + 1] = col2[1] * 255 * shade; d[o + 2] = col2[2] * 255 * shade; d[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  };

  TW.World = W;
})();
