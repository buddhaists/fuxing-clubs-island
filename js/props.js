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

  /* ---------- 精緻四肢可動 Q 版師生小人 (Articulated Student & Coach Figures) ---------- */
  const SKIN = '#f3c9a0';
  const HAIR_COLORS = ['#3b2a20', '#2b1e16', '#4a3222', '#1f1815'];

  function createKid(opts = {}) {
    const {
      shirt = '#e63946',
      pants = '#1d3557',
      pos = [0, 0, 0],
      rotY = 0,
      scale = 0.85,
      hat = null,          // 球帽顏色
      helmet = null,       // 頭盔顏色 (直排輪/打擊)
      belt = null,         // 柔道腰帶顏色
      skirt = null,        // 舞裙/百褶裙顏色
      backpack = null,     // 書包顏色
      apron = null,        // 美勞圍裙顏色
      hair = HAIR_COLORS[0],
      ponytail = false,
      teacher = false,     // 老師/教練體型較高
      sitting = false,     // 坐姿
      heldItem = null      // 右手握持道具 (Three.Object3D)
    } = opts;

    const s = teacher ? scale * 1.18 : scale;
    const g = new T.Group();
    g.position.set(pos[0], pos[1], pos[2]);
    g.rotation.y = rotY;
    g.scale.setScalar(s);

    const body = new T.Group();
    g.add(body);

    // 雙腿
    const legL = new T.Group();
    const legR = new T.Group();
    legL.position.set(-0.09, 0.25, 0);
    legR.position.set(0.09, 0.25, 0);
    add(legL, box(0.1, 0.24, 0.11, pants, [0, -0.12, 0]), box(0.11, 0.06, 0.15, '#ffffff', [0, -0.23, 0.02]));
    add(legR, box(0.1, 0.24, 0.11, pants, [0, -0.12, 0]), box(0.11, 0.06, 0.15, '#ffffff', [0, -0.23, 0.02]));
    if (sitting) {
      legL.rotation.x = -Math.PI / 2.2;
      legR.rotation.x = -Math.PI / 2.2;
      body.position.y = -0.12;
    }
    body.add(legL, legR);

    // 軀幹
    const torso = box(0.32, 0.34, 0.2, shirt, [0, 0.42, 0]);
    body.add(torso);

    // 領口細節
    body.add(box(0.14, 0.06, 0.21, '#ffffff', [0, 0.56, 0]));

    // 裙子 / 舞衣裙擺
    if (skirt) {
      body.add(con(0.24, 0.18, skirt, [0, 0.28, 0], null, 10));
    }
    // 柔道腰帶
    if (belt) {
      body.add(box(0.35, 0.055, 0.23, belt, [0, 0.31, 0]), box(0.05, 0.16, 0.04, belt, [0.05, 0.24, 0.12], [0, 0, -0.2]));
    }
    // 美勞圍裙
    if (apron) {
      body.add(box(0.26, 0.28, 0.03, apron, [0, 0.38, 0.105]));
    }
    // 小書包
    if (backpack) {
      body.add(box(0.25, 0.26, 0.13, backpack, [0, 0.43, -0.15]));
    }

    // 雙手 (可轉動肩膀關節)
    const armL = new T.Group();
    const armR = new T.Group();
    armL.position.set(-0.21, 0.54, 0);
    armR.position.set(0.21, 0.54, 0);
    add(armL, box(0.085, 0.24, 0.09, shirt, [0, -0.1, 0]), sph(0.05, SKIN, [0, -0.23, 0], 1, 1));
    add(armR, box(0.085, 0.24, 0.09, shirt, [0, -0.1, 0]), sph(0.05, SKIN, [0, -0.23, 0], 1, 1));
    if (heldItem) {
      heldItem.position.set(0, -0.23, 0.06);
      armR.add(heldItem);
    }
    body.add(armL, armR);

    // 頭部與五官
    const head = new T.Group();
    head.position.set(0, 0.75, 0);
    add(head,
      sph(0.175, SKIN, [0, 0, 0], 1, 2),
      sph(0.18, hair, [0, 0.04, -0.02], [1.02, 0.88, 1.02], 2),
      // 眼睛與微笑腮紅
      sph(0.022, '#222222', [-0.06, 0.0, 0.155], 1, 0),
      sph(0.022, '#222222', [0.06, 0.0, 0.155], 1, 0),
      sph(0.026, '#ff8a80', [-0.1, -0.04, 0.14], [1.2, 0.7, 0.5], 0),
      sph(0.026, '#ff8a80', [0.1, -0.04, 0.14], [1.2, 0.7, 0.5], 0)
    );
    if (ponytail) {
      head.add(sph(0.08, hair, [0, 0.05, -0.2], [0.8, 1.2, 0.8], 1));
    }
    if (hat) {
      head.add(
        cyl(0.18, 0.18, 0.08, hat, [0, 0.13, 0], null, 12),
        box(0.22, 0.03, 0.16, hat, [0, 0.1, 0.14])
      );
    }
    if (helmet) {
      head.add(sph(0.2, helmet, [0, 0.06, 0], [1.05, 0.85, 1.08], 2));
    }
    if (teacher) {
      // 老師配戴哨子或名牌掛繩
      body.add(tor(0.08, 0.014, '#ffd166', [0, 0.53, 0.09], [0.5, 0, 0]));
    }
    body.add(head);

    g.userData = { body, legL, legR, armL, armR, head, baseY: pos[1] };
    return g;
  }

  /* 通用小人動作輔助：歡呼揮手、跑步、對練、律動 */
  function poseWalk(kid, t, speed = 8, amp = 0.65) {
    const u = kid.userData;
    const s = Math.sin(t * speed);
    u.legL.rotation.x = s * amp;
    u.legR.rotation.x = -s * amp;
    u.armL.rotation.x = -s * amp * 0.85;
    u.armR.rotation.x = s * amp * 0.85;
    u.body.position.y = Math.abs(Math.cos(t * speed)) * 0.04;
  }

  function poseCheer(kid, t, ph = 0) {
    const u = kid.userData;
    const s = Math.sin(t * 5 + ph);
    u.armL.rotation.z = 2.4 + s * 0.35;
    u.armR.rotation.z = -2.4 - s * 0.35;
    u.body.position.y = Math.max(0, s) * 0.09;
    u.head.rotation.y = Math.sin(t * 2.5 + ph) * 0.2;
  }

  function figure(color, p, h = 1) {
    return createKid({ shirt: color, pos: p, scale: h });
  }
  function musicNote(color) {
    const g = new T.Group();
    add(g, sph(0.2, color, [0, 0, 0], [1.2, 0.85, 1], 1), box(0.05, 0.75, 0.05, color, [0.2, 0.36, 0]), box(0.25, 0.08, 0.05, color, [0.3, 0.72, 0], [0, 0, -0.5]));
    return g;
  }

  /* =========================================================
     20 個社團的微縮道具與「學生活動中實況」小劇場
     每個函式在 g 上建構模型，回傳 anim(t) 動畫函式
     ========================================================= */
  const P = {};

  // 1. 棒球社：投手投球、打者揮棒、捕手蹲捕、跑壘員衝刺與教練指導
  P.baseball = (g) => {
    add(g, box(4.6, 0.12, 4.6, '#c98a55', [0, 0.06, 0], [0, Math.PI / 4, 0]),
      box(3, 0.14, 3, '#6dbb4f', [0, 0.07, 0], [0, Math.PI / 4, 0]),
      cyl(0.45, 0.55, 0.18, '#c98a55', [0, 0.16, 0]));
    [[0, 2.1], [2.1, 0], [0, -2.1], [-2.1, 0]].forEach(([x, z]) => g.add(box(0.36, 0.1, 0.36, '#ffffff', [x, 0.2, z], [0, Math.PI / 4, 0])));

    // 飛行中的棒球
    const ball = sph(0.24, '#fbfaf5', [0, 0.85, 0.8], 1, 2);
    ball.add(tor(0.24, 0.02, '#d6342c', [0, 0, 0], [0.4, 0, 0.3]));
    g.add(ball);

    // 投手 (中場投手丘)
    const pitcher = createKid({ shirt: '#ea580c', pants: '#ffffff', hat: '#1d3557', pos: [0, 0.24, -0.1], rotY: 0, scale: 0.78 });
    // 打者 (本壘板旁，手持球棒)
    const miniBat = cyl(0.05, 0.025, 0.75, '#c88a4c', [0, 0.28, 0]);
    const batter = createKid({ shirt: '#ea580c', pants: '#ffffff', helmet: '#1d3557', pos: [-0.42, 0.14, 1.95], rotY: 1.2, scale: 0.8, heldItem: miniBat });
    // 跑壘員 (一壘往二壘衝刺)
    const runner = createKid({ shirt: '#ea580c', pants: '#ffffff', helmet: '#ea580c', pos: [1.5, 0.14, 0.5], rotY: -2.35, scale: 0.76 });
    // 少棒教練 (三壘指導區)
    const coach = createKid({ shirt: '#1d3557', pants: '#37474f', hat: '#ea580c', teacher: true, pos: [-1.85, 0.14, 0.6], rotY: 1.1, scale: 0.78 });
    add(g, pitcher, batter, runner, coach);

    return (t) => {
      const cyc = (t * 1.4) % (Math.PI * 2);
      // 投手抬腿投球
      pitcher.userData.armR.rotation.x = -Math.sin(t * 4) * 1.6;
      pitcher.userData.legL.rotation.x = Math.max(0, Math.sin(t * 4)) * 0.7;
      // 打者全力揮棒
      batter.userData.armR.rotation.x = -1.1;
      batter.userData.armR.rotation.z = Math.sin(t * 4 - 0.8) * 1.3;
      batter.userData.body.rotation.y = Math.sin(t * 4 - 0.8) * 0.45;
      // 棒球往返飛行軌跡
      const p = (Math.sin(t * 4) + 1) * 0.5;
      ball.position.set(p * 0.3, 0.75 + Math.sin(p * Math.PI) * 0.65, -0.1 + (1 - p) * 2.0);
      // 跑壘員繞壘奔跑
      const ra = t * 1.1;
      runner.position.set(Math.cos(ra) * 1.75, 0.14, Math.sin(ra) * 1.75);
      runner.rotation.y = -ra;
      poseWalk(runner, t, 12, 0.8);
      // 教練揮手指導
      poseCheer(coach, t, 1.2);
    };
  };

  // 2. 樂樂棒球社：打擊座揮棒、守備學員接球與外野歡呼
  P.teeball = (g) => {
    add(g, cyl(2.25, 2.35, 0.12, '#79c35a', [0, 0.06, 0], null, 20),
      cyl(0.42, 0.52, 0.16, '#3a3a3a', [0, 0.18, 0.8]), cyl(0.06, 0.06, 0.85, '#4a4a4a', [0, 0.6, 0.8]));
    const ball = sph(0.24, '#ffe066', [0, 1.12, 0.8], 1, 2);
    g.add(ball);
    [[1.5, 0.6], [-1.4, 0.9], [0.3, -1.6], [-0.9, -1.2]].forEach(([x, z]) => g.add(con(0.18, 0.42, '#ff8a3d', [x, 0.32, z])));

    // 打擊學員 (手持藍色安全泡棉棒)
    const foamBat = cyl(0.07, 0.04, 0.78, '#3f7fd6', [0, 0.28, 0]);
    const hitter = createKid({ shirt: '#ff8a3d', pants: '#1d3557', pos: [-0.48, 0.12, 0.85], rotY: 1.3, scale: 0.78, heldItem: foamBat });
    // 內野守備女同學
    const fielder1 = createKid({ shirt: '#3f7fd6', pants: '#ffffff', ponytail: true, pos: [0.85, 0.12, -0.85], rotY: -0.4, scale: 0.76 });
    // 外野守備男同學
    const fielder2 = createKid({ shirt: '#ff8a3d', pants: '#1d3557', hat: '#ffe066', pos: [-0.95, 0.12, -1.0], rotY: 0.5, scale: 0.76 });
    add(g, hitter, fielder1, fielder2);

    return (t) => {
      const hitPhase = (t * 2.2) % (Math.PI * 2);
      hitter.userData.armR.rotation.x = -1.2;
      hitter.userData.armR.rotation.z = Math.sin(hitPhase) * 1.35;
      // 樂樂棒球被擊飛與回座
      const fly = Math.max(0, Math.sin(hitPhase));
      ball.position.set(fly * 0.85, 1.12 + Math.sin(fly * Math.PI) * 0.9, 0.8 - fly * 1.65);
      // 守備員左右移位接球
      fielder1.position.x = 0.85 + Math.sin(t * 3) * 0.22;
      poseWalk(fielder1, t, 7, 0.45);
      poseCheer(fielder2, t, 0.5);
    };
  };

  // 3. 籃球社：運球進攻、擦板投籃、防守滑步與低年級運球練習
  P.basketball = (g) => {
    add(g, box(4.6, 0.12, 3.4, '#3f9a72', [0, 0.06, 0]), box(4.2, 0.13, 3.0, '#e98d4e', [0, 0.07, 0]),
      box(0.06, 0.15, 3.0, '#ffffff', [0, 0.08, 0]),
      cyl(0.08, 0.08, 3.2, '#5a5a5a', [-2.0, 1.6, 0]), box(0.08, 0.95, 1.5, '#ffffff', [-1.85, 2.8, 0]),
      box(0.09, 0.4, 0.5, '#e25b3c', [-1.83, 2.65, 0]));
    g.add(tor(0.3, 0.04, '#ff6b2c', [-1.5, 2.45, 0], [Math.PI / 2, 0, 0]));

    const ball = sph(0.26, '#f07b2a', [-0.4, 0.6, 0.2], 1, 2);
    ball.add(tor(0.26, 0.018, '#3a2414', [0, 0, 0], [0, 0, 0]));
    g.add(ball);

    // 投籃進攻球員 (高年級)
    const shooter = createKid({ shirt: '#e63946', pants: '#ffffff', pos: [-0.2, 0.14, 0.25], rotY: -Math.PI / 2, scale: 0.82 });
    // 防守球員
    const defender = createKid({ shirt: '#2563eb', pants: '#1d3557', pos: [-0.95, 0.14, -0.15], rotY: Math.PI / 2 - 0.3, scale: 0.8 });
    // 場邊練習運球的低年級學員 + 第二顆籃球
    const kidLow = createKid({ shirt: '#ffbe0b', pants: '#1d3557', ponytail: true, pos: [1.25, 0.14, 0.65], rotY: -0.8, scale: 0.68 });
    const ball2 = sph(0.21, '#f07b2a', [1.05, 0.4, 0.5], 1, 1);
    add(g, shooter, defender, kidLow, ball2);

    return (t) => {
      // 跳投與籃球拋物線入網
      const s = (Math.sin(t * 3.2) + 1) * 0.5;
      shooter.position.y = 0.14 + Math.max(0, Math.sin(t * 3.2)) * 0.32;
      shooter.userData.armR.rotation.x = -2.2 - Math.sin(t * 3.2) * 0.5;
      shooter.userData.armL.rotation.x = -1.8;
      ball.position.set(-0.2 - s * 1.3, 0.85 + Math.sin(s * Math.PI) * 1.85, 0.25 * (1 - s));
      ball.rotation.z = -t * 5;

      // 防守球員張手橫移
      defender.position.z = -0.15 + Math.sin(t * 2.8) * 0.35;
      defender.userData.armL.rotation.z = 1.6;
      defender.userData.armR.rotation.z = -1.6;

      // 低年級原地運球
      kidLow.userData.armR.rotation.x = -1.1 + Math.sin(t * 8) * 0.45;
      ball2.position.y = 0.26 + Math.abs(Math.cos(t * 8)) * 0.38;
    };
  };

  // 4. 足球社：帶球盤帶射門、守門員撲救與隊友跑位助攻
  P.soccer = (g) => {
    g.add(box(5, 0.12, 3.6, '#4fa846', [0, 0.06, 0]));
    for (let i = 0; i < 5; i += 2) g.add(box(1, 0.13, 3.6, '#66bd55', [-2 + i, 0.065, 0]));
    g.add(box(0.06, 0.14, 3.6, '#ffffff', [0, 0.08, 0]));
    const gl = new T.Group(); gl.position.set(-2.3, 0.1, 0);
    add(gl, cyl(0.07, 0.07, 1.5, '#ffffff', [0, 0.75, 1]), cyl(0.07, 0.07, 1.5, '#ffffff', [0, 0.75, -1]),
      cyl(0.07, 0.07, 2.1, '#ffffff', [0, 1.5, 0], [Math.PI / 2, 0, 0]),
      mesh(new T.BoxGeometry(0.8, 1.5, 2, 3, 4, 6), new T.MeshBasicMaterial({ color: '#ffffff', wireframe: true, transparent: true, opacity: 0.55 }), [-0.4, 0.75, 0]));
    g.add(gl);

    const bg = new T.IcosahedronGeometry(0.28, 1).toNonIndexed();
    const n = bg.attributes.position.count, col = new Float32Array(n * 3);
    for (let f = 0; f < n / 3; f++) { const dark = f % 4 === 0; for (let k = 0; k < 3; k++) col.set(dark ? [0.03, 0.03, 0.03] : [1, 1, 1], (f * 3 + k) * 3); }
    bg.setAttribute('color', new T.BufferAttribute(col, 3));
    const ball = mesh(bg, vcMat, [0.8, 0.4, 0.2]);
    g.add(ball);

    // 射門前鋒、守門員、傳球翼鋒
    const striker = createKid({ shirt: '#ffbe0b', pants: '#1d3557', pos: [1.1, 0.14, 0.25], rotY: -Math.PI / 2, scale: 0.78 });
    const keeper = createKid({ shirt: '#10b981', pants: '#111827', pos: [-2.0, 0.14, 0], rotY: Math.PI / 2, scale: 0.8 });
    const winger = createKid({ shirt: '#ffbe0b', pants: '#1d3557', ponytail: true, pos: [0.4, 0.14, -1.05], rotY: -1.1, scale: 0.74 });
    add(g, striker, keeper, winger);

    return (t) => {
      const cyc = (t * 0.9) % 1;
      ball.position.x = 1.0 - cyc * 2.85;
      ball.position.z = 0.25 * (1 - cyc) + Math.sin(cyc * Math.PI * 2) * 0.25;
      ball.position.y = 0.36 + Math.sin(cyc * Math.PI) * 0.45;
      ball.rotation.z = t * 5;

      // 前鋒助跑踢球
      striker.position.x = 1.35 - Math.min(0.45, cyc) * 0.9;
      poseWalk(striker, t, 10, 0.75);
      // 守門員橫向撲救
      keeper.position.z = Math.sin(t * 3.5) * 0.55;
      keeper.userData.armL.rotation.z = 2.1;
      keeper.userData.armR.rotation.z = -2.1;
      // 隊友跟進跑位
      winger.position.x = 0.6 + Math.sin(t * 2) * 0.5;
      poseWalk(winger, t, 9, 0.6);
    };
  };

  // 5. 田徑社：雙跑道競速跨欄、傳接棒衝刺與教練碼錶計時
  P.track = (g) => {
    const ring = mesh(new T.RingGeometry(1.25, 2.15, 40), M('#d9573f', { side: T.DoubleSide }), [0, 0.09, 0], [-Math.PI / 2, 0, 0], [1.25, 1, 1]);
    const lane1 = mesh(new T.RingGeometry(1.53, 1.57, 40), M('#ffffff', { side: T.DoubleSide }), [0, 0.1, 0], [-Math.PI / 2, 0, 0], [1.25, 1, 1]);
    const lane2 = mesh(new T.RingGeometry(1.83, 1.87, 40), M('#ffffff', { side: T.DoubleSide }), [0, 0.1, 0], [-Math.PI / 2, 0, 0], [1.25, 1, 1]);
    add(g, cyl(2.3, 2.35, 0.08, '#7cc35c', [0, 0.04, 0], null, 24, null), ring, lane1, lane2);
    g.children[0].scale.set(1.28, 1, 1.02);
    // 頒獎台
    add(g, box(0.55, 0.52, 0.55, '#ffd54f', [0, 0.34, 0]), box(0.55, 0.36, 0.55, '#e0e0e0', [-0.55, 0.26, 0]), box(0.55, 0.26, 0.55, '#d7995b', [0.55, 0.21, 0]));
    // 雙跨欄
    [1.68, -1.68].forEach((hz) => {
      const h = new T.Group(); h.position.set(0, 0.1, hz);
      add(h, box(0.05, 0.5, 0.05, '#ffffff', [-0.35, 0.25, 0]), box(0.05, 0.5, 0.05, '#ffffff', [0.35, 0.25, 0]), box(0.76, 0.1, 0.05, '#e53935', [0, 0.48, 0]));
      g.add(h);
    });

    // 內道跨欄選手 (手持接力棒)
    const baton = cyl(0.025, 0.025, 0.28, '#ffd166', [0, 0, 0], [Math.PI / 2, 0, 0]);
    const runner1 = createKid({ shirt: '#ff7043', pants: '#1d3557', pos: [0, 0.1, 0], scale: 0.74, heldItem: baton });
    // 外道追趕選手
    const runner2 = createKid({ shirt: '#29b6f6', pants: '#1d3557', ponytail: true, pos: [0, 0.1, 0], scale: 0.72 });
    // 頒獎台歡呼選手
    const winner = createKid({ shirt: '#ab47bc', pants: '#ffffff', pos: [0, 0.6, 0], scale: 0.68 });
    add(g, runner1, runner2, winner);

    return (t) => {
      const a1 = t * 1.35;
      const jump1 = Math.abs(Math.cos(a1)) < 0.28 ? 0.36 : 0;
      runner1.position.set(Math.cos(a1) * 1.42 * 1.25, 0.1 + jump1 + Math.abs(Math.sin(t * 12)) * 0.05, Math.sin(a1) * 1.42);
      runner1.rotation.y = -a1;
      poseWalk(runner1, t, 14, 0.85);

      const a2 = t * 1.22 + 1.8;
      runner2.position.set(Math.cos(a2) * 1.96 * 1.25, 0.1 + Math.abs(Math.sin(t * 11)) * 0.05, Math.sin(a2) * 1.96);
      runner2.rotation.y = -a2;
      poseWalk(runner2, t + 0.5, 13, 0.8);

      poseCheer(winner, t, 0);
    };
  };

  // 6. 直排輪社：穿戴頭盔護具小選手 S 型繞樁滑行與教練帶隊
  P.skating = (g) => {
    const s = new T.Group(); s.position.set(-0.3, 0.42, -0.35); s.rotation.y = 0.5; s.scale.setScalar(0.82);
    add(s, box(1.2, 0.8, 2.2, '#4fc3f7', [0, 0.4, 0]), box(1.2, 1.5, 1.1, '#29a5e0', [0, 1.15, -0.55]),
      box(1.3, 0.25, 1.2, '#ff7aa2', [0, 1.95, -0.55]), box(0.3, 0.25, 2.2, '#455a64', [0, -0.05, 0]),
      box(1.25, 0.12, 0.25, '#ffffff', [0, 0.85, 0.3]), box(1.25, 0.12, 0.25, '#ffffff', [0, 0.85, 0.75]));
    const wheels = [];
    [-0.8, -0.27, 0.27, 0.8].forEach(z => { const w = cyl(0.28, 0.28, 0.24, '#ffd54f', [0, -0.25, z], [0, 0, Math.PI / 2], 14); wheels.push(w); s.add(w); });
    g.add(s);

    // 繞樁角錐
    [[-1.6, 1.3], [-0.55, 1.55], [0.55, 1.55], [1.6, 1.3]].forEach(([x, z]) => g.add(con(0.16, 0.4, '#ff8a3d', [x, 0.22, z])));

    // 兩位戴安全頭盔的直排輪小選手
    const skater1 = createKid({ shirt: '#00bcd4', pants: '#1d3557', helmet: '#ff7aa2', pos: [-1.2, 0.12, 1.4], scale: 0.76 });
    const skater2 = createKid({ shirt: '#ffca28', pants: '#1d3557', helmet: '#29b6f6', ponytail: true, pos: [0.8, 0.12, 1.4], scale: 0.72 });
    const coach = createKid({ shirt: '#263238', pants: '#37474f', helmet: '#ffd54f', teacher: true, pos: [1.45, 0.12, -0.5], rotY: -0.6, scale: 0.76 });
    add(g, skater1, skater2, coach);

    return (t) => {
      wheels.forEach(w => (w.rotation.x = t * 4));
      s.position.y = 0.42 + Math.sin(t * 2) * 0.06;

      // S型蛇行繞樁動畫
      const x1 = Math.sin(t * 1.1) * 1.55;
      const z1 = 1.42 + Math.sin(t * 2.2) * 0.35;
      skater1.position.set(x1, 0.12, z1);
      skater1.rotation.y = Math.cos(t * 1.1) > 0 ? Math.PI / 2 : -Math.PI / 2;
      skater1.rotation.z = Math.sin(t * 2.2) * 0.18;
      poseWalk(skater1, t, 6, 0.5);

      const x2 = Math.sin(t * 1.1 - 1.2) * 1.55;
      const z2 = 1.42 + Math.sin(t * 2.2 - 2.4) * 0.35;
      skater2.position.set(x2, 0.12, z2);
      skater2.rotation.y = Math.cos(t * 1.1 - 1.2) > 0 ? Math.PI / 2 : -Math.PI / 2;
      skater2.rotation.z = Math.sin(t * 2.2 - 2.4) * 0.18;
      poseWalk(skater2, t + 1, 6, 0.5);

      poseCheer(coach, t, 0.4);
    };
  };

  // 7. 柔道社：武道館內雙人組手摔技對練、場邊受身拍墊與黑帶教練指導
  P.judo = (g) => {
    add(g, box(4.4, 0.3, 4.4, '#c8a26a', [0, 0.15, 0]), box(3.9, 0.07, 3.9, '#d84343', [0, 0.33, 0]), box(3.5, 0.09, 3.5, '#a5cf6a', [0, 0.35, 0]));
    [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]].forEach(([x, z]) => g.add(cyl(0.13, 0.13, 2.5, '#b9382f', [x, 1.55, z])));
    add(g, box(4.6, 0.2, 4.6, '#6d4c41', [0, 2.85, 0]), con(3.6, 1.5, '#5d4037', [0, 3.7, 0], [0, Math.PI / 4, 0], 4),
      sph(0.18, '#ffd54f', [0, 4.5, 0], 1, 0));

    // 中央對練組手學員 (白道服 + 藍帶/白帶)
    const judoka1 = createKid({ shirt: '#ffffff', pants: '#ffffff', belt: '#1e88e5', pos: [-0.45, 0.4, 0.1], rotY: Math.PI / 2, scale: 0.82 });
    const judoka2 = createKid({ shirt: '#ffffff', pants: '#ffffff', belt: '#fdd835', pos: [0.45, 0.4, 0.1], rotY: -Math.PI / 2, scale: 0.8 });
    // 黑帶師範教練
    const sensei = createKid({ shirt: '#ffffff', pants: '#ffffff', belt: '#111111', teacher: true, pos: [0, 0.4, -1.15], rotY: 0, scale: 0.82 });
    // 前排練習敬禮與受身的低年級學員
    const junior = createKid({ shirt: '#ffffff', pants: '#ffffff', belt: '#ffffff', ponytail: true, pos: [-1.15, 0.4, 1.05], rotY: 0.6, scale: 0.7 });
    add(g, judoka1, judoka2, sensei, junior);

    return (t) => {
      // 對練推拉與行禮循環
      const phase = (t * 1.6) % (Math.PI * 2);
      const bow = Math.max(0, Math.sin(phase));
      judoka1.position.x = -0.38 + Math.sin(t * 3) * 0.1;
      judoka2.position.x = 0.38 + Math.sin(t * 3) * 0.1;
      judoka1.userData.armL.rotation.x = -1.2;
      judoka1.userData.armR.rotation.x = -1.1 + Math.sin(t * 5) * 0.3;
      judoka2.userData.armL.rotation.x = -1.2;
      judoka2.userData.armR.rotation.x = -1.1 - Math.sin(t * 5) * 0.3;
      judoka1.userData.body.rotation.x = bow * 0.35;
      judoka2.userData.body.rotation.x = bow * 0.35;

      // 教練點頭指導
      sensei.userData.head.rotation.x = Math.sin(t * 2.5) * 0.18;
      // 學妹練習拍墊與敬禮
      junior.userData.body.rotation.x = Math.abs(Math.sin(t * 2)) * 0.45;
      junior.userData.armL.rotation.z = 0.5 + Math.sin(t * 6) * 0.4;
      junior.userData.armR.rotation.z = -0.5 - Math.sin(t * 6) * 0.4;
    };
  };

  // 8. 陶笛社：巨型陶笛雕像前，老師指揮與三位跨年級學員合奏吹奏
  P.ocarina = (g) => {
    const o = new T.Group(); o.position.set(0, 1.35, -0.35); o.rotation.set(0, 0.4, 0.15);
    add(o, sph(0.95, '#d98e5a', [0, 0, 0], [1.6, 0.85, 1.0], 2), cyl(0.26, 0.3, 0.85, '#c97c4a', [1.45, 0.25, 0], [0, 0, -1.2], 10));
    [[-0.6, 0.3], [-0.15, 0.5], [0.3, 0.35], [0.1, -0.3], [-0.5, -0.35], [0.6, -0.1]].forEach(([x, z]) => o.add(sph(0.1, '#5a3220', [x, 0.75, z], [1, 0.4, 1], 1)));
    g.add(o, cyl(0.55, 0.75, 0.4, '#8d6e63', [0, 0.2, -0.35]));

    const notes = [];
    ['#3f7fd6', '#e91e63', '#7e57c2', '#ffab00'].forEach((c, i) => {
      const n = musicNote(c);
      n.position.set(-1.2 + i * 0.8, 2.5, 0.4);
      g.add(n);
      notes.push(n);
    });

    // 手持小陶笛吹奏的三位學員 + 指導老師
    const players = [
      [-1.1, 0.08, 1.15, 0.35, '#42a5f5', false],
      [0, 0.08, 1.35, 0, '#ec407a', true],
      [1.1, 0.08, 1.15, -0.35, '#66bb6a', false]
    ].map(([x, y, z, ry, col, pt]) => {
      const miniOca = sph(0.08, '#d98e5a', [0, 0, 0.05], [1.4, 0.9, 1], 1);
      const k = createKid({ shirt: col, pants: '#1d3557', ponytail: pt, pos: [x, y, z], rotY: ry, scale: 0.76, heldItem: miniOca });
      // 雙手舉至嘴邊吹奏姿勢
      k.userData.armL.rotation.x = -1.45;
      k.userData.armL.rotation.z = -0.35;
      k.userData.armR.rotation.x = -1.45;
      k.userData.armR.rotation.z = 0.35;
      g.add(k);
      return k;
    });

    return (t) => {
      notes.forEach((n, i) => {
        n.position.y = 2.35 + Math.sin(t * 1.8 + i * 1.7) * 0.38 + (i % 2) * 0.25;
        n.rotation.y = Math.sin(t + i) * 0.6;
      });
      o.rotation.z = 0.15 + Math.sin(t * 1.2) * 0.05;
      players.forEach((p, i) => {
        p.userData.body.rotation.z = Math.sin(t * 2.2 + i) * 0.08;
        p.userData.head.rotation.x = Math.sin(t * 3 + i) * 0.08;
      });
    };
  };

  // 9. 合唱團：三層階梯合唱台、7位團員持譜歌唱、指揮老師揮棒與伴奏鋼琴
  P.choir = (g) => {
    const half = (r, h, c, y) => mesh(new T.CylinderGeometry(r, r, h, 24, 1, false, -Math.PI / 2, Math.PI), M(c), [0, y, -0.45]);
    add(g, half(2.4, 0.3, '#c9a27a', 0.15), half(1.75, 0.6, '#b98d63', 0.3), half(1.1, 0.9, '#a77a51', 0.45));

    const robes = ['#3f7fd6', '#3f7fd6', '#e85a8a', '#e85a8a', '#3f7fd6', '#e85a8a', '#ffb300'];
    const singers = [];
    [[-1.85, 0.3, -0.2], [1.85, 0.3, -0.2], [-1.3, 0.6, 0.55], [1.3, 0.6, 0.55], [0, 0.6, 0.85], [-0.52, 0.9, 0.15], [0.52, 0.9, 0.15]]
      .forEach(([x, y, z], i) => {
        const folder = box(0.16, 0.12, 0.02, '#fffaf0', [0, 0, 0.04], [-0.4, 0, 0]);
        const f = createKid({
          shirt: robes[i],
          pants: '#1d3557',
          skirt: i % 2 === 1 ? '#ffffff' : null,
          ponytail: i % 2 === 1,
          pos: [x, y, z - 0.45],
          scale: 0.72,
          heldItem: folder
        });
        f.lookAt(0, y, 2.5);
        f.userData.armL.rotation.x = -1.1;
        f.userData.armR.rotation.x = -1.1;
        singers.push({ f, baseY: y });
        g.add(f);
      });

    // 舞台前方：指揮老師與麥克風架
    const conductor = createKid({ shirt: '#1e293b', pants: '#0f172a', teacher: true, pos: [0, 0.05, 1.55], rotY: Math.PI, scale: 0.78 });
    add(g, conductor, cyl(0.03, 0.03, 1.1, '#555', [-0.65, 0.55, 1.25]), sph(0.1, '#333', [-0.65, 1.15, 1.25], 1, 1));

    const n1 = musicNote('#ffffff'); n1.position.set(0.9, 2.5, 0.4);
    const n2 = musicNote('#ffd54f'); n2.position.set(-0.9, 2.3, 0.2);
    add(g, n1, n2);

    return (t) => {
      singers.forEach(({ f, baseY }, i) => {
        f.position.y = baseY + Math.abs(Math.sin(t * 3 + i * 0.7)) * 0.04;
        f.userData.body.rotation.z = Math.sin(t * 2 + i) * 0.06;
      });
      // 指揮老師雙手揮拍
      conductor.userData.armL.rotation.x = -1.5 + Math.sin(t * 4) * 0.55;
      conductor.userData.armR.rotation.x = -1.5 + Math.cos(t * 4) * 0.55;
      conductor.userData.armR.rotation.z = -0.3 + Math.sin(t * 2) * 0.3;
      n1.position.y = 2.5 + Math.sin(t * 2.2) * 0.3;
      n2.position.y = 2.3 + Math.cos(t * 2.2) * 0.3;
    };
  };

  // 10. 舞蹈社：粉紅圓舞台上三位舞者彩帶群舞與旋轉律動
  P.dance = (g) => {
    add(g, cyl(2.2, 2.3, 0.35, '#ffffff', [0, 0.17, 0], null, 28), cyl(2.0, 2.0, 0.37, '#f48fb1', [0, 0.18, 0], null, 28));

    // 主舞者 (中央芭蕾旋轉)
    const lead = createKid({ shirt: '#ff80ab', pants: SKIN, skirt: '#f8bbd0', ponytail: true, pos: [0, 0.37, 0], scale: 0.85 });
    lead.userData.armL.rotation.z = 2.2;
    lead.userData.armR.rotation.z = -2.2;
    // 左右伴舞學員
    const d1 = createKid({ shirt: '#ce93d8', pants: SKIN, skirt: '#f3e5f5', ponytail: true, pos: [-1.1, 0.37, 0.55], scale: 0.72 });
    const d2 = createKid({ shirt: '#80deea', pants: SKIN, skirt: '#e0f7fa', ponytail: true, pos: [1.1, 0.37, 0.55], scale: 0.72 });
    add(g, lead, d1, d2);

    const ribbon = tor(1.35, 0.045, '#ffd54f', [0, 1.45, 0], [Math.PI / 2, 0, 0], Math.PI * 1.35);
    g.add(ribbon);

    return (t) => {
      lead.rotation.y = t * 1.8;
      lead.position.y = 0.37 + Math.abs(Math.sin(t * 3.6)) * 0.14;
      d1.rotation.y = -t * 1.2;
      d2.rotation.y = t * 1.2;
      poseCheer(d1, t, 0);
      poseCheer(d2, t, 1.5);
      ribbon.rotation.z = -t * 1.8;
      ribbon.position.y = 1.45 + Math.sin(t * 2.4) * 0.2;
    };
  };

  // 11. 熱舞社：七彩發光地板、巨型音響與三位跨年級街舞隊員排舞律動
  P.hiphop = (g) => {
    const tiles = [];
    const pal = ['#ff4081', '#7c4dff', '#00bcd4', '#ffeb3b'];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const m = Glow(pal[(i + j) % 4], 0.25, 1.4);
      const tl = box(0.95, 0.12, 0.95, m, [-1.5 + i, 0.06, -1.5 + j]); tl.userData.ph = i * 1.3 + j * 0.7; tiles.push(tl); g.add(tl);
    }
    const b = new T.Group(); b.position.set(0, 0.12, -1.15); b.scale.setScalar(0.9);
    add(b, box(3, 1.5, 0.9, '#37474f', [0, 0.75, 0]), box(3.1, 0.15, 1.0, '#263238', [0, 1.55, 0]),
      cyl(0.5, 0.5, 0.1, '#111', [-0.9, 0.75, 0.45], [Math.PI / 2, 0, 0], 16), cyl(0.5, 0.5, 0.1, '#111', [0.9, 0.75, 0.45], [Math.PI / 2, 0, 0], 16),
      tor(0.5, 0.06, '#ff4081', [-0.9, 0.75, 0.5]), tor(0.5, 0.06, '#00e5ff', [0.9, 0.75, 0.5]),
      box(0.6, 0.3, 0.05, '#80deea', [0, 1.1, 0.46]), tor(0.9, 0.07, '#90a4ae', [0, 1.6, 0], [0, 0, 0], Math.PI));
    g.add(b);

    // 三位街舞隊員 (反戴棒球帽、寬鬆潮T)
    const crew = [
      createKid({ shirt: '#ff4081', pants: '#111827', hat: '#ffeb3b', pos: [0, 0.14, 0.55], scale: 0.82 }),
      createKid({ shirt: '#00e5ff', pants: '#1e293b', ponytail: true, pos: [-1.05, 0.14, 0.95], scale: 0.74 }),
      createKid({ shirt: '#ffeb3b', pants: '#111827', hat: '#7c4dff', pos: [1.05, 0.14, 0.95], scale: 0.74 })
    ];
    crew.forEach((c) => g.add(c));

    return (t) => {
      tiles.forEach(tl => tl.position.y = 0.06 + Math.max(0, Math.sin(t * 4 + tl.userData.ph)) * 0.08);
      b.scale.setScalar(0.9 * (1 + Math.max(0, Math.sin(t * 8)) * 0.04));
      crew.forEach((dancer, i) => {
        const beat = Math.sin(t * 7 + i * 0.8);
        dancer.position.y = 0.14 + Math.max(0, beat) * 0.15;
        dancer.userData.body.rotation.z = Math.sin(t * 3.5 + i) * 0.18;
        dancer.userData.armL.rotation.x = -1.2 + Math.sin(t * 7 + i) * 0.9;
        dancer.userData.armR.rotation.z = -1.4 - Math.cos(t * 7 + i) * 0.8;
        dancer.userData.legL.rotation.z = Math.max(0, -beat) * 0.25;
        dancer.userData.legR.rotation.z = -Math.max(0, beat) * 0.25;
      });
    };
  };

  // 12. 紙雕藝術社：立體浮雕畫框前，低年級學員持色紙摺剪與老師指導
  P.papercut = (g) => {
    const f = new T.Group(); f.position.set(0, 0.2, -0.35); f.rotation.x = -0.15;
    add(f, box(3.0, 3.0, 0.2, '#f6e7c8', [0, 1.5, 0]), box(2.5, 2.5, 0.1, '#b39ddb', [0, 1.5, 0.15]),
      cyl(0.98, 0.98, 0.1, '#f2c96d', [0, 1.5, 0.22], [Math.PI / 2, 0, 0], 24), cyl(0.65, 0.65, 0.1, '#fff4dc', [0, 1.5, 0.3], [Math.PI / 2, 0, 0], 6));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; f.add(con(0.23, 0.46, '#9575cd', [Math.cos(a) * 1.0, 1.5 + Math.sin(a) * 1.0, 0.3], [Math.PI / 2, 0, a - Math.PI / 2], 3)); }
    g.add(f, box(3.2, 0.2, 1.1, '#a1774f', [0, 0.1, -0.15]));
    // 紙鶴
    const crane = new T.Group(); crane.position.set(1.5, 2.5, 1.1);
    add(crane, con(0.35, 0.9, '#ffffff', [0, 0, 0], [0, 0, Math.PI / 2], 3), con(0.25, 0.8, '#ff8a80', [0, 0.1, 0.35], [Math.PI / 2.4, 0, 0], 3), con(0.25, 0.8, '#ff8a80', [0, 0.1, -0.35], [-Math.PI / 2.4, 0, 0], 3));
    g.add(crane);

    // 創作桌與兩位低年級學員
    add(g, box(2.2, 0.42, 0.85, '#ffe0b2', [0, 0.21, 1.15]));
    const paperSheet = box(0.18, 0.02, 0.18, '#ff80ab', [0, 0, 0.04]);
    const kid1 = createKid({ shirt: '#ab47bc', pants: '#1d3557', apron: '#fff9c4', ponytail: true, pos: [-0.65, 0.1, 1.65], rotY: Math.PI - 0.2, scale: 0.74, heldItem: paperSheet });
    const kid2 = createKid({ shirt: '#26a69a', pants: '#1d3557', apron: '#fff9c4', pos: [0.65, 0.1, 1.65], rotY: Math.PI + 0.2, scale: 0.74 });
    add(g, kid1, kid2);

    return (t) => {
      crane.position.set(Math.cos(t * 0.7) * 1.65, 2.65 + Math.sin(t * 1.6) * 0.28, Math.sin(t * 0.7) * 1.65);
      crane.rotation.y = -t * 0.7;
      kid1.userData.armR.rotation.x = -1.1 + Math.sin(t * 5) * 0.25;
      kid1.userData.armL.rotation.x = -1.0 - Math.sin(t * 5) * 0.2;
      kid2.userData.armR.rotation.x = -1.2 + Math.cos(t * 4) * 0.25;
      kid2.userData.head.rotation.z = Math.sin(t * 2) * 0.12;
    };
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

  // 13. 蝶古巴特社：印花木盒旁，小福星手持排筆刷塗拼貼膠與欣賞作品
  P.decoupage = (g) => {
    const lidMat = new T.MeshStandardMaterial({ map: floralTex(), roughness: 0.7 });
    const side = M('#a1683a');
    add(g, mesh(new T.BoxGeometry(2.4, 1.2, 1.7), [side, side, lidMat, side, side, side], [0, 0.6, -0.2]),
      box(0.3, 0.35, 0.08, '#d4a64a', [0, 0.95, 0.67]));
    const lid = mesh(new T.BoxGeometry(2.5, 0.22, 1.8), [side, side, lidMat, side, side, side], [0, 0, 0.9]);
    const hinge = new T.Group(); hinge.position.set(0, 1.32, -1.05); hinge.add(lid); hinge.rotation.x = -1.1; g.add(hinge);
    add(g, cyl(0.06, 0.03, 1.4, '#c88a4c', [1.5, 0.4, 0.7], [0.3, 0, 1.2]), cyl(0.14, 0.16, 0.45, '#ffffff', [-1.5, 0.22, 0.6]));

    // 兩位穿美勞圍裙拼貼刷膠的小朋友
    const brush = cyl(0.025, 0.02, 0.35, '#d4a64a', [0, 0.12, 0]);
    const kid1 = createKid({ shirt: '#ec407a', pants: '#1d3557', apron: '#f8bbd0', ponytail: true, pos: [-0.85, 0.1, 1.25], rotY: 2.6, scale: 0.75, heldItem: brush });
    const kid2 = createKid({ shirt: '#42a5f5', pants: '#1d3557', apron: '#bbdefb', pos: [0.85, 0.1, 1.25], rotY: -2.6, scale: 0.75 });
    add(g, kid1, kid2);

    const bfs = ['#ff80ab', '#80d8ff'].map((c) => { const b = butterfly(c); g.add(b); return b; });
    return (t) => {
      bfs.forEach((b, i) => {
        const a = t * (0.7 + i * 0.2) + i * 3;
        b.position.set(Math.cos(a) * 1.75, 2.2 + Math.sin(t * 2 + i) * 0.35, Math.sin(a) * 1.75); b.rotation.y = -a;
        const f = Math.sin(t * 14 + i) * 0.9; b.userData.wings[0].rotation.z = f; b.userData.wings[1].rotation.z = -f;
      });
      kid1.userData.armR.rotation.x = -1.3 + Math.sin(t * 5) * 0.35;
      kid2.userData.armL.rotation.x = -1.1 + Math.cos(t * 4) * 0.25;
      kid2.userData.armR.rotation.x = -1.1 - Math.cos(t * 4) * 0.25;
    };
  };

  // 14. 黏土捏塑社：可愛小熊與胡蘿蔔轉盤旁，學員搓揉五彩超輕土
  P.clay = (g) => {
    g.add(cyl(2.0, 2.1, 0.2, '#64b5f6', [0, 0.1, 0], null, 24));
    const bear = new T.Group(); bear.position.set(-0.65, 0.2, -0.2);
    add(bear, sph(0.65, '#a1673f', [0, 0.62, 0], [1, 1.05, 0.9]), sph(0.46, '#a1673f', [0, 1.5, 0]), sph(0.16, '#a1673f', [-0.35, 1.88, 0]), sph(0.16, '#a1673f', [0.35, 1.88, 0]),
      sph(0.18, '#e8c39a', [0, 1.42, 0.4], [1, 0.8, 0.6]), sph(0.055, '#222', [-0.16, 1.62, 0.42]), sph(0.055, '#222', [0.16, 1.62, 0.42]), sph(0.35, '#e8c39a', [0, 0.62, 0.46], [1, 1, 0.4]));
    g.add(bear);
    const carrot = new T.Group(); carrot.position.set(0.85, 0.2, -0.35);
    add(carrot, con(0.32, 1.3, '#ff8a3d', [0, 0.65, 0], [Math.PI, 0, 0], 8), con(0.11, 0.45, '#66bb6a', [0, 1.5, 0]), con(0.11, 0.42, '#66bb6a', [0.14, 1.45, 0], [0, 0, -0.5]));
    g.add(carrot);

    const balls = [];
    ['#ef5350', '#ffee58', '#ab47bc', '#26c6da', '#9ccc65'].forEach((c, i) => { const b = sph(0.2, c, [1.1 - i * 0.45, 0.4, 0.85]); balls.push(b); g.add(b); });

    // 兩位捏黏土的小朋友
    const clayPiece = sph(0.09, '#ff80ab', [0, 0, 0.04]);
    const kid1 = createKid({ shirt: '#ffa726', pants: '#1d3557', apron: '#e1f5fe', pos: [-1.15, 0.2, 1.15], rotY: 2.3, scale: 0.74, heldItem: clayPiece });
    const kid2 = createKid({ shirt: '#ab47bc', pants: '#1d3557', ponytail: true, pos: [1.15, 0.2, 1.15], rotY: -2.4, scale: 0.74 });
    add(g, kid1, kid2);

    return (t) => {
      bear.rotation.y = Math.sin(t) * 0.4;
      balls.forEach((b, i) => (b.position.y = 0.4 + Math.abs(Math.sin(t * 3 + i)) * 0.25));
      // 雙手搓揉黏土動作
      kid1.userData.armL.rotation.x = -1.25 + Math.sin(t * 7) * 0.2;
      kid1.userData.armR.rotation.x = -1.25 - Math.sin(t * 7) * 0.2;
      poseCheer(kid2, t, 0.8);
    };
  };

  // 15. 手作社：線軸、大木扣與毛線球旁，高年級學員縫製布偶與編織
  P.handcraft = (g) => {
    const spool = new T.Group(); spool.position.set(-0.95, 0, -0.2);
    add(spool, cyl(0.85, 0.85, 0.2, '#d7a86e', [0, 0.1, 0], null, 18), cyl(0.65, 0.65, 1.35, '#e57373', [0, 0.85, 0], null, 18), cyl(0.85, 0.85, 0.2, '#d7a86e', [0, 1.65, 0], null, 18));
    for (let i = 0; i < 6; i++) spool.add(tor(0.66, 0.03, '#ef9a9a', [0, 0.35 + i * 0.21, 0], [Math.PI / 2, 0, 0]));
    g.add(spool);
    const btn = new T.Group(); btn.position.set(0.95, 0.9, -0.35); btn.rotation.set(0, -0.4, 0.2);
    add(btn, cyl(0.8, 0.8, 0.2, '#ffca28', [0, 0, 0], [Math.PI / 2, 0, 0], 20));
    [[-0.2, 0.2], [0.2, 0.2], [-0.2, -0.2], [0.2, -0.2]].forEach(([x, y]) => btn.add(cyl(0.09, 0.09, 0.22, '#8d6e63', [x, y, 0], [Math.PI / 2, 0, 0], 8)));
    g.add(btn);
    const yarn = sph(0.45, '#7986cb', [0.4, 0.45, 0.85], 1, 2);
    yarn.add(tor(0.45, 0.04, '#9fa8da', [0, 0, 0], [0.5, 0, 0]), tor(0.45, 0.04, '#9fa8da', [0, 0, 0], [1.4, 0.6, 0]));
    g.add(yarn);

    // 兩位高年級學員穿針縫製與捲毛線球
    const feltDoll = sph(0.1, '#f48fb1', [0, 0, 0.05]);
    const crafter1 = createKid({ shirt: '#5c6bc0', pants: '#1d3557', ponytail: true, pos: [-0.6, 0.1, 1.35], rotY: 2.7, scale: 0.78, heldItem: feltDoll });
    const crafter2 = createKid({ shirt: '#26a69a', pants: '#37474f', pos: [1.15, 0.1, 1.15], rotY: -2.3, scale: 0.78 });
    add(g, crafter1, crafter2);

    return (t) => {
      spool.rotation.y = t * 0.5;
      crafter1.userData.armR.rotation.x = -1.2 + Math.sin(t * 5) * 0.35;
      crafter1.userData.armL.rotation.x = -1.1;
      crafter2.userData.armL.rotation.x = -1.15 + Math.cos(t * 6) * 0.3;
      crafter2.userData.armR.rotation.x = -1.15 - Math.cos(t * 6) * 0.3;
    };
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

  // 16. 漫畫創作社：四格漫畫原稿旁，小漫畫家持畫筆揮毫與討論分鏡
  P.comic = (g) => {
    const pageMat = new T.MeshStandardMaterial({ map: comicTex(), roughness: 0.8 });
    const cov = M('#5c6bc0');
    g.add(mesh(new T.BoxGeometry(2.5, 0.18, 2.8), [cov, cov, pageMat, cov, cov, cov], [-0.25, 0.12, -0.15], [0, 0.22, 0]));
    const pen = new T.Group(); pen.position.set(0.6, 0.55, 0.35); pen.rotation.set(0, -0.7, Math.PI / 2 - 0.1);
    add(pen, cyl(0.24, 0.24, 2.3, '#ffca28', [0, 0, 0], null, 6), con(0.24, 0.55, '#f1d1a5', [0, -1.42, 0], [Math.PI, 0, 0], 6),
      con(0.09, 0.2, '#37474f', [0, -1.62, 0], [Math.PI, 0, 0], 6), cyl(0.25, 0.25, 0.22, '#b0bec5', [0, 1.25, 0], null, 12), cyl(0.24, 0.24, 0.36, '#f48fb1', [0, 1.54, 0], null, 12));
    g.add(pen);
    const bubble = makeLabel('創作中…', { color: '#5c6bc0', size: 0.7, font: 44 }); bubble.position.set(-0.6, 1.15, -0.6); g.add(bubble);

    // 兩位小漫畫家：一位拿速寫板畫分鏡，一位開心討論
    const sketchPad = box(0.22, 0.26, 0.03, '#ffffff', [0, 0, 0.05], [-0.4, 0, 0]);
    const artist1 = createKid({ shirt: '#7e57c2', pants: '#1d3557', pos: [-1.15, 0.15, 1.25], rotY: 2.4, scale: 0.78, heldItem: sketchPad });
    const artist2 = createKid({ shirt: '#ff7043', pants: '#1d3557', ponytail: true, pos: [1.05, 0.15, 1.2], rotY: -2.4, scale: 0.76 });
    add(g, artist1, artist2);

    return (t) => {
      pen.position.y = 0.55 + Math.sin(t * 3) * 0.08;
      pen.position.x = 0.6 + Math.cos(t * 3) * 0.12;
      bubble.position.y = 1.15 + Math.sin(t * 1.5) * 0.14;
      artist1.userData.armL.rotation.x = -1.2 + Math.sin(t * 6) * 0.25;
      artist1.userData.armR.rotation.x = -1.1;
      poseCheer(artist2, t, 0.5);
    };
  };

  // 17. 繪本欣賞社：自動翻頁立體繪本前，閱讀老師導讀與孩子們圍坐聆聽
  P.picturebook = (g) => {
    add(g, box(3.4, 0.12, 2.4, '#c0392b', [0, 0.08, -0.3]));
    const pm = M('#fffaf0');
    const l = new T.Group(); l.position.set(0, 0.15, -0.3); l.rotation.z = 0.18; l.add(mesh(new T.BoxGeometry(1.6, 0.26, 2.2), pm, [-0.8, 0.13, 0]));
    const r = new T.Group(); r.position.set(0, 0.15, -0.3); r.rotation.z = -0.18; r.add(mesh(new T.BoxGeometry(1.6, 0.26, 2.2), pm, [0.8, 0.13, 0]));
    g.add(l, r);
    // 立體繪本：小樹、房子、太陽
    add(g, cyl(0.05, 0.07, 0.6, '#795548', [-0.85, 0.85, -0.3]), sph(0.34, '#66bb6a', [-0.85, 1.25, -0.3]),
      box(0.56, 0.48, 0.42, '#ffcc80', [0.75, 0.85, -0.3]), con(0.46, 0.38, '#e57373', [0.75, 1.28, -0.3], [0, Math.PI / 4, 0], 4));
    const sun = sph(0.28, Glow('#ffd54f', 0.5, 1.2), [0, 2.15, -0.55], 1, 1); g.add(sun);
    const page = new T.Group(); page.position.set(0, 0.44, -0.3);
    page.add(mesh(new T.BoxGeometry(1.5, 0.02, 2.1), M('#fff3d6', { side: T.DoubleSide }), [0.75, 0, 0]));
    g.add(page);

    // 導讀老師與兩位圍坐聽故事舉手的小朋友
    const teacher = createKid({ shirt: '#00897b', pants: '#263238', teacher: true, pos: [-1.45, 0.1, 0.85], rotY: 2.1, scale: 0.78 });
    const reader1 = createKid({ shirt: '#ffca28', pants: '#1d3557', sitting: true, pos: [-0.35, 0.1, 1.35], rotY: Math.PI - 0.15, scale: 0.74 });
    const reader2 = createKid({ shirt: '#ec407a', pants: '#1d3557', ponytail: true, sitting: true, pos: [0.65, 0.1, 1.35], rotY: Math.PI + 0.2, scale: 0.74 });
    add(g, teacher, reader1, reader2);

    return (t) => {
      const c = (t * 0.4) % 2;
      page.rotation.z = c < 1 ? Math.PI * (0.5 - 0.5 * Math.cos(c * Math.PI)) : 0;
      page.visible = c < 1;
      sun.position.y = 2.15 + Math.sin(t * 1.3) * 0.18;
      // 老師生動講故事手勢、學生舉手發問
      teacher.userData.armR.rotation.x = -1.2 + Math.sin(t * 3.5) * 0.4;
      reader1.userData.armR.rotation.z = -2.4 - Math.max(0, Math.sin(t * 2.5)) * 0.35;
      reader2.userData.head.rotation.y = Math.sin(t * 2) * 0.22;
    };
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

  // 18. 桌遊社：大富翁策略棋盤周圍，三位同學圍桌擲骰出牌與歡呼
  P.boardgame = (g) => {
    const boardMat = new T.MeshStandardMaterial({ roughness: 0.8, map: canvasTex(256, 256, (ctx) => {
      ctx.fillStyle = '#ffe9b8'; ctx.fillRect(0, 0, 256, 256);
      const cols = ['#ef5350', '#42a5f5', '#66bb6a', '#ffca28'];
      for (let i = 0; i < 8; i++) { [[i, 0], [7, i], [7 - i, 7], [0, 7 - i]].forEach(([x, y], k) => { ctx.fillStyle = cols[(i + k) % 4]; ctx.fillRect(x * 32 + 2, y * 32 + 2, 28, 28); }); }
      ctx.fillStyle = '#8d6e63'; ctx.font = '900 40px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('GO!', 128, 140);
    }) });
    const wood = M('#8d6e63');
    g.add(mesh(new T.BoxGeometry(3.1, 0.18, 3.1), [wood, wood, boardMat, wood, wood, wood], [0, 0.09, 0]));
    const dm = diceMats();
    const d1 = mesh(new T.BoxGeometry(0.75, 0.75, 0.75), dm, [0.35, 1.35, 0.25]);
    const d2 = mesh(new T.BoxGeometry(0.75, 0.75, 0.75), dm, [-0.55, 0.56, -0.35], [0.3, 0.6, 0]);
    g.add(d1, d2);
    ['#ef5350', '#42a5f5', '#66bb6a'].forEach((c, i) => { const p = new T.Group(); p.position.set(-1.1 + i * 0.35, 0.18, 1.1); add(p, con(0.16, 0.42, c, [0, 0.21, 0], null, 10), sph(0.11, c, [0, 0.46, 0])); g.add(p); });

    // 三位圍繞桌遊棋盤對局的同學
    const p1 = createKid({ shirt: '#ef5350', pants: '#1d3557', pos: [-1.75, 0.1, 0.3], rotY: Math.PI / 2, scale: 0.76 });
    const p2 = createKid({ shirt: '#42a5f5', pants: '#1d3557', ponytail: true, pos: [1.75, 0.1, 0.3], rotY: -Math.PI / 2, scale: 0.76 });
    const p3 = createKid({ shirt: '#66bb6a', pants: '#1d3557', pos: [0, 0.1, -1.75], rotY: 0, scale: 0.76 });
    add(g, p1, p2, p3);

    return (t) => {
      d1.rotation.set(t * 1.3, t * 0.9, 0);
      d1.position.y = 1.45 + Math.sin(t * 2.2) * 0.28;
      // 輪流伸手出牌與歡呼
      p1.userData.armR.rotation.x = -1.2 + Math.sin(t * 3) * 0.4;
      poseCheer(p2, t, 1.1);
      p3.userData.armL.rotation.x = -1.1 + Math.cos(t * 3) * 0.35;
    };
  };

  function lathePiece(pts, c) { return mesh(new T.LatheGeometry(pts.map(([x, y]) => new T.Vector2(x, y)), 12), M(c)); }

  // 19. 棋藝社：黑白棋盤兩側，兩位小棋士對坐凝神思考與伸手落子
  P.chess = (g) => {
    const boardMat = new T.MeshStandardMaterial({ roughness: 0.6, map: canvasTex(256, 256, (ctx) => {
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { ctx.fillStyle = (i + j) % 2 ? '#7a5230' : '#f3dfbf'; ctx.fillRect(i * 32, j * 32, 32, 32); }
    }) });
    const wood = M('#5d3a1f');
    g.add(mesh(new T.BoxGeometry(3.1, 0.22, 3.1), [wood, wood, boardMat, wood, wood, wood], [0, 0.11, 0]));
    const pawn = [[0, 0], [0.3, 0], [0.3, 0.1], [0.18, 0.18], [0.1, 0.45], [0.16, 0.5], [0.2, 0.62], [0.12, 0.78], [0, 0.82]];
    const king = [[0, 0], [0.45, 0], [0.45, 0.15], [0.28, 0.3], [0.16, 1.1], [0.3, 1.2], [0.3, 1.3], [0.2, 1.45], [0, 1.5]];
    const k = lathePiece(king, '#fafafa'); k.position.set(0.55, 0.22, 0.55); k.scale.setScalar(1.1);
    k.add(box(0.08, 0.4, 0.08, '#fafafa', [0, 1.7, 0]), box(0.28, 0.08, 0.08, '#fafafa', [0, 1.72, 0]));
    const k2 = lathePiece(king, '#2b2b2b'); k2.position.set(-0.55, 0.22, -0.75); k2.scale.setScalar(1.1);
    k2.add(box(0.08, 0.4, 0.08, '#2b2b2b', [0, 1.7, 0]), box(0.28, 0.08, 0.08, '#2b2b2b', [0, 1.72, 0]));
    add(g, k, k2);
    [[-1.1, 1.1, '#fafafa'], [-0.35, 1.1, '#fafafa'], [1.1, -1.1, '#2b2b2b'], [0.35, -1.1, '#2b2b2b'], [1.1, 0.35, '#fafafa']].forEach(([x, z, c]) => { const p = lathePiece(pawn, c); p.position.set(x, 0.22, z); p.scale.setScalar(1.1); g.add(p); });

    // 對弈雙方小棋手與觀棋同學
    const playerWhite = createKid({ shirt: '#00897b', pants: '#1d3557', pos: [-1.78, 0.1, 0], rotY: Math.PI / 2, scale: 0.78 });
    const playerBlack = createKid({ shirt: '#5e35b1', pants: '#1d3557', ponytail: true, pos: [1.78, 0.1, 0], rotY: -Math.PI / 2, scale: 0.78 });
    add(g, playerWhite, playerBlack);

    return (t) => {
      k.position.y = 0.22 + Math.max(0, Math.sin(t * 1.6)) * 0.38;
      // 雙方交替伸手落子與托腮思考
      playerWhite.userData.armR.rotation.x = -0.8 - Math.max(0, Math.sin(t * 1.6)) * 0.7;
      playerBlack.userData.armR.rotation.x = -0.8 - Math.max(0, -Math.sin(t * 1.6)) * 0.7;
      playerBlack.userData.head.rotation.x = Math.sin(t * 1.6) * 0.12;
    };
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

  // 20. 程式設計社：發光 Scratch 電腦桌前，小創客敲擊鍵盤、討論 Debug 與跳躍貓咪積木
  P.coding = (g) => {
    add(g, box(3.6, 0.15, 2.0, '#a1887f', [0, 1.1, -0.2]), box(0.15, 1.1, 1.8, '#8d6e63', [-1.6, 0.55, -0.2]), box(0.15, 1.1, 1.8, '#8d6e63', [1.6, 0.55, -0.2]));
    const scr = new T.MeshStandardMaterial({ map: screenTex(), emissive: '#ffffff', emissiveMap: null, emissiveIntensity: 0.0, roughness: 0.4 });
    scr.emissiveMap = scr.map; scr.userData.glow = [0.35, 1.0]; glowMats.push(scr);
    const dark = M('#37474f');
    add(g, mesh(new T.BoxGeometry(2.4, 1.55, 0.14), [dark, dark, dark, dark, scr, dark], [0, 2.25, -0.6]),
      box(0.2, 0.5, 0.2, '#37474f', [0, 1.4, -0.6]), box(0.8, 0.06, 0.5, '#37474f', [0, 1.2, -0.6]),
      box(1.6, 0.08, 0.5, '#eceff1', [0, 1.22, 0.25]), box(0.25, 0.08, 0.35, '#eceff1', [1.1, 1.22, 0.25]));
    const blocks = [];
    ['#ffab19', '#4c97ff', '#9966ff', '#59c059'].forEach((c, i) => { const b = new T.Group(); add(b, box(0.8, 0.3, 0.3, c, [0, 0, 0]), box(0.2, 0.08, 0.3, c, [-0.15, 0.18, 0])); b.position.set(-1.5 + i, 3.6, 0.1); blocks.push(b); g.add(b); });

    // 電腦桌前兩位小創客 (一位操作鍵盤滑鼠、一位手指螢幕歡呼 Debug 成功)
    const coder1 = createKid({ shirt: '#00acc1', pants: '#1d3557', pos: [-0.45, 0.15, 1.15], rotY: Math.PI, scale: 0.82 });
    const coder2 = createKid({ shirt: '#ffab19', pants: '#1d3557', ponytail: true, pos: [0.75, 0.15, 1.15], rotY: Math.PI + 0.25, scale: 0.78 });
    add(g, coder1, coder2);

    return (t) => {
      blocks.forEach((b, i) => {
        b.position.y = 3.5 + Math.sin(t * 1.5 + i * 1.2) * 0.25;
        b.rotation.z = Math.sin(t + i) * 0.15;
      });
      coder1.userData.armL.rotation.x = -1.35 + Math.sin(t * 10) * 0.15;
      coder1.userData.armR.rotation.x = -1.35 + Math.cos(t * 10) * 0.15;
      coder2.userData.armL.rotation.x = -1.6 + Math.sin(t * 3) * 0.25;
      coder2.userData.body.position.y = Math.max(0, Math.sin(t * 4)) * 0.06;
    };
  };

  window.FX3D = { T, rnd, R, hash3, M, Glow, glowMats, vcMat, mesh, box, cyl, sph, con, tor, add, Merger, canvasTex, roundRect, makeLabel, figure, createKid, poseWalk, poseCheer, musicNote, butterfly, PROPS: P, FONT };
})();
