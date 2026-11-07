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

  function makePresetItem(itemType) {
    if (!itemType) return null;
    if (itemType === 'folder') return box(0.18, 0.22, 0.03, '#ffd166', [0, -0.02, 0.04], [-0.4, 0, 0]);
    if (itemType === 'bat') return cyl(0.05, 0.025, 0.78, '#c88a4c', [0, 0.28, 0]);
    if (itemType === 'foamBat') return cyl(0.07, 0.04, 0.78, '#3f7fd6', [0, 0.28, 0]);
    if (itemType === 'glove') return sph(0.095, '#8d5524', [0, -0.02, 0.05], [1.2, 1.1, 0.75], 1);
    if (itemType === 'ocarina') return sph(0.085, '#d98e5a', [0, 0, 0.05], [1.4, 0.9, 1], 1);
    if (itemType === 'brush') return cyl(0.025, 0.02, 0.36, '#d4a64a', [0, 0.12, 0]);
    if (itemType === 'scissors') return box(0.05, 0.24, 0.03, '#ec407a', [0, 0.08, 0.04]);
    if (itemType === 'book') return box(0.24, 0.18, 0.04, '#ef5350', [0, 0, 0.05], [-0.4, 0, 0]);
    if (itemType === 'pom') return sph(0.11, '#ffd54f', [0, -0.02, 0.04], 1, 1);
    return null;
  }

  function createKid(opts = {}) {
    const {
      shirt = '#e63946',
      pants = '#1d3557',
      pos = [0, 0, 0],
      rotY = 0,
      scale = 0.88,
      hat = null,          // 球帽顏色
      backwardsHat = false,// 反戴潮帽 (街舞)
      helmet = null,       // 頭盔顏色 (直排輪/打擊)
      crown = null,        // 故事頭飾/皇冠
      belt = null,         // 柔道腰帶顏色
      skirt = null,        // 舞裙/百褶裙顏色
      backpack = null,     // 書包顏色
      apron = null,        // 美勞圍裙顏色
      vest = null,         // 背心/球衣號碼背心
      skates = false,      // 直排輪鞋輪
      crouch = false,      // 捕手/守門蹲姿
      hair = HAIR_COLORS[0],
      ponytail = false,
      hairStyle = null,
      teacher = false,     // 老師/教練體型較高
      sitting = false,     // 坐姿
      item = null,         // 預設道具名稱 ('folder' | 'bat' | ...)
      heldItem = null,     // 右手握持道具 (Three.Object3D)
      heldItemL = null     // 左手握持道具 (Three.Object3D)
    } = opts;

    const hasPonytail = ponytail || hairStyle === 'ponytail';
    const rightItem = heldItem || makePresetItem(item);

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
    if (skates) {
      add(legL, box(0.04, 0.05, 0.18, '#ffd54f', [0, -0.27, 0.02]));
      add(legR, box(0.04, 0.05, 0.18, '#ffd54f', [0, -0.27, 0.02]));
    }
    if (sitting) {
      legL.rotation.x = -Math.PI / 2.2;
      legR.rotation.x = -Math.PI / 2.2;
      body.position.y = -0.12;
    } else if (crouch) {
      legL.rotation.x = -0.65;
      legR.rotation.x = -0.65;
      body.position.y = -0.08;
    }
    body.add(legL, legR);

    // 軀幹
    const torso = box(0.32, 0.34, 0.2, shirt, [0, 0.42, 0]);
    body.add(torso);

    // 領口細節
    body.add(box(0.14, 0.06, 0.21, '#ffffff', [0, 0.56, 0]));

    if (vest) {
      body.add(box(0.335, 0.28, 0.215, vest, [0, 0.41, 0]));
    }
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
    if (heldItemL) {
      heldItemL.position.set(0, -0.23, 0.06);
      armL.add(heldItemL);
    }
    if (rightItem) {
      rightItem.position.set(0, -0.23, 0.06);
      armR.add(rightItem);
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
    if (hasPonytail) {
      head.add(sph(0.085, hair, [0, 0.05, -0.2], [0.85, 1.25, 0.85], 1));
    }
    if (hat) {
      const brimZ = backwardsHat ? -0.14 : 0.14;
      head.add(
        cyl(0.18, 0.18, 0.08, hat, [0, 0.13, 0], null, 12),
        box(0.22, 0.03, 0.16, hat, [0, 0.1, brimZ])
      );
    }
    if (helmet) {
      head.add(sph(0.2, helmet, [0, 0.06, 0], [1.05, 0.85, 1.08], 2));
    }
    if (crown) {
      head.add(cyl(0.11, 0.09, 0.1, crown, [0, 0.19, 0], null, 6));
    }
    if (teacher) {
      // 老師配戴哨子或名牌掛繩
      body.add(tor(0.08, 0.014, '#ffd166', [0, 0.53, 0.09], [0.5, 0, 0]));
    }
    body.add(head);

    const refs = { g, body, legL, legR, armL, armR, head, baseY: pos[1] };
    g.userData = refs;
    Object.assign(g, refs);
    return g;
  }

  /* 通用小人動作輔助：歡呼揮手、跑步、對練、律動 */
  function poseWalk(kid, t, speed = 8, amp = 0.65) {
    const u = kid.userData || kid;
    if (!u || !u.legL) return;
    const s = Math.sin(t * speed);
    u.legL.rotation.x = s * amp;
    u.legR.rotation.x = -s * amp;
    u.armL.rotation.x = -s * amp * 0.85;
    u.armR.rotation.x = s * amp * 0.85;
    u.body.position.y = Math.abs(Math.cos(t * speed)) * 0.04;
  }

  function poseCheer(kid, t, ph = 0) {
    const u = kid.userData || kid;
    if (!u || !u.armL) return;
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

  // 1. 棒球社：投手投球、打者揮棒、捕手蹲捕、游擊守備、跑壘員繞壘衝刺與少棒教練指導 (6人完整編制)
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
    const pitcher = createKid({ shirt: '#ea580c', pants: '#ffffff', hat: '#1d3557', item: 'glove', pos: [0, 0.24, -0.15], rotY: 0, scale: 0.88 });
    // 打者 (本壘板旁，戴打擊頭盔手持木棒)
    const batter = createKid({ shirt: '#ea580c', pants: '#ffffff', helmet: '#1d3557', item: 'bat', pos: [-0.46, 0.14, 1.9], rotY: 1.25, scale: 0.9 });
    // 捕手 (本壘板後方蹲捕接球)
    const catcher = createKid({ shirt: '#1d3557', pants: '#ffffff', helmet: '#ea580c', vest: '#ea580c', crouch: true, heldItemL: makePresetItem('glove'), pos: [0, 0.14, 2.48], rotY: Math.PI, scale: 0.86 });
    // 二游內野守備員 (壓低重心準備接滾地球)
    const fielder = createKid({ shirt: '#ea580c', pants: '#ffffff', hat: '#1d3557', heldItemL: makePresetItem('glove'), pos: [0.85, 0.14, -1.25], rotY: -0.35, scale: 0.85 });
    // 跑壘員 (一壘往二壘、三壘繞圈衝刺)
    const runner = createKid({ shirt: '#ea580c', pants: '#ffffff', helmet: '#ea580c', pos: [1.5, 0.14, 0.5], rotY: -2.35, scale: 0.86 });
    // 少棒總教練 (三壘指導區揮手戰術指導)
    const coach = createKid({ shirt: '#1d3557', pants: '#37474f', hat: '#ea580c', teacher: true, pos: [-1.95, 0.14, 0.65], rotY: 1.1, scale: 0.88 });
    add(g, pitcher, batter, catcher, fielder, runner, coach);

    return (t) => {
      // 投手抬腿振臂投球
      pitcher.armR.rotation.x = -Math.sin(t * 4) * 1.65;
      pitcher.legL.rotation.x = Math.max(0, Math.sin(t * 4)) * 0.75;
      // 打者全力揮棒與轉腰
      batter.armR.rotation.x = -1.1;
      batter.armR.rotation.z = Math.sin(t * 4 - 0.8) * 1.35;
      batter.body.rotation.y = Math.sin(t * 4 - 0.8) * 0.5;
      // 捕手伸手套準備接捕
      catcher.armL.rotation.x = -1.35 + Math.sin(t * 4) * 0.25;
      catcher.armR.rotation.x = -1.0;
      // 內野守備員左右墊步守備
      fielder.position.x = 0.85 + Math.sin(t * 3.2) * 0.35;
      fielder.armL.rotation.x = -1.1 + Math.sin(t * 6.4) * 0.35;
      fielder.body.position.y = -0.05 + Math.abs(Math.sin(t * 6.4)) * 0.08;
      // 棒球投打往返飛行軌跡
      const p = (Math.sin(t * 4) + 1) * 0.5;
      ball.position.set(p * 0.35, 0.75 + Math.sin(p * Math.PI) * 0.75, -0.15 + (1 - p) * 2.1);
      // 跑壘員繞四個壘包奔跑
      const ra = t * 1.15;
      runner.position.set(Math.cos(ra) * 1.78, 0.14, Math.sin(ra) * 1.78);
      runner.rotation.y = -ra;
      poseWalk(runner, t, 13, 0.85);
      // 教練揮手指導
      poseCheer(coach, t, 1.2);
    };
  };

  // 2. 樂樂棒球社：T座揮棒打者、衝壘跑者、2位內外野守備員與體育老師指導 (5人)
  P.teeball = (g) => {
    add(g, cyl(2.25, 2.35, 0.12, '#79c35a', [0, 0.06, 0], null, 20),
      cyl(0.42, 0.52, 0.16, '#3a3a3a', [0, 0.18, 0.8]), cyl(0.06, 0.06, 0.85, '#4a4a4a', [0, 0.6, 0.8]));
    const ball = sph(0.24, '#ffe066', [0, 1.12, 0.8], 1, 2);
    g.add(ball);
    [[1.5, 0.6], [-1.4, 0.9], [0.3, -1.6], [-0.9, -1.2]].forEach(([x, z]) => g.add(con(0.18, 0.42, '#ff8a3d', [x, 0.32, z])));

    // 打擊學員 (手持藍色安全泡棉棒)
    const hitter = createKid({ shirt: '#ff8a3d', pants: '#1d3557', item: 'foamBat', pos: [-0.52, 0.12, 0.85], rotY: 1.3, scale: 0.88 });
    // 跑向一壘的女同學
    const baseRunner = createKid({ shirt: '#ff8a3d', pants: '#1d3557', ponytail: true, pos: [1.25, 0.12, 0.15], rotY: -2.5, scale: 0.84 });
    // 內野守備女同學
    const fielder1 = createKid({ shirt: '#3f7fd6', pants: '#ffffff', ponytail: true, pos: [0.85, 0.12, -0.95], rotY: -0.4, scale: 0.85 });
    // 外野守備男同學
    const fielder2 = createKid({ shirt: '#3f7fd6', pants: '#ffffff', hat: '#ffe066', pos: [-0.95, 0.12, -1.05], rotY: 0.5, scale: 0.85 });
    // 體育指導老師
    const teacher = createKid({ shirt: '#10b981', pants: '#1e293b', hat: '#ffffff', teacher: true, pos: [-1.45, 0.12, 0.35], rotY: 1.2, scale: 0.86 });
    add(g, hitter, baseRunner, fielder1, fielder2, teacher);

    return (t) => {
      const hitPhase = (t * 2.4) % (Math.PI * 2);
      hitter.armR.rotation.x = -1.2;
      hitter.armR.rotation.z = Math.sin(hitPhase) * 1.4;
      hitter.body.rotation.y = Math.sin(hitPhase) * 0.4;
      // 樂樂棒球被擊飛與回座
      const fly = Math.max(0, Math.sin(hitPhase));
      ball.position.set(fly * 0.85, 1.12 + Math.sin(fly * Math.PI) * 0.95, 0.8 - fly * 1.7);
      // 跑壘員衝刺
      baseRunner.position.z = 0.45 - Math.abs(Math.sin(t * 1.8)) * 0.9;
      poseWalk(baseRunner, t, 11, 0.78);
      // 守備員左右移位接球與歡呼
      fielder1.position.x = 0.85 + Math.sin(t * 3) * 0.25;
      poseWalk(fielder1, t, 7, 0.5);
      poseCheer(fielder2, t, 0.5);
      teacher.armR.rotation.z = -2.1 + Math.sin(t * 4) * 0.35;
    };
  };

  // 3. 籃球社：跳投射手、防守球員、雙人胸前傳球組、低年級運球學員與教練 (5人 + 3顆球)
  P.basketball = (g) => {
    add(g, box(4.6, 0.12, 3.4, '#3f9a72', [0, 0.06, 0]), box(4.2, 0.13, 3.0, '#e98d4e', [0, 0.07, 0]),
      box(0.06, 0.15, 3.0, '#ffffff', [0, 0.08, 0]),
      cyl(0.08, 0.08, 3.2, '#5a5a5a', [-2.0, 1.6, 0]), box(0.08, 0.95, 1.5, '#ffffff', [-1.85, 2.8, 0]),
      box(0.09, 0.4, 0.5, '#e25b3c', [-1.83, 2.65, 0]));
    g.add(tor(0.3, 0.04, '#ff6b2c', [-1.5, 2.45, 0], [Math.PI / 2, 0, 0]));

    const ball = sph(0.25, '#f07b2a', [-0.4, 0.6, 0.2], 1, 2);
    ball.add(tor(0.25, 0.018, '#3a2414', [0, 0, 0], [0, 0, 0]));
    const ballPass = sph(0.22, '#f07b2a', [0.7, 0.6, -0.5], 1, 1);
    const ballDribble = sph(0.21, '#f07b2a', [1.25, 0.4, 0.85], 1, 1);
    add(g, ball, ballPass, ballDribble);

    // 1. 跳投進攻球員 (高年級紅隊)
    const shooter = createKid({ shirt: '#e63946', pants: '#ffffff', pos: [-0.25, 0.14, 0.3], rotY: -Math.PI / 2, scale: 0.9 });
    // 2. 防守滑步球員 (藍隊)
    const defender = createKid({ shirt: '#2563eb', pants: '#1d3557', pos: [-0.98, 0.14, 0.1], rotY: Math.PI / 2 - 0.2, scale: 0.88 });
    // 3 & 4. 雙人傳接球練習組
    const passer1 = createKid({ shirt: '#e63946', pants: '#ffffff', pos: [0.35, 0.14, -0.85], rotY: 1.35, scale: 0.84 });
    const passer2 = createKid({ shirt: '#2563eb', pants: '#1d3557', ponytail: true, pos: [1.55, 0.14, -0.55], rotY: -1.8, scale: 0.84 });
    // 5. 低年級換手運球小隊員
    const kidLow = createKid({ shirt: '#ffbe0b', pants: '#1d3557', ponytail: true, pos: [1.45, 0.14, 0.85], rotY: -0.9, scale: 0.78 });
    add(g, shooter, defender, passer1, passer2, kidLow);

    return (t) => {
      // 跳投與籃球拋物線入網
      const s = (Math.sin(t * 3.2) + 1) * 0.5;
      shooter.position.y = 0.14 + Math.max(0, Math.sin(t * 3.2)) * 0.35;
      shooter.armR.rotation.x = -2.2 - Math.sin(t * 3.2) * 0.5;
      shooter.armL.rotation.x = -1.8;
      ball.position.set(-0.25 - s * 1.25, 0.85 + Math.sin(s * Math.PI) * 1.85, 0.3 * (1 - s));
      ball.rotation.z = -t * 5;

      // 防守球員張手橫移
      defender.position.z = 0.1 + Math.sin(t * 3.0) * 0.38;
      defender.armL.rotation.z = 1.65;
      defender.armR.rotation.z = -1.65;

      // 雙人胸前傳球
      const pRatio = (Math.sin(t * 4.2) + 1) * 0.5;
      ballPass.position.set(0.35 + pRatio * 1.2, 0.55 + Math.sin(pRatio * Math.PI) * 0.32, -0.85 + pRatio * 0.3);
      passer1.armL.rotation.x = -1.1 - Math.sin(t * 4.2) * 0.45;
      passer1.armR.rotation.x = -1.1 - Math.sin(t * 4.2) * 0.45;
      passer2.armL.rotation.x = -1.1 + Math.sin(t * 4.2) * 0.45;
      passer2.armR.rotation.x = -1.1 + Math.sin(t * 4.2) * 0.45;

      // 低年級原地運球
      kidLow.armR.rotation.x = -1.1 + Math.sin(t * 8.5) * 0.5;
      ballDribble.position.y = 0.26 + Math.abs(Math.cos(t * 8.5)) * 0.42;
    };
  };

  // 4. 足球社：帶球射門前鋒、飛撲守門員、雙人傳球翼鋒、S型繞錐學員與教練 (5人 + 2顆足球)
  P.soccer = (g) => {
    g.add(box(5, 0.12, 3.6, '#4fa846', [0, 0.06, 0]));
    for (let i = 0; i < 5; i += 2) g.add(box(1, 0.13, 3.6, '#66bd55', [-2 + i, 0.065, 0]));
    g.add(box(0.06, 0.14, 3.6, '#ffffff', [0, 0.08, 0]));
    const gl = new T.Group(); gl.position.set(-2.3, 0.1, 0);
    add(gl, cyl(0.07, 0.07, 1.5, '#ffffff', [0, 0.75, 1]), cyl(0.07, 0.07, 1.5, '#ffffff', [0, 0.75, -1]),
      cyl(0.07, 0.07, 2.1, '#ffffff', [0, 1.5, 0], [Math.PI / 2, 0, 0]),
      mesh(new T.BoxGeometry(0.8, 1.5, 2, 3, 4, 6), new T.MeshBasicMaterial({ color: '#ffffff', wireframe: true, transparent: true, opacity: 0.55 }), [-0.4, 0.75, 0]));
    g.add(gl);

    // 繞錐訓練角標
    [[0.4, 1.15], [1.0, 1.15], [1.6, 1.15]].forEach(([x, z]) => g.add(con(0.13, 0.3, '#ff6d00', [x, 0.25, z])));

    const bg = new T.IcosahedronGeometry(0.27, 1).toNonIndexed();
    const n = bg.attributes.position.count, col = new Float32Array(n * 3);
    for (let f = 0; f < n / 3; f++) { const dark = f % 4 === 0; for (let k = 0; k < 3; k++) col.set(dark ? [0.03, 0.03, 0.03] : [1, 1, 1], (f * 3 + k) * 3); }
    bg.setAttribute('color', new T.BufferAttribute(col, 3));
    const ball = mesh(bg, vcMat, [0.8, 0.4, 0.1]);
    const ball2 = mesh(bg.clone(), vcMat, [1.0, 0.32, 1.0]);
    ball2.scale.setScalar(0.82);
    add(g, ball, ball2);

    // 1. 射門前鋒
    const striker = createKid({ shirt: '#ffbe0b', pants: '#1d3557', pos: [0.95, 0.14, 0.15], rotY: -Math.PI / 2, scale: 0.88 });
    // 2. 守門員
    const keeper = createKid({ shirt: '#10b981', pants: '#111827', crouch: true, pos: [-2.0, 0.14, 0], rotY: Math.PI / 2, scale: 0.9 });
    // 3. 傳球助攻翼鋒
    const winger = createKid({ shirt: '#ffbe0b', pants: '#1d3557', ponytail: true, pos: [0.25, 0.14, -1.05], rotY: -1.1, scale: 0.84 });
    // 4. 中場防守隊員
    const defender = createKid({ shirt: '#ef4444', pants: '#ffffff', pos: [-0.75, 0.14, -0.55], rotY: 1.2, scale: 0.84 });
    // 5. S型帶球繞錐學員
    const dribbler = createKid({ shirt: '#ffbe0b', pants: '#1d3557', pos: [1.0, 0.14, 1.15], rotY: -Math.PI / 2, scale: 0.82 });
    add(g, striker, keeper, winger, defender, dribbler);

    return (t) => {
      const cyc = (t * 0.95) % 1;
      ball.position.x = 0.9 - cyc * 2.75;
      ball.position.z = 0.15 * (1 - cyc) + Math.sin(cyc * Math.PI * 2) * 0.25;
      ball.position.y = 0.36 + Math.sin(cyc * Math.PI) * 0.48;
      ball.rotation.z = t * 5;

      // 前鋒助跑踢球
      striker.position.x = 1.25 - Math.min(0.45, cyc) * 0.9;
      poseWalk(striker, t, 10, 0.78);
      // 守門員橫向撲救
      keeper.position.z = Math.sin(t * 3.6) * 0.6;
      keeper.armL.rotation.z = 2.15;
      keeper.armR.rotation.z = -2.15;
      // 隊友與防守員跑位
      winger.position.x = 0.35 + Math.sin(t * 2.2) * 0.5;
      poseWalk(winger, t, 9, 0.65);
      defender.position.z = -0.55 + Math.cos(t * 2.6) * 0.35;
      poseWalk(defender, t + 1, 8, 0.6);
      // 繞錐盤球
      const dx = 1.0 + Math.sin(t * 1.8) * 0.75;
      const dz = 1.15 + Math.sin(t * 3.6) * 0.28;
      dribbler.position.set(dx, 0.14, dz);
      dribbler.rotation.y = Math.cos(t * 1.8) > 0 ? Math.PI / 2 : -Math.PI / 2;
      poseWalk(dribbler, t, 11, 0.7);
      ball2.position.set(dx + (Math.cos(t * 1.8) > 0 ? 0.25 : -0.25), 0.28, dz);
      ball2.rotation.x = t * 6;
    };
  };

  // 5. 田徑社：雙跑道跨欄與大隊接力選手(3人)、中央敏捷高抬腿選手、頒獎台冠軍與教練 (5人)
  P.track = (g) => {
    const ring = mesh(new T.RingGeometry(1.25, 2.15, 40), M('#d9573f', { side: T.DoubleSide }), [0, 0.09, 0], [-Math.PI / 2, 0, 0], [1.25, 1, 1]);
    const lane1 = mesh(new T.RingGeometry(1.53, 1.57, 40), M('#ffffff', { side: T.DoubleSide }), [0, 0.1, 0], [-Math.PI / 2, 0, 0], [1.25, 1, 1]);
    const lane2 = mesh(new T.RingGeometry(1.83, 1.87, 40), M('#ffffff', { side: T.DoubleSide }), [0, 0.1, 0], [-Math.PI / 2, 0, 0], [1.25, 1, 1]);
    add(g, cyl(2.3, 2.35, 0.08, '#7cc35c', [0, 0.04, 0], null, 24, null), ring, lane1, lane2);
    g.children[0].scale.set(1.28, 1, 1.02);
    // 頒獎台
    add(g, box(0.55, 0.52, 0.55, '#ffd54f', [0, 0.34, -0.2]), box(0.55, 0.36, 0.55, '#e0e0e0', [-0.55, 0.26, -0.2]), box(0.55, 0.26, 0.55, '#d7995b', [0.55, 0.21, -0.2]));
    // 雙跨欄
    [1.68, -1.68].forEach((hz) => {
      const h = new T.Group(); h.position.set(0, 0.1, hz);
      add(h, box(0.05, 0.5, 0.05, '#ffffff', [-0.35, 0.25, 0]), box(0.05, 0.5, 0.05, '#ffffff', [0.35, 0.25, 0]), box(0.76, 0.1, 0.05, '#e53935', [0, 0.48, 0]));
      g.add(h);
    });

    // 內道跨欄與傳棒選手 (手持金色接力棒)
    const baton = cyl(0.028, 0.028, 0.32, '#ffd166', [0, 0, 0], [Math.PI / 2, 0, 0]);
    const runner1 = createKid({ shirt: '#ff7043', pants: '#1d3557', pos: [0, 0.1, 0], scale: 0.85, heldItem: baton });
    // 內道前方接棒衝刺選手
    const runnerRelay = createKid({ shirt: '#ff7043', pants: '#1d3557', ponytail: true, pos: [0, 0.1, 0], scale: 0.84 });
    // 外道追趕選手
    const runner2 = createKid({ shirt: '#29b6f6', pants: '#1d3557', ponytail: true, pos: [0, 0.1, 0], scale: 0.84 });
    // 頒獎台歡呼選手
    const winner = createKid({ shirt: '#ab47bc', pants: '#ffffff', pos: [0, 0.6, -0.2], scale: 0.8 });
    // 場內計時田徑教練
    const coach = createKid({ shirt: '#1e293b', pants: '#334155', hat: '#ffd54f', teacher: true, pos: [-0.95, 0.1, 0.45], rotY: 0.6, scale: 0.84 });
    add(g, runner1, runnerRelay, runner2, winner, coach);

    return (t) => {
      const a1 = t * 1.4;
      const jump1 = Math.abs(Math.cos(a1)) < 0.28 ? 0.38 : 0;
      runner1.position.set(Math.cos(a1) * 1.42 * 1.25, 0.1 + jump1 + Math.abs(Math.sin(t * 12)) * 0.05, Math.sin(a1) * 1.42);
      runner1.rotation.y = -a1;
      poseWalk(runner1, t, 14, 0.88);

      const aRelay = a1 + 0.55;
      const jumpR = Math.abs(Math.cos(aRelay)) < 0.28 ? 0.36 : 0;
      runnerRelay.position.set(Math.cos(aRelay) * 1.42 * 1.25, 0.1 + jumpR + Math.abs(Math.cos(t * 12)) * 0.05, Math.sin(aRelay) * 1.42);
      runnerRelay.rotation.y = -aRelay;
      poseWalk(runnerRelay, t + 0.3, 14, 0.88);
      runnerRelay.armL.rotation.x = 0.9; // 向後伸手準備接棒

      const a2 = t * 1.28 + 2.1;
      runner2.position.set(Math.cos(a2) * 1.96 * 1.25, 0.1 + Math.abs(Math.sin(t * 11)) * 0.05, Math.sin(a2) * 1.96);
      runner2.rotation.y = -a2;
      poseWalk(runner2, t + 0.5, 13, 0.85);

      poseCheer(winner, t, 0);
      coach.armR.rotation.x = -1.2 + Math.sin(t * 4) * 0.25;
    };
  };

  // 6. 直排輪社：4位穿戴頭盔與直排輪鞋的小選手 S 型繞樁、外圈滑行與教練領滑 (5人)
  P.skating = (g) => {
    const s = new T.Group(); s.position.set(0, 0.42, -0.55); s.rotation.y = 0.5; s.scale.setScalar(0.76);
    add(s, box(1.2, 0.8, 2.2, '#4fc3f7', [0, 0.4, 0]), box(1.2, 1.5, 1.1, '#29a5e0', [0, 1.15, -0.55]),
      box(1.3, 0.25, 1.2, '#ff7aa2', [0, 1.95, -0.55]), box(0.3, 0.25, 2.2, '#455a64', [0, -0.05, 0]),
      box(1.25, 0.12, 0.25, '#ffffff', [0, 0.85, 0.3]), box(1.25, 0.12, 0.25, '#ffffff', [0, 0.85, 0.75]));
    const wheels = [];
    [-0.8, -0.27, 0.27, 0.8].forEach(z => { const w = cyl(0.28, 0.28, 0.24, '#ffd54f', [0, -0.25, z], [0, 0, Math.PI / 2], 14); wheels.push(w); s.add(w); });
    g.add(s);

    // 繞樁角錐
    [[-1.6, 1.25], [-0.55, 1.4], [0.55, 1.4], [1.6, 1.25]].forEach(([x, z]) => g.add(con(0.16, 0.4, '#ff8a3d', [x, 0.22, z])));

    // 4 位戴安全頭盔穿直排輪鞋的小選手 + 專業教練
    const skater1 = createKid({ shirt: '#00bcd4', pants: '#1d3557', helmet: '#ff7aa2', skates: true, pos: [-1.2, 0.12, 1.3], scale: 0.86 });
    const skater2 = createKid({ shirt: '#ffca28', pants: '#1d3557', helmet: '#29b6f6', ponytail: true, skates: true, pos: [0.8, 0.12, 1.3], scale: 0.84 });
    const skater3 = createKid({ shirt: '#ec407a', pants: '#1d3557', helmet: '#ffd54f', ponytail: true, skates: true, pos: [-1.5, 0.12, -0.2], scale: 0.82 });
    const skater4 = createKid({ shirt: '#66bb6a', pants: '#1d3557', helmet: '#ab47bc', skates: true, pos: [1.5, 0.12, -0.2], scale: 0.82 });
    const coach = createKid({ shirt: '#263238', pants: '#37474f', helmet: '#ffd54f', skates: true, teacher: true, pos: [1.55, 0.12, -0.85], rotY: -0.6, scale: 0.86 });
    add(g, skater1, skater2, skater3, skater4, coach);

    return (t) => {
      wheels.forEach(w => (w.rotation.x = t * 4));
      s.position.y = 0.42 + Math.sin(t * 2) * 0.06;

      // 前排兩位 S 型蛇行繞樁動畫
      [skater1, skater2].forEach((sk, idx) => {
        const ph = idx * 1.25;
        const x = Math.sin(t * 1.15 - ph) * 1.6;
        const z = 1.35 + Math.sin(t * 2.3 - ph * 2) * 0.36;
        sk.position.set(x, 0.12, z);
        sk.rotation.y = Math.cos(t * 1.15 - ph) > 0 ? Math.PI / 2 : -Math.PI / 2;
        sk.rotation.z = Math.sin(t * 2.3 - ph * 2) * 0.22;
        poseWalk(sk, t + idx, 7, 0.55);
      });

      // 外圈兩位壓低重心剪冰過彎滑行
      [skater3, skater4].forEach((sk, idx) => {
        const ang = t * 0.95 + idx * Math.PI;
        sk.position.set(Math.cos(ang) * 1.85, 0.12, Math.sin(ang) * 1.65);
        sk.rotation.y = -ang;
        sk.rotation.z = 0.18;
        poseWalk(sk, t + idx * 2, 8, 0.6);
      });

      poseCheer(coach, t, 0.4);
    };
  };

  // 7. 柔道社：武道館內雙人組手摔技對練、側邊雙人受身拍墊與敬禮、黑帶師範指導 (5人)
  P.judo = (g) => {
    add(g, box(4.4, 0.3, 4.4, '#c8a26a', [0, 0.15, 0]), box(3.9, 0.07, 3.9, '#d84343', [0, 0.33, 0]), box(3.5, 0.09, 3.5, '#a5cf6a', [0, 0.35, 0]));
    [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]].forEach(([x, z]) => g.add(cyl(0.13, 0.13, 2.5, '#b9382f', [x, 1.55, z])));
    add(g, box(4.6, 0.2, 4.6, '#6d4c41', [0, 2.85, 0]), con(3.6, 1.5, '#5d4037', [0, 3.7, 0], [0, Math.PI / 4, 0], 4),
      sph(0.18, '#ffd54f', [0, 4.5, 0], 1, 0));

    // 中央對練組手學員 (白道服 + 藍帶 vs 黃帶)
    const judoka1 = createKid({ shirt: '#ffffff', pants: '#ffffff', belt: '#1e88e5', pos: [-0.45, 0.4, -0.05], rotY: Math.PI / 2, scale: 0.9 });
    const judoka2 = createKid({ shirt: '#ffffff', pants: '#ffffff', belt: '#fdd835', pos: [0.45, 0.4, -0.05], rotY: -Math.PI / 2, scale: 0.88 });
    // 前排練習敬禮與受身拍墊的兩位低年級學員
    const junior1 = createKid({ shirt: '#ffffff', pants: '#ffffff', belt: '#ffffff', ponytail: true, pos: [-1.15, 0.4, 1.15], rotY: 1.2, scale: 0.8 });
    const junior2 = createKid({ shirt: '#ffffff', pants: '#ffffff', belt: '#43a047', pos: [1.15, 0.4, 1.15], rotY: -1.2, scale: 0.8 });
    // 黑帶師範教練
    const sensei = createKid({ shirt: '#ffffff', pants: '#ffffff', belt: '#111111', teacher: true, pos: [0, 0.4, -1.25], rotY: 0, scale: 0.9 });
    add(g, judoka1, judoka2, junior1, junior2, sensei);

    return (t) => {
      // 中央組手推拉、大外割出腳與行禮循環
      const phase = (t * 1.6) % (Math.PI * 2);
      const bow = Math.max(0, Math.sin(phase));
      judoka1.position.x = -0.38 + Math.sin(t * 3.2) * 0.12;
      judoka2.position.x = 0.38 + Math.sin(t * 3.2) * 0.12;
      judoka1.armL.rotation.x = -1.25;
      judoka1.armR.rotation.x = -1.1 + Math.sin(t * 5) * 0.35;
      judoka1.legR.rotation.x = Math.max(0, Math.cos(t * 3.2)) * 0.55;
      judoka2.armL.rotation.x = -1.25;
      judoka2.armR.rotation.x = -1.1 - Math.sin(t * 5) * 0.35;
      judoka1.body.rotation.x = bow * 0.35;
      judoka2.body.rotation.x = bow * 0.35;

      // 教練點頭與手勢指導
      sensei.head.rotation.x = Math.sin(t * 2.5) * 0.18;
      sensei.armR.rotation.x = -0.7 + Math.sin(t * 3) * 0.25;
      // 兩位學弟妹相互敬禮與練習受身拍墊
      [junior1, junior2].forEach((jr, idx) => {
        jr.body.rotation.x = Math.abs(Math.sin(t * 2.2 + idx * 0.5)) * 0.45;
        jr.armL.rotation.z = 0.5 + Math.sin(t * 6 + idx) * 0.45;
        jr.armR.rotation.z = -0.5 - Math.sin(t * 6 + idx) * 0.45;
      });
    };
  };

  // 8. 陶笛社：巨型陶笛雕塑前，4位跨年級學員弧形雙手吹奏陶笛 + 音樂老師指揮 (5人)
  P.ocarina = (g) => {
    const o = new T.Group(); o.position.set(0, 1.35, -0.45); o.rotation.set(0, 0.4, 0.15);
    add(o, sph(0.95, '#d98e5a', [0, 0, 0], [1.6, 0.85, 1.0], 2), cyl(0.26, 0.3, 0.85, '#c97c4a', [1.45, 0.25, 0], [0, 0, -1.2], 10));
    [[-0.6, 0.3], [-0.15, 0.5], [0.3, 0.35], [0.1, -0.3], [-0.5, -0.35], [0.6, -0.1]].forEach(([x, z]) => o.add(sph(0.1, '#5a3220', [x, 0.75, z], [1, 0.4, 1], 1)));
    g.add(o, cyl(0.55, 0.75, 0.4, '#8d6e63', [0, 0.2, -0.45]));

    const notes = [];
    ['#3f7fd6', '#e91e63', '#7e57c2', '#ffab00'].forEach((c, i) => {
      const n = musicNote(c);
      n.position.set(-1.2 + i * 0.8, 2.5, 0.4);
      g.add(n);
      notes.push(n);
    });

    // 手持小陶笛雙聲部合奏的 4 位學員
    const players = [
      [-1.35, 0.08, 0.95, 0.45, '#42a5f5', false],
      [-0.48, 0.08, 1.28, 0.18, '#ec407a', true],
      [0.48, 0.08, 1.28, -0.18, '#66bb6a', false],
      [1.35, 0.08, 0.95, -0.45, '#ffa726', true]
    ].map(([x, y, z, ry, col, pt]) => {
      const k = createKid({ shirt: col, pants: '#1d3557', ponytail: pt, item: 'ocarina', pos: [x, y, z], rotY: ry, scale: 0.86 });
      // 雙手舉至嘴邊吹奏姿勢
      k.armL.rotation.x = -1.45;
      k.armL.rotation.z = -0.35;
      k.armR.rotation.x = -1.45;
      k.armR.rotation.z = 0.35;
      g.add(k);
      return k;
    });

    // 陶笛指導老師
    const teacher = createKid({ shirt: '#5c6bc0', pants: '#1e293b', skirt: '#ffffff', ponytail: true, teacher: true, pos: [0, 0.08, 1.85], rotY: Math.PI, scale: 0.84 });
    g.add(teacher);

    return (t) => {
      notes.forEach((n, i) => {
        n.position.y = 2.35 + Math.sin(t * 1.8 + i * 1.7) * 0.38 + (i % 2) * 0.25;
        n.rotation.y = Math.sin(t + i) * 0.6;
      });
      o.rotation.z = 0.15 + Math.sin(t * 1.2) * 0.05;
      players.forEach((p, i) => {
        p.body.rotation.z = Math.sin(t * 2.4 + i * 0.8) * 0.1;
        p.head.rotation.x = Math.sin(t * 3.2 + i) * 0.08;
      });
      teacher.armL.rotation.x = -1.3 + Math.sin(t * 3.6) * 0.45;
      teacher.armR.rotation.x = -1.3 + Math.cos(t * 3.6) * 0.45;
    };
  };

  // 9. 合唱團：三層階梯合唱台 7 位團員持譜合唱 + 指揮老師 + 鋼琴伴奏同學 (共9人)
  P.choir = (g) => {
    const half = (r, h, c, y) => mesh(new T.CylinderGeometry(r, r, h, 24, 1, false, -Math.PI / 2, Math.PI), M(c), [0, y, -0.45]);
    add(g, half(2.4, 0.3, '#c9a27a', 0.15), half(1.75, 0.6, '#b98d63', 0.3), half(1.1, 0.9, '#a77a51', 0.45));

    const robes = ['#3f7fd6', '#3f7fd6', '#e85a8a', '#e85a8a', '#3f7fd6', '#e85a8a', '#ffb300'];
    const singers = [];
    [[-1.85, 0.3, -0.2], [1.85, 0.3, -0.2], [-1.3, 0.6, 0.55], [1.3, 0.6, 0.55], [0, 0.6, 0.85], [-0.52, 0.9, 0.15], [0.52, 0.9, 0.15]]
      .forEach(([x, y, z], i) => {
        const folder = box(0.18, 0.14, 0.02, '#fffaf0', [0, 0, 0.04], [-0.4, 0, 0]);
        const f = createKid({
          shirt: robes[i],
          pants: '#1d3557',
          skirt: i % 2 === 1 ? '#ffffff' : null,
          ponytail: i % 2 === 1,
          pos: [x, y, z - 0.45],
          scale: 0.82,
          heldItem: folder
        });
        f.lookAt(0, y, 2.5);
        f.armL.rotation.x = -1.1;
        f.armR.rotation.x = -1.1;
        singers.push({ f, baseY: y });
        g.add(f);
      });

    // 舞台側邊：迷你伴奏鋼琴與伴奏同學
    add(g, box(0.85, 0.55, 0.45, '#1e293b', [-1.55, 0.28, 1.25], [0, 0.5, 0]),
      box(0.82, 0.06, 0.18, '#ffffff', [-1.48, 0.45, 1.35], [0, 0.5, 0]));
    const pianist = createKid({ shirt: '#ec407a', pants: '#1d3557', skirt: '#ffffff', ponytail: true, sitting: true, pos: [-1.32, 0.18, 1.62], rotY: -2.6, scale: 0.78 });
    // 舞台前方：指揮老師與麥克風架
    const conductor = createKid({ shirt: '#1e293b', pants: '#0f172a', teacher: true, pos: [0.15, 0.05, 1.58], rotY: Math.PI, scale: 0.88 });
    add(g, pianist, conductor, cyl(0.03, 0.03, 1.1, '#555', [-0.55, 0.55, 1.25]), sph(0.1, '#333', [-0.55, 1.15, 1.25], 1, 1));

    const n1 = musicNote('#ffffff'); n1.position.set(0.9, 2.5, 0.4);
    const n2 = musicNote('#ffd54f'); n2.position.set(-0.9, 2.3, 0.2);
    add(g, n1, n2);

    return (t) => {
      singers.forEach(({ f, baseY }, i) => {
        f.position.y = baseY + Math.abs(Math.sin(t * 3 + i * 0.7)) * 0.045;
        f.body.rotation.z = Math.sin(t * 2.2 + i) * 0.07;
      });
      // 鋼琴伴奏雙手彈奏
      pianist.armL.rotation.x = -1.25 + Math.sin(t * 9) * 0.2;
      pianist.armR.rotation.x = -1.25 + Math.cos(t * 9) * 0.2;
      // 指揮老師雙手揮拍
      conductor.armL.rotation.x = -1.5 + Math.sin(t * 4) * 0.55;
      conductor.armR.rotation.x = -1.5 + Math.cos(t * 4) * 0.55;
      conductor.armR.rotation.z = -0.3 + Math.sin(t * 2) * 0.3;
      n1.position.y = 2.5 + Math.sin(t * 2.2) * 0.3;
      n2.position.y = 2.3 + Math.cos(t * 2.2) * 0.3;
    };
  };

  // 10. 舞蹈社：粉紅圓舞台上 4 位舞者持彩帶與花球旋轉群舞 + 舞蹈老師示範 (5人)
  P.dance = (g) => {
    add(g, cyl(2.2, 2.3, 0.35, '#ffffff', [0, 0.17, 0], null, 28), cyl(2.0, 2.0, 0.37, '#f48fb1', [0, 0.18, 0], null, 28));

    // 主舞者 (中央芭蕾旋轉)
    const lead = createKid({ shirt: '#ff80ab', pants: SKIN, skirt: '#f8bbd0', crown: '#ffd54f', ponytail: true, pos: [0, 0.37, -0.15], scale: 0.92 });
    lead.armL.rotation.z = 2.2;
    lead.armR.rotation.z = -2.2;
    // 左右與前排共 3 位伴舞學員 (手持花球道具)
    const d1 = createKid({ shirt: '#ce93d8', pants: SKIN, skirt: '#f3e5f5', ponytail: true, item: 'pom', heldItemL: makePresetItem('pom'), pos: [-1.15, 0.37, 0.45], scale: 0.84 });
    const d2 = createKid({ shirt: '#80deea', pants: SKIN, skirt: '#e0f7fa', ponytail: true, item: 'pom', heldItemL: makePresetItem('pom'), pos: [1.15, 0.37, 0.45], scale: 0.84 });
    const d3 = createKid({ shirt: '#ffca28', pants: SKIN, skirt: '#fff9c4', ponytail: true, pos: [0, 0.37, 1.15], scale: 0.82 });
    // 舞蹈指導老師
    const teacher = createKid({ shirt: '#ad1457', pants: '#1e293b', skirt: '#f8bbd0', ponytail: true, teacher: true, pos: [-1.55, 0.37, -0.95], rotY: 0.7, scale: 0.86 });
    add(g, lead, d1, d2, d3, teacher);

    const ribbon = tor(1.35, 0.045, '#ffd54f', [0, 1.45, -0.15], [Math.PI / 2, 0, 0], Math.PI * 1.35);
    g.add(ribbon);

    return (t) => {
      lead.rotation.y = t * 1.9;
      lead.position.y = 0.37 + Math.abs(Math.sin(t * 3.8)) * 0.16;
      d1.rotation.y = -t * 1.3;
      d2.rotation.y = t * 1.3;
      poseCheer(d1, t, 0);
      poseCheer(d2, t, 1.5);
      d3.body.rotation.z = Math.sin(t * 3.8) * 0.22;
      d3.legL.rotation.z = Math.max(0, Math.sin(t * 3.8)) * 0.55;
      d3.legR.rotation.z = -Math.max(0, -Math.sin(t * 3.8)) * 0.55;
      d3.armL.rotation.z = 2.1 + Math.sin(t * 3.8) * 0.4;
      d3.armR.rotation.z = -2.1 - Math.sin(t * 3.8) * 0.4;
      poseCheer(teacher, t, 0.8);
      ribbon.rotation.z = -t * 1.9;
      ribbon.position.y = 1.45 + Math.sin(t * 2.4) * 0.2;
    };
  };

  // 11. 熱舞社：七彩發光舞池、重低音音響與 5 位跨年級街舞社員 V 字排舞律動 + 街舞老師 (6人)
  P.hiphop = (g) => {
    const tiles = [];
    const pal = ['#ff4081', '#7c4dff', '#00bcd4', '#ffeb3b'];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const m = Glow(pal[(i + j) % 4], 0.25, 1.4);
      const tl = box(0.95, 0.12, 0.95, m, [-1.5 + i, 0.06, -1.5 + j]); tl.userData.ph = i * 1.3 + j * 0.7; tiles.push(tl); g.add(tl);
    }
    const b = new T.Group(); b.position.set(0, 0.12, -1.25); b.scale.setScalar(0.88);
    add(b, box(3, 1.5, 0.9, '#37474f', [0, 0.75, 0]), box(3.1, 0.15, 1.0, '#263238', [0, 1.55, 0]),
      cyl(0.5, 0.5, 0.1, '#111', [-0.9, 0.75, 0.45], [Math.PI / 2, 0, 0], 16), cyl(0.5, 0.5, 0.1, '#111', [0.9, 0.75, 0.45], [Math.PI / 2, 0, 0], 16),
      tor(0.5, 0.06, '#ff4081', [-0.9, 0.75, 0.5]), tor(0.5, 0.06, '#00e5ff', [0.9, 0.75, 0.5]),
      box(0.6, 0.3, 0.05, '#80deea', [0, 1.1, 0.46]), tor(0.9, 0.07, '#90a4ae', [0, 1.6, 0], [0, 0, 0], Math.PI));
    g.add(b);

    // 5 位街舞隊員 (V字排舞隊形：C位主舞 + 左右前排 + 左右後排) + 街舞老師
    const crewSpecs = [
      { shirt: '#ff4081', pants: '#111827', hat: '#ffeb3b', backwardsHat: true, pos: [0, 0.14, 0.35], scale: 0.92 },
      { shirt: '#00e5ff', pants: '#1e293b', ponytail: true, pos: [-0.95, 0.14, 0.85], scale: 0.86 },
      { shirt: '#ffeb3b', pants: '#111827', hat: '#7c4dff', backwardsHat: true, pos: [0.95, 0.14, 0.85], scale: 0.86 },
      { shirt: '#a855f7', pants: '#ffffff', ponytail: true, pos: [-1.45, 0.14, 0.05], scale: 0.82 },
      { shirt: '#10b981', pants: '#111827', hat: '#ff4081', backwardsHat: true, pos: [1.45, 0.14, 0.05], scale: 0.82 }
    ];
    const crew = crewSpecs.map((spec) => {
      const d = createKid(spec);
      d.userData.baseX = spec.pos[0];
      g.add(d);
      return d;
    });
    const teacher = createKid({ shirt: '#111827', pants: '#ff4081', hat: '#00e5ff', backwardsHat: true, teacher: true, pos: [1.65, 0.14, 1.35], rotY: -2.4, scale: 0.86 });
    g.add(teacher);

    return (t) => {
      tiles.forEach(tl => tl.position.y = 0.06 + Math.max(0, Math.sin(t * 4.5 + tl.userData.ph)) * 0.09);
      b.scale.setScalar(0.88 * (1 + Math.max(0, Math.sin(t * 8)) * 0.045));
      crew.forEach((dancer, i) => {
        const beat = Math.sin(t * 7.5 + i * 0.6);
        const slide = Math.sin(t * 2.2) * 0.18 * (i % 2 === 0 ? 1 : -1);
        dancer.position.x = dancer.userData.baseX + slide;
        dancer.position.y = 0.14 + Math.max(0, beat) * 0.16;
        dancer.body.rotation.z = Math.sin(t * 3.75 + i) * 0.22;
        dancer.body.rotation.y = Math.cos(t * 3.75) * 0.28;
        dancer.armL.rotation.x = -1.25 + Math.sin(t * 7.5 + i) * 0.95;
        dancer.armR.rotation.z = -1.45 - Math.cos(t * 7.5 + i) * 0.85;
        dancer.legL.rotation.z = Math.max(0, -beat) * 0.28;
        dancer.legR.rotation.z = -Math.max(0, beat) * 0.28;
      });
      poseCheer(teacher, t, 0.3);
    };
  };

  // 12. 紙雕藝術社：立體浮雕畫框前，4位低年級學員穿美勞圍裙持色紙、安全剪刀摺剪與紙藝老師巡堂指導 (5人)
  P.papercut = (g) => {
    const f = new T.Group(); f.position.set(0, 0.2, -0.45); f.rotation.x = -0.15;
    add(f, box(3.0, 3.0, 0.2, '#f6e7c8', [0, 1.5, 0]), box(2.5, 2.5, 0.1, '#b39ddb', [0, 1.5, 0.15]),
      cyl(0.98, 0.98, 0.1, '#f2c96d', [0, 1.5, 0.22], [Math.PI / 2, 0, 0], 24), cyl(0.65, 0.65, 0.1, '#fff4dc', [0, 1.5, 0.3], [Math.PI / 2, 0, 0], 6));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; f.add(con(0.23, 0.46, '#9575cd', [Math.cos(a) * 1.0, 1.5 + Math.sin(a) * 1.0, 0.3], [Math.PI / 2, 0, a - Math.PI / 2], 3)); }
    g.add(f, box(3.2, 0.2, 1.1, '#a1774f', [0, 0.1, -0.25]));
    // 紙鶴
    const crane = new T.Group(); crane.position.set(1.5, 2.5, 1.1);
    add(crane, con(0.35, 0.9, '#ffffff', [0, 0, 0], [0, 0, Math.PI / 2], 3), con(0.25, 0.8, '#ff8a80', [0, 0.1, 0.35], [Math.PI / 2.4, 0, 0], 3), con(0.25, 0.8, '#ff8a80', [0, 0.1, -0.35], [-Math.PI / 2.4, 0, 0], 3));
    g.add(crane);

    // 創作桌與 4 位低年級學員 + 紙藝老師
    add(g, box(2.6, 0.42, 0.9, '#ffe0b2', [0, 0.21, 1.05]));
    const paperSheet1 = box(0.2, 0.02, 0.2, '#ff80ab', [0, 0, 0.04]);
    const paperSheet2 = box(0.2, 0.02, 0.2, '#4fc3f7', [0, 0, 0.04]);
    const kid1 = createKid({ shirt: '#ab47bc', pants: '#1d3557', apron: '#fff9c4', ponytail: true, pos: [-0.95, 0.1, 1.6], rotY: Math.PI - 0.25, scale: 0.84, heldItem: paperSheet1 });
    const kid2 = createKid({ shirt: '#26a69a', pants: '#1d3557', apron: '#fff9c4', item: 'scissors', pos: [0, 0.1, 1.65], rotY: Math.PI, scale: 0.84 });
    const kid3 = createKid({ shirt: '#ff7043', pants: '#1d3557', apron: '#e1f5fe', ponytail: true, pos: [0.95, 0.1, 1.6], rotY: Math.PI + 0.25, scale: 0.84, heldItem: paperSheet2 });
    const kid4 = createKid({ shirt: '#42a5f5', pants: '#1d3557', apron: '#fff9c4', pos: [-1.55, 0.1, 0.75], rotY: 1.4, scale: 0.82 });
    const teacher = createKid({ shirt: '#8e24aa', pants: '#1e293b', skirt: '#f3e5f5', ponytail: true, teacher: true, pos: [1.65, 0.1, 0.65], rotY: -1.6, scale: 0.86 });
    add(g, kid1, kid2, kid3, kid4, teacher);

    return (t) => {
      crane.position.set(Math.cos(t * 0.7) * 1.65, 2.65 + Math.sin(t * 1.6) * 0.28, Math.sin(t * 0.7) * 1.65);
      crane.rotation.y = -t * 0.7;
      kid1.armR.rotation.x = -1.1 + Math.sin(t * 5) * 0.28;
      kid1.armL.rotation.x = -1.0 - Math.sin(t * 5) * 0.22;
      kid2.armR.rotation.x = -1.2 + Math.cos(t * 6) * 0.3;
      kid2.head.rotation.z = Math.sin(t * 2) * 0.12;
      kid3.armR.rotation.x = -1.15 + Math.sin(t * 4.5 + 1) * 0.28;
      poseCheer(kid4, t, 0.6);
      teacher.armL.rotation.x = -0.9 + Math.sin(t * 3) * 0.25;
      teacher.head.rotation.y = Math.sin(t * 1.8) * 0.25;
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

  // 13. 蝶古巴特社：印花木盒旁，4位小福星穿圍裙持排筆刷塗拼貼膠、海綿拍色與老師指導 (5人)
  P.decoupage = (g) => {
    const lidMat = new T.MeshStandardMaterial({ map: floralTex(), roughness: 0.7 });
    const side = M('#a1683a');
    add(g, mesh(new T.BoxGeometry(2.4, 1.2, 1.7), [side, side, lidMat, side, side, side], [0, 0.6, -0.25]),
      box(0.3, 0.35, 0.08, '#d4a64a', [0, 0.95, 0.62]));
    const lid = mesh(new T.BoxGeometry(2.5, 0.22, 1.8), [side, side, lidMat, side, side, side], [0, 0, 0.9]);
    const hinge = new T.Group(); hinge.position.set(0, 1.32, -1.1); hinge.add(lid); hinge.rotation.x = -1.1; g.add(hinge);
    add(g, cyl(0.06, 0.03, 1.4, '#c88a4c', [1.5, 0.4, 0.65], [0.3, 0, 1.2]), cyl(0.14, 0.16, 0.45, '#ffffff', [-1.5, 0.22, 0.55]));

    // 4 位穿美勞圍裙拼貼刷膠的小朋友 + 指導老師
    const kid1 = createKid({ shirt: '#ec407a', pants: '#1d3557', apron: '#f8bbd0', ponytail: true, item: 'brush', pos: [-0.95, 0.1, 1.3], rotY: 2.6, scale: 0.85 });
    const kid2 = createKid({ shirt: '#42a5f5', pants: '#1d3557', apron: '#bbdefb', item: 'brush', pos: [0.0, 0.1, 1.45], rotY: Math.PI, scale: 0.85 });
    const kid3 = createKid({ shirt: '#ab47bc', pants: '#1d3557', apron: '#e1bee7', ponytail: true, pos: [0.95, 0.1, 1.3], rotY: -2.6, scale: 0.85 });
    const kid4 = createKid({ shirt: '#26a69a', pants: '#1d3557', apron: '#fff9c4', pos: [-1.6, 0.1, 0.1], rotY: 1.5, scale: 0.82 });
    const teacher = createKid({ shirt: '#d81b60', pants: '#1e293b', apron: '#fffaf0', ponytail: true, teacher: true, pos: [1.65, 0.1, 0.0], rotY: -1.5, scale: 0.86 });
    add(g, kid1, kid2, kid3, kid4, teacher);

    const bfs = ['#ff80ab', '#80d8ff'].map((c) => { const b = butterfly(c); g.add(b); return b; });
    return (t) => {
      bfs.forEach((b, i) => {
        const a = t * (0.7 + i * 0.2) + i * 3;
        b.position.set(Math.cos(a) * 1.75, 2.2 + Math.sin(t * 2 + i) * 0.35, Math.sin(a) * 1.75); b.rotation.y = -a;
        const f = Math.sin(t * 14 + i) * 0.9; b.userData.wings[0].rotation.z = f; b.userData.wings[1].rotation.z = -f;
      });
      kid1.armR.rotation.x = -1.3 + Math.sin(t * 5) * 0.35;
      kid2.armR.rotation.x = -1.25 + Math.cos(t * 5.5) * 0.35;
      kid3.armL.rotation.x = -1.1 + Math.cos(t * 4) * 0.25;
      kid3.armR.rotation.x = -1.1 - Math.cos(t * 4) * 0.25;
      poseCheer(kid4, t, 1.1);
      teacher.armR.rotation.x = -0.95 + Math.sin(t * 3.5) * 0.25;
    };
  };

  // 14. 黏土捏塑社：可愛小熊與胡蘿蔔轉盤旁，4位學員搓揉五彩超輕土與捏塑老師指導 (5人)
  P.clay = (g) => {
    g.add(cyl(2.0, 2.1, 0.2, '#64b5f6', [0, 0.1, 0], null, 24));
    const bear = new T.Group(); bear.position.set(-0.65, 0.2, -0.25);
    add(bear, sph(0.65, '#a1673f', [0, 0.62, 0], [1, 1.05, 0.9]), sph(0.46, '#a1673f', [0, 1.5, 0]), sph(0.16, '#a1673f', [-0.35, 1.88, 0]), sph(0.16, '#a1673f', [0.35, 1.88, 0]),
      sph(0.18, '#e8c39a', [0, 1.42, 0.4], [1, 0.8, 0.6]), sph(0.055, '#222', [-0.16, 1.62, 0.42]), sph(0.055, '#222', [0.16, 1.62, 0.42]), sph(0.35, '#e8c39a', [0, 0.62, 0.46], [1, 1, 0.4]));
    g.add(bear);
    const carrot = new T.Group(); carrot.position.set(0.85, 0.2, -0.4);
    add(carrot, con(0.32, 1.3, '#ff8a3d', [0, 0.65, 0], [Math.PI, 0, 0], 8), con(0.11, 0.45, '#66bb6a', [0, 1.5, 0]), con(0.11, 0.42, '#66bb6a', [0.14, 1.45, 0], [0, 0, -0.5]));
    g.add(carrot);

    const balls = [];
    ['#ef5350', '#ffee58', '#ab47bc', '#26c6da', '#9ccc65'].forEach((c, i) => { const b = sph(0.2, c, [1.1 - i * 0.45, 0.4, 0.75]); balls.push(b); g.add(b); });

    // 4 位捏黏土的小朋友 + 捏塑老師
    const clay1 = sph(0.1, '#ff80ab', [0, 0, 0.04]);
    const clay2 = sph(0.1, '#ffee58', [0, 0, 0.04]);
    const kid1 = createKid({ shirt: '#ffa726', pants: '#1d3557', apron: '#e1f5fe', pos: [-1.15, 0.2, 1.2], rotY: 2.4, scale: 0.85, heldItem: clay1 });
    const kid2 = createKid({ shirt: '#ec407a', pants: '#1d3557', apron: '#fff9c4', ponytail: true, pos: [0, 0.2, 1.45], rotY: Math.PI, scale: 0.85, heldItem: clay2 });
    const kid3 = createKid({ shirt: '#ab47bc', pants: '#1d3557', ponytail: true, pos: [1.15, 0.2, 1.2], rotY: -2.4, scale: 0.85 });
    const kid4 = createKid({ shirt: '#29b6f6', pants: '#1d3557', apron: '#f8bbd0', pos: [-1.55, 0.2, 0.15], rotY: 1.5, scale: 0.82 });
    const teacher = createKid({ shirt: '#fb8c00', pants: '#1e293b', apron: '#ffffff', teacher: true, pos: [1.55, 0.2, 0.15], rotY: -1.5, scale: 0.86 });
    add(g, kid1, kid2, kid3, kid4, teacher);

    return (t) => {
      bear.rotation.y = Math.sin(t) * 0.4;
      balls.forEach((b, i) => (b.position.y = 0.4 + Math.abs(Math.sin(t * 3 + i)) * 0.25));
      // 雙手搓揉黏土動作
      kid1.armL.rotation.x = -1.25 + Math.sin(t * 7) * 0.22;
      kid1.armR.rotation.x = -1.25 - Math.sin(t * 7) * 0.22;
      kid2.armL.rotation.x = -1.25 + Math.cos(t * 6.5) * 0.22;
      kid2.armR.rotation.x = -1.25 - Math.cos(t * 6.5) * 0.22;
      poseCheer(kid3, t, 0.8);
      kid4.armR.rotation.x = -1.1 + Math.sin(t * 5) * 0.25;
      teacher.armL.rotation.x = -1.0 + Math.sin(t * 3) * 0.25;
    };
  };

  // 15. 手作社：線軸、大木扣與毛線球旁，4位高年級學員縫製布偶、纏毛線球與老師指導 (5人)
  P.handcraft = (g) => {
    const spool = new T.Group(); spool.position.set(-0.95, 0, -0.25);
    add(spool, cyl(0.85, 0.85, 0.2, '#d7a86e', [0, 0.1, 0], null, 18), cyl(0.65, 0.65, 1.35, '#e57373', [0, 0.85, 0], null, 18), cyl(0.85, 0.85, 0.2, '#d7a86e', [0, 1.65, 0], null, 18));
    for (let i = 0; i < 6; i++) spool.add(tor(0.66, 0.03, '#ef9a9a', [0, 0.35 + i * 0.21, 0], [Math.PI / 2, 0, 0]));
    g.add(spool);
    const btn = new T.Group(); btn.position.set(0.95, 0.9, -0.4); btn.rotation.set(0, -0.4, 0.2);
    add(btn, cyl(0.8, 0.8, 0.2, '#ffca28', [0, 0, 0], [Math.PI / 2, 0, 0], 20));
    [[-0.2, 0.2], [0.2, 0.2], [-0.2, -0.2], [0.2, -0.2]].forEach(([x, y]) => btn.add(cyl(0.09, 0.09, 0.22, '#8d6e63', [x, y, 0], [Math.PI / 2, 0, 0], 8)));
    g.add(btn);
    const yarn = sph(0.45, '#7986cb', [0.35, 0.45, 0.75], 1, 2);
    yarn.add(tor(0.45, 0.04, '#9fa8da', [0, 0, 0], [0.5, 0, 0]), tor(0.45, 0.04, '#9fa8da', [0, 0, 0], [1.4, 0.6, 0]));
    g.add(yarn);

    // 4 位高年級學員穿針縫製與捲毛線球 + 手作老師
    const feltDoll = sph(0.11, '#f48fb1', [0, 0, 0.05]);
    const yarnBall = sph(0.11, '#4dd0e1', [0, 0, 0.05]);
    const crafter1 = createKid({ shirt: '#5c6bc0', pants: '#1d3557', ponytail: true, pos: [-0.95, 0.1, 1.35], rotY: 2.6, scale: 0.86, heldItem: feltDoll });
    const crafter2 = createKid({ shirt: '#26a69a', pants: '#37474f', pos: [0.0, 0.1, 1.48], rotY: Math.PI, scale: 0.86, heldItem: yarnBall });
    const crafter3 = createKid({ shirt: '#ec407a', pants: '#1d3557', ponytail: true, pos: [0.98, 0.1, 1.3], rotY: -2.5, scale: 0.85 });
    const crafter4 = createKid({ shirt: '#ffa726', pants: '#1d3557', pos: [-1.6, 0.1, 0.3], rotY: 1.6, scale: 0.84 });
    const teacher = createKid({ shirt: '#7e57c2', pants: '#1e293b', skirt: '#ede7f6', ponytail: true, teacher: true, pos: [1.65, 0.1, 0.2], rotY: -1.6, scale: 0.88 });
    add(g, crafter1, crafter2, crafter3, crafter4, teacher);

    return (t) => {
      spool.rotation.y = t * 0.5;
      crafter1.armR.rotation.x = -1.2 + Math.sin(t * 5) * 0.35;
      crafter1.armL.rotation.x = -1.1;
      crafter2.armL.rotation.x = -1.15 + Math.cos(t * 6) * 0.3;
      crafter2.armR.rotation.x = -1.15 - Math.cos(t * 6) * 0.3;
      crafter3.armR.rotation.x = -1.2 + Math.sin(t * 5.5 + 1) * 0.3;
      poseCheer(crafter4, t, 0.5);
      teacher.armL.rotation.x = -0.9 + Math.sin(t * 3) * 0.25;
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

  // 16. 漫畫創作社：四格漫畫原稿旁，4位小漫畫家持速寫板畫分鏡、展示角色與漫畫老師指導 (5人)
  P.comic = (g) => {
    const pageMat = new T.MeshStandardMaterial({ map: comicTex(), roughness: 0.8 });
    const cov = M('#5c6bc0');
    g.add(mesh(new T.BoxGeometry(2.5, 0.18, 2.8), [cov, cov, pageMat, cov, cov, cov], [-0.25, 0.12, -0.2], [0, 0.22, 0]));
    const pen = new T.Group(); pen.position.set(0.6, 0.55, 0.35); pen.rotation.set(0, -0.7, Math.PI / 2 - 0.1);
    add(pen, cyl(0.24, 0.24, 2.3, '#ffca28', [0, 0, 0], null, 6), con(0.24, 0.55, '#f1d1a5', [0, -1.42, 0], [Math.PI, 0, 0], 6),
      con(0.09, 0.2, '#37474f', [0, -1.62, 0], [Math.PI, 0, 0], 6), cyl(0.25, 0.25, 0.22, '#b0bec5', [0, 1.25, 0], null, 12), cyl(0.24, 0.24, 0.36, '#f48fb1', [0, 1.54, 0], null, 12));
    g.add(pen);
    const bubble = makeLabel('創作中…', { color: '#5c6bc0', size: 0.7, font: 44 }); bubble.position.set(-0.6, 1.15, -0.6); g.add(bubble);

    // 4 位小漫畫家 + 插畫老師
    const sketchPad1 = box(0.22, 0.26, 0.03, '#ffffff', [0, 0, 0.05], [-0.4, 0, 0]);
    const sketchPad2 = box(0.22, 0.26, 0.03, '#fff9c4', [0, 0, 0.05], [-0.4, 0, 0]);
    const artist1 = createKid({ shirt: '#7e57c2', pants: '#1d3557', pos: [-1.1, 0.15, 1.3], rotY: 2.5, scale: 0.86, heldItem: sketchPad1 });
    const artist2 = createKid({ shirt: '#ff7043', pants: '#1d3557', ponytail: true, pos: [0, 0.15, 1.48], rotY: Math.PI, scale: 0.86, heldItem: sketchPad2 });
    const artist3 = createKid({ shirt: '#29b6f6', pants: '#1d3557', ponytail: true, pos: [1.1, 0.15, 1.25], rotY: -2.4, scale: 0.85 });
    const artist4 = createKid({ shirt: '#66bb6a', pants: '#1d3557', pos: [-1.6, 0.15, 0.1], rotY: 1.5, scale: 0.84 });
    const teacher = createKid({ shirt: '#3949ab', pants: '#1e293b', hat: '#ffca28', teacher: true, pos: [1.6, 0.15, 0.0], rotY: -1.6, scale: 0.88 });
    add(g, artist1, artist2, artist3, artist4, teacher);

    return (t) => {
      pen.position.y = 0.55 + Math.sin(t * 3) * 0.08;
      pen.position.x = 0.6 + Math.cos(t * 3) * 0.12;
      bubble.position.y = 1.15 + Math.sin(t * 1.5) * 0.14;
      artist1.armL.rotation.x = -1.2 + Math.sin(t * 6) * 0.25;
      artist1.armR.rotation.x = -1.1;
      artist2.armL.rotation.x = -1.2 + Math.cos(t * 5.5) * 0.25;
      artist2.armR.rotation.x = -1.1;
      poseCheer(artist3, t, 0.5);
      artist4.armR.rotation.x = -1.15 + Math.sin(t * 4.5) * 0.25;
      teacher.armR.rotation.x = -0.9 + Math.sin(t * 3) * 0.25;
    };
  };

  // 17. 繪本欣賞社：自動翻頁立體繪本前，閱讀老師導讀與 4 位孩子圍坐聆聽、角色演繹 (5人)
  P.picturebook = (g) => {
    add(g, box(3.4, 0.12, 2.4, '#c0392b', [0, 0.08, -0.35]));
    const pm = M('#fffaf0');
    const l = new T.Group(); l.position.set(0, 0.15, -0.35); l.rotation.z = 0.18; l.add(mesh(new T.BoxGeometry(1.6, 0.26, 2.2), pm, [-0.8, 0.13, 0]));
    const r = new T.Group(); r.position.set(0, 0.15, -0.35); r.rotation.z = -0.18; r.add(mesh(new T.BoxGeometry(1.6, 0.26, 2.2), pm, [0.8, 0.13, 0]));
    g.add(l, r);
    // 立體繪本：小樹、房子、太陽
    add(g, cyl(0.05, 0.07, 0.6, '#795548', [-0.85, 0.85, -0.35]), sph(0.34, '#66bb6a', [-0.85, 1.25, -0.35]),
      box(0.56, 0.48, 0.42, '#ffcc80', [0.75, 0.85, -0.35]), con(0.46, 0.38, '#e57373', [0.75, 1.28, -0.35], [0, Math.PI / 4, 0], 4));
    const sun = sph(0.28, Glow('#ffd54f', 0.5, 1.2), [0, 2.15, -0.6], 1, 1); g.add(sun);
    const page = new T.Group(); page.position.set(0, 0.44, -0.35);
    page.add(mesh(new T.BoxGeometry(1.5, 0.02, 2.1), M('#fff3d6', { side: T.DoubleSide }), [0.75, 0, 0]));
    g.add(page);

    // 導讀老師 + 3 位圍坐聽故事舉手的小朋友 + 1 位戴皇冠演繹故事角色的小說書人
    const teacher = createKid({ shirt: '#00897b', pants: '#263238', item: 'book', teacher: true, pos: [-1.55, 0.1, 0.75], rotY: 2.1, scale: 0.88 });
    const reader1 = createKid({ shirt: '#ffca28', pants: '#1d3557', sitting: true, pos: [-0.75, 0.1, 1.38], rotY: Math.PI - 0.3, scale: 0.84 });
    const reader2 = createKid({ shirt: '#ec407a', pants: '#1d3557', ponytail: true, sitting: true, pos: [0.05, 0.1, 1.48], rotY: Math.PI, scale: 0.84 });
    const reader3 = createKid({ shirt: '#42a5f5', pants: '#1d3557', sitting: true, pos: [0.85, 0.1, 1.35], rotY: Math.PI + 0.3, scale: 0.84 });
    const actor = createKid({ shirt: '#ab47bc', pants: '#1d3557', crown: '#ffd54f', ponytail: true, pos: [1.55, 0.1, 0.65], rotY: -1.9, scale: 0.85 });
    add(g, teacher, reader1, reader2, reader3, actor);

    return (t) => {
      const c = (t * 0.4) % 2;
      page.rotation.z = c < 1 ? Math.PI * (0.5 - 0.5 * Math.cos(c * Math.PI)) : 0;
      page.visible = c < 1;
      sun.position.y = 2.15 + Math.sin(t * 1.3) * 0.18;
      // 老師生動講故事手勢、學生舉手發問與角色演繹
      teacher.armR.rotation.x = -1.2 + Math.sin(t * 3.5) * 0.4;
      reader1.armR.rotation.z = -2.4 - Math.max(0, Math.sin(t * 2.5)) * 0.35;
      reader2.head.rotation.y = Math.sin(t * 2) * 0.22;
      reader3.armL.rotation.z = 2.3 + Math.max(0, Math.cos(t * 2.5)) * 0.35;
      poseCheer(actor, t, 0.7);
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

  // 18. 桌遊社：大富翁策略棋盤周圍，4位同學圍桌擲骰出牌與桌遊老師指導 (5人)
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
    const d1 = mesh(new T.BoxGeometry(0.72, 0.72, 0.72), dm, [0.35, 1.35, 0.25]);
    const d2 = mesh(new T.BoxGeometry(0.72, 0.72, 0.72), dm, [-0.55, 0.56, -0.35], [0.3, 0.6, 0]);
    g.add(d1, d2);
    ['#ef5350', '#42a5f5', '#66bb6a', '#ffca28'].forEach((c, i) => { const p = new T.Group(); p.position.set(-1.1 + i * 0.35, 0.18, 1.1); add(p, con(0.16, 0.42, c, [0, 0.21, 0], null, 10), sph(0.11, c, [0, 0.46, 0])); g.add(p); });

    // 四位圍繞桌遊棋盤對局的同學 + 桌遊指導老師
    const p1 = createKid({ shirt: '#ef5350', pants: '#1d3557', pos: [-1.75, 0.1, 0.2], rotY: Math.PI / 2, scale: 0.86 });
    const p2 = createKid({ shirt: '#42a5f5', pants: '#1d3557', ponytail: true, pos: [1.75, 0.1, 0.2], rotY: -Math.PI / 2, scale: 0.86 });
    const p3 = createKid({ shirt: '#66bb6a', pants: '#1d3557', pos: [-0.55, 0.1, -1.75], rotY: 0, scale: 0.86 });
    const p4 = createKid({ shirt: '#ffa726', pants: '#1d3557', ponytail: true, pos: [0.55, 0.1, 1.75], rotY: Math.PI, scale: 0.86 });
    const teacher = createKid({ shirt: '#0d9488', pants: '#1e293b', teacher: true, pos: [1.45, 0.1, -1.45], rotY: -0.75, scale: 0.88 });
    add(g, p1, p2, p3, p4, teacher);

    return (t) => {
      d1.rotation.set(t * 1.3, t * 0.9, 0);
      d1.position.y = 1.45 + Math.sin(t * 2.2) * 0.28;
      // 輪流伸手出牌與歡呼
      p1.armR.rotation.x = -1.2 + Math.sin(t * 3.5) * 0.45;
      poseCheer(p2, t, 1.1);
      p3.armL.rotation.x = -1.1 + Math.cos(t * 3.5) * 0.38;
      p4.armR.rotation.x = -1.15 + Math.sin(t * 4 + 1) * 0.4;
      teacher.armL.rotation.x = -0.85 + Math.sin(t * 2.8) * 0.25;
    };
  };

  function lathePiece(pts, c) { return mesh(new T.LatheGeometry(pts.map(([x, y]) => new T.Vector2(x, y)), 12), M(c)); }

  // 19. 棋藝社：黑白棋盤四周，兩組小棋士對弈思考落子 + 觀棋覆盤老師 (5人)
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

    // 對弈雙方小棋手 + 另一組研討同學 + 棋藝老師
    const playerWhite = createKid({ shirt: '#00897b', pants: '#1d3557', pos: [-1.78, 0.1, 0.2], rotY: Math.PI / 2, scale: 0.88 });
    const playerBlack = createKid({ shirt: '#5e35b1', pants: '#1d3557', ponytail: true, pos: [1.78, 0.1, 0.2], rotY: -Math.PI / 2, scale: 0.88 });
    const watcher1 = createKid({ shirt: '#f59e0b', pants: '#1d3557', pos: [-0.65, 0.1, 1.75], rotY: Math.PI - 0.2, scale: 0.84 });
    const watcher2 = createKid({ shirt: '#ec4899', pants: '#1d3557', ponytail: true, pos: [0.65, 0.1, 1.75], rotY: Math.PI + 0.2, scale: 0.84 });
    const teacher = createKid({ shirt: '#334155', pants: '#0f172a', teacher: true, pos: [0, 0.1, -1.78], rotY: 0, scale: 0.88 });
    add(g, playerWhite, playerBlack, watcher1, watcher2, teacher);

    return (t) => {
      k.position.y = 0.22 + Math.max(0, Math.sin(t * 1.6)) * 0.38;
      // 雙方交替伸手落子與托腮思考
      playerWhite.armR.rotation.x = -0.8 - Math.max(0, Math.sin(t * 1.6)) * 0.75;
      playerBlack.armR.rotation.x = -0.8 - Math.max(0, -Math.sin(t * 1.6)) * 0.75;
      playerBlack.head.rotation.x = Math.sin(t * 1.6) * 0.14;
      watcher1.head.rotation.y = Math.sin(t * 1.4) * 0.2;
      watcher2.armL.rotation.x = -1.1 + Math.sin(t * 3) * 0.25;
      teacher.head.rotation.x = Math.abs(Math.sin(t * 2)) * 0.15;
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

  // 20. 程式設計社：發光 Scratch 電腦桌前，4位小創客敲擊鍵盤、討論 Debug 與資訊老師指導 (5人)
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

    // 電腦桌前 4 位小創客 + 資訊科技老師
    const coder1 = createKid({ shirt: '#00acc1', pants: '#1d3557', pos: [-0.95, 0.15, 1.2], rotY: Math.PI - 0.15, scale: 0.88 });
    const coder2 = createKid({ shirt: '#ffab19', pants: '#1d3557', ponytail: true, pos: [0.0, 0.15, 1.25], rotY: Math.PI, scale: 0.88 });
    const coder3 = createKid({ shirt: '#ec407a', pants: '#1d3557', ponytail: true, pos: [0.95, 0.15, 1.2], rotY: Math.PI + 0.2, scale: 0.86 });
    const coder4 = createKid({ shirt: '#7e57c2', pants: '#1d3557', pos: [-1.55, 0.15, 0.35], rotY: 1.8, scale: 0.84 });
    const teacher = createKid({ shirt: '#0284c7', pants: '#1e293b', teacher: true, pos: [1.6, 0.15, 0.25], rotY: -1.8, scale: 0.88 });
    add(g, coder1, coder2, coder3, coder4, teacher);

    return (t) => {
      blocks.forEach((b, i) => {
        b.position.y = 3.5 + Math.sin(t * 1.5 + i * 1.2) * 0.25;
        b.rotation.z = Math.sin(t + i) * 0.15;
      });
      coder1.armL.rotation.x = -1.35 + Math.sin(t * 10) * 0.18;
      coder1.armR.rotation.x = -1.35 + Math.cos(t * 10) * 0.18;
      coder2.armL.rotation.x = -1.35 + Math.cos(t * 9) * 0.18;
      coder2.armR.rotation.x = -1.35 + Math.sin(t * 9) * 0.18;
      poseCheer(coder3, t, 0.4);
      coder4.armR.rotation.x = -1.5 + Math.sin(t * 3.5) * 0.25;
      teacher.armL.rotation.x = -1.4 + Math.sin(t * 3) * 0.25;
    };
  };

  window.FX3D = { T, rnd, R, hash3, M, Glow, glowMats, vcMat, mesh, box, cyl, sph, con, tor, add, Merger, canvasTex, roundRect, makeLabel, figure, createKid, poseWalk, poseCheer, musicNote, butterfly, PROPS: P, FONT };
})();
