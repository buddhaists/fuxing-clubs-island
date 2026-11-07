/* =========================================================
   屏東縣復興國民小學：「復興國小之福星社團翱翔島」
   3D 天空之城浮空島微縮模型引擎 (world.js)
   設計概念融合：
   - 馬鳴國小社團群島 (mmps-clubs-island) 天空之城浮空島、飛行石核心、雲海空橋、RPG 漫遊
   - 南大附中探索群島 (tntcshisland) 八角形手作微縮模型、移軸景深、動態師生小人
   ========================================================= */

(function () {
  const {
    T,
    M,
    Glow,
    glowMats,
    vcMat,
    mesh,
    box,
    cyl,
    sph,
    con,
    tor,
    add,
    makeLabel,
    createKid,
    poseWalk,
    poseCheer,
    PROPS
  } = window.FX3D;

  const HUB_RADIUS = 9.2;
  const CAT_RADIUS = 10.2;
  const ISLAND_HEIGHT = 1.6;

  // 建立八角形 Shape 與 ExtrudeGeometry（致敬南大附中與馬鳴群島的手作切角美學）
  function makeOctagonShape(radius) {
    const shape = new T.Shape();
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + (i * Math.PI) / 4;
      const x = Math.cos(a) * radius;
      const y = Math.sin(a) * radius;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    shape.closePath();
    return shape;
  }

  function makeOctagonExtrude(radius, depth, bevel) {
    const geo = new T.ExtrudeGeometry(makeOctagonShape(radius), {
      depth: depth,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: 1
    });
    geo.rotateX(-Math.PI / 2);
    return geo;
  }

  // 建立文字招牌貼圖
  function makeSignTexture(text, bg = '#3b2f2a', fg = '#fffaf2', border = '#e39b2d') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = border;
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, 496, 112);
    ctx.fillStyle = fg;
    ctx.font = '900 46px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 66);
    const tex = new T.CanvasTexture(canvas);
    tex.encoding = T.sRGBEncoding;
    tex.needsUpdate = true;
    return tex;
  }

  // 建立手作風微縮樹木
  function createTree(pos, scale = 0.85, kind = 'round', color = '#5aa84c') {
    const g = new T.Group();
    g.position.set(pos[0], pos[1], pos[2]);
    g.scale.setScalar(scale);
    g.add(cyl(0.09, 0.14, 0.6, '#8d6e4f', [0, 0.3, 0], null, 8));
    if (kind === 'pine') {
      g.add(
        cyl(0.02, 0.55, 0.7, '#4c9141', [0, 0.72, 0], null, 8),
        cyl(0.02, 0.44, 0.6, '#58a34c', [0, 1.08, 0], null, 8),
        cyl(0.01, 0.32, 0.5, '#67b35a', [0, 1.4, 0], null, 8)
      );
    } else {
      g.add(
        sph(0.48, color, [0, 0.82, 0], 1, 1),
        sph(0.34, '#72be5b', [0.25, 0.7, 0.15], 1, 1)
      );
    }
    return g;
  }

  // 建立微縮主題建築（含發光窗戶、斜屋頂、立體招牌）
  function createMiniBuilding(opts = {}) {
    const {
      w = 3.2,
      d = 1.6,
      floors = 2,
      wall = '#fff6e8',
      trim = '#d9785a',
      roof = '#c86446',
      sign = '復興學園',
      pos = [0, 0, 0],
      rotY = 0,
      windowMat
    } = opts;

    const g = new T.Group();
    g.position.set(pos[0], pos[1], pos[2]);
    g.rotation.y = rotY;
    const h = floors * 0.72;

    // 主牆體與腰線
    g.add(box(w, h, d, wall, [0, h / 2, 0]));
    g.add(box(w + 0.1, 0.12, d + 0.1, trim, [0, 0.06, 0]));
    if (floors > 1) {
      g.add(box(w + 0.06, 0.07, d + 0.06, trim, [0, h * 0.5, 0]));
    }
    // 屋簷與斜屋頂
    g.add(box(w + 0.22, 0.1, d + 0.22, roof, [0, h + 0.05, 0]));
    g.add(cyl(0.02, (d + 0.2) * 0.68, w + 0.1, roof, [0, h + 0.34, 0], [0, 0, Math.PI / 2], 4));

    // 窗戶（夜間自動發光）
    const cols = Math.max(2, Math.floor(w / 0.62));
    for (let f = 0; f < floors; f++) {
      for (let c = 0; c < cols; c++) {
        if (f === 0 && c === Math.floor(cols / 2)) continue;
        const wx = -((cols - 1) * 0.56) / 2 + c * 0.56;
        const wy = 0.38 + f * 0.7;
        const winMesh = mesh(new T.BoxGeometry(0.32, 0.3, 0.04), windowMat, [wx, wy, d / 2 + 0.01]);
        g.add(winMesh);
      }
    }

    // 大門與雨遮
    g.add(box(0.42, 0.52, 0.05, '#7f5539', [0, 0.26, d / 2 + 0.01]));
    g.add(box(0.64, 0.06, 0.28, trim, [0, 0.56, d / 2 + 0.12]));

    // 屋頂招牌
    if (sign) {
      const signTex = makeSignTexture(sign, '#3b2f2a', '#fffaf2', trim);
      const signMat = new T.MeshBasicMaterial({ map: signTex });
      const signMesh = mesh(new T.BoxGeometry(1.9, 0.46, 0.08), signMat, [0, h + 0.52, d / 2 - 0.1]);
      g.add(signMesh);
    }

    return g;
  }

  // 建立尋寶彩蛋吉祥物：「復興閃耀福星精靈 (Fuxing Lucky Star Mascot)」
  function createMascotStar(islandId, islandName, pos, animCallbacks, interactiveMeshes) {
    const g = new T.Group();
    g.position.set(pos[0], pos[1], pos[2]);
    g.scale.setScalar(0.95);

    const starMat = Glow('#ffd166', 0.45, 1.5);
    // 星形身體（兩個交錯八面體與可愛小臉、小翅膀）
    const core1 = mesh(new T.OctahedronGeometry(0.32, 0), starMat, [0, 0.42, 0]);
    const core2 = mesh(new T.OctahedronGeometry(0.3, 0), starMat, [0, 0.42, 0], [0, Math.PI / 4, Math.PI / 4]);
    // 小皇冠與白色小翅膀
    const crown = cyl(0.12, 0.08, 0.12, '#ff6b6b', [0, 0.74, 0], null, 6);
    const wingL = box(0.22, 0.04, 0.14, '#ffffff', [-0.28, 0.44, 0], [0, 0, 0.35]);
    const wingR = box(0.22, 0.04, 0.14, '#ffffff', [0.28, 0.44, 0], [0, 0, -0.35]);
    // 底座光圈
    const pedestal = cyl(0.22, 0.26, 0.08, '#e39b2d', [0, 0.04, 0], null, 12);

    g.add(core1, core2, crown, wingL, wingR, pedestal);

    const hitSphere = new T.Mesh(
      new T.SphereGeometry(0.65, 8, 8),
      new T.MeshBasicMaterial({ visible: false })
    );
    hitSphere.position.set(0, 0.42, 0);
    hitSphere.userData = { type: 'mascot', islandId, islandName, group: g, jumpUntil: 0 };
    g.add(hitSphere);
    interactiveMeshes.push(hitSphere);

    animCallbacks.push((t) => {
      const now = performance.now();
      if (now < hitSphere.userData.jumpUntil) {
        const p = (hitSphere.userData.jumpUntil - now) / 900;
        g.position.y = pos[1] + Math.sin(p * Math.PI * 2) * 0.9;
        core1.rotation.y += 0.22;
        core2.rotation.y += 0.22;
      } else {
        g.position.y = pos[1] + Math.abs(Math.sin(t * 2.5 + pos[0])) * 0.12;
        core1.rotation.y = t * 1.2 + pos[2];
        core2.rotation.y = t * 1.2 + pos[2] + Math.PI / 4;
      }
    });

    return g;
  }

  class IslandWorld {
    constructor(containerEl, labelLayerEl, callbacks = {}) {
      this.container = containerEl;
      this.labelLayer = labelLayerEl;
      this.callbacks = callbacks;

      this.scene = null;
      this.camera = null;
      this.renderer = null;

      this.animCallbacks = [];
      this.interactiveMeshes = [];
      this.islandGroups = {};   // catId -> { root, floatGroup, crystalCore, liveRing, basePos }
      this.clubGroups = {};     // clubId -> { group, pad, rim, hitBox, liveRing, club, cat }
      this.labelEls = {};       // catId -> DOM button
      this.clubLabelEls = {};   // clubId -> DOM button
      this.islandBubbleEls = {}; // catId -> { el, quotes, cat }
      this.clubBubbleEls = {};   // clubId -> { el, quotes, club, cat, idx }
      this.cheerUntil = {};      // id -> timestamp
      this.cheerStart = {};      // id -> start timestamp
      this.linkLabels = [];

      this.selectedCatId = null;
      this.selectedClubId = null;
      this.hoveredId = null;

      this.animateEnabled = true;
      this.showLabels = true;
      this.showBubbles = true;
      this.showLinks = false;
      this.currentGradeFilter = 'all';
      this.activeSlotId = 'all';
      this.currentTimeTheme = 'day';
      this.isDay = true;
      this.manuallyAwakenedClubs = new Set();

      // 平滑阻尼相機狀態 (Orbit + Pan + Zoom + FlyTo)
      this.camState = {
        theta: 0.28,
        phi: 0.94,
        radius: 56,
        target: new T.Vector3(0, 1.2, 0),
        goalTheta: 0.28,
        goalPhi: 0.94,
        goalRadius: 56,
        goalTarget: new T.Vector3(0, 1.2, 0),
        dragging: false,
        panning: false,
        lastX: 0,
        lastY: 0,
        downX: 0,
        downY: 0
      };

      // RPG 漫遊小學生狀態
      this.roamState = {
        active: false,
        x: 0,
        z: 3.5,
        y: ISLAND_HEIGHT + 0.8 + 0.1,
        vy: 0,
        onGround: true,
        yaw: 0,
        runAnim: 0,
        keys: { forward: false, backward: false, left: false, right: false, jump: false, sprint: false },
        nearTarget: { type: 'category', id: 'hub' }
      };

      this.init();
    }

    init() {
      const w = this.container.clientWidth || window.innerWidth;
      const h = this.container.clientHeight || window.innerHeight;

      this.scene = new T.Scene();
      this.scene.background = new T.Color('#bfe3f2');
      this.scene.fog = new T.FogExp2('#cde8f2', 0.0058);

      this.camera = new T.PerspectiveCamera(34, w / h, 0.5, 480);
      this.camera.position.set(0, 38, 56);

      this.renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      this.renderer.setSize(w, h);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.85));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = T.PCFSoftShadowMap;
      this.renderer.outputEncoding = T.sRGBEncoding;
      this.renderer.toneMapping = T.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.04;
      this.container.innerHTML = '';
      this.container.appendChild(this.renderer.domElement);

      // 夜間窗戶發光共用材質
      this.windowMat = new T.MeshStandardMaterial({
        color: new T.Color('#90e0ef'),
        emissive: new T.Color('#ffd166'),
        emissiveIntensity: 0.1,
        roughness: 0.25
      });

      this.setupLights();
      this.buildWorld();
      this.setupRoamPlayer();
      this.bindEvents();

      this.lastStamp = performance.now();
      this.clockTime = 0;
      this.animate(this.lastStamp);
    }

    setupLights() {
      this.hemiLight = new T.HemisphereLight('#cfe8ff', '#b98e5a', 1.12);
      this.scene.add(this.hemiLight);

      this.dirLight = new T.DirectionalLight('#fff1d6', 1.45);
      this.dirLight.position.set(36, 58, 32);
      this.dirLight.castShadow = true;
      this.dirLight.shadow.mapSize.width = 2048;
      this.dirLight.shadow.mapSize.height = 2048;
      this.dirLight.shadow.camera.near = 6;
      this.dirLight.shadow.camera.far = 160;
      const d = 42;
      this.dirLight.shadow.camera.left = -d;
      this.dirLight.shadow.camera.right = d;
      this.dirLight.shadow.camera.top = d;
      this.dirLight.shadow.camera.bottom = -d;
      this.dirLight.shadow.bias = -0.0005;
      this.scene.add(this.dirLight);
    }

    /* 依據時段控制上課師生與動態課堂道具之可見性：白天上課全員呈現；傍晚與夜間放學沉靜隱藏，但若點擊社團則即時喚醒 */
    updatePeopleVisibility(isDay) {
      this.isDay = !!isDay;
      if (this.scene) {
        this.scene.traverse((child) => {
          if (child.userData && (child.userData.isPerson || child.userData.isClassProp)) {
            const clubId = child.userData.clubId;
            const isAwakened = clubId && this.manuallyAwakenedClubs && this.manuallyAwakenedClubs.has(clubId);
            child.visible = this.isDay || !!isAwakened;
          }
        });
      }
      // 傍晚與夜間非上課時段，同步隱藏未手動喚醒社團的對話氣泡
      if (!this.isDay) {
        Object.values(this.islandBubbleEls || {}).forEach((b) => {
          if (b && b.el) b.el.style.display = 'none';
        });
        Object.keys(this.clubBubbleEls || {}).forEach((cId) => {
          const b = this.clubBubbleEls[cId];
          if (b && b.el && (!this.manuallyAwakenedClubs || !this.manuallyAwakenedClubs.has(cId))) {
            b.el.style.display = 'none';
          }
        });
      }
    }

    /* 手動召喚／喚醒特定社團的上課師生與動態課堂道具（非上課時間僅顯示最新點擊的社團，上一個社團消失） */
    wakeClub(clubId, force = true) {
      if (!this.isDay) {
        // 非社團上課時間：點擊下一個社團後，上一個社團的師生消失不見，同時間只顯示最新點擊的社團
        const previousClubs = Array.from(this.manuallyAwakenedClubs);
        this.manuallyAwakenedClubs.clear();

        if (force && clubId) {
          this.manuallyAwakenedClubs.add(clubId);
        }

        // 將先前被喚醒的社團師生與課堂道具立即隱藏消失，並恢復平穩狀態
        previousClubs.forEach((prevId) => {
          if (prevId !== clubId) {
            delete this.cheerUntil[prevId];
            delete this.cheerStart[prevId];
            const prevCg = this.clubGroups[prevId];
            if (prevCg && prevCg.group) {
              const baseFilterY = prevCg.baseFilterY !== undefined ? prevCg.baseFilterY : 0.45;
              prevCg.group.position.y = baseFilterY;
              prevCg.group.traverse((child) => {
                if (child.userData && (child.userData.isPerson || child.userData.isClassProp)) {
                  child.visible = false;
                }
              });
            }
            const prevCb = this.clubBubbleEls[prevId];
            if (prevCb && prevCb.el) prevCb.el.style.display = 'none';
          }
        });
      } else {
        // 白天正常上課時段
        if (force && clubId) {
          this.manuallyAwakenedClubs.add(clubId);
        } else if (clubId) {
          this.manuallyAwakenedClubs.delete(clubId);
        }
      }

      if (clubId) {
        const cg = this.clubGroups[clubId];
        if (cg && cg.group) {
          const shouldShow = this.isDay || this.manuallyAwakenedClubs.has(clubId);
          cg.group.traverse((child) => {
            if (child.userData && (child.userData.isPerson || child.userData.isClassProp)) {
              child.visible = shouldShow;
            }
          });
        }
        const cb = this.clubBubbleEls[clubId];
        if (cb && cb.el && !this.isDay && !this.manuallyAwakenedClubs.has(clubId)) {
          cb.el.style.display = 'none';
        }
      }
    }

    setTimeTheme(theme) {
      this.currentTimeTheme = theme;
      const isDay = theme === 'day';
      // 當手動切換至夜間或傍晚時，清空手動喚醒記錄，回歸靜謐夜間校園
      if (!isDay && this.isDay) {
        this.manuallyAwakenedClubs.clear();
      }
      this.updatePeopleVisibility(isDay);

      const themes = {
        day: {
          bg: '#bfe3f2',
          fog: '#cde8f2',
          sun: '#fff1d6',
          sunI: 1.45,
          hemiSky: '#cfe8ff',
          hemiGround: '#b98e5a',
          winEmissive: 0.08,
          glowScale: 1
        },
        dusk: {
          bg: '#f4c7a8',
          fog: '#f1cdb4',
          sun: '#ffb27a',
          sunI: 1.28,
          hemiSky: '#f6c3a4',
          hemiGround: '#7a5a48',
          winEmissive: 0.5,
          glowScale: 2.2
        },
        night: {
          bg: '#1b2644',
          fog: '#223056',
          sun: '#9ab4ff',
          sunI: 0.65,
          hemiSky: '#4f62a3',
          hemiGround: '#252b48',
          winEmissive: 0.98,
          glowScale: 4.5
        }
      };
      const cfg = themes[theme] || themes.day;
      this.scene.background.set(cfg.bg);
      this.scene.fog.color.set(cfg.fog);
      this.dirLight.color.set(cfg.sun);
      this.dirLight.intensity = cfg.sunI;
      this.hemiLight.color.set(cfg.hemiSky);
      this.hemiLight.groundColor.set(cfg.hemiGround);
      this.windowMat.emissiveIntensity = cfg.winEmissive;
      document.body.style.background = cfg.bg;

      glowMats.forEach((m) => {
        if (m.userData && m.userData.glow) {
          m.emissiveIntensity =
            theme === 'night'
              ? m.userData.glow[1]
              : theme === 'dusk'
              ? m.userData.glow[0] * 2
              : m.userData.glow[0];
        }
      });
    }

    /* ---------------- 建造八角形天空之城浮空島底座 ---------------- */
    createSkyIslandMesh(radius, islandCfg) {
      const floatGroup = new T.Group();

      const grassGeo = makeOctagonExtrude(radius, 0.28, 0.12);
      const stripeGeo = makeOctagonExtrude(radius * 0.99, 0.24, 0.08);
      const soilGeo = makeOctagonExtrude(radius * 0.96, 1.15, 0.14);

      const grassMesh = mesh(grassGeo, M(islandCfg.grass || '#74bd65'), [0, ISLAND_HEIGHT - 0.28, 0]);
      const stripeMesh = mesh(stripeGeo, M(islandCfg.color), [0, ISLAND_HEIGHT - 0.64, 0]);
      const soilMesh = mesh(soilGeo, M(islandCfg.rock || '#9e7652'), [0, ISLAND_HEIGHT - 1.65, 0]);
      floatGroup.add(grassMesh, stripeMesh, soilMesh);

      // 錐形多層浮空岩層底座 + 古代金紋能量環
      floatGroup.add(cyl(radius * 0.78, radius * 0.52, 1.8, '#8d6e53', [0, -0.75, 0], null, 8));
      floatGroup.add(
        cyl(radius * 0.55, radius * 0.56, 0.18, '#e39b2d', [0, -1.0, 0], null, 8, {
          metalness: 0.4,
          roughness: 0.35
        })
      );
      floatGroup.add(cyl(radius * 0.5, radius * 0.22, 1.75, '#745840', [0, -2.35, 0], null, 7));

      // 底部發光飛行石核心 (Levitation Crystal Core)
      const crystalCore = mesh(
        new T.OctahedronGeometry(islandCfg.id === 'hub' ? 1.15 : 0.9, 0),
        Glow(islandCfg.crystal || '#38bdf8', 0.75, 1.8),
        [0, -3.65, 0]
      );
      floatGroup.add(crystalCore);

      // 島底專屬托島雲朵墊
      const underCloud = new T.Group();
      underCloud.position.set(0, -2.6, 0);
      const cr = radius * 0.56;
      [
        [cr, 0, -0.4, 1.2],
        [-cr, 0.15, 0.5, 1.15],
        [0.5, -0.2, cr, 1.1],
        [-0.6, -0.1, -cr, 1.1]
      ].forEach(([cx, cy, cz, r]) => {
        const cm = sph(r, M('#ffffff', { transparent: true, opacity: 0.88, roughness: 1 }), [cx, cy, cz], 1, 1);
        underCloud.add(cm);
      });
      floatGroup.add(underCloud);

      return { floatGroup, crystalCore };
    }

    buildWorld() {
      const { CATEGORIES, CLUBS, LINKS } = window.FX_DATA;

      // 1. 建立 6 座主要浮空島（中央福星主島 + 5 座領域群島）
      CATEGORIES.forEach((cat, idx) => {
        const radius = cat.id === 'hub' ? HUB_RADIUS : CAT_RADIUS;
        const root = new T.Group();
        root.position.set(cat.pos[0], cat.pos[1], cat.pos[2]);
        this.scene.add(root);

        const { floatGroup, crystalCore } = this.createSkyIslandMesh(radius, cat);
        root.add(floatGroup);

        const contentGroup = new T.Group();
        contentGroup.position.y = ISLAND_HEIGHT + 0.08;
        floatGroup.add(contentGroup);

        // 邊緣綠樹點綴
        for (let a = 0; a < 10; a++) {
          const ang = (a / 10) * Math.PI * 2 + 0.3;
          const r = radius - 0.85;
          contentGroup.add(
            createTree(
              [Math.cos(ang) * r, 0, Math.sin(ang) * r],
              0.7 + (a % 3) * 0.1,
              a % 3 === 0 ? 'pine' : 'round'
            )
          );
        }

        // 若為中央福星主島，建造復興教學大樓、鐘樓、噴泉與校慶拱門
        if (cat.id === 'hub') {
          this.PopulateHubIsland(contentGroup);
        } else {
          // 5 大領域島：中央建造主題專科館 + 環繞擺設該類社團微縮展台
          this.PopulateCategoryIsland(cat, contentGroup);
        }

        // 放置尋寶吉祥物「復興福星精靈」
        const starAng = idx * 1.2 + 0.5;
        const starR = radius * 0.42;
        const mascot = createMascotStar(
          cat.id,
          cat.name,
          [Math.cos(starAng) * starR, 0, Math.sin(starAng) * starR],
          this.animCallbacks,
          this.interactiveMeshes
        );
        contentGroup.add(mascot);

        // 島嶼動態 LIVE 光環
        const liveRing = mesh(
          new T.RingGeometry(radius - 0.15, radius + 0.25, 32),
          new T.MeshBasicMaterial({
            color: new T.Color(cat.color),
            side: T.DoubleSide,
            transparent: true,
            opacity: 0.78
          }),
          [0, ISLAND_HEIGHT + 0.12, 0],
          [-Math.PI / 2, 0, 0]
        );
        floatGroup.add(liveRing);

        // 點擊判定柱
        const hitCyl = mesh(
          new T.CylinderGeometry(radius * 0.65, radius * 0.55, 3.6, 8),
          new T.MeshBasicMaterial({ visible: false }),
          [0, 0.8, 0]
        );
        hitCyl.userData = { type: 'category', id: cat.id, data: cat };
        floatGroup.add(hitCyl);
        this.interactiveMeshes.push(hitCyl);

        // HTML 3D 浮動島嶼名牌
        const el = document.createElement('button');
        el.className = 'nameplate island-plate';
        el.style.setProperty('--c', cat.color);
        el.innerHTML = `
          <span class="dot"></span>
          <span>${cat.emoji} ${cat.name}</span>
          <em>${cat.badge}</em>
          <span class="live-pill" style="display:none">LIVE</span>
        `;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.callbacks.onSelectCategory) this.callbacks.onSelectCategory(cat.id);
        });
        el.addEventListener('mouseenter', () => this.setHovered(cat.id));
        el.addEventListener('mouseleave', () => this.setHovered(null));
        this.labelLayer.appendChild(el);
        this.labelEls[cat.id] = el;

        // 島嶼上空「師生現場對話實況氣泡」
        const bQuotes = cat.bubbles && cat.bubbles.length ? cat.bubbles : [`🌟 ${cat.name}社團熱烈進行中！`];
        const bEl = document.createElement('div');
        bEl.className = 'live-bubble island-bubble';
        bEl.style.setProperty('--c', cat.color);
        bEl.innerHTML = `<span class="lb-dot"></span><span class="lb-text">${bQuotes[0]}</span>`;
        bEl.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.callbacks.onSelectCategory) this.callbacks.onSelectCategory(cat.id);
        });
        this.labelLayer.appendChild(bEl);
        this.islandBubbleEls[cat.id] = { el: bEl, quotes: bQuotes, cat, idx };

        this.islandGroups[cat.id] = {
          root,
          floatGroup,
          crystalCore,
          liveRing,
          basePos: cat.pos,
          radius,
          hoverLift: 0,
          phase: idx * 0.9
        };
      });

      // 2. 建造連接中央主島與 5 大群島的「雲海木棧拱橋」与橋上奔走小學生
      this.buildSkyBridges();

      // 3. 建造跨域串聯金色光弧
      this.buildCrossLinks(LINKS);

      // 4. 建造多層立體雲海、天空之城飛空艇與彩色熱氣球
      this.buildAtmosphere();
    }

    /* 中央主島專屬地標：復興大樓、榮耀鐘樓、噴泉廣場與廣場師生實況 */
    PopulateHubIsland(contentGroup) {
      // 復興主教學樓
      contentGroup.add(
        createMiniBuilding({
          w: 4.4,
          d: 1.8,
          floors: 2,
          wall: '#fff8ec',
          trim: '#e07a5f',
          roof: '#d65a31',
          sign: '屏東縣復興國小',
          pos: [0, 0, -3.2],
          windowMat: this.windowMat
        })
      );

      // 復興榮耀鐘樓
      const tower = new T.Group();
      tower.position.set(-3.4, 0, -1.8);
      tower.add(
        box(1.5, 3.2, 1.5, '#f3ece2', [0, 1.6, 0]),
        con(1.25, 1.6, '#e65142', [0, 4.0, 0], [0, Math.PI / 4, 0], 4),
        mesh(new T.CircleGeometry(0.42, 16), M('#ffffff'), [0, 2.4, 0.77]),
        cyl(0.03, 0.03, 0.9, '#e39b2d', [0, 5.1, 0])
      );
      const flag = box(0.65, 0.35, 0.04, '#ffd166', [0.32, 5.25, 0]);
      tower.add(flag);
      contentGroup.add(tower);

      // 中央飛行石噴泉廣場
      const pathRing = mesh(
        new T.RingGeometry(2.4, 3.6, 24),
        M('#e9d8be', { side: T.DoubleSide }),
        [0, 0.03, 1.2],
        [-Math.PI / 2, 0, 0]
      );
      const fRim = cyl(1.8, 1.95, 0.38, '#ffffff', [0, 0.19, 1.2], null, 18);
      const fWater = mesh(
        new T.CircleGeometry(1.7, 18),
        Glow('#38bdf8', 0.4, 1.2),
        [0, 0.39, 1.2],
        [-Math.PI / 2, 0, 0]
      );
      const fStar = mesh(new T.OctahedronGeometry(0.55, 0), Glow('#ffd166', 0.6, 1.6), [0, 1.35, 1.2]);
      contentGroup.add(pathRing, fRim, fWater, fStar);

      // 少棒與合唱榮耀金盃雕塑
      const trophy = new T.Group();
      trophy.position.set(3.4, 0, -1.5);
      trophy.add(
        box(1.1, 0.4, 1.1, '#8d6e63', [0, 0.2, 0]),
        cyl(0.18, 0.35, 0.7, '#ffd166', [0, 0.75, 0], null, 12),
        sph(0.45, Glow('#ffd166', 0.35, 1.2), [0, 1.35, 0], 1, 1)
      );
      contentGroup.add(trophy);

      // 廣場木質長椅與歡迎告示牌
      contentGroup.add(
        box(1.1, 0.14, 0.32, '#8d6e4f', [-2.2, 0.14, 0.1], [0, 0.4, 0]),
        box(1.1, 0.14, 0.32, '#8d6e4f', [2.2, 0.14, 0.1], [0, -0.4, 0])
      );

      // 中央廣場師生活動實況：主任／老師在教學大樓前揮手引導，各領域社團代表學生在噴泉、榮耀金盃與草坪熱烈練習交流
      const teacherHub = createKid({
        shirt: '#e63946',
        pants: '#1d3557',
        hat: '#ffd166',
        scale: 0.9,
        pos: [0, 0, -1.95],
        rotY: 0,
        item: 'folder'
      });
      const kidFountain1 = createKid({
        shirt: '#3a86ff',
        pants: '#1d3557',
        backpack: '#ffd166',
        scale: 0.78,
        pos: [-1.55, 0, 2.55],
        rotY: 2.3
      });
      const kidFountain2 = createKid({
        shirt: '#ffbe0b',
        skirt: '#ec4899',
        hairStyle: 'ponytail',
        scale: 0.78,
        pos: [1.55, 0, 2.45],
        rotY: -2.3,
        item: 'pom'
      });
      // 金盃旁：少棒代表揮棒練習 + 合唱團代表拿歌譜練唱
      const kidTrophy = createKid({
        shirt: '#ffffff',
        vest: '#e63946',
        pants: '#ffffff',
        hat: '#1d3557',
        scale: 0.8,
        pos: [2.5, 0, -0.85],
        rotY: -0.6,
        item: 'bat'
      });
      const kidChoirHub = createKid({
        shirt: '#ffffff',
        skirt: '#be123c',
        hairStyle: 'ponytail',
        scale: 0.78,
        pos: [3.55, 0, -0.45],
        rotY: -0.9,
        item: 'book'
      });
      // 鐘樓草坪旁：熱舞社與烏克麗麗／陶笛學生對練
      const kidDancerHub = createKid({
        shirt: '#f97316',
        pants: '#1e293b',
        backwardsHat: '#ef4444',
        scale: 0.8,
        pos: [-2.7, 0, -0.4],
        rotY: 0.65
      });
      const kidMusicHub = createKid({
        shirt: '#ec4899',
        pants: '#1e293b',
        hat: '#ffd166',
        scale: 0.78,
        pos: [-3.55, 0, 0.35],
        rotY: 0.95,
        item: 'ocarina'
      });
      const runner1 = createKid({
        shirt: '#10b981',
        pants: '#1e293b',
        hat: '#ffd166',
        scale: 0.78,
        pos: [3.0, 0, 1.2]
      });
      const runner2 = createKid({
        shirt: '#8b5cf6',
        pants: '#1e293b',
        backpack: '#f97316',
        scale: 0.76,
        pos: [-3.0, 0, 1.2]
      });
      contentGroup.add(
        teacherHub.g,
        kidFountain1.g,
        kidFountain2.g,
        kidTrophy.g,
        kidChoirHub.g,
        kidDancerHub.g,
        kidMusicHub.g,
        runner1.g,
        runner2.g
      );

      this.animCallbacks.push((t) => {
        fStar.rotation.y = t * 1.5;
        fStar.position.y = 1.35 + Math.sin(t * 2.2) * 0.18;
        flag.rotation.y = Math.sin(t * 3) * 0.2;

        // 老師揮手歡迎、各社團代表練習與繞行噴泉步道
        teacherHub.armR.rotation.z = -2.2 + Math.sin(t * 5) * 0.35;
        teacherHub.head.rotation.y = Math.sin(t * 1.8) * 0.25;
        poseCheer(kidFountain1, t, 0.4);
        poseCheer(kidFountain2, t, 1.9);
        kidTrophy.armR.rotation.x = -0.85 + Math.sin(t * 4.5) * 0.55;
        kidTrophy.body.rotation.y = Math.sin(t * 4.5) * 0.25;
        kidChoirHub.armR.rotation.x = -0.7;
        kidChoirHub.armL.rotation.x = -0.7;
        kidChoirHub.body.rotation.z = Math.sin(t * 3.2) * 0.1;

        // 鐘樓旁街舞與陶笛合奏
        kidDancerHub.g.position.y = Math.abs(Math.sin(t * 6.5)) * 0.12;
        kidDancerHub.armL.rotation.z = 1.8 + Math.sin(t * 6.5) * 0.55;
        kidDancerHub.armR.rotation.z = -1.8 + Math.cos(t * 6.5) * 0.55;
        kidMusicHub.armR.rotation.x = -1.15;
        kidMusicHub.armL.rotation.x = -1.05;
        kidMusicHub.body.rotation.z = Math.sin(t * 3.5) * 0.08;

        [runner1, runner2].forEach((rk, i) => {
          const ang = t * 0.75 + i * Math.PI;
          const rx = Math.cos(ang) * 3.05;
          const rz = 1.2 + Math.sin(ang) * 3.05;
          rk.g.position.set(rx, rk.baseY, rz);
          rk.g.rotation.y = -ang + Math.PI;
          poseWalk(rk, t + i, 8, 0.72);
        });
      });
    }

    /* 各領域島嶼中央草坪與廣場：依 5 大領域特色配置戶外練習中的學生與道具 */
    populateIslandLawnActivity(cat, contentGroup) {
      if (cat.id === 'ball') {
        // 球類競技島草坪：右側 2 位棒球社員傳接球 (Catch Ball)，左側 2 位足球／籃球社員繞角錐盤球對練
        const catcherA = createKid({
          shirt: '#ffffff',
          vest: '#ea580c',
          pants: '#ffffff',
          hat: '#1e3a8a',
          scale: 0.82,
          pos: [1.75, 0, 1.55],
          rotY: -1.1,
          heldItemL: cyl(0.11, 0.11, 0.07, '#92400e')
        });
        const catcherB = createKid({
          shirt: '#ffffff',
          vest: '#ea580c',
          pants: '#ffffff',
          hat: '#1e3a8a',
          scale: 0.82,
          pos: [3.2, 0, 0.75],
          rotY: 2.04,
          heldItemL: cyl(0.11, 0.11, 0.07, '#92400e')
        });
        const catchBall = sph(0.08, '#ffffff', [2.45, 0.75, 1.15]);

        const cone1 = con(0.12, 0.28, '#f97316', [-1.85, 0.14, 1.25]);
        const cone2 = con(0.12, 0.28, '#f97316', [-2.85, 0.14, 0.75]);
        const dribbler = createKid({
          shirt: '#22c55e',
          pants: '#1e293b',
          scale: 0.8,
          pos: [-2.35, 0, 1.55],
          rotY: 0.4
        });
        const defender = createKid({
          shirt: '#fbbf24',
          pants: '#1e293b',
          scale: 0.8,
          pos: [-2.35, 0, 0.35],
          rotY: 0
        });
        const lawnBall = sph(0.13, '#ffffff', [-2.35, 0.14, 1.0]);
        [catchBall, cone1, cone2, lawnBall].forEach((p) => {
          p.userData = { isClassProp: true };
        });

        contentGroup.add(
          catcherA.g,
          catcherB.g,
          catchBall,
          cone1,
          cone2,
          dribbler.g,
          defender.g,
          lawnBall
        );

        this.animCallbacks.push((t) => {
          const u = (Math.sin(t * 3.8) + 1) * 0.5;
          catchBall.position.set(
            1.75 + (3.2 - 1.75) * u,
            0.58 + Math.sin(u * Math.PI) * 0.55,
            1.55 + (0.75 - 1.55) * u
          );
          catcherA.armR.rotation.x = -0.6 - Math.max(0, Math.cos(t * 3.8)) * 0.9;
          catcherB.armR.rotation.x = -0.6 - Math.max(0, -Math.cos(t * 3.8)) * 0.9;

          poseWalk(dribbler, t * 1.1, 8, 0.65);
          dribbler.g.position.x = -2.35 + Math.sin(t * 2.6) * 0.48;
          defender.g.position.x = -2.35 - Math.sin(t * 2.6) * 0.38;
          poseWalk(defender, t * 1.1 + 1, 7, 0.5);
          lawnBall.position.x = -2.35 + Math.sin(t * 5.2) * 0.45;
          lawnBall.position.z = 0.95 + Math.cos(t * 2.6) * 0.35;
        });
      } else if (cat.id === 'move') {
        // 競速武道島草坪：2 位直排輪社員繞內圈滑行 + 右側 2 位柔道／田徑社員做開合跳與暖身操
        const skater1 = createKid({
          shirt: '#06b6d4',
          pants: '#0f172a',
          hat: '#f43f5e',
          skates: '#f43f5e',
          scale: 0.82,
          pos: [2.2, 0, 1.2]
        });
        const skater2 = createKid({
          shirt: '#eab308',
          pants: '#0f172a',
          hat: '#3b82f6',
          skates: '#3b82f6',
          scale: 0.8,
          pos: [-2.2, 0, 1.2]
        });
        const warmMat = box(1.5, 0.05, 1.1, '#fde047', [2.45, 0.03, -0.35]);
        warmMat.userData = { isClassProp: true };
        const warmKid1 = createKid({
          shirt: '#ffffff',
          pants: '#ffffff',
          belt: '#1e293b',
          scale: 0.8,
          pos: [2.1, 0.05, -0.35],
          rotY: -0.4
        });
        const warmKid2 = createKid({
          shirt: '#10b981',
          pants: '#1e293b',
          scale: 0.8,
          pos: [2.8, 0.05, -0.35],
          rotY: -0.4
        });
        contentGroup.add(skater1.g, skater2.g, warmMat, warmKid1.g, warmKid2.g);

        this.animCallbacks.push((t) => {
          [skater1, skater2].forEach((sk, idx) => {
            const ang = t * 1.35 + idx * Math.PI;
            const rx = Math.cos(ang) * 2.55;
            const rz = 1.25 + Math.sin(ang) * 1.45;
            sk.g.position.set(rx, sk.baseY, rz);
            sk.g.rotation.y = -ang + Math.PI;
            sk.body.rotation.z = -0.18;
            poseWalk(sk, t + idx, 9.5, 0.78);
          });
          const jj = Math.max(0, Math.sin(t * 6));
          warmKid1.g.position.y = 0.05 + jj * 0.14;
          warmKid1.armL.rotation.z = 0.3 + jj * 2.1;
          warmKid1.armR.rotation.z = -0.3 - jj * 2.1;
          warmKid2.body.rotation.x = 0.25 + Math.sin(t * 4) * 0.25;
          warmKid2.armL.rotation.x = -1.2 + Math.sin(t * 4) * 0.4;
          warmKid2.armR.rotation.x = -1.2 + Math.sin(t * 4) * 0.4;
        });
      } else if (cat.id === 'music') {
        // 音律舞動島草坪：右側街舞社員戶外 Freestyle 對尬 + 左側陶笛與合唱社員圍圈合奏
        const boombox = box(0.48, 0.26, 0.22, '#1e293b', [2.45, 0.13, 0.95]);
        boombox.userData = { isClassProp: true };
        const bboy1 = createKid({
          shirt: '#f97316',
          pants: '#1e293b',
          backwardsHat: '#ef4444',
          scale: 0.82,
          pos: [1.85, 0, 1.35],
          rotY: 1.2
        });
        const bboy2 = createKid({
          shirt: '#a855f7',
          pants: '#1e293b',
          backwardsHat: '#eab308',
          scale: 0.82,
          pos: [3.0, 0, 1.15],
          rotY: -1.4
        });
        const musician1 = createKid({
          shirt: '#ec4899',
          skirt: '#ffffff',
          hairStyle: 'ponytail',
          scale: 0.8,
          pos: [-2.0, 0, 1.35],
          rotY: 0.7,
          item: 'ocarina'
        });
        const musician2 = createKid({
          shirt: '#38bdf8',
          pants: '#1e3a8a',
          scale: 0.8,
          pos: [-2.85, 0, 0.85],
          rotY: 1.1,
          item: 'book'
        });
        const noteLawn = sph(0.1, Glow('#f472b6', 0.6, 1.4), [-2.4, 1.35, 1.1]);
        noteLawn.userData = { isClassProp: true };
        contentGroup.add(boombox, bboy1.g, bboy2.g, musician1.g, musician2.g, noteLawn);

        this.animCallbacks.push((t) => {
          bboy1.g.position.y = Math.abs(Math.sin(t * 7)) * 0.14;
          bboy1.armL.rotation.z = 1.9 + Math.sin(t * 7) * 0.6;
          bboy1.armR.rotation.x = -1.2 + Math.cos(t * 7) * 0.6;
          bboy1.body.rotation.y = Math.sin(t * 3.5) * 0.35;

          bboy2.g.position.y = Math.abs(Math.cos(t * 7)) * 0.14;
          bboy2.armR.rotation.z = -1.9 + Math.cos(t * 7) * 0.6;
          bboy2.armL.rotation.x = -1.2 + Math.sin(t * 7) * 0.6;
          bboy2.body.rotation.y = -Math.sin(t * 3.5) * 0.35;

          musician1.armR.rotation.x = -1.2;
          musician1.armL.rotation.x = -1.1;
          musician1.body.rotation.z = Math.sin(t * 3.2) * 0.09;
          musician2.armR.rotation.x = -0.7;
          musician2.armL.rotation.x = -0.7;
          musician2.body.rotation.z = Math.cos(t * 3.2) * 0.09;
          noteLawn.position.y = 1.25 + ((t * 0.5) % 0.65);
        });
      } else if (cat.id === 'craft') {
        // 巧手美學島草坪：戶外寫生畫架 2 位小畫家 + 右側展示桌 2 位黏土／紙藝社員互秀作品
        const easel = new T.Group();
        easel.position.set(-2.35, 0, 1.05);
        easel.rotation.y = 0.5;
        easel.add(
          cyl(0.03, 0.03, 1.05, '#7f5539', [-0.22, 0.5, 0], [0.12, 0, -0.08]),
          cyl(0.03, 0.03, 1.05, '#7f5539', [0.22, 0.5, 0], [0.12, 0, 0.08]),
          box(0.62, 0.46, 0.05, '#ffffff', [0, 0.68, 0.05]),
          box(0.46, 0.3, 0.06, '#38bdf8', [0, 0.68, 0.06])
        );
        const painter = createKid({
          shirt: '#fb7185',
          apron: '#fde047',
          pants: '#1e293b',
          hat: '#f43f5e',
          scale: 0.82,
          pos: [-2.05, 0, 1.55],
          rotY: -2.5,
          item: 'brush'
        });
        const craftTable = box(1.1, 0.42, 0.7, '#fed7aa', [2.35, 0.21, 1.0]);
        const displaySculpt = sph(0.14, '#f43f5e', [2.35, 0.52, 1.0]);
        [easel, craftTable, displaySculpt].forEach((p) => {
          p.userData = { isClassProp: true };
        });
        const crafter1 = createKid({
          shirt: '#38bdf8',
          apron: '#ffffff',
          pants: '#334155',
          scale: 0.8,
          pos: [1.8, 0, 1.0],
          rotY: Math.PI / 2,
          item: 'scissors'
        });
        const crafter2 = createKid({
          shirt: '#a855f7',
          skirt: '#f472b6',
          hairStyle: 'ponytail',
          scale: 0.8,
          pos: [2.9, 0, 1.0],
          rotY: -Math.PI / 2
        });
        contentGroup.add(easel, painter.g, craftTable, displaySculpt, crafter1.g, crafter2.g);

        this.animCallbacks.push((t) => {
          painter.armR.rotation.x = -0.95 + Math.sin(t * 5.5) * 0.35;
          painter.head.rotation.y = Math.sin(t * 2.2) * 0.2;
          crafter1.armR.rotation.x = -0.8 + Math.sin(t * 5) * 0.25;
          poseCheer(crafter2, t, 0.8);
          displaySculpt.position.y = 0.52 + Math.abs(Math.sin(t * 3.5)) * 0.08;
        });
      } else if (cat.id === 'mind') {
        // 智創思維島草坪：左側草地繪本共讀野餐墊 + 右側戶外大棋盤對弈討論
        const picnicMat = box(1.45, 0.04, 1.15, '#fef08a', [-2.35, 0.02, 1.05]);
        const reader1 = createKid({
          shirt: '#ec4899',
          skirt: '#fbcfe8',
          hairStyle: 'ponytail',
          scale: 0.8,
          pos: [-2.75, 0.04, 1.05],
          rotY: 1.3,
          item: 'book'
        });
        const reader2 = createKid({
          shirt: '#3b82f6',
          pants: '#1e293b',
          scale: 0.8,
          pos: [-1.95, 0.04, 1.05],
          rotY: -1.3
        });
        const miniBoard = box(0.95, 0.36, 0.95, '#d97706', [2.35, 0.18, 1.05]);
        [picnicMat, miniBoard].forEach((p) => {
          p.userData = { isClassProp: true };
        });
        const thinker1 = createKid({
          shirt: '#6366f1',
          pants: '#1e293b',
          hat: '#fbbf24',
          scale: 0.82,
          pos: [1.75, 0, 1.05],
          rotY: Math.PI / 2
        });
        const thinker2 = createKid({
          shirt: '#10b981',
          pants: '#1e293b',
          scale: 0.82,
          pos: [2.95, 0, 1.05],
          rotY: -Math.PI / 2
        });
        contentGroup.add(picnicMat, reader1.g, reader2.g, miniBoard, thinker1.g, thinker2.g);

        this.animCallbacks.push((t) => {
          reader1.armR.rotation.x = -0.75 + Math.sin(t * 3.5) * 0.2;
          reader1.head.rotation.y = Math.sin(t * 2) * 0.2;
          reader2.head.rotation.x = 0.18 + Math.sin(t * 3) * 0.1;
          poseCheer(reader2, t, 1.1);
          thinker1.armR.rotation.x = -0.65 - Math.max(0, Math.sin(t * 3.2)) * 0.55;
          thinker2.armR.rotation.x = -0.65 - Math.max(0, -Math.sin(t * 3.2)) * 0.55;
        });
      }
    }

    /* 五大領域島：中央專科教室 + 廣場師生暖身實況 + 環島社團微縮舞台 */
    PopulateCategoryIsland(cat, contentGroup) {
      const { CLUBS } = window.FX_DATA;
      const catClubs = CLUBS.filter((c) => c.cat === cat.id);

      // 島嶼中央小型主題館
      contentGroup.add(
        createMiniBuilding({
          w: 2.8,
          d: 1.4,
          floors: 1,
          wall: '#fffaf2',
          trim: cat.color,
          roof: cat.color,
          sign: cat.short,
          pos: [0, 0, -0.6],
          windowMat: this.windowMat
        })
      );

      // 專科館前廣場：指導老師點名叮嚀 + 3 位小福星集合熱身討論
      const coachPlaza = createKid({
        shirt: cat.color,
        pants: '#1e293b',
        hat: '#ffd166',
        scale: 1.05,
        pos: [0, 0, 0.42],
        rotY: 0,
        item: 'folder'
      });
      const stuPlazaL = createKid({
        shirt: '#ffffff',
        pants: cat.color,
        backpack: '#ffd166',
        scale: 0.92,
        pos: [-0.78, 0, 1.38],
        rotY: Math.PI - 0.35
      });
      const stuPlazaC = createKid({
        shirt: cat.color,
        pants: '#1e293b',
        hat: '#ffffff',
        scale: 0.92,
        pos: [0, 0, 1.52],
        rotY: Math.PI
      });
      const stuPlazaR = createKid({
        shirt: '#ffd166',
        skirt: cat.color,
        hairStyle: 'ponytail',
        scale: 0.92,
        pos: [0.78, 0, 1.38],
        rotY: Math.PI + 0.35
      });
      // 專科館旁木椅與榮譽榜立牌
      const board = new T.Group();
      board.position.set(-1.85, 0, -0.2);
      board.rotation.y = 0.35;
      board.add(
        cyl(0.04, 0.04, 0.7, '#7f5539', [-0.35, 0.35, 0]),
        cyl(0.04, 0.04, 0.7, '#7f5539', [0.35, 0.35, 0]),
        box(0.85, 0.52, 0.06, '#fffaf2', [0, 0.56, 0]),
        box(0.91, 0.08, 0.08, cat.color, [0, 0.84, 0])
      );
      contentGroup.add(coachPlaza.g, stuPlazaL.g, stuPlazaC.g, stuPlazaR.g, board);

      this.animCallbacks.push((t) => {
        coachPlaza.armR.rotation.x = -0.65 + Math.sin(t * 4.2) * 0.3;
        coachPlaza.head.rotation.y = Math.sin(t * 2.0) * 0.25;
        poseCheer(stuPlazaL, t, 0.5);
        poseCheer(stuPlazaC, t, 1.4);
        stuPlazaR.armL.rotation.z = 2.2 + Math.sin(t * 5.2) * 0.3;
        stuPlazaR.g.position.y = Math.abs(Math.sin(t * 4.5 + 1.2)) * 0.08;
      });

      // 在島嶼中央草坪區布置該領域專屬的戶外社團練習學生
      this.populateIslandLawnActivity(cat, contentGroup);

      // 環繞擺設該分類下的 3～5 個社團立體微縮展台
      const count = catClubs.length;
      const ringR = 5.85;

      catClubs.forEach((club, idx) => {
        // 均勻分佈在島嶼周圍，避開正後方橋樑入口
        const startAng = Math.PI * 0.17;
        const span = Math.PI * 1.66;
        const angle = count === 1 ? Math.PI / 2 : startAng + (idx / (count - 1)) * span;
        const px = Math.cos(angle) * ringR;
        const pz = Math.sin(angle) * ringR;

        const clubUnit = new T.Group();
        clubUnit.position.set(px, 0.05, pz);

        // 微縮木質與主題色圓形展台（放大讓 5~9 位練習中的師生更清楚）
        const pad = cyl(2.2, 2.4, 0.32, cat.soft, [0, 0.16, 0], null, 20);
        const rim = tor(2.26, 0.09, cat.color, [0, 0.33, 0], [Math.PI / 2, 0, 0]);
        clubUnit.add(pad, rim);

        // 呼叫 props.js 建立該社團專屬 3D 動態微縮模型 (scale: 0.95 讓師生更巨大鮮明)
        const propGroup = new T.Group();
        propGroup.position.set(0, 0.32, 0);
        propGroup.scale.setScalar(0.95);
        let propAnim = null;
        const propKey = club.photo || club.id;
        if (PROPS[propKey]) {
          try {
            propAnim = PROPS[propKey](propGroup);
          } catch (e) {
            console.warn('Prop error:', club.id, e);
          }
        } else {
          propGroup.add(sph(0.8, cat.color, [0, 1, 0]));
        }
        propGroup.traverse((child) => {
          if (child.userData && (child.userData.isPerson || child.userData.isClassProp)) {
            child.userData.clubId = club.id;
          }
        });
        clubUnit.add(propGroup);

        // 點擊判定區
        const hitBox = mesh(
          new T.CylinderGeometry(2.45, 2.45, 3.8, 12),
          new T.MeshBasicMaterial({ visible: false }),
          [0, 1.85, 0]
        );
        hitBox.userData = { type: 'club', id: club.id, data: club, parentCat: cat };
        clubUnit.add(hitBox);
        this.interactiveMeshes.push(hitBox);

        // HTML 浮動社團小名牌
        const gradeBadge = club.allSchool
          ? '1-6全校'
          : `${club.grades[0]}-${club.grades[club.grades.length - 1]}年級`;
        const cEl = document.createElement('button');
        cEl.className = 'nameplate club-plate';
        cEl.style.setProperty('--c', cat.color);
        cEl.innerHTML = `
          <span>${club.icon} ${club.short}</span>
          <em>${gradeBadge}</em>
        `;
        cEl.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.callbacks.onSelectClub) this.callbacks.onSelectClub(club);
        });
        cEl.addEventListener('mouseenter', () => this.setHovered(club.id));
        cEl.addEventListener('mouseleave', () => this.setHovered(null));
        this.labelLayer.appendChild(cEl);
        this.clubLabelEls[club.id] = cEl;

        // 社團舞台上方「上課中即時對話氣泡」
        const cQuotes =
          club.live && club.live.bubbles && club.live.bubbles.length
            ? club.live.bubbles
            : [`${club.icon} ${club.short}上課中！`];
        const cbEl = document.createElement('div');
        cbEl.className = 'live-bubble club-bubble';
        cbEl.style.setProperty('--c', cat.color);
        cbEl.innerHTML = `<span class="lb-dot"></span><span class="lb-text">${cQuotes[0]}</span>`;
        cbEl.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.callbacks.onSelectClub) this.callbacks.onSelectClub(club);
        });
        this.labelLayer.appendChild(cbEl);
        this.clubBubbleEls[club.id] = {
          el: cbEl,
          quotes: cQuotes,
          club,
          cat,
          idx: Object.keys(this.clubBubbleEls).length
        };

        if (propAnim) {
          let clubLocalTime = idx * 0.7;
          this.animCallbacks.push((t, dt = 0.016) => {
            const nowMs = performance.now();
            const cheerStart = this.cheerStart && (this.cheerStart[club.id] || this.cheerStart[cat.id]);
            const cheerEnd = Math.max(this.cheerUntil[club.id] || 0, this.cheerUntil[cat.id] || 0);
            const isCheering = !!(cheerStart && nowMs >= cheerStart && nowMs < cheerEnd);
            clubLocalTime += dt * (isCheering ? 1.2 : 1.0);
            propAnim(clubLocalTime);
          });
        }

        contentGroup.add(clubUnit);
        this.clubGroups[club.id] = {
          group: clubUnit,
          propGroup,
          pad,
          rim,
          hitBox,
          club,
          cat,
          baseY: 0.05
        };
      });
    }

    /* 連接中央福星主島與 5 大群島的「雲海木棧拱橋」與背書包過橋小學生 */
    buildSkyBridges() {
      const { CATEGORIES } = window.FX_DATA;
      const outerCats = CATEGORIES.filter((c) => c.id !== 'hub');

      outerCats.forEach((cat, bIdx) => {
        const pHub = new T.Vector3(0, ISLAND_HEIGHT + 0.8, 0);
        const pCat = new T.Vector3(cat.pos[0], ISLAND_HEIGHT + cat.pos[1], cat.pos[2]);
        const dir = pCat.clone().sub(pHub).normalize();

        const startPt = pHub.clone().addScaledVector(dir, HUB_RADIUS * 0.9);
        const endPt = pCat.clone().addScaledVector(dir, -CAT_RADIUS * 0.9);
        const midPt = startPt.clone().lerp(endPt, 0.5);
        midPt.y += 1.6;

        const curve = new T.QuadraticBezierCurve3(startPt, midPt, endPt);
        const planks = 16;

        const bridgeGroup = new T.Group();
        for (let i = 0; i <= planks; i++) {
          const u = i / planks;
          const pt = curve.getPoint(u);
          const tangent = curve.getTangent(u);
          const angleY = Math.atan2(tangent.x, tangent.z);

          const plank = box(
            1.35,
            0.09,
            0.42,
            i % 2 === 0 ? '#d6ab76' : '#c4925a',
            [pt.x, pt.y, pt.z],
            [0, angleY, 0]
          );
          bridgeGroup.add(plank);

          if (i % 3 === 0) {
            const postL = box(0.08, 0.45, 0.08, '#8d6e4f', [0.62, 0.22, 0]);
            const postR = box(0.08, 0.45, 0.08, '#8d6e4f', [-0.62, 0.22, 0]);
            plank.add(postL, postR);
          }
        }

        // 橋側發光能量導引線
        const tubeGeo = new T.TubeGeometry(curve, 20, 0.06, 6, false);
        const tube = mesh(tubeGeo, Glow(cat.color, 0.3, 1.1));
        bridgeGroup.add(tube);

        // 每座雲海木棧橋上安排 2 位背著小書包、開心趕往社團島嶼上課的復興小福星
        const walker1 = createKid({
          shirt: cat.color,
          pants: '#1d3557',
          backpack: '#ffd166',
          hat: '#ffffff',
          scale: 0.72
        });
        const walker2 = createKid({
          shirt: '#ffffff',
          skirt: cat.color,
          backpack: cat.color,
          hairStyle: 'ponytail',
          scale: 0.7
        });
        bridgeGroup.add(walker1.g, walker2.g);

        this.animCallbacks.push((t) => {
          [walker1, walker2].forEach((wk, wIdx) => {
            const raw = (t * 0.11 + bIdx * 0.23 + wIdx * 0.48) % 2;
            const forward = raw <= 1;
            const u = forward ? raw : 2 - raw;
            const clampedU = 0.08 + u * 0.84;
            const pt = curve.getPoint(clampedU);
            const tan = curve.getTangent(clampedU);
            const sideOffset = wIdx === 0 ? 0.24 : -0.24;
            const sideX = -tan.z * sideOffset;
            const sideZ = tan.x * sideOffset;
            wk.g.position.set(pt.x + sideX, pt.y + 0.06, pt.z + sideZ);
            wk.g.rotation.y = Math.atan2(tan.x, tan.z) + (forward ? 0 : Math.PI);
            poseWalk(wk, t + bIdx + wIdx * 2, 8.5, 0.68);
          });
        });

        this.scene.add(bridgeGroup);
      });
    }

    /* 跨島串聯光弧 (Cross-Island Sky Links) */
    buildCrossLinks(links) {
      this.linksGroup = new T.Group();
      this.linksGroup.visible = false;
      this.scene.add(this.linksGroup);

      const { CATEGORIES } = window.FX_DATA;
      const catMap = {};
      CATEGORIES.forEach((c) => (catMap[c.id] = c));

      links.forEach((lnk) => {
        const c1 = catMap[lnk.from];
        const c2 = catMap[lnk.to];
        if (!c1 || !c2) return;

        const p1 = c1.pos;
        const p2 = c2.pos;
        const mid = [(p1[0] + p2[0]) / 2, Math.max(p1[1], p2[1]) + 9.5, (p1[2] + p2[2]) / 2];

        const curve = new T.CatmullRomCurve3([
          new T.Vector3(p1[0], p1[1] + 3.2, p1[2]),
          new T.Vector3(mid[0], mid[1], mid[2]),
          new T.Vector3(p2[0], p2[1] + 3.2, p2[2])
        ]);

        const tubeGeo = new T.TubeGeometry(curve, 32, 0.12, 8, false);
        const tubeMesh = mesh(tubeGeo, Glow('#e39b2d', 0.55, 1.4));
        this.linksGroup.add(tubeMesh);

        const lbl = document.createElement('div');
        lbl.className = 'link-label';
        lbl.style.display = 'none';
        lbl.textContent = lnk.label;
        this.labelLayer.appendChild(lbl);
        this.linkLabels.push({ el: lbl, pos: new T.Vector3(mid[0], mid[1] + 0.6, mid[2]) });
      });
    }

    /* 立體多層雲海、復古飛空艇與彩色熱氣球 */
    buildAtmosphere() {
      const cloudMat = M('#ffffff', { transparent: true, opacity: 0.9, roughness: 1 });
      this.clouds = [];

      for (let i = 0; i < 40; i++) {
        const cg = new T.Group();
        const puffs = [
          [0, 0, 0, 1.8],
          [1.5, -0.2, 0.2, 1.3],
          [-1.4, -0.25, -0.1, 1.35],
          [0.3, 0.6, 0.15, 1.2],
          [-0.4, -0.1, 1.0, 1.1]
        ];
        puffs.forEach(([px, py, pz, pr]) => {
          cg.add(sph(pr, cloudMat, [px, py, pz], 1, 1));
        });

        const isDeep = i < 24;
        const orbitR = isDeep ? 10 + ((i * 9) % 45) : 30 + ((i * 13) % 32);
        const orbitY = isDeep ? -6.5 - (i % 5) * 1.8 : 7.5 + (i % 4) * 3.0;
        const scale = isDeep ? 1.5 + (i % 4) * 0.4 : 0.9 + (i % 3) * 0.3;
        cg.scale.setScalar(scale);
        this.scene.add(cg);

        this.clouds.push({
          group: cg,
          r: orbitR,
          y: orbitY,
          angle: (i * Math.PI * 2) / 20,
          speed: (0.01 + (i % 5) * 0.003) * (i % 2 === 0 ? 1 : -1)
        });
      }

      // 2 艘「天空之城復興號飛空艇」
      for (let s = 0; s < 2; s++) {
        const ship = new T.Group();
        const hull = sph(1.4, s === 0 ? '#ea580c' : '#2563eb', [0, 1.1, 0], [0.85, 0.85, 1.9], 2);
        ship.add(
          hull,
          box(2.4, 0.15, 0.45, '#ffd166', [0, 1.1, 0]),
          box(0.7, 0.48, 1.8, '#8d5b4c', [0, 0, 0])
        );
        const prop = box(0.95, 0.1, 0.08, '#ffd166', [0, 0.12, -1.0]);
        ship.add(prop);
        this.scene.add(ship);

        const shipR = 34 + s * 8;
        const shipY = 9.5 + s * 3.0;
        const dir = s === 0 ? 1 : -1;
        this.animCallbacks.push((t) => {
          const ang = t * 0.055 * dir + s * Math.PI;
          ship.position.set(
            Math.cos(ang) * shipR,
            shipY + Math.sin(t * 1.4 + s) * 0.45,
            Math.sin(ang) * shipR
          );
          ship.rotation.y = -ang + (dir > 0 ? 0 : Math.PI);
          prop.rotation.z = t * 15;
        });
      }

      // 3 顆彩色熱氣球
      ['#ffbe0b', '#ec4899', '#14b8a6'].forEach((bColor, idx) => {
        const balloon = new T.Group();
        balloon.add(
          sph(1.1, bColor, [0, 1.4, 0], 1, 2),
          cyl(0.4, 0.28, 0.45, bColor, [0, 0.45, 0], null, 12),
          box(0.42, 0.32, 0.42, '#a47148', [0, -0.1, 0])
        );
        this.scene.add(balloon);

        const br = 29 + idx * 6;
        const by = 6.5 + idx * 2.2;
        this.animCallbacks.push((t) => {
          const ang = -t * 0.03 + idx * 2.1;
          balloon.position.set(
            Math.cos(ang) * br,
            by + Math.sin(t * 1.1 + idx) * 0.65,
            Math.sin(ang) * br
          );
        });
      });
    }

    /* ---------------- 漫遊模式：可操控復興小福星探險家 ---------------- */
    setupRoamPlayer() {
      this.playerGroup = new T.Group();
      this.playerGroup.position.set(0, ISLAND_HEIGHT + 0.9, 3.5);
      this.playerGroup.visible = false;
      this.scene.add(this.playerGroup);

      const pBody = new T.Group();
      this.playerGroup.add(pBody);

      this.pLegL = new T.Group();
      this.pLegL.position.set(-0.09, 0.26, 0);
      this.pLegL.add(box(0.11, 0.28, 0.13, '#1d3557', [0, -0.14, 0]));
      pBody.add(this.pLegL);

      this.pLegR = new T.Group();
      this.pLegR.position.set(0.09, 0.26, 0);
      this.pLegR.add(box(0.11, 0.28, 0.13, '#1d3557', [0, -0.14, 0]));
      pBody.add(this.pLegR);

      this.pTorsoMat = new T.MeshStandardMaterial({ color: new T.Color('#e63946'), roughness: 0.7 });
      pBody.add(mesh(new T.BoxGeometry(0.35, 0.36, 0.22), this.pTorsoMat, [0, 0.45, 0]));
      // 黃色小書包
      pBody.add(box(0.28, 0.3, 0.14, '#ffd166', [0, 0.45, -0.16]));

      this.pArmL = new T.Group();
      this.pArmL.position.set(-0.23, 0.56, 0);
      this.pArmL.add(mesh(new T.BoxGeometry(0.09, 0.28, 0.1), this.pTorsoMat, [0, -0.13, 0]));
      pBody.add(this.pArmL);

      this.pArmR = new T.Group();
      this.pArmR.position.set(0.23, 0.56, 0);
      this.pArmR.add(mesh(new T.BoxGeometry(0.09, 0.28, 0.1), this.pTorsoMat, [0, -0.13, 0]));
      pBody.add(this.pArmR);

      pBody.add(sph(0.18, '#f4c89e', [0, 0.78, 0], 1, 2));
      pBody.add(sph(0.185, '#2b2018', [0, 0.81, -0.02], 1, 2));

      this.pHatMat = new T.MeshStandardMaterial({ color: new T.Color('#2a9d8f'), roughness: 0.6 });
      pBody.add(
        mesh(new T.CylinderGeometry(0.19, 0.19, 0.07, 14), this.pHatMat, [0, 0.9, 0]),
        mesh(new T.BoxGeometry(0.24, 0.03, 0.16), this.pHatMat, [0, 0.88, 0.15])
      );

      // 腳底陰影
      const pShadow = mesh(
        new T.CircleGeometry(0.38, 16),
        new T.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.35, depthWrite: false }),
        [0, 0.02, 0],
        [-Math.PI / 2, 0, 0]
      );
      this.playerGroup.add(pShadow);

      // 玩家頭頂 3D 浮動名牌
      this.pNameplateEl = document.createElement('div');
      this.pNameplateEl.className = 'player-nameplate hidden';
      this.pNameplateEl.innerHTML = `<span class="p-badge" id="p-np-badge">福星探險家</span><span id="p-np-name">復興小福星</span>`;
      this.labelLayer.appendChild(this.pNameplateEl);
    }

    getGroundHeight(x, z) {
      const { CATEGORIES } = window.FX_DATA;
      // 1. 檢查是否在 6 座島嶼範圍內
      for (let i = 0; i < CATEGORIES.length; i++) {
        const cat = CATEGORIES[i];
        const r = cat.id === 'hub' ? HUB_RADIUS : CAT_RADIUS;
        const d = Math.hypot(x - cat.pos[0], z - cat.pos[2]);
        if (d <= r * 0.96) {
          return { y: ISLAND_HEIGHT + cat.pos[1] + 0.1, catId: cat.id, valid: true };
        }
      }

      // 2. 檢查是否在連接中央主島與 5 大群島的空橋上
      const rFromHub = Math.hypot(x, z);
      const angle = Math.atan2(z, x);
      const outerCats = CATEGORIES.filter((c) => c.id !== 'hub');

      for (let i = 0; i < outerCats.length; i++) {
        const cat = outerCats[i];
        const bAngle = Math.atan2(cat.pos[2], cat.pos[0]);
        let diff = Math.abs(angle - bAngle);
        while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);

        const distTotal = Math.hypot(cat.pos[0], cat.pos[2]);
        if (rFromHub >= HUB_RADIUS * 0.82 && rFromHub <= distTotal - CAT_RADIUS * 0.82) {
          const maxAngW = 1.25 / rFromHub;
          if (diff <= maxAngW) {
            const u = (rFromHub - HUB_RADIUS * 0.85) / (distTotal - HUB_RADIUS * 0.85 - CAT_RADIUS * 0.85);
            const clampedU = Math.max(0, Math.min(1, u));
            const arch = Math.sin(clampedU * Math.PI) * 1.4;
            const y =
              (ISLAND_HEIGHT + 0.8 + 0.1) * (1 - clampedU) +
              (ISLAND_HEIGHT + cat.pos[1] + 0.1) * clampedU +
              arch;
            return { y, catId: cat.id, valid: true };
          }
        }
      }

      return { y: ISLAND_HEIGHT + 0.9, catId: null, valid: false };
    }

    /* ---------------- 外部控制 API ---------------- */
    focusOverview(viewMode = 'panorama') {
      this.selectedCatId = null;
      this.selectedClubId = null;
      this.updateActiveLabels();

      if (viewMode === 'bird') {
        this.camState.goalTarget.set(0, 0, 0);
        this.camState.goalPhi = 0.22;
        this.camState.goalRadius = 60;
      } else {
        this.camState.goalTarget.set(0, 1.2, 0);
        this.camState.goalPhi = 0.95;
        this.camState.goalRadius = 45;
      }
    }

    focusCategory(catId) {
      this.selectedCatId = catId;
      this.selectedClubId = null;
      this.updateActiveLabels();

      const cat = window.FX_DATA.CATEGORIES.find((c) => c.id === catId);
      if (!cat) return;
      const offsetX = window.innerWidth > 900 ? 2.6 : 0;
      this.camState.goalTarget.set(cat.pos[0] + offsetX, cat.pos[1] + 1.8, cat.pos[2]);
      this.camState.goalRadius = catId === 'hub' ? 19.5 : 21.0;
      this.camState.goalPhi = 0.95;
      if (catId !== 'hub') {
        this.camState.goalTheta = Math.atan2(cat.pos[0], cat.pos[2]) + 0.22;
      }
    }

    focusClub(clubId) {
      const entry = this.clubGroups[clubId];
      if (!entry) return;
      this.selectedClubId = clubId;
      this.selectedCatId = entry.cat.id;
      this.updateActiveLabels();
      this.wakeClub(clubId, true);

      const worldPos = new T.Vector3();
      entry.group.getWorldPosition(worldPos);
      const offsetX = window.innerWidth > 900 ? 1.3 : 0;
      this.camState.goalTarget.set(worldPos.x + offsetX, worldPos.y + 1.45, worldPos.z);
      this.camState.goalRadius = 9.8;
      this.camState.goalPhi = 1.0;
      this.camState.goalTheta = Math.atan2(worldPos.x, worldPos.z) + 0.28;
    }

    setHovered(id) {
      this.hoveredId = id;
      this.updateActiveLabels();
    }

    updateActiveLabels() {
      Object.keys(this.labelEls).forEach((k) => {
        this.labelEls[k].classList.toggle(
          'on',
          k === this.selectedCatId || k === this.hoveredId
        );
      });
      Object.keys(this.clubLabelEls).forEach((k) => {
        this.clubLabelEls[k].classList.toggle(
          'on',
          k === this.selectedClubId || k === this.hoveredId
        );
      });
    }

    setShowLabels(v) {
      this.showLabels = v;
      Object.values(this.labelEls).forEach((el) => el.classList.toggle('hidden', !v));
      Object.values(this.clubLabelEls).forEach((el) => el.classList.toggle('hidden', !v));
    }

    setShowBubbles(v) {
      this.showBubbles = v;
      if (!v) {
        Object.values(this.islandBubbleEls).forEach((b) => (b.el.style.display = 'none'));
        Object.values(this.clubBubbleEls).forEach((b) => (b.el.style.display = 'none'));
      }
    }

    triggerCheer(id, customText) {
      const duration = 1000; // 精準跳動 3 下 (共 1.0 秒，每下約 0.33 秒)
      const now = performance.now();
      this.cheerStart = this.cheerStart || {};
      this.cheerStart[id] = now;
      this.cheerUntil[id] = now + duration;

      const cb = this.clubBubbleEls[id];
      if (cb) {
        const txtEl = cb.el.querySelector('.lb-text');
        if (txtEl && customText) txtEl.textContent = customText;
        cb.el.classList.add('cheer-pop');
        setTimeout(() => cb.el.classList.remove('cheer-pop'), duration);
      }

      const ib = this.islandBubbleEls[id];
      if (ib) {
        const txtEl = ib.el.querySelector('.lb-text');
        if (txtEl && customText) txtEl.textContent = customText;
        ib.el.classList.add('cheer-pop');
        setTimeout(() => ib.el.classList.remove('cheer-pop'), duration);
      }
    }

    setShowLinks(v) {
      this.showLinks = v;
      if (this.linksGroup) this.linksGroup.visible = v;
      this.linkLabels.forEach((l) => (l.el.style.display = v ? 'block' : 'none'));
    }

    /* 依據選課亮點模擬器或年級篩選動態高亮 3D 社團與群島 */
    applyFilter(filterFn, activeCatIds = []) {
      const catSet = new Set(activeCatIds);
      Object.keys(this.islandGroups).forEach((catId) => {
        const ig = this.islandGroups[catId];
        const isLive = catSet.has(catId);
        ig.liveRing.visible = isLive;
        const pill = this.labelEls[catId]?.querySelector('.live-pill');
        if (pill) pill.style.display = isLive && activeCatIds.length < 5 ? 'inline-flex' : 'none';
      });

      Object.keys(this.clubGroups).forEach((clubId) => {
        const cg = this.clubGroups[clubId];
        const match = filterFn ? filterFn(cg.club) : true;
        cg.baseFilterY = match ? 0.45 : 0.0;
        cg.group.position.y = cg.baseFilterY;
        cg.group.scale.setScalar(match ? 1.06 : 0.82);
        const lbl = this.clubLabelEls[clubId];
        if (lbl) {
          lbl.style.opacity = match ? '1' : '0.38';
        }
      });
    }

    setRoamMode(enabled) {
      this.roamState.active = enabled;
      this.playerGroup.visible = enabled;
      this.pNameplateEl.classList.toggle('hidden', !enabled);
      if (enabled) {
        this.camState.goalRadius = 12.5;
        this.camState.goalPhi = 0.98;
      } else {
        this.focusOverview('panorama');
      }
    }

    updatePlayerCustom(cfg) {
      if (!cfg) return;
      const nEl = document.getElementById('p-np-name');
      const bEl = document.getElementById('p-np-badge');
      if (cfg.name && nEl) nEl.textContent = cfg.name;
      if (cfg.title && bEl) bEl.textContent = cfg.title;
      if (cfg.shirtColor && this.pTorsoMat) this.pTorsoMat.color.set(cfg.shirtColor);
      if (cfg.hatColor && this.pHatMat) this.pHatMat.color.set(cfg.hatColor);
      if (cfg.badgeColor && bEl) bEl.style.background = cfg.badgeColor;
    }

    setVirtualInput(key, val) {
      if (this.roamState.keys[key] !== undefined) {
        this.roamState.keys[key] = val;
      }
      if (key === 'jump' && val && this.roamState.onGround) {
        this.roamState.vy = 0.22;
        this.roamState.onGround = false;
      }
    }

    /* ---------------- 滑鼠、滾輪與鍵盤事件綁定 ---------------- */
    bindEvents() {
      const dom = this.renderer.domElement;

      dom.addEventListener('pointerdown', (e) => {
        this.camState.dragging = true;
        this.camState.panning = e.button === 2 || e.shiftKey;
        this.camState.lastX = e.clientX;
        this.camState.lastY = e.clientY;
        this.camState.downX = e.clientX;
        this.camState.downY = e.clientY;
      });

      window.addEventListener('pointermove', (e) => {
        if (this.camState.dragging) {
          const dx = e.clientX - this.camState.lastX;
          const dy = e.clientY - this.camState.lastY;
          this.camState.lastX = e.clientX;
          this.camState.lastY = e.clientY;

          if (this.camState.panning) {
            const panSpeed = 0.04 * (this.camState.radius / 45);
            const right = new T.Vector3(Math.cos(this.camState.theta), 0, -Math.sin(this.camState.theta));
            const forward = new T.Vector3(Math.sin(this.camState.theta), 0, Math.cos(this.camState.theta));
            this.camState.goalTarget.addScaledVector(right, -dx * panSpeed);
            this.camState.goalTarget.addScaledVector(forward, -dy * panSpeed);
          } else {
            this.camState.goalTheta -= dx * 0.0065;
            this.camState.goalPhi = Math.max(0.2, Math.min(1.42, this.camState.goalPhi - dy * 0.0055));
          }
          return;
        }

        const rect = dom.getBoundingClientRect();
        const mouse = new T.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new T.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);
        const hits = raycaster.intersectObjects(this.interactiveMeshes, false);
        if (hits.length > 0) {
          dom.style.cursor = 'pointer';
          const ud = hits[0].object.userData;
          if (ud.type === 'club' || ud.type === 'category') {
            this.setHovered(ud.id);
          }
        } else {
          dom.style.cursor = 'grab';
          this.setHovered(null);
        }
      });

      window.addEventListener('pointerup', (e) => {
        const moved = Math.hypot(e.clientX - this.camState.downX, e.clientY - this.camState.downY);
        this.camState.dragging = false;
        if (moved < 6 && e.target === dom) {
          const rect = dom.getBoundingClientRect();
          const mouse = new T.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
          );
          const raycaster = new T.Raycaster();
          raycaster.setFromCamera(mouse, this.camera);
          const hits = raycaster.intersectObjects(this.interactiveMeshes, false);
          if (hits.length > 0) {
            const ud = hits[0].object.userData;
            if (ud.type === 'mascot') {
              ud.jumpUntil = performance.now() + 900;
              if (this.callbacks.onFindMascot) this.callbacks.onFindMascot(ud.islandId, ud.islandName);
            } else if (ud.type === 'club') {
              if (this.callbacks.onSelectClub) this.callbacks.onSelectClub(ud.data);
            } else if (ud.type === 'category') {
              if (this.callbacks.onSelectCategory) this.callbacks.onSelectCategory(ud.id);
            }
          }
        }
      });

      dom.addEventListener('contextmenu', (e) => e.preventDefault());
      dom.addEventListener(
        'wheel',
        (e) => {
          e.preventDefault();
          this.camState.goalRadius = Math.max(9, Math.min(88, this.camState.goalRadius + e.deltaY * 0.032));
        },
        { passive: false }
      );

      // 漫遊鍵盤控制
      window.addEventListener('keydown', (e) => {
        if (!this.roamState.active) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
        if (e.code === 'KeyW' || e.code === 'ArrowUp') this.roamState.keys.forward = true;
        if (e.code === 'KeyS' || e.code === 'ArrowDown') this.roamState.keys.backward = true;
        if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.roamState.keys.left = true;
        if (e.code === 'KeyD' || e.code === 'ArrowRight') this.roamState.keys.right = true;
        if (e.code === 'Space') {
          if (this.roamState.onGround) {
            this.roamState.vy = 0.22;
            this.roamState.onGround = false;
          }
          e.preventDefault();
        }
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.roamState.keys.sprint = true;
        if (e.code === 'KeyE') {
          if (this.callbacks.onPlayerInteract) this.callbacks.onPlayerInteract(this.roamState.nearTarget);
        }
      });

      window.addEventListener('keyup', (e) => {
        if (!this.roamState.active) return;
        if (e.code === 'KeyW' || e.code === 'ArrowUp') this.roamState.keys.forward = false;
        if (e.code === 'KeyS' || e.code === 'ArrowDown') this.roamState.keys.backward = false;
        if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.roamState.keys.left = false;
        if (e.code === 'KeyD' || e.code === 'ArrowRight') this.roamState.keys.right = false;
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.roamState.keys.sprint = false;
      });

      window.addEventListener('resize', () => {
        const w = this.container.clientWidth || window.innerWidth;
        const h = this.container.clientHeight || window.innerHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
      });
    }

    /* ---------------- 主動畫與渲染迴圈 ---------------- */
    animate(now) {
      requestAnimationFrame((t) => this.animate(t));
      const dt = Math.min(0.05, (now - this.lastStamp) / 1000);
      this.lastStamp = now;

      if (this.animateEnabled) {
        this.clockTime += dt;
        this.animCallbacks.forEach((fn) => {
          try {
            fn(this.clockTime, dt);
          } catch (err) {
            console.warn('Anim error:', err);
          }
        });

        this.clouds.forEach((c) => {
          const a = c.angle + this.clockTime * c.speed;
          c.group.position.set(
            Math.cos(a) * c.r,
            c.y + Math.sin(this.clockTime * 0.8 + c.angle) * 0.3,
            Math.sin(a) * c.r
          );
        });
      }

      const tempVec = new T.Vector3();
      const bubbleCycle = Math.floor(this.clockTime / 4.2);

      // 更新 6 座大浮空島上下輕盈懸浮、HTML 名牌與島嶼實況氣泡座標
      Object.keys(this.islandGroups).forEach((catId) => {
        const ig = this.islandGroups[catId];
        const cheerStart = this.cheerStart && this.cheerStart[catId];
        const cheerEnd = this.cheerUntil[catId] || 0;
        const isCheering = !!(cheerStart && now >= cheerStart && now < cheerEnd);
        let cheerBounce = 0;
        if (isCheering) {
          const p = Math.min(1, Math.max(0, (now - cheerStart) / (cheerEnd - cheerStart)));
          cheerBounce = Math.abs(Math.sin(p * Math.PI * 3)) * 0.45 * (1 - p * 0.25);
        }
        const targetLift =
          catId === this.selectedCatId ? 0.55 : catId === this.hoveredId ? 0.32 : 0;
        ig.hoverLift += (targetLift - ig.hoverLift) * 0.12;
        const bob = this.animateEnabled ? Math.sin(this.clockTime * 1.5 + ig.phase) * 0.2 : 0;
        ig.floatGroup.position.y = bob + ig.hoverLift + cheerBounce;
        ig.crystalCore.rotation.y = this.clockTime * 1.3 + ig.phase;

        if (ig.liveRing.visible) {
          const s = 1 + Math.sin(this.clockTime * 3.8) * 0.03;
          ig.liveRing.scale.set(s, s, 1);
        }

        const p = ig.basePos;
        tempVec.set(
          p[0],
          p[1] + ig.floatGroup.position.y + ISLAND_HEIGHT + (catId === 'hub' ? 5.8 : 4.2),
          p[2]
        );
        tempVec.project(this.camera);
        const el = this.labelEls[catId];
        const sx = (tempVec.x * 0.5 + 0.5) * window.innerWidth;
        const sy = (-tempVec.y * 0.5 + 0.5) * window.innerHeight;
        if (tempVec.z > 1 || !this.showLabels) {
          el.style.display = 'none';
        } else {
          el.style.display = 'inline-flex';
          el.style.left = `${sx}px`;
          el.style.top = `${sy}px`;
        }

        // 島嶼實況氣泡（在全景時輪播，或聚焦該島時顯示；僅白天上課時段呈現）
        const ib = this.islandBubbleEls[catId];
        if (ib) {
          const showIb =
            this.isDay &&
            this.showBubbles &&
            tempVec.z <= 1 &&
            (isCheering ||
              catId === this.hoveredId ||
              (this.selectedCatId === catId && !this.selectedClubId) ||
              (!this.selectedCatId && (bubbleCycle + ib.idx) % 2 === 0));
          if (!showIb) {
            ib.el.style.display = 'none';
          } else {
            if (!isCheering) {
              const qIdx = (bubbleCycle + ib.idx) % ib.quotes.length;
              const txtEl = ib.el.querySelector('.lb-text');
              if (txtEl && txtEl.textContent !== ib.quotes[qIdx]) {
                txtEl.textContent = ib.quotes[qIdx];
              }
            }
            ib.el.style.display = 'inline-flex';
            ib.el.style.left = `${sx}px`;
            ib.el.style.top = `${sy - 32}px`;
          }
        }
      });

      // 更新 20 個社團展台 HTML 名牌與師生實況對話氣泡座標
      Object.keys(this.clubGroups).forEach((clubId) => {
        const cg = this.clubGroups[clubId];
        const el = this.clubLabelEls[clubId];
        const cheerStart = this.cheerStart && this.cheerStart[clubId];
        const cheerEnd = this.cheerUntil[clubId] || 0;
        const isCheering = !!(cheerStart && now >= cheerStart && now < cheerEnd);
        const baseFilterY = cg.baseFilterY !== undefined ? cg.baseFilterY : 0.45;
        if (isCheering) {
          const p = Math.min(1, Math.max(0, (now - cheerStart) / (cheerEnd - cheerStart)));
          // 精確跳動 3 下 (0 到 3*PI)，每下一上一下自然著地
          cg.group.position.y = baseFilterY + Math.abs(Math.sin(p * Math.PI * 3)) * 0.52 * (1 - p * 0.25);
        } else {
          // 跳動 3 下結束後立即恢復平穩高度，恢復師生原本動作
          cg.group.position.y += (baseFilterY - cg.group.position.y) * 0.2;
          if (Math.abs(cg.group.position.y - baseFilterY) < 0.002) {
            cg.group.position.y = baseFilterY;
          }
        }

        cg.group.getWorldPosition(tempVec);
        tempVec.y += 3.5;
        tempVec.project(this.camera);
        const sx = (tempVec.x * 0.5 + 0.5) * window.innerWidth;
        const sy = (-tempVec.y * 0.5 + 0.5) * window.innerHeight;

        if (!this.showLabels || tempVec.z > 1) {
          el.style.display = 'none';
        } else {
          el.style.display = 'inline-flex';
          el.style.left = `${sx}px`;
          el.style.top = `${sy}px`;
        }

        // 社團上課中對話氣泡：僅白天上課時段呈現；聚焦或滑過時必顯；在群島視角顯示該島社團；在全景時智慧輪播避免遮擋
        const cb = this.clubBubbleEls[clubId];
        if (cb) {
          const isFocusedClub = clubId === this.selectedClubId || clubId === this.hoveredId;
          const isSameSelectedCat = this.selectedCatId && cg.cat.id === this.selectedCatId && !this.selectedClubId;
          const isNearRoam =
            this.roamState.active &&
            this.roamState.nearTarget &&
            this.roamState.nearTarget.id === clubId;
          const isPanoramaCycle =
            !this.selectedCatId && !this.selectedClubId && (bubbleCycle + cb.idx) % 5 === 0;

          const isAwakened = this.manuallyAwakenedClubs && this.manuallyAwakenedClubs.has(clubId);

          const showCb =
            (this.isDay || isAwakened) &&
            this.showBubbles &&
            tempVec.z <= 1 &&
            (isCheering || isFocusedClub || isSameSelectedCat || isNearRoam || isPanoramaCycle);

          if (!showCb) {
            cb.el.style.display = 'none';
          } else {
            if (!isCheering) {
              const qIdx = (bubbleCycle + cb.idx) % cb.quotes.length;
              const txtEl = cb.el.querySelector('.lb-text');
              if (txtEl && txtEl.textContent !== cb.quotes[qIdx]) {
                txtEl.textContent = cb.quotes[qIdx];
              }
            }
            cb.el.classList.toggle('is-focus', isFocusedClub || isCheering);
            cb.el.style.display = 'inline-flex';
            cb.el.style.left = `${sx}px`;
            cb.el.style.top = `${sy - 30}px`;
          }
        }
      });

      // 更新跨島連線標籤位置
      if (this.showLinks) {
        this.linkLabels.forEach((l) => {
          tempVec.copy(l.pos).project(this.camera);
          if (tempVec.z > 1) {
            l.el.style.display = 'none';
          } else {
            l.el.style.display = 'block';
            l.el.style.left = `${(tempVec.x * 0.5 + 0.5) * window.innerWidth}px`;
            l.el.style.top = `${(-tempVec.y * 0.5 + 0.5) * window.innerHeight}px`;
          }
        });
      }

      // 鏡頭平滑阻尼插值
      this.camState.theta += (this.camState.goalTheta - this.camState.theta) * 0.085;
      this.camState.phi += (this.camState.goalPhi - this.camState.phi) * 0.085;
      this.camState.radius += (this.camState.goalRadius - this.camState.radius) * 0.085;
      this.camState.target.lerp(this.camState.goalTarget, 0.085);

      const cx =
        this.camState.target.x +
        this.camState.radius * Math.sin(this.camState.phi) * Math.sin(this.camState.theta);
      const cy = this.camState.target.y + this.camState.radius * Math.cos(this.camState.phi);
      const cz =
        this.camState.target.z +
        this.camState.radius * Math.sin(this.camState.phi) * Math.cos(this.camState.theta);
      this.camera.position.set(cx, cy, cz);
      this.camera.lookAt(this.camState.target);

      // 漫遊模式角色運動更新
      if (this.roamState.active) {
        const moveSpeed = this.roamState.keys.sprint ? 0.18 : 0.11;
        let moveX = 0;
        let moveZ = 0;
        const sinT = Math.sin(this.camState.theta);
        const cosT = Math.cos(this.camState.theta);

        if (this.roamState.keys.forward) {
          moveX -= sinT;
          moveZ -= cosT;
        }
        if (this.roamState.keys.backward) {
          moveX += sinT;
          moveZ += cosT;
        }
        if (this.roamState.keys.left) {
          moveX -= cosT;
          moveZ += sinT;
        }
        if (this.roamState.keys.right) {
          moveX += cosT;
          moveZ -= sinT;
        }

        const len = Math.hypot(moveX, moveZ);
        if (len > 0.001) {
          moveX = (moveX / len) * moveSpeed;
          moveZ = (moveZ / len) * moveSpeed;

          const nextCheck = this.getGroundHeight(this.roamState.x + moveX, this.roamState.z + moveZ);
          if (nextCheck.valid) {
            this.roamState.x += moveX;
            this.roamState.z += moveZ;
          } else {
            const checkX = this.getGroundHeight(this.roamState.x + moveX, this.roamState.z);
            if (checkX.valid) this.roamState.x += moveX;
            const checkZ = this.getGroundHeight(this.roamState.x, this.roamState.z + moveZ);
            if (checkZ.valid) this.roamState.z += moveZ;
          }

          this.roamState.yaw = Math.atan2(moveX, moveZ);
          this.roamState.runAnim += dt * (this.roamState.keys.sprint ? 18 : 12);
          this.pLegL.rotation.x = Math.sin(this.roamState.runAnim) * 0.72;
          this.pLegR.rotation.x = -Math.sin(this.roamState.runAnim) * 0.72;
          this.pArmL.rotation.x = -Math.sin(this.roamState.runAnim) * 0.65;
          this.pArmR.rotation.x = Math.sin(this.roamState.runAnim) * 0.65;
        } else {
          this.pLegL.rotation.x *= 0.8;
          this.pLegR.rotation.x *= 0.8;
          this.pArmL.rotation.x *= 0.8;
          this.pArmR.rotation.x *= 0.8;
        }

        const ground = this.getGroundHeight(this.roamState.x, this.roamState.z);
        this.roamState.y += this.roamState.vy;
        this.roamState.vy -= 0.013;

        if (this.roamState.y <= ground.y) {
          this.roamState.y = ground.y;
          this.roamState.vy = 0;
          this.roamState.onGround = true;
        }

        this.playerGroup.position.set(this.roamState.x, this.roamState.y, this.roamState.z);
        this.playerGroup.rotation.y = this.roamState.yaw;

        // 偵測玩家最接近的社團展台或島嶼
        let nearestClub = null;
        let minClubDist = 3.6;
        const pPos = this.playerGroup.position;
        Object.values(this.clubGroups).forEach((cg) => {
          const wPos = new T.Vector3();
          cg.group.getWorldPosition(wPos);
          const d = Math.hypot(pPos.x - wPos.x, pPos.z - wPos.z);
          if (d < minClubDist) {
            minClubDist = d;
            nearestClub = cg.club;
          }
        });

        const newTarget = nearestClub
          ? { type: 'club', id: nearestClub.id, data: nearestClub }
          : { type: 'category', id: ground.catId || 'hub' };

        if (
          newTarget.type !== this.roamState.nearTarget.type ||
          newTarget.id !== this.roamState.nearTarget.id
        ) {
          this.roamState.nearTarget = newTarget;
          if (this.callbacks.onPlayerNearChange) {
            this.callbacks.onPlayerNearChange(newTarget);
          }
        }

        this.camState.goalTarget.set(this.roamState.x, this.roamState.y + 1.0, this.roamState.z);

        tempVec.set(this.roamState.x, this.roamState.y + 1.4, this.roamState.z);
        tempVec.project(this.camera);
        if (tempVec.z > 1) {
          this.pNameplateEl.classList.add('hidden');
        } else {
          this.pNameplateEl.classList.remove('hidden');
          this.pNameplateEl.style.left = `${(tempVec.x * 0.5 + 0.5) * window.innerWidth}px`;
          this.pNameplateEl.style.top = `${(-tempVec.y * 0.5 + 0.5) * window.innerHeight}px`;
        }
      } else {
        this.pNameplateEl.classList.add('hidden');
      }

      this.renderer.render(this.scene, this.camera);
    }
  }

  window.IslandWorld = IslandWorld;
})();
