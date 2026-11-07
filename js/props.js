/* =========================================================
   復興國小之福星社團群島 — 3D 工具與微縮道具模型
   (Three.js r149 UMD，無需建置，可直接以 file:// 開啟)
   ========================================================= */
(function () {
  const T = THREE;
  if (T.ColorManagement) T.ColorManagement.legacyMode = false;

  /* ---------- 亂數 / 雜訊 ---------- */
  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rnd = mulberry(20260611);
  const R = (a, b) => a + (b - a) * rnd();
  const hash3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };

  /* ---------- 材質 ---------- */
  const matCache = {};
  function M(color, o) {
    const key = color + (o ? JSON.stringify(o) : '');
    if (matCache[key]) return matCache[key];
    return (matCache[key] = new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.82, metalness: 0, flatShading: true }, o || {})));
  }
  const glowMats = [];           // 夜間會發光的材質
  function Glow(color, base = 0.15, night = 1.6) {
    const m = new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: base, roughness: 0.6, flatShading: true });
    m.userData.glow = [base, night];
    glowMats.push(m);
    return m;
  }
  const vcMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, flatShading: true });

  /* ---------- 網格輔助 ---------- */
  function mesh(geo, mat, p, r, s) {
    const m = new T.Mesh(geo, mat);
    if (p) m.position.set(p[0], p[1], p[2]);
    if (r) m.rotation.set(r[0], r[1], r[2]);
    if (s !== undefined) { if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]); }
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  const matOf = (c, o) => (c && c.isMaterial ? c : M(c, o));
  const box = (w, h, d, c, p, r, o) => mesh(new T.BoxGeometry(w, h, d), matOf(c, o), p, r);
  const cyl = (rt, rb, h, c, p, r, seg = 14, o) => mesh(new T.CylinderGeometry(rt, rb, h, seg), matOf(c, o), p, r);
  const sph = (rad, c, p, s, detail = 1, o) => mesh(new T.IcosahedronGeometry(rad, detail), matOf(c, o), p, null, s);
  const con = (rad, h, c, p, r, seg = 8, o) => mesh(new T.ConeGeometry(rad, h, seg), matOf(c, o), p, r);
  const tor = (rad, tube, c, p, r, arc = Math.PI * 2) => mesh(new T.TorusGeometry(rad, tube, 6, 20, arc), matOf(c), p, r);
  function add(g) { for (let i = 1; i < arguments.length; i++) g.add(arguments[i]); return g; }

  /* ---------- 靜態裝飾合併（減少 draw call） ---------- */
  function Merger() { this.parts = []; }
  Merger.prototype.add = function (geo, color, pos, rot, scale) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const sc = Array.isArray(scale) ? scale : [scale || 1, scale || 1, scale || 1];
    const m = new T.Matrix4().compose(
      new T.Vector3(pos[0], pos[1], pos[2]),
      new T.Quaternion().setFromEuler(new T.Euler(...(rot || [0, 0, 0]))),
      new T.Vector3(sc[0], sc[1], sc[2]));
    g.applyMatrix4(m);
    const c = new T.Color(color), n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    this.parts.push({ pos: g.attributes.position.array, col });
  };
  Merger.prototype.build = function () {
    let total = 0; this.parts.forEach(p => (total += p.pos.length));
    const pos = new Float32Array(total), col = new Float32Array(total);
    let o = 0; this.parts.forEach(p => { pos.set(p.pos, o); col.set(p.col, o); o += p.pos.length; });
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = new T.Mesh(geo, vcMat); m.castShadow = true; m.receiveShadow = true;
    return m;
  };

  /* ---------- Canvas 貼圖 ---------- */
  const FONT = '"Chiron GoRound TC","Noto Sans TC","Microsoft JhengHei",sans-serif';
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4;
    return t;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  /* 手作感標籤（貼紙＋縫線） */
  function makeLabel(text, opt) {
    opt = Object.assign({ color: '#f08a3c', bg: '#fffaf0', fg: '#4a3423', size: 1.6, font: 56, sub: null }, opt || {});
    const pad = 34, fz = opt.font, subFz = Math.round(fz * 0.5);
    const meas = document.createElement('canvas').getContext('2d');
    meas.font = `900 ${fz}px ${FONT}`;
    let tw = meas.measureText(text).width;
    if (opt.sub) { meas.font = `700 ${subFz}px ${FONT}`; tw = Math.max(tw, meas.measureText(opt.sub).width); }
    const w = Math.ceil(tw + pad * 2), h = Math.ceil(fz * 1.55 + (opt.sub ? subFz * 1.3 : 0) + 18);
    const tex = canvasTex(w, h + 10, (ctx) => {
      ctx.fillStyle = 'rgba(60,40,20,.25)'; roundRect(ctx, 6, 12, w - 10, h - 6, h * 0.3); ctx.fill();
      ctx.fillStyle = opt.bg; roundRect(ctx, 3, 3, w - 10, h - 6, h * 0.3); ctx.fill();
      ctx.lineWidth = 7; ctx.strokeStyle = opt.color; ctx.stroke();
      ctx.setLineDash([10, 8]); ctx.lineWidth = 2.5; ctx.strokeStyle = opt.color;
      roundRect(ctx, 14, 14, w - 32, h - 28, h * 0.22); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = opt.fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 ${fz}px ${FONT}`;
      const ty = opt.sub ? h * 0.4 : h / 2;
      ctx.fillText(text, (w - 7) / 2, ty);
      if (opt.sub) { ctx.font = `700 ${subFz}px ${FONT}`; ctx.fillStyle = opt.color; ctx.fillText(opt.sub, (w - 7) / 2, h * 0.76); }
    });
    const mat = new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const s = new T.Sprite(mat);
    const asp = w / (h + 10);
    s.scale.set(opt.size * asp, opt.size, 1);
    s.center.set(0.5, 0);
    s.renderOrder = 10;
    return s;
  }

  /* ---------- 小人偶 ---------- */
  const SKIN = '#f3c9a0';
  function figure(color, p, h = 1) {
    const g = new T.Group(); g.position.set(p[0], p[1], p[2]);
    add(g, con(0.28 * h, 0.75 * h, color, [0, 0.38 * h, 0], null, 8), sph(0.2 * h, SKIN, [0, 0.92 * h, 0], 1, 1),
      sph(0.21 * h, '#3b2a20', [0, 1.0 * h, -0.03], [1, 0.7, 1], 1));
    return g;
  }
  function musicNote(color) {
    const g = new T.Group();
    add(g, sph(0.2, color, [0, 0, 0], [1.2, 0.85, 1], 1), box(0.05, 0.75, 0.05, color, [0.2, 0.36, 0]), box(0.25, 0.08, 0.05, color, [0.3, 0.72, 0], [0, 0, -0.5]));
    return g;
  }

  /* =========================================================
     20 個社團的微縮道具
     每個函式在 g 上建構模型，可回傳 anim(t) 動畫函式
     ========================================================= */
  const P = {};

  P.baseball = (g) => {
    add(g, box(4.6, 0.12, 4.6, '#c98a55', [0, 0.06, 0], [0, Math.PI / 4, 0]),
      box(3, 0.14, 3, '#6dbb4f', [0, 0.07, 0], [0, Math.PI / 4, 0]),
      cyl(0.45, 0.55, 0.18, '#c98a55', [0, 0.16, 0]));
    [[0, 2.1], [2.1, 0], [0, -2.1], [-2.1, 0]].forEach(([x, z]) => g.add(box(0.36, 0.1, 0.36, '#ffffff', [x, 0.2, z], [0, Math.PI / 4, 0])));
    const ball = sph(0.75, '#fbfaf5', [0.2, 1.1, 2.1], 1, 2);
    ball.add(tor(0.75, 0.035, '#d6342c', [0, 0, 0], [0.4, 0, 0.3]));
    g.add(ball);
    const bat = new T.Group(); bat.position.set(-1.1, 0.2, 1.6); bat.rotation.set(0, 0.6, -1.2);
    add(bat, cyl(0.16, 0.06, 2.6, '#c88a4c', [0, 1.3, 0]), sph(0.09, '#8a5a2c', [0, 0, 0]));
    g.add(bat);
    return (t) => { ball.rotation.y = t * 0.8; ball.position.y = 1.1 + Math.sin(t * 2) * 0.15; };
  };

  P.teeball = (g) => {
    add(g, cyl(2.1, 2.2, 0.12, '#79c35a', [0, 0.06, 0], null, 20),
      cyl(0.45, 0.55, 0.18, '#3a3a3a', [0, 0.2, 0]), cyl(0.08, 0.08, 1.3, '#4a4a4a', [0, 0.9, 0]));
    const ball = sph(0.32, '#ffe066', [0, 1.75, 0], 1, 2);
    g.add(ball);
    [[1.5, 0.6], [-1.4, 0.9], [0.3, -1.6], [-0.9, -1.2]].forEach(([x, z]) => g.add(con(0.22, 0.5, '#ff8a3d', [x, 0.37, z])));
    const bat = new T.Group(); bat.position.set(1.0, 0.15, -0.5); bat.rotation.set(0, -0.4, 1.35);
    add(bat, cyl(0.22, 0.1, 2.1, '#3f7fd6', [0, 1.05, 0])); g.add(bat);
    return (t) => { ball.rotation.x = t; };
  };

  P.basketball = (g) => {
    add(g, box(4.6, 0.12, 3.4, '#3f9a72', [0, 0.06, 0]), box(4.2, 0.13, 3.0, '#e98d4e', [0, 0.07, 0]),
      box(0.06, 0.15, 3.0, '#ffffff', [0, 0.08, 0]),
      cyl(0.08, 0.08, 3.2, '#5a5a5a', [-2.0, 1.6, 0]), box(0.08, 0.95, 1.5, '#ffffff', [-1.85, 2.8, 0]),
      box(0.09, 0.4, 0.5, '#e25b3c', [-1.83, 2.65, 0]));
    g.add(tor(0.3, 0.04, '#ff6b2c', [-1.5, 2.45, 0], [Math.PI / 2, 0, 0]));
    const ball = sph(0.45, '#f07b2a', [0.9, 0.6, 0.4], 1, 2);
    ball.add(tor(0.45, 0.025, '#3a2414', [0, 0, 0], [0, 0, 0]), tor(0.45, 0.025, '#3a2414', [0, 0, 0], [Math.PI / 2, 0, 0]));
    g.add(ball);
    return (t) => { ball.position.y = 0.6 + Math.abs(Math.sin(t * 3)) * 1.2; ball.rotation.z = -t * 2; };
  };

  P.soccer = (g) => {
    g.add(box(5, 0.12, 3.6, '#4fa846', [0, 0.06, 0]));
    for (let i = 0; i < 5; i += 2) g.add(box(1, 0.13, 3.6, '#66bd55', [-2 + i, 0.065, 0]));
    g.add(box(0.06, 0.14, 3.6, '#ffffff', [0, 0.08, 0]));
    const gl = new T.Group(); gl.position.set(-2.3, 0.1, 0);
    add(gl, cyl(0.07, 0.07, 1.5, '#ffffff', [0, 0.75, 1]), cyl(0.07, 0.07, 1.5, '#ffffff', [0, 0.75, -1]),
      cyl(0.07, 0.07, 2.1, '#ffffff', [0, 1.5, 0], [Math.PI / 2, 0, 0]),
      mesh(new T.BoxGeometry(0.8, 1.5, 2, 3, 4, 6), new T.MeshBasicMaterial({ color: '#ffffff', wireframe: true, transparent: true, opacity: 0.55 }), [-0.4, 0.75, 0]));
    g.add(gl);
    const bg = new T.IcosahedronGeometry(0.42, 1).toNonIndexed();
    const n = bg.attributes.position.count, col = new Float32Array(n * 3);
    for (let f = 0; f < n / 3; f++) { const dark = f % 4 === 0; for (let k = 0; k < 3; k++) col.set(dark ? [0.03, 0.03, 0.03] : [1, 1, 1], (f * 3 + k) * 3); }
    bg.setAttribute('color', new T.BufferAttribute(col, 3));
    const ball = mesh(bg, vcMat, [0.8, 0.55, 0.3]);
    g.add(ball);
    return (t) => { ball.position.x = 0.8 - ((t * 0.8) % 2.5); ball.rotation.z = t * 3; };
  };

  P.track = (g) => {
    const ring = mesh(new T.RingGeometry(1.25, 2.15, 40), M('#d9573f', { side: T.DoubleSide }), [0, 0.09, 0], [-Math.PI / 2, 0, 0], [1.25, 1, 1]);
    const lane1 = mesh(new T.RingGeometry(1.53, 1.57, 40), M('#ffffff', { side: T.DoubleSide }), [0, 0.1, 0], [-Math.PI / 2, 0, 0], [1.25, 1, 1]);
    const lane2 = mesh(new T.RingGeometry(1.83, 1.87, 40), M('#ffffff', { side: T.DoubleSide }), [0, 0.1, 0], [-Math.PI / 2, 0, 0], [1.25, 1, 1]);
    add(g, cyl(2.3, 2.35, 0.08, '#7cc35c', [0, 0.04, 0], null, 24, null), ring, lane1, lane2);
    g.children[0].scale.set(1.28, 1, 1.02);
    // 頒獎台
    add(g, box(0.6, 0.6, 0.6, '#ffd54f', [0, 0.38, 0]), box(0.6, 0.42, 0.6, '#e0e0e0', [-0.6, 0.29, 0]), box(0.6, 0.3, 0.6, '#d7995b', [0.6, 0.23, 0]));
    // 跨欄
    const h = new T.Group(); h.position.set(0, 0.1, 1.7);
    add(h, box(0.05, 0.6, 0.05, '#ffffff', [-0.4, 0.3, 0]), box(0.05, 0.6, 0.05, '#ffffff', [0.4, 0.3, 0]), box(0.9, 0.12, 0.05, '#e53935', [0, 0.6, 0]));
    g.add(h);
    const runner = figure('#ff7043', [0, 0.1, 0], 0.7); g.add(runner);
    return (t) => { const a = t * 0.9; runner.position.set(Math.cos(a) * 1.7 * 1.25, 0.1 + Math.abs(Math.sin(t * 8)) * 0.08, Math.sin(a) * 1.7); runner.rotation.y = -a; };
  };

  P.skating = (g) => {
    const s = new T.Group(); s.position.set(0, 0.45, 0); s.rotation.y = 0.5;
    add(s, box(1.2, 0.8, 2.2, '#4fc3f7', [0, 0.4, 0]), box(1.2, 1.5, 1.1, '#29a5e0', [0, 1.15, -0.55]),
      box(1.3, 0.25, 1.2, '#ff7aa2', [0, 1.95, -0.55]), box(0.3, 0.25, 2.2, '#455a64', [0, -0.05, 0]),
      box(1.25, 0.12, 0.25, '#ffffff', [0, 0.85, 0.3]), box(1.25, 0.12, 0.25, '#ffffff', [0, 0.85, 0.75]));
    const wheels = [];
    [-0.8, -0.27, 0.27, 0.8].forEach(z => { const w = cyl(0.28, 0.28, 0.24, '#ffd54f', [0, -0.25, z], [0, 0, Math.PI / 2], 14); wheels.push(w); s.add(w); });
    g.add(s);
    [[-1.8, 1.4], [-0.6, 1.9], [0.6, 2.0], [1.8, 1.5]].forEach(([x, z]) => g.add(con(0.18, 0.45, '#ff8a3d', [x, 0.25, z])));
    return (t) => { wheels.forEach(w => (w.rotation.x = t * 4)); s.position.y = 0.45 + Math.sin(t * 2) * 0.08; };
  };

  P.judo = (g) => {
    add(g, box(4.4, 0.3, 4.4, '#c8a26a', [0, 0.15, 0]), box(3.9, 0.07, 3.9, '#d84343', [0, 0.33, 0]), box(3.5, 0.09, 3.5, '#a5cf6a', [0, 0.35, 0]));
    [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]].forEach(([x, z]) => g.add(cyl(0.13, 0.13, 2.5, '#b9382f', [x, 1.55, z])));
    add(g, box(4.6, 0.2, 4.6, '#6d4c41', [0, 2.85, 0]), con(3.6, 1.5, '#5d4037', [0, 3.7, 0], [0, Math.PI / 4, 0], 4),
      sph(0.18, '#ffd54f', [0, 4.5, 0], 1, 0));
    g.add(figure('#ffffff', [-0.6, 0.4, 0], 0.8), figure('#ffffff', [0.6, 0.4, 0], 0.8));
    g.children[g.children.length - 1].rotation.y = Math.PI;
    const belt1 = box(0.5, 0.07, 0.5, '#222', [-0.6, 0.72, 0]), belt2 = box(0.5, 0.07, 0.5, '#2a62c9', [0.6, 0.72, 0]);
    add(g, belt1, belt2);
  };

  P.ocarina = (g) => {
    const o = new T.Group(); o.position.set(0, 1.2, 0); o.rotation.set(0, 0.4, 0.15);
    add(o, sph(1, '#d98e5a', [0, 0, 0], [1.6, 0.85, 1.0], 2), cyl(0.28, 0.32, 0.9, '#c97c4a', [1.55, 0.25, 0], [0, 0, -1.2], 10));
    [[-0.6, 0.3], [-0.15, 0.5], [0.3, 0.35], [0.1, -0.3], [-0.5, -0.35], [0.6, -0.1]].forEach(([x, z]) => o.add(sph(0.11, '#5a3220', [x, 0.78, z], [1, 0.4, 1], 1)));
    g.add(o, cyl(0.6, 0.8, 0.4, '#8d6e63', [0, 0.2, 0]));
    const notes = [];
    ['#3f7fd6', '#e91e63', '#7e57c2'].forEach((c, i) => { const n = musicNote(c); n.position.set(-1 + i, 2.5, 0.5); g.add(n); notes.push(n); });
    return (t) => { notes.forEach((n, i) => { n.position.y = 2.4 + Math.sin(t * 1.6 + i * 2) * 0.35 + i * 0.25; n.rotation.y = Math.sin(t + i) * 0.6; }); o.rotation.z = 0.15 + Math.sin(t * 1.2) * 0.05; };
  };

  P.choir = (g) => {
    const half = (r, h, c, y) => mesh(new T.CylinderGeometry(r, r, h, 24, 1, false, -Math.PI / 2, Math.PI), M(c), [0, y, -0.4]);
    add(g, half(2.4, 0.3, '#c9a27a', 0.15), half(1.75, 0.6, '#b98d63', 0.3), half(1.1, 0.9, '#a77a51', 0.45));
    const robes = ['#3f7fd6', '#3f7fd6', '#e85a8a', '#e85a8a', '#3f7fd6', '#e85a8a', '#ffb300'];
    const singers = [];
    [[-1.9, 0.3, -0.2], [1.9, 0.3, -0.2], [-1.35, 0.6, 0.6], [1.35, 0.6, 0.6], [0, 0.6, 1.4], [-0.5, 0.9, 0.2], [0.5, 0.9, 0.2]]
      .forEach(([x, y, z], i) => { const f = figure(robes[i], [x, y, z - 0.4], 0.75); f.lookAt(0, y, 3); singers.push(f); g.add(f); });
    add(g, cyl(0.04, 0.04, 1.3, '#555', [0, 0.65, 1.7]), sph(0.13, '#333', [0, 1.35, 1.7], 1, 1), cyl(0.3, 0.32, 0.05, '#444', [0, 0.03, 1.7]));
    const n = musicNote('#ffffff'); n.position.set(0.9, 2.6, 0.5); g.add(n);
    return (t) => { singers.forEach((s, i) => (s.position.y = (i < 2 ? 0.3 : i < 5 ? 0.6 : 0.9) + Math.abs(Math.sin(t * 3 + i)) * 0.05)); n.position.y = 2.6 + Math.sin(t * 2) * 0.3; };
  };

  P.dance = (g) => {
    add(g, cyl(2.2, 2.3, 0.35, '#ffffff', [0, 0.17, 0], null, 28), cyl(2.0, 2.0, 0.37, '#f48fb1', [0, 0.18, 0], null, 28));
    const d = new T.Group(); d.position.set(0, 0.37, 0);
    add(d, con(0.55, 0.45, '#ff80ab', [0, 0.85, 0], [Math.PI, 0, 0], 12), cyl(0.12, 0.15, 0.55, '#ff80ab', [0, 1.25, 0]),
      cyl(0.04, 0.04, 0.8, SKIN, [0.1, 0.35, 0]), cyl(0.04, 0.04, 0.8, SKIN, [-0.1, 0.35, 0]), sph(0.2, SKIN, [0, 1.7, 0]),
      sph(0.14, '#3b2a20', [0, 1.88, -0.05], 1, 1),
      cyl(0.03, 0.03, 0.8, SKIN, [0.4, 1.6, 0], [0, 0, -1.0]), cyl(0.03, 0.03, 0.8, SKIN, [-0.4, 1.6, 0], [0, 0, 1.0]));
    g.add(d);
    const ribbon = tor(1.4, 0.05, '#ffd54f', [0, 1.6, 0], [Math.PI / 2, 0, 0], Math.PI * 1.3); g.add(ribbon);
    return (t) => { d.rotation.y = t * 1.5; ribbon.rotation.z = -t * 1.5; ribbon.position.y = 1.6 + Math.sin(t * 2) * 0.2; };
  };

  P.hiphop = (g) => {
    const tiles = [];
    const pal = ['#ff4081', '#7c4dff', '#00bcd4', '#ffeb3b'];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const m = Glow(pal[(i + j) % 4], 0.25, 1.4);
      const tl = box(0.95, 0.12, 0.95, m, [-1.5 + i, 0.06, -1.5 + j]); tl.userData.ph = i * 1.3 + j * 0.7; tiles.push(tl); g.add(tl);
    }
    const b = new T.Group(); b.position.set(0, 0.12, -1.0);
    add(b, box(3, 1.5, 0.9, '#37474f', [0, 0.75, 0]), box(3.1, 0.15, 1.0, '#263238', [0, 1.55, 0]),
      cyl(0.5, 0.5, 0.1, '#111', [-0.9, 0.75, 0.45], [Math.PI / 2, 0, 0], 16), cyl(0.5, 0.5, 0.1, '#111', [0.9, 0.75, 0.45], [Math.PI / 2, 0, 0], 16),
      tor(0.5, 0.06, '#ff4081', [-0.9, 0.75, 0.5]), tor(0.5, 0.06, '#00e5ff', [0.9, 0.75, 0.5]),
      box(0.6, 0.3, 0.05, '#80deea', [0, 1.1, 0.46]), tor(0.9, 0.07, '#90a4ae', [0, 1.6, 0], [0, 0, 0], Math.PI));
    g.add(b);
    return (t) => { tiles.forEach(tl => tl.position.y = 0.06 + Math.max(0, Math.sin(t * 4 + tl.userData.ph)) * 0.08); b.scale.setScalar(1 + Math.max(0, Math.sin(t * 8)) * 0.03); };
  };

  P.papercut = (g) => {
    const f = new T.Group(); f.position.set(0, 0.2, 0); f.rotation.x = -0.15;
    add(f, box(3.2, 3.2, 0.2, '#f6e7c8', [0, 1.6, 0]), box(2.7, 2.7, 0.1, '#b39ddb', [0, 1.6, 0.15]),
      cyl(1.05, 1.05, 0.1, '#f2c96d', [0, 1.6, 0.22], [Math.PI / 2, 0, 0], 24), cyl(0.7, 0.7, 0.1, '#fff4dc', [0, 1.6, 0.3], [Math.PI / 2, 0, 0], 6));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; f.add(con(0.25, 0.5, '#9575cd', [Math.cos(a) * 1.1, 1.6 + Math.sin(a) * 1.1, 0.3], [Math.PI / 2, 0, a - Math.PI / 2], 3)); }
    g.add(f, box(3.4, 0.2, 1.2, '#a1774f', [0, 0.1, 0.2]));
    // 紙鶴
    const crane = new T.Group(); crane.position.set(1.6, 2.6, 1.2);
    add(crane, con(0.35, 0.9, '#ffffff', [0, 0, 0], [0, 0, Math.PI / 2], 3), con(0.25, 0.8, '#ff8a80', [0, 0.1, 0.35], [Math.PI / 2.4, 0, 0], 3), con(0.25, 0.8, '#ff8a80', [0, 0.1, -0.35], [-Math.PI / 2.4, 0, 0], 3));
    g.add(crane);
    return (t) => { crane.position.set(Math.cos(t * 0.6) * 1.8, 2.8 + Math.sin(t * 1.5) * 0.3, Math.sin(t * 0.6) * 1.8); crane.rotation.y = -t * 0.6; };
  };

  function floralTex() {
    return canvasTex(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#fff6ea'; ctx.fillRect(0, 0, w, h);
      const cols = ['#f48fb1', '#ce93d8', '#ffcc80', '#90caf9', '#a5d6a7'];
      for (let i = 0; i < 22; i++) {
        const x = R(0, w), y = R(0, h), r = R(10, 26), c = cols[i % 5];
        ctx.fillStyle = '#9ccc65'; ctx.beginPath(); ctx.ellipse(x + r, y + r * 0.4, r * 0.6, r * 0.25, 0.5, 0, Math.PI * 2); ctx.fill();
        for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.5, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#ffeb3b'; ctx.beginPath(); ctx.arc(x, y, r * 0.35, 0, Math.PI * 2); ctx.fill();
      }
    });
  }
  function butterfly(c) {
    const b = new T.Group();
    const wingGeo = new T.CircleGeometry(0.35, 8);
    const wm = M(c, { side: T.DoubleSide });
    const l = mesh(wingGeo, wm, [-0.3, 0, 0]), r = mesh(wingGeo, wm, [0.3, 0, 0]);
    const lw = new T.Group(), rw = new T.Group(); lw.add(l); rw.add(r);
    add(b, lw, rw, box(0.08, 0.08, 0.5, '#3b2a20'));
    b.children.forEach(ch => ch.rotation.x = -Math.PI / 2);
    b.userData.wings = [lw, rw];
    return b;
  }
  P.decoupage = (g) => {
    const lidMat = new T.MeshStandardMaterial({ map: floralTex(), roughness: 0.7 });
    const side = M('#a1683a');
    add(g, mesh(new T.BoxGeometry(2.6, 1.3, 1.9), [side, side, lidMat, side, side, side], [0, 0.65, 0]),
      box(0.3, 0.35, 0.08, '#d4a64a', [0, 1.0, 0.97]));
    const lid = mesh(new T.BoxGeometry(2.7, 0.25, 2.0), [side, side, lidMat, side, side, side], [0, 0, 1.0]);
    const hinge = new T.Group(); hinge.position.set(0, 1.42, -0.95); hinge.add(lid); hinge.rotation.x = -1.1; g.add(hinge);
    add(g, cyl(0.06, 0.03, 1.4, '#c88a4c', [1.6, 0.4, 0.9], [0.3, 0, 1.2]), cyl(0.14, 0.16, 0.45, '#ffffff', [-1.6, 0.22, 0.8]));
    const bfs = ['#ff80ab', '#80d8ff'].map((c) => { const b = butterfly(c); g.add(b); return b; });
    return (t) => bfs.forEach((b, i) => {
      const a = t * (0.7 + i * 0.2) + i * 3;
      b.position.set(Math.cos(a) * 1.8, 2.2 + Math.sin(t * 2 + i) * 0.4, Math.sin(a) * 1.8); b.rotation.y = -a;
      const f = Math.sin(t * 14 + i) * 0.9; b.userData.wings[0].rotation.z = f; b.userData.wings[1].rotation.z = -f;
    });
  };

  P.clay = (g) => {
    g.add(cyl(2.0, 2.1, 0.2, '#64b5f6', [0, 0.1, 0], null, 24));
    const bear = new T.Group(); bear.position.set(-0.7, 0.2, 0);
    add(bear, sph(0.7, '#a1673f', [0, 0.65, 0], [1, 1.05, 0.9]), sph(0.5, '#a1673f', [0, 1.6, 0]), sph(0.17, '#a1673f', [-0.38, 2.0, 0]), sph(0.17, '#a1673f', [0.38, 2.0, 0]),
      sph(0.2, '#e8c39a', [0, 1.5, 0.42], [1, 0.8, 0.6]), sph(0.06, '#222', [-0.17, 1.72, 0.44]), sph(0.06, '#222', [0.17, 1.72, 0.44]), sph(0.38, '#e8c39a', [0, 0.65, 0.5], [1, 1, 0.4]));
    g.add(bear);
    const carrot = new T.Group(); carrot.position.set(0.9, 0.2, -0.3);
    add(carrot, con(0.35, 1.4, '#ff8a3d', [0, 0.7, 0], [Math.PI, 0, 0], 8), con(0.12, 0.5, '#66bb6a', [0, 1.6, 0]), con(0.12, 0.45, '#66bb6a', [0.15, 1.55, 0], [0, 0, -0.5]));
    g.add(carrot);
    const balls = [];
    ['#ef5350', '#ffee58', '#ab47bc', '#26c6da', '#9ccc65'].forEach((c, i) => { const b = sph(0.22, c, [1.2 - i * 0.45, 0.42, 1.2]); balls.push(b); g.add(b); });
    return (t) => { bear.rotation.y = Math.sin(t) * 0.4; balls.forEach((b, i) => (b.position.y = 0.42 + Math.abs(Math.sin(t * 3 + i)) * 0.3)); };
  };

  P.handcraft = (g) => {
    const spool = new T.Group(); spool.position.set(-0.9, 0, 0);
    add(spool, cyl(0.9, 0.9, 0.2, '#d7a86e', [0, 0.1, 0], null, 18), cyl(0.7, 0.7, 1.4, '#e57373', [0, 0.9, 0], null, 18), cyl(0.9, 0.9, 0.2, '#d7a86e', [0, 1.7, 0], null, 18));
    for (let i = 0; i < 6; i++) spool.add(tor(0.71, 0.03, '#ef9a9a', [0, 0.35 + i * 0.22, 0], [Math.PI / 2, 0, 0]));
    g.add(spool);
    const btn = new T.Group(); btn.position.set(1.0, 0.95, -0.2); btn.rotation.set(0, -0.4, 0.2);
    add(btn, cyl(0.85, 0.85, 0.2, '#ffca28', [0, 0, 0], [Math.PI / 2, 0, 0], 20));
    [[-0.22, 0.22], [0.22, 0.22], [-0.22, -0.22], [0.22, -0.22]].forEach(([x, y]) => btn.add(cyl(0.1, 0.1, 0.22, '#8d6e63', [x, y, 0], [Math.PI / 2, 0, 0], 8)));
    g.add(btn);
    const yarn = sph(0.5, '#7986cb', [0.6, 0.5, 1.3], 1, 2);
    yarn.add(tor(0.5, 0.04, '#9fa8da', [0, 0, 0], [0.5, 0, 0]), tor(0.5, 0.04, '#9fa8da', [0, 0, 0], [1.4, 0.6, 0]));
    g.add(yarn, cyl(0.03, 0.01, 1.8, '#cfd8dc', [-0.2, 0.25, 1.4], [0, 0, 1.45], 6));
    return (t) => { spool.rotation.y = t * 0.5; };
  };

  function comicTex() {
    return canvasTex(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#fffdf6'; ctx.fillRect(0, 0, w, h);
      ctx.lineWidth = 6; ctx.strokeStyle = '#333';
      ctx.strokeRect(12, 12, 110, 110); ctx.strokeRect(134, 12, 110, 110); ctx.strokeRect(12, 134, 232, 110);
      ctx.fillStyle = '#ffd54f'; ctx.beginPath(); ctx.arc(67, 67, 28, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(57, 62, 4, 0, 7); ctx.arc(77, 62, 4, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(67, 72, 12, 0.2, Math.PI - 0.2); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(189, 60, 42, 28, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e53935'; ctx.font = '900 34px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('哇!', 189, 72);
      ctx.fillStyle = '#90caf9'; ctx.fillRect(15, 137, 226, 104);
      ctx.fillStyle = '#ff8a65'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(40 + i * 45, 230); ctx.lineTo(60 + i * 45, 170); ctx.lineTo(80 + i * 45, 230); ctx.fill(); }
    });
  }
  P.comic = (g) => {
    const pageMat = new T.MeshStandardMaterial({ map: comicTex(), roughness: 0.8 });
    const cov = M('#5c6bc0');
    g.add(mesh(new T.BoxGeometry(2.6, 0.18, 3), [cov, cov, pageMat, cov, cov, cov], [-0.3, 0.12, 0], [0, 0.25, 0]));
    const pen = new T.Group(); pen.position.set(0.6, 0.45, 0.5); pen.rotation.set(0, -0.7, Math.PI / 2 - 0.1);
    add(pen, cyl(0.28, 0.28, 2.6, '#ffca28', [0, 0, 0], null, 6), con(0.28, 0.6, '#f1d1a5', [0, -1.6, 0], [Math.PI, 0, 0], 6),
      con(0.1, 0.22, '#37474f', [0, -1.82, 0], [Math.PI, 0, 0], 6), cyl(0.29, 0.29, 0.25, '#b0bec5', [0, 1.4, 0], null, 12), cyl(0.28, 0.28, 0.4, '#f48fb1', [0, 1.72, 0], null, 12));
    g.add(pen);
    const bubble = makeLabel('創作中…', { color: '#5c6bc0', size: 0.7, font: 44 }); bubble.position.set(-0.6, 1.0, -0.6); g.add(bubble);
    return (t) => { pen.position.y = 0.45 + Math.sin(t * 3) * 0.08; bubble.position.y = 1.0 + Math.sin(t * 1.5) * 0.15; };
  };

  P.picturebook = (g) => {
    add(g, box(3.6, 0.12, 2.6, '#c0392b', [0, 0.08, 0]));
    const pm = M('#fffaf0');
    const l = new T.Group(); l.position.set(0, 0.15, 0); l.rotation.z = 0.18; l.add(mesh(new T.BoxGeometry(1.7, 0.28, 2.4), pm, [-0.85, 0.14, 0]));
    const r = new T.Group(); r.position.set(0, 0.15, 0); r.rotation.z = -0.18; r.add(mesh(new T.BoxGeometry(1.7, 0.28, 2.4), pm, [0.85, 0.14, 0]));
    g.add(l, r);
    // 立體繪本：小樹、房子、太陽
    add(g, cyl(0.05, 0.07, 0.6, '#795548', [-0.9, 0.85, 0]), sph(0.35, '#66bb6a', [-0.9, 1.25, 0]),
      box(0.6, 0.5, 0.45, '#ffcc80', [0.8, 0.85, 0]), con(0.5, 0.4, '#e57373', [0.8, 1.3, 0], [0, Math.PI / 4, 0], 4));
    const sun = sph(0.3, Glow('#ffd54f', 0.5, 1.2), [0, 2.2, -0.3], 1, 1); g.add(sun);
    const page = new T.Group(); page.position.set(0, 0.45, 0);
    page.add(mesh(new T.BoxGeometry(1.6, 0.02, 2.3), M('#fff3d6', { side: T.DoubleSide }), [0.8, 0, 0]));
    g.add(page);
    return (t) => { const c = (t * 0.4) % 2; page.rotation.z = c < 1 ? Math.PI * (0.5 - 0.5 * Math.cos(c * Math.PI)) : 0; page.visible = c < 1; sun.position.y = 2.2 + Math.sin(t * 1.3) * 0.2; };
  };

  function diceTex(n) {
    const pts = { 1: [[.5, .5]], 2: [[.25, .25], [.75, .75]], 3: [[.25, .25], [.5, .5], [.75, .75]], 4: [[.25, .25], [.75, .25], [.25, .75], [.75, .75]],
      5: [[.25, .25], [.75, .25], [.5, .5], [.25, .75], [.75, .75]], 6: [[.25, .25], [.75, .25], [.25, .5], [.75, .5], [.25, .75], [.75, .75]] }[n];
    return new T.MeshStandardMaterial({ roughness: 0.6, map: canvasTex(128, 128, (ctx) => {
      ctx.fillStyle = '#fffdf8'; ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = n === 1 ? '#e53935' : '#333'; pts.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x * 128, y * 128, n === 1 ? 18 : 12, 0, 7); ctx.fill(); });
    }) });
  }
  const diceMats = () => [1, 6, 2, 5, 3, 4].map(diceTex);
  P.boardgame = (g) => {
    const boardMat = new T.MeshStandardMaterial({ roughness: 0.8, map: canvasTex(256, 256, (ctx) => {
      ctx.fillStyle = '#ffe9b8'; ctx.fillRect(0, 0, 256, 256);
      const cols = ['#ef5350', '#42a5f5', '#66bb6a', '#ffca28'];
      for (let i = 0; i < 8; i++) { [[i, 0], [7, i], [7 - i, 7], [0, 7 - i]].forEach(([x, y], k) => { ctx.fillStyle = cols[(i + k) % 4]; ctx.fillRect(x * 32 + 2, y * 32 + 2, 28, 28); }); }
      ctx.fillStyle = '#8d6e63'; ctx.font = '900 40px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('GO!', 128, 140);
    }) });
    const wood = M('#8d6e63');
    g.add(mesh(new T.BoxGeometry(3.4, 0.18, 3.4), [wood, wood, boardMat, wood, wood, wood], [0, 0.09, 0]));
    const dm = diceMats();
    const d1 = mesh(new T.BoxGeometry(0.85, 0.85, 0.85), dm, [0.4, 1.4, 0.3]); const d2 = mesh(new T.BoxGeometry(0.85, 0.85, 0.85), dm, [-0.6, 0.62, -0.4], [0.3, 0.6, 0]);
    g.add(d1, d2);
    ['#ef5350', '#42a5f5', '#66bb6a'].forEach((c, i) => { const p = new T.Group(); p.position.set(-1.3 + i * 0.35, 0.18, 1.3); add(p, con(0.17, 0.45, c, [0, 0.22, 0], null, 10), sph(0.12, c, [0, 0.5, 0])); g.add(p); });
    return (t) => { d1.rotation.set(t * 1.3, t * 0.9, 0); d1.position.y = 1.5 + Math.sin(t * 2) * 0.3; };
  };

  function lathePiece(pts, c) { return mesh(new T.LatheGeometry(pts.map(([x, y]) => new T.Vector2(x, y)), 12), M(c)); }
  P.chess = (g) => {
    const boardMat = new T.MeshStandardMaterial({ roughness: 0.6, map: canvasTex(256, 256, (ctx) => {
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { ctx.fillStyle = (i + j) % 2 ? '#7a5230' : '#f3dfbf'; ctx.fillRect(i * 32, j * 32, 32, 32); }
    }) });
    const wood = M('#5d3a1f');
    g.add(mesh(new T.BoxGeometry(3.4, 0.22, 3.4), [wood, wood, boardMat, wood, wood, wood], [0, 0.11, 0]));
    const pawn = [[0, 0], [0.3, 0], [0.3, 0.1], [0.18, 0.18], [0.1, 0.45], [0.16, 0.5], [0.2, 0.62], [0.12, 0.78], [0, 0.82]];
    const king = [[0, 0], [0.45, 0], [0.45, 0.15], [0.28, 0.3], [0.16, 1.1], [0.3, 1.2], [0.3, 1.3], [0.2, 1.45], [0, 1.5]];
    const k = lathePiece(king, '#fafafa'); k.position.set(0.6, 0.22, 0.6); k.scale.setScalar(1.2);
    k.add(box(0.08, 0.4, 0.08, '#fafafa', [0, 1.7, 0]), box(0.28, 0.08, 0.08, '#fafafa', [0, 1.72, 0]));
    const k2 = lathePiece(king, '#2b2b2b'); k2.position.set(-0.6, 0.22, -0.8); k2.scale.setScalar(1.2);
    k2.add(box(0.08, 0.4, 0.08, '#2b2b2b', [0, 1.7, 0]), box(0.28, 0.08, 0.08, '#2b2b2b', [0, 1.72, 0]));
    add(g, k, k2);
    [[-1.2, 1.2, '#fafafa'], [-0.4, 1.2, '#fafafa'], [1.2, -1.2, '#2b2b2b'], [0.4, -1.2, '#2b2b2b'], [1.2, 0.4, '#fafafa']].forEach(([x, z, c]) => { const p = lathePiece(pawn, c); p.position.set(x, 0.22, z); p.scale.setScalar(1.2); g.add(p); });
    return (t) => { k.position.y = 0.22 + Math.max(0, Math.sin(t * 1.5)) * 0.4; };
  };

  function screenTex() {
    return canvasTex(256, 160, (ctx) => {
      ctx.fillStyle = '#f5f7ff'; ctx.fillRect(0, 0, 256, 160);
      ctx.fillStyle = '#e3e8f7'; ctx.fillRect(0, 0, 256, 16); ctx.fillRect(0, 16, 90, 144);
      const blocks = [['#ffab19', 20], ['#4c97ff', 44], ['#9966ff', 68], ['#59c059', 92], ['#ffab19', 116]];
      blocks.forEach(([c, y], i) => { ctx.fillStyle = c; roundRect(ctx, 10 + (i % 2) * 8, y + 6, 66, 18, 5); ctx.fill(); });
      // 小貓
      const cx = 175, cy = 92;
      ctx.fillStyle = '#ffab19'; ctx.beginPath(); ctx.arc(cx, cy, 30, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx - 28, cy - 10); ctx.lineTo(cx - 22, cy - 42); ctx.lineTo(cx - 6, cy - 26); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx + 28, cy - 10); ctx.lineTo(cx + 22, cy - 42); ctx.lineTo(cx + 6, cy - 26); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx - 11, cy - 4, 8, 0, 7); ctx.arc(cx + 11, cy - 4, 8, 0, 7); ctx.fill();
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(cx - 9, cy - 3, 4, 0, 7); ctx.arc(cx + 13, cy - 3, 4, 0, 7); ctx.fill();
      ctx.strokeStyle = '#222'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy + 8, 9, 0.3, Math.PI - 0.3); ctx.stroke();
    });
  }
  P.coding = (g) => {
    add(g, box(3.6, 0.15, 2.0, '#a1887f', [0, 1.1, 0]), box(0.15, 1.1, 1.8, '#8d6e63', [-1.6, 0.55, 0]), box(0.15, 1.1, 1.8, '#8d6e63', [1.6, 0.55, 0]));
    const scr = new T.MeshStandardMaterial({ map: screenTex(), emissive: '#ffffff', emissiveMap: null, emissiveIntensity: 0.0, roughness: 0.4 });
    scr.emissiveMap = scr.map; scr.userData.glow = [0.35, 1.0]; glowMats.push(scr);
    const dark = M('#37474f');
    add(g, mesh(new T.BoxGeometry(2.4, 1.55, 0.14), [dark, dark, dark, dark, scr, dark], [0, 2.25, -0.4]),
      box(0.2, 0.5, 0.2, '#37474f', [0, 1.4, -0.4]), box(0.8, 0.06, 0.5, '#37474f', [0, 1.2, -0.4]),
      box(1.6, 0.08, 0.5, '#eceff1', [0, 1.22, 0.45]), box(0.25, 0.08, 0.35, '#eceff1', [1.1, 1.22, 0.45]));
    const blocks = [];
    ['#ffab19', '#4c97ff', '#9966ff', '#59c059'].forEach((c, i) => { const b = new T.Group(); add(b, box(0.8, 0.3, 0.3, c, [0, 0, 0]), box(0.2, 0.08, 0.3, c, [-0.15, 0.18, 0])); b.position.set(-1.5 + i, 3.6, 0.3); blocks.push(b); g.add(b); });
    return (t) => blocks.forEach((b, i) => { b.position.y = 3.5 + Math.sin(t * 1.5 + i * 1.2) * 0.25; b.rotation.z = Math.sin(t + i) * 0.15; });
  };

  window.FX3D = { T, rnd, R, hash3, M, Glow, glowMats, vcMat, mesh, box, cyl, sph, con, tor, add, Merger, canvasTex, roundRect, makeLabel, figure, musicNote, butterfly, PROPS: P, FONT };
})();
