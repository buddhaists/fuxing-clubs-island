/* =========================================================
   屏東縣復興國民小學：「復興國小之福星社團翱翔島」
   主互動邏輯、即時雷達、選課導航矩陣、適性測驗、志願回條與社團簡介上傳管理系統 (app.js)
   ========================================================= */

(function () {
  const { SCHOOL, CATEGORIES, CLUBS, LINKS, SLOTS, NEWS, LIVE_FEED, QUOTES, QUIZ } = window.FX_DATA;

  const catMap = {};
  CATEGORIES.forEach((c) => (catMap[c.id] = c));
  const clubMap = {};
  CLUBS.forEach((c) => (clubMap[c.id] = c));

  // 1. Web Audio 輕快互動音效產生器（零外部音訊依賴）
  const Sound = (function () {
    let ctx = null;
    let enabled = true;

    function initCtx() {
      if (!ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) ctx = new AudioCtx();
      }
      if (ctx && ctx.state === 'suspended') ctx.resume();
    }

    function playTone(freq, type = 'sine', duration = 0.14, vol = 0.1) {
      if (!enabled) return;
      try {
        initCtx();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration);
      } catch (e) {}
    }

    function chime() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        setTimeout(() => playTone(f, 'triangle', 0.24, 0.07), i * 55);
      });
    }

    function click() {
      playTone(880, 'sine', 0.07, 0.08);
    }

    function pop() {
      if (!enabled) return;
      try {
        initCtx();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(340, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(860, ctx.currentTime + 0.11);
        gain.gain.setValueAtTime(0.09, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.11);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.11);
      } catch (e) {}
    }

    return {
      toggle: () => {
        enabled = !enabled;
        return enabled;
      },
      isEnabled: () => enabled,
      click,
      pop,
      chime
    };
  })();

  // 2. 讀取與儲存自訂社團簡介覆寫 (localStorage)
  function loadCustomClubData() {
    try {
      const saved = JSON.parse(localStorage.getItem('fx_custom_clubs_v1') || '{}');
      CLUBS.forEach((c) => {
        if (saved[c.id]) {
          Object.assign(c, saved[c.id]);
        }
      });
    } catch (e) {}
  }

  function saveCustomClubData() {
    try {
      const obj = {};
      CLUBS.forEach((c) => {
        obj[c.id] = {
          name: c.name,
          short: c.short,
          teacher: c.teacher,
          location: c.location,
          schedule: c.schedule,
          enrolled: c.enrolled,
          capacity: c.capacity,
          tagline: c.tagline,
          desc: c.desc,
          courses: c.courses,
          highlights: c.highlights
        };
      });
      localStorage.setItem('fx_custom_clubs_v1', JSON.stringify(obj));
    } catch (e) {}
  }

  loadCustomClubData();

  // 3. 玩家探險家角色造型設定
  const defaultPlayerProfile = {
    name: '小福星',
    title: '復興探險家',
    shirtColor: '#e63946',
    hatColor: '#2a9d8f',
    badgeColor: '#e63946',
    customized: false
  };

  let playerProfile = { ...defaultPlayerProfile };
  try {
    const saved = localStorage.getItem('fx_player_profile');
    if (saved) playerProfile = { ...defaultPlayerProfile, ...JSON.parse(saved) };
  } catch (e) {}

  // 4. 全域 UI 狀態
  const state = {
    selectedType: null, // 'category' | 'club' | null
    selectedId: null,
    activeTab: 'intro', // 'intro' | 'live' | 'data' | 'matrix'
    catTab: 'clubs',    // 'clubs' | 'live'
    logFeedMode: 'live', // 'live' | 'news'
    view: 'panorama',   // 'panorama' | 'bird' | 'list'
    showLabels: true,
    showBubbles: true,
    showLinks: false,
    animate: true,
    fx: true,
    showLog: window.innerWidth > 860,
    timeMode: 'auto',   // 'auto' | 'day' | 'dusk' | 'night'
    slotMode: 'all',
    gradeFilter: 'all', // 'all' | 'allSchool' | 1..6
    quoteIdx: Math.floor(Date.now() / 86400000) % QUOTES.length,
    foundMascots: new Set(),
    tour: null,         // { idx: 0, paused: false, progress: 0 }
    quizStep: 0,
    quizAnswers: [],
    roam: false,
    nearTarget: { type: 'category', id: 'hub' },
    slip: {
      grade: '3',
      cls: '三年甲班',
      seat: '1',
      name: '',
      selectedClubs: new Set(['baseball', 'basketball', 'coding'])
    }
  };

  let world = null;
  let toastTimer = null;

  function showToast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
  }

  function resolveTimeTheme(mode) {
    if (mode !== 'auto') return mode;
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    if (h >= 6.0 && h < 16.8) return 'day';
    if ((h >= 16.8 && h < 18.5) || (h >= 5.2 && h < 6.0)) return 'dusk';
    return 'night';
  }

  // =========================================================
  // 頂部列：名言、日期時間、屏東市復興即時天氣
  // =========================================================
  function renderQuote() {
    const [text, author] = QUOTES[state.quoteIdx % QUOTES.length];
    document.getElementById('quote-text').textContent = text;
    document.getElementById('quote-by').textContent = `—— ${author}`;
  }

  function updateClock() {
    const now = new Date();
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    const m = now.getMonth() + 1;
    const d = now.getDate();
    const w = days[now.getDay()];
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('clock-date').textContent = `${m} 月 ${d} 日`;
    document.getElementById('clock-time').textContent = `星期${w}・${hh}:${mm}`;

    if (world && state.timeMode === 'auto') {
      const theme = resolveTimeTheme('auto');
      if (world.currentTimeTheme !== theme) {
        world.setTimeTheme(theme);
        if (state.selectedId && state.selectedType === 'club') {
          renderPanel();
        }
      }
    }
  }

  async function fetchPingtungWeather() {
    const { lat, lon } = SCHOOL.coordinates;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTaipei&forecast_days=1`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      const c = data.current;
      const code = c.weather_code;
      let info = { text: '晴朗', icon: '☀️' };
      if (code === 1 || code === 2) info = { text: '晴時多雲', icon: '🌤️' };
      else if (code === 3) info = { text: '多雲', icon: '⛅' };
      else if (code >= 45 && code <= 48) info = { text: '微霧', icon: '🌫️' };
      else if (code >= 51 && code <= 67) info = { text: '有雨', icon: '🌧️' };
      else if (code >= 80) info = { text: '陣雨', icon: '🌦️' };

      const maxT = Math.round(data.daily.temperature_2m_max[0]);
      const minT = Math.round(data.daily.temperature_2m_min[0]);
      const rainP = data.daily.precipitation_probability_max[0] ?? 0;

      document.getElementById('wx-box').innerHTML = `
        <span class="wx-icon">${info.icon}</span>
        <div>
          <b>${info.text} ${Math.round(c.temperature_2m)}°C</b>
          <span>${minT}°～${maxT}°・降雨 ${rainP}%</span>
        </div>
      `;
    } catch (e) {
      document.getElementById('wx-box').innerHTML = `
        <span class="wx-icon">☀️</span>
        <div>
          <b>屏東晴空 27°C</b>
          <span>適合社團活動好天氣</span>
        </div>
      `;
    }
  }

  // =========================================================
  // 次導覽列：五大群島快速切換 + 年級快篩膠囊
  // =========================================================
  function renderSubTopbar() {
    const chipsEl = document.getElementById('island-chips');
    chipsEl.innerHTML = CATEGORIES.map((cat) => {
      const isOn =
        state.selectedType === 'category' && state.selectedId === cat.id;
      return `
        <button class="q-chip ${isOn ? 'on' : ''}" style="--c:${cat.color}" data-cat-chip="${cat.id}">
          ${cat.emoji} ${cat.name}
        </button>
      `;
    }).join('');

    chipsEl.querySelectorAll('[data-cat-chip]').forEach((btn) => {
      btn.onclick = () => {
        Sound.click();
        const cid = btn.dataset.catChip;
        selectCategory(cid);
      };
    });

    const grades = [
      { id: 'all', label: '全部年級 (20)' },
      { id: 'allSchool', label: '🔥 1-6全校皆可 (5)' },
      { id: '1', label: '一年級' },
      { id: '2', label: '二年級' },
      { id: '3', label: '三年級' },
      { id: '4', label: '四年級' },
      { id: '5', label: '五年級' },
      { id: '6', label: '六年級' }
    ];

    const gradeEl = document.getElementById('grade-pills');
    gradeEl.innerHTML = grades
      .map(
        (g) => `
      <button class="g-pill ${state.gradeFilter === g.id ? 'on' : ''}" data-grade-pill="${g.id}">
        ${g.label}
      </button>
    `
      )
      .join('');

    gradeEl.querySelectorAll('[data-grade-pill]').forEach((btn) => {
      btn.onclick = () => {
        Sound.click();
        state.gradeFilter = btn.dataset.gradePill;
        applyGradeFilter(state.gradeFilter);
        renderSubTopbar();
      };
    });
  }

  function applyGradeFilter(gid) {
    if (gid === 'all') {
      world.applyFilter(() => true, ['ball', 'move', 'music', 'craft', 'mind']);
      return;
    }
    if (gid === 'allSchool') {
      world.applyFilter((c) => !!c.allSchool, ['ball', 'move', 'music']);
      showToast('🌈 已篩選：1～6 年級全校皆可參加的 5 大明星社團！');
      return;
    }
    const gNum = parseInt(gid, 10);
    const matchingClubs = CLUBS.filter((c) => c.grades.includes(gNum));
    const activeCats = [...new Set(matchingClubs.map((c) => c.cat))];
    world.applyFilter((c) => c.grades.includes(gNum), activeCats);
    showToast(`✨ 已凸顯【${gNum} 年級】可選修的 ${matchingClubs.length} 個社團展台！`);
  }

  // =========================================================
  // 左側社團即時雷達與亮點模擬器（含現場上課實況 LIVE_FEED 切換）
  // =========================================================
  function renderLiveLog() {
    const logEl = document.getElementById('club-log');
    logEl.classList.toggle('hidden', !state.showLog || !!state.selectedId);

    const pillsContainer = document.getElementById('sim-pills');
    pillsContainer.innerHTML = SLOTS.map(
      (s) => `
      <button class="sim-pill ${state.slotMode === s.id ? 'on' : ''}" data-slot="${s.id}">
        ${s.label}
      </button>
    `
    ).join('');

    pillsContainer.querySelectorAll('.sim-pill').forEach((btn) => {
      btn.onclick = () => {
        Sound.click();
        state.slotMode = btn.dataset.slot;
        const slotObj = SLOTS.find((s) => s.id === state.slotMode);
        if (slotObj) {
          world.applyFilter(slotObj.filterFn, slotObj.activeCats);
          showToast(`⚡ 已切換雷達：${slotObj.desc}`);
        }
        renderLiveLog();
      };
    });

    const currentSlot = SLOTS.find((s) => s.id === state.slotMode);
    document.getElementById('sim-desc').textContent = currentSlot ? currentSlot.desc : '';

    const feedTabsEl = document.getElementById('log-feed-tabs');
    if (feedTabsEl) {
      const liveItems = LIVE_FEED || [];
      feedTabsEl.innerHTML = `
        <button class="log-feed-btn ${state.logFeedMode === 'live' ? 'on' : ''}" data-feed="live">
          🎬 現場上課實況 (${liveItems.length})
        </button>
        <button class="log-feed-btn ${state.logFeedMode === 'news' ? 'on' : ''}" data-feed="news">
          🏆 榮耀與公告 (${NEWS.length})
        </button>
      `;
      feedTabsEl.querySelectorAll('[data-feed]').forEach((b) => {
        b.onclick = () => {
          Sound.click();
          state.logFeedMode = b.dataset.feed;
          renderLiveLog();
        };
      });
    }

    const activeList = state.logFeedMode === 'live' && LIVE_FEED ? LIVE_FEED : NEWS;
    const newsUl = document.getElementById('log-news-list');
    newsUl.innerHTML = activeList
      .map(
        (item, idx) => `
      <li data-news-idx="${idx}">
        <div class="meta">
          <span class="unit" style="${state.logFeedMode === 'live' ? 'background:#fee2e2;color:#b91c1c;' : ''}">${item.tag}</span>
          <span>${item.time}</span>
        </div>
        <div class="title">${item.text}</div>
      </li>
    `
      )
      .join('');

    newsUl.querySelectorAll('li').forEach((li) => {
      li.onclick = () => {
        Sound.click();
        const item = activeList[Number(li.dataset.newsIdx)];
        if (item.clubId && clubMap[item.clubId]) {
          selectClub(clubMap[item.clubId]);
          if (state.logFeedMode === 'live') {
            state.activeTab = 'live';
            renderPanel();
            world.triggerCheer(item.clubId);
          }
        } else if (item.cat) {
          selectCategory(item.cat);
        }
      };
    });
  }

  // =========================================================
  // 右側詳細資訊抽屜面板（支援「群島分類」與「單一社團」雙模式 + 活動中實況分頁）
  // =========================================================
  function selectCategory(catId) {
    if (!catId) {
      clearSelection();
      return;
    }
    state.selectedType = 'category';
    state.selectedId = catId;
    state.catTab = 'clubs';
    if (state.tour) stopTour();
    world.focusCategory(catId);
    renderSubTopbar();
    renderLiveLog();
    renderPanel();
    renderToolbar();
  }

  function selectClub(clubOrId) {
    const club = typeof clubOrId === 'string' ? clubMap[clubOrId] : clubOrId;
    if (!club) return;
    Sound.pop();
    state.selectedType = 'club';
    state.selectedId = club.id;
    state.activeTab = 'intro';
    if (state.tour) stopTour();
    world.focusClub(club.id);
    world.triggerCheer(club.id);
    renderSubTopbar();
    renderLiveLog();
    renderPanel();
    renderToolbar();
  }

  function clearSelection() {
    state.selectedType = null;
    state.selectedId = null;
    world.focusOverview(state.view === 'bird' ? 'bird' : 'panorama');
    renderSubTopbar();
    renderLiveLog();
    renderPanel();
    renderToolbar();
  }

  function renderPanel() {
    const panelEl = document.getElementById('detail-panel');
    if (!state.selectedId) {
      panelEl.classList.add('hidden');
      return;
    }
    panelEl.classList.remove('hidden');

    if (state.selectedType === 'category') {
      renderCategoryPanel(panelEl, catMap[state.selectedId]);
    } else {
      renderClubPanel(panelEl, clubMap[state.selectedId]);
    }
  }

  function renderCategoryPanel(panelEl, cat) {
    if (!cat) return;
    panelEl.style.setProperty('--c', cat.color);

    const catIdx = CATEGORIES.findIndex((c) => c.id === cat.id);
    const prevCat = CATEGORIES[(catIdx - 1 + CATEGORIES.length) % CATEGORIES.length];
    const nextCat = CATEGORIES[(catIdx + 1) % CATEGORIES.length];
    const catClubs = cat.id === 'hub' ? CLUBS : CLUBS.filter((c) => c.cat === cat.id);

    let bodyHtml = '';
    if (state.catTab === 'live') {
      bodyHtml = `
        <div class="live-status-card">
          <div class="live-status-top">
            <span class="live-now-pill">ISLAND LIVE・全島實況</span>
            <span style="font-size:11.5px;font-weight:800;color:${cat.color};">📍 ${cat.location}</span>
          </div>
          <div style="font-weight:900;font-size:15px;color:var(--ink);margin-bottom:4px;">
            ${cat.liveStatus || '島上各社團正熱烈進行中！'}
          </div>
          <div style="font-size:12.5px;color:var(--ink-2);line-height:1.55;">
            ${cat.atmosphere || cat.sceneDesc}
          </div>
        </div>

        <h4>🎬 浮空島廣場與專科館現場實況動態</h4>
        <div class="live-steps">
          ${(cat.liveMoments || [])
            .map(
              (m, i) => `
            <div class="live-step-item">
              <div class="live-step-phase">✨ 現場鏡頭 #${i + 1}</div>
              <div class="live-step-detail">${m}</div>
            </div>
          `
            )
            .join('')}
        </div>

        <h4>💬 島上社團即時上課實況一覽（點擊飛往舞台）</h4>
        <div style="display:grid;gap:8px;margin-bottom:14px;">
          ${catClubs
            .map((c) => {
              const liveStatus = c.live ? c.live.status : c.tagline;
              const quote = c.live && c.live.bubbles ? c.live.bubbles[0] : '';
              return `
              <div style="background:var(--paper-2);border:1.5px solid var(--line);border-left:5px solid ${cat.color};border-radius:12px;padding:9px 12px;cursor:pointer;" data-goto-club-live="${c.id}">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                  <b style="font-size:14px;">${c.icon} ${c.name}</b>
                  <span class="live-now-pill" style="font-size:10px;padding:1px 7px;">上課中</span>
                </div>
                <div style="font-size:12px;font-weight:800;color:${cat.color};margin-top:3px;">▶ ${liveStatus}</div>
                ${quote ? `<div style="font-size:11.5px;color:var(--ink-2);margin-top:2px;">💬 「${quote}」</div>` : ''}
              </div>
            `;
            })
            .join('')}
        </div>

        <button id="cat-cheer-btn" class="cheer-btn">
          👏 為【${cat.name}】全體師生熱情喝采！
        </button>
      `;
    } else {
      bodyHtml = `
        <div class="live-status-card" style="cursor:pointer;" id="cat-jump-live">
          <div class="live-status-top">
            <span class="live-now-pill">LIVE 島上實況</span>
            <span style="font-size:11.5px;font-weight:800;color:${cat.color};">點擊查看現場對話 ›</span>
          </div>
          <div style="font-weight:900;font-size:13.8px;color:var(--ink);">
            ${cat.liveStatus || cat.sceneDesc}
          </div>
        </div>

        <div class="notice-box">
          <b>👀 3D 浮空島微縮景觀：</b><br/>
          ${cat.sceneDesc}
        </div>
        <p class="para">${cat.desc}</p>

        <h4>🌟 點擊下方島上社團，立即飛往 3D 微縮展台查看詳情：</h4>
        <div style="display:grid;gap:8px;">
          ${catClubs
            .map((c) => {
              const gText = c.allSchool ? '1-6年級全校開放' : `${c.grades.join('、')} 年級`;
              const liveSt = c.live ? c.live.status : '';
              return `
              <div style="background:var(--paper-2);border:1.5px solid var(--line);border-left:5px solid ${cat.color};border-radius:12px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;gap:10px;cursor:pointer;" data-goto-club="${c.id}">
                <div>
                  <div style="font-weight:900;font-size:15px;">${c.icon} ${c.name} <span style="font-size:11px;color:${cat.color};font-weight:800;">（編號 #${c.no}・${gText}）</span></div>
                  <div style="font-size:12px;color:var(--ink-2);margin-top:2px;">${c.tagline}</div>
                  ${liveSt ? `<div style="font-size:11px;color:#b91c1c;font-weight:800;margin-top:3px;">🎬 實況：${liveSt}</div>` : ''}
                </div>
                <button class="tour-btn" style="background:${cat.color};padding:6px 12px;font-size:12px;">探索 ›</button>
              </div>
            `;
            })
            .join('')}
        </div>
      `;
    }

    panelEl.innerHTML = `
      <div class="panel-head">
        <div class="panel-nav">
          <button class="nav-circle" id="panel-prev" title="上一座群島 (←)">‹</button>
          <button class="nav-circle" id="panel-next" title="下一座群島 (→)">›</button>
          <span class="kind">${cat.badge}｜📍 ${cat.location}</span>
          <button class="x" id="panel-close" title="關閉 (Esc)">×</button>
        </div>
        <h2>${cat.emoji} ${cat.fullName}</h2>
        <p class="tagline">${cat.slogan}</p>
        <div class="group-meta">
          <span>👩‍🏫 ${cat.teacher}</span>
          <span>🕒 ${cat.schedule}</span>
        </div>
        <div class="tabs">
          <button class="${state.catTab === 'clubs' ? 'on' : ''}" data-cattab="clubs">群島社團 (${catClubs.length})</button>
          <button class="${state.catTab === 'live' ? 'on' : ''}" data-cattab="live">🎬 島上活動實況</button>
        </div>
      </div>
      <div class="panel-body">
        ${bodyHtml}
      </div>
    `;

    document.getElementById('panel-prev').onclick = () => selectCategory(prevCat.id);
    document.getElementById('panel-next').onclick = () => selectCategory(nextCat.id);
    document.getElementById('panel-close').onclick = () => clearSelection();

    panelEl.querySelectorAll('[data-cattab]').forEach((b) => {
      b.onclick = () => {
        Sound.click();
        state.catTab = b.dataset.cattab;
        renderPanel();
      };
    });

    const jumpLive = document.getElementById('cat-jump-live');
    if (jumpLive) {
      jumpLive.onclick = () => {
        Sound.click();
        state.catTab = 'live';
        renderPanel();
      };
    }

    const cheerBtn = document.getElementById('cat-cheer-btn');
    if (cheerBtn) {
      cheerBtn.onclick = () => {
        Sound.chime();
        world.triggerCheer(cat.id, `🎉 全場為【${cat.name}】熱烈歡呼喝采！`);
        catClubs.forEach((c) => world.triggerCheer(c.id));
        showToast(`👏 已為【${cat.name}】全體師生送出掌聲與歡呼！看，3D 浮空島正在跳躍回應你！`);
      };
    }

    panelEl.querySelectorAll('[data-goto-club]').forEach((el) => {
      el.onclick = () => selectClub(el.dataset.gotoClub);
    });

    panelEl.querySelectorAll('[data-goto-club-live]').forEach((el) => {
      el.onclick = () => {
        selectClub(el.dataset.gotoClubLive);
        state.activeTab = 'live';
        renderPanel();
      };
    });
  }

  function renderClubPanel(panelEl, club) {
    if (!club) return;
    const cat = catMap[club.cat];
    panelEl.style.setProperty('--c', cat.color);

    const idx = CLUBS.findIndex((c) => c.id === club.id);
    const prevClub = CLUBS[(idx - 1 + CLUBS.length) % CLUBS.length];
    const nextClub = CLUBS[(idx + 1) % CLUBS.length];

    const pct = Math.min(100, Math.round((club.enrolled / club.capacity) * 100));
    const isInSlip = state.slip.selectedClubs.has(club.id);
    const photoSrc = club.photo ? `assets/photos/${club.photo}.jpg` : 'assets/photos/baseball.jpg';
    const liveData = club.live || {
      status: `${club.name}師生正專注練習與互動中`,
      energy: 95,
      bubbles: [`${club.icon} 一起來參加${club.short}！`],
      steps: [],
      dialogues: []
    };

    const currentTimeTheme = resolveTimeTheme(state.timeMode);
    const isDay = currentTimeTheme === 'day';

    let bodyHtml = '';
    if (state.activeTab === 'intro') {
      bodyHtml = `
        <div class="club-photo-banner">
          <img src="${photoSrc}" alt="${club.name}" onerror="this.style.display='none'" />
        </div>
        <div class="live-status-card" style="cursor:pointer;" id="club-jump-live">
          <div class="live-status-top">
            <span class="live-now-pill" style="${isDay ? '' : (currentTimeTheme === 'dusk' ? 'background:#ea580c;' : 'background:#475569;')}">${isDay ? 'LIVE 活動中實況' : (currentTimeTheme === 'dusk' ? '🌇 傍晚放學休憩中' : '🌙 夜間非上課時段')}</span>
            <span style="font-size:11.5px;font-weight:800;color:${cat.color};">${isDay ? '點此看課堂流程與對話 ›' : '點此看課程進度與資訊 ›'}</span>
          </div>
          <div style="font-weight:900;font-size:13.8px;color:var(--ink);">
            🎬 ${isDay ? liveData.status : (currentTimeTheme === 'dusk' ? '傍晚放學時段：師生已放學返家，校園沉靜休憩。點擊上方「時段」切換至「☀️ 白天」可觀看 106+ 師生上課現場！' : '夜間校園靜謐星空，師生非上課時段。點擊上方「時段」切換至「☀️ 白天」可觀看 106+ 師生上課現場！')}
          </div>
        </div>
        <div class="notice-box">
          <b>🏝️ 所屬群島：</b>${cat.emoji} ${cat.name}（課程序號 #${club.no}）<br/>
          <b>👤 可選修年段：</b><span style="color:#c62828;font-weight:900;">${club.gradeTarget}</span><br/>
          <b>📍 上課地點：</b>${club.location}｜<b>👩‍🏫 師資：</b>${club.teacher}
        </div>
        <p class="para">${club.desc}</p>

        <h4>✨ 核心課程與學習內容</h4>
        <div class="chips">
          ${(club.courses || []).map((c) => `<span class="chip">${c}</span>`).join('')}
        </div>

        ${
          club.highlights && club.highlights.length
            ? `
          <h4>🏆 社團亮點與特色榮耀</h4>
          <ul class="features">
            ${club.highlights.map((h) => `<li>${h}</li>`).join('')}
          </ul>
        `
            : ''
        }

        <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;">
          <button id="panel-add-slip" class="reg-btn" style="flex:1;padding:10px 14px;">
            ${isInSlip ? '✓ 已加入我的選課志願單（點擊查看）' : '＋ 將此社團加入我的選課志願單'}
          </button>
          <button id="panel-edit-club" class="tb" style="border:1px solid var(--line);background:var(--paper-2);" title="編輯或更新此社團簡介資料">
            ✏️ 編輯簡介
          </button>
        </div>
      `;
    } else if (state.activeTab === 'live') {
      bodyHtml = `
        <div class="live-status-card">
          <div class="live-status-top">
            <span class="live-now-pill" style="${isDay ? '' : (currentTimeTheme === 'dusk' ? 'background:#ea580c;' : 'background:#475569;')}">${isDay ? 'LIVE 上課中實況' : (currentTimeTheme === 'dusk' ? '🌇 傍晚放學休憩中' : '🌙 夜間非上課時段')}</span>
            <span style="font-size:11.5px;font-weight:800;color:var(--ink-2);">📍 ${club.location}</span>
          </div>
          <div style="font-weight:900;font-size:15px;color:var(--ink);margin-top:2px;">
            ${isDay ? liveData.status : (currentTimeTheme === 'dusk' ? `${club.name} 今日社團課程已圓滿結束，學員與老師放學返家休憩中` : `${club.name} 夜間休館中，星光照映專屬展台，期待明日晨光精彩課程`)}
          </div>
          <div class="live-energy-wrap">
            <div class="live-energy-head">
              <span>${isDay ? '🔥 現場師生專注與活力指數' : '💤 夜間靜謐沉思指數'}</span>
              <span id="live-energy-val" style="color:${cat.color};font-weight:900;">${isDay ? liveData.energy + '%' : (currentTimeTheme === 'dusk' ? '25%' : '10%')}</span>
            </div>
            <div class="live-energy-bar">
              <i id="live-energy-fill" style="width:${isDay ? Math.min(100, liveData.energy) : (currentTimeTheme === 'dusk' ? 25 : 10)}%"></i>
            </div>
          </div>
        </div>

        <h4>⏱️ 社團課堂三階段實況進度</h4>
        <div class="live-steps">
          ${(liveData.steps || [])
            .map(
              (s) => `
            <div class="live-step-item">
              <div class="live-step-phase">▶ ${s.phase} ${s.time ? `<small style="opacity:0.75;font-weight:700;">（${s.time}）</small>` : ''}</div>
              <div class="live-step-detail">${s.desc || s.detail || ''}</div>
            </div>
          `
            )
            .join('')}
        </div>

        <h4>💬 現場師生即時互動對話</h4>
        <div class="live-chat-list">
          ${(liveData.dialogues || [])
            .map((d) => {
              const isT = d.role.includes('教練') || d.role.includes('老師');
              return `
              <div class="live-chat-item">
                <span class="live-chat-role ${isT ? 'is-teacher' : ''}">${isT ? '👩‍🏫 ' : '🧒 '}${d.role}</span>
                <div class="live-chat-text">「${d.text}」</div>
              </div>
            `;
            })
            .join('')}
        </div>

        <button id="club-cheer-btn" class="cheer-btn">
          👏 為【${club.name}】師生加油歡呼！（觸發 3D 展台喝采）
        </button>
      `;
    } else if (state.activeTab === 'data') {
      bodyHtml = `
        <h4>📊 社團名額與選修年段分佈</h4>
        <div class="tiles">
          <div class="tile">
            <span class="tile-label">目前登記人數</span>
            <div class="tile-val">${club.enrolled} <small>人</small></div>
          </div>
          <div class="tile">
            <span class="tile-label">班級名額上限</span>
            <div class="tile-val">${club.capacity} <small>人</small></div>
          </div>
          <div class="tile">
            <span class="tile-label">名額熱度</span>
            <div class="tile-val">${pct} <small>%</small></div>
          </div>
          <div class="tile">
            <span class="tile-label">開放年級數</span>
            <div class="tile-val" style="color:${cat.color};">${club.grades.length} <small>個年級</small></div>
          </div>
        </div>

        <div class="quota-adjust">
          <div>
            <b style="font-size:13px;">即時人數動態調整（展示／管理）</b>
            <div style="font-size:11.5px;color:var(--muted);">可即時增減並自動儲存於瀏覽器</div>
          </div>
          <div class="quota-btns">
            <button id="q-minus" title="減少 1 人">－</button>
            <span style="font-weight:900;min-width:36px;text-align:center;">${club.enrolled}</span>
            <button id="q-plus" title="增加 1 人">＋</button>
          </div>
        </div>

        <h4>🎯 1～6 年級可選修資格核對</h4>
        <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px;text-align:center;margin-top:8px;">
          ${[1, 2, 3, 4, 5, 6]
            .map((g) => {
              const ok = club.grades.includes(g);
              return `
              <div style="padding:10px 4px;border-radius:10px;border:1.5px solid ${ok ? cat.color : 'var(--line)'};background:${ok ? cat.soft : 'var(--paper-2)'};opacity:${ok ? 1 : 0.45};">
                <div style="font-size:12px;font-weight:800;">${g}年級</div>
                <div style="font-size:16px;font-weight:900;color:${ok ? cat.color : 'var(--muted)'};margin-top:2px;">${ok ? '✔ 可選' : '—'}</div>
              </div>
            `;
            })
            .join('')}
        </div>
      `;
    } else if (state.activeTab === 'matrix') {
      const sameCatClubs = CLUBS.filter((c) => c.cat === club.cat);
      bodyHtml = `
        <h4>🏝️ 【${cat.name}】同領域社團年級對照</h4>
        <p class="para" style="font-size:12.5px;">點擊任一社團可立即在 3D 浮空島上切換聚焦：</p>
        <table class="matrix-table">
          <thead>
            <tr>
              <th>社團</th>
              <th>一</th><th>二</th><th>三</th><th>四</th><th>五</th><th>六</th>
            </tr>
          </thead>
          <tbody>
            ${sameCatClubs
              .map(
                (c) => `
              <tr style="${c.id === club.id ? 'background:#fff6e5;' : ''}">
                <td class="club-name" style="cursor:pointer;" data-goto-club="${c.id}">
                  ${c.icon} ${c.short}
                </td>
                ${[1, 2, 3, 4, 5, 6]
                  .map(
                    (g) =>
                      `<td>${c.grades.includes(g) ? `<span class="check-dot" style="background:${cat.color}">✔</span>` : ''}</td>`
                  )
                  .join('')}
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
        <div style="margin-top:14px;">
          <button id="panel-open-full-matrix" class="tour-btn" style="width:100%;">
            📊 開啟全校 20 社團完整選課導航矩陣
          </button>
        </div>
      `;
    }

    panelEl.innerHTML = `
      <div class="panel-head">
        <div class="panel-nav">
          <button class="nav-circle" id="panel-prev" title="上一個社團 (←)">‹</button>
          <button class="nav-circle" id="panel-next" title="下一個社團 (→)">›</button>
          <span class="kind" style="cursor:pointer;" id="panel-back-cat">‹ 返回 ${cat.name}</span>
          <button class="x" id="panel-close" title="關閉 (Esc)">×</button>
        </div>
        <h2>${club.icon} ${club.name}</h2>
        <p class="tagline">${club.tagline}</p>
        <div class="group-meta">
          <span>👤 ${club.gradeTarget}</span>
          <span>📍 ${club.location}</span>
          <span>👩‍🏫 ${club.teacher}</span>
        </div>
        <div class="tabs">
          <button class="${state.activeTab === 'intro' ? 'on' : ''}" data-tab="intro">簡介與照片</button>
          <button class="${state.activeTab === 'live' ? 'on' : ''}" data-tab="live">🎬 活動中實況</button>
          <button class="${state.activeTab === 'data' ? 'on' : ''}" data-tab="data">名額 (${club.enrolled}/${club.capacity})</button>
          <button class="${state.activeTab === 'matrix' ? 'on' : ''}" data-tab="matrix">同島比較</button>
        </div>
      </div>
      <div class="panel-body">
        ${bodyHtml}
      </div>
    `;

    document.getElementById('panel-prev').onclick = () => selectClub(prevClub);
    document.getElementById('panel-next').onclick = () => selectClub(nextClub);
    document.getElementById('panel-back-cat').onclick = () => selectCategory(cat.id);
    document.getElementById('panel-close').onclick = () => clearSelection();

    panelEl.querySelectorAll('.tabs button').forEach((b) => {
      b.onclick = () => {
        Sound.click();
        state.activeTab = b.dataset.tab;
        renderPanel();
      };
    });

    const jumpLiveBtn = document.getElementById('club-jump-live');
    if (jumpLiveBtn) {
      jumpLiveBtn.onclick = () => {
        Sound.click();
        state.activeTab = 'live';
        renderPanel();
      };
    }

    const clubCheerBtn = document.getElementById('club-cheer-btn');
    if (clubCheerBtn) {
      clubCheerBtn.onclick = () => {
        Sound.chime();
        if (club.live) {
          club.live.energy = Math.min(100, (club.live.energy || 95) + 1);
        }
        world.triggerCheer(club.id, `👏 太棒了！全場為【${club.short}】大聲喝采！🎉`);
        renderPanel();
        showToast(`🎉 已為【${club.name}】送上熱烈歡呼！看，3D 微縮舞台上的小福星們正在跳躍喝采！`);
      };
    }

    const addSlipBtn = document.getElementById('panel-add-slip');
    if (addSlipBtn) {
      addSlipBtn.onclick = () => {
        state.slip.selectedClubs.add(club.id);
        openSlipModal();
        renderPanel();
      };
    }

    const editClubBtn = document.getElementById('panel-edit-club');
    if (editClubBtn) {
      editClubBtn.onclick = () => openDataManagerModal(club.id);
    }

    const qMinus = document.getElementById('q-minus');
    const qPlus = document.getElementById('q-plus');
    if (qMinus) {
      qMinus.onclick = () => {
        club.enrolled = Math.max(0, club.enrolled - 1);
        saveCustomClubData();
        renderPanel();
      };
    }
    if (qPlus) {
      qPlus.onclick = () => {
        club.enrolled = Math.min(club.capacity + 10, club.enrolled + 1);
        saveCustomClubData();
        renderPanel();
      };
    }

    const fullMatBtn = document.getElementById('panel-open-full-matrix');
    if (fullMatBtn) fullMatBtn.onclick = () => openMatrixModal();

    panelEl.querySelectorAll('[data-goto-club]').forEach((el) => {
      el.onclick = () => selectClub(el.dataset.gotoClub);
    });
  }

  // =========================================================
  // 清單與 20 社團總表視圖 (List View)
  // =========================================================
  function renderListView() {
    const lv = document.getElementById('list-view');
    if (state.view !== 'list') {
      lv.classList.add('hidden');
      return;
    }
    lv.classList.remove('hidden');

    lv.innerHTML = `
      <div class="list-inner">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
          <div>
            <h2 style="margin:0;font-size:22px;font-weight:900;">🌟 屏東縣復興國小「福星社團翱翔島」5 大類 20 社團總覽</h2>
            <p style="margin:4px 0 0;color:var(--ink-2);font-size:13.5px;">
              可輸入關鍵字即時篩選，或點選任一社團卡片直接飛往該座 3D 浮空島展台！
            </p>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <input type="text" id="list-search-input" placeholder="🔍 搜尋社團名稱、特色或年級..." style="padding:8px 14px;border-radius:999px;border:1.5px solid var(--accent);background:#fff;font-size:13.5px;font-weight:700;min-width:240px;" />
            <button id="list-close-btn" class="tour-btn" style="padding:8px 16px;">返回 3D 浮空群島 ›</button>
          </div>
        </div>

        <div class="cards" id="list-cards-grid"></div>
      </div>
    `;

    const gridEl = document.getElementById('list-cards-grid');
    const searchInput = document.getElementById('list-search-input');

    function renderCards(items) {
      gridEl.innerHTML = items
        .map((c) => {
          const cat = catMap[c.cat];
          const photo = c.photo ? `assets/photos/${c.photo}.jpg` : 'assets/photos/baseball.jpg';
          return `
            <button class="card" style="--c:${cat.color}" data-list-club="${c.id}">
              <div class="card-thumb">
                <img src="${photo}" alt="${c.name}" onerror="this.style.display='none'" />
              </div>
              <span class="card-kind">${cat.emoji} ${cat.name}｜#${c.no}</span>
              <b>${c.icon} ${c.name}</b>
              <span class="card-tag">${c.desc}</span>
              <span class="card-stat">👤 ${c.gradeTarget}（名額 ${c.enrolled}/${c.capacity}）</span>
            </button>
          `;
        })
        .join('');

      gridEl.querySelectorAll('[data-list-club]').forEach((btn) => {
        btn.onclick = () => {
          state.view = 'panorama';
          renderListView();
          selectClub(btn.dataset.listClub);
        };
      });
    }

    renderCards(CLUBS);

    searchInput.oninput = (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (!q) {
        renderCards(CLUBS);
        return;
      }
      const filtered = CLUBS.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.desc.toLowerCase().includes(q) ||
          c.gradeTarget.toLowerCase().includes(q) ||
          (c.tags && c.tags.some((t) => t.toLowerCase().includes(q)))
      );
      renderCards(filtered);
    };

    document.getElementById('list-close-btn').onclick = () => {
      state.view = 'panorama';
      renderListView();
      renderToolbar();
    };
  }

  // =========================================================
  // 群島自動巡航導覽 (Auto Tour)
  // =========================================================
  function startTour() {
    Sound.chime();
    state.selectedType = null;
    state.selectedId = null;
    state.view = 'panorama';
    state.tour = { idx: 0, paused: false, progress: 0 };
    renderListView();
    renderPanel();
    syncTourStep();
    renderTour();
    renderToolbar();
  }

  function stopTour() {
    state.tour = null;
    world.focusOverview('panorama');
    renderTour();
    renderToolbar();
  }

  function syncTourStep() {
    if (!state.tour) return;
    const cat = CATEGORIES[state.tour.idx];
    world.focusCategory(cat.id);
    world.setHovered(cat.id);
  }

  function stepTour(delta) {
    if (!state.tour) return;
    state.tour.idx = (state.tour.idx + delta + CATEGORIES.length) % CATEGORIES.length;
    state.tour.progress = 0;
    syncTourStep();
    renderTour();
  }

  function renderTour() {
    const el = document.getElementById('tour-box');
    if (!state.tour) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    const cat = CATEGORIES[state.tour.idx];
    el.style.setProperty('--c', cat.color);

    el.innerHTML = `
      <div class="tour-bar"><i id="tour-prog-bar" style="width:${state.tour.progress}%"></i></div>
      <div class="tour-main">
        <div class="tour-text">
          <div class="tour-head">
            <span class="tour-step">${state.tour.idx + 1} / ${CATEGORIES.length}</span>
            <span class="tour-kind">${cat.badge}</span>
            ${state.tour.paused ? `<span style="color:#c0602a;font-weight:800;">已暫停</span>` : ''}
          </div>
          <h3>${cat.emoji} ${cat.fullName}</h3>
          <p class="tour-tag">✨ ${cat.slogan}</p>
          <p class="tour-scene">👀 ${cat.sceneDesc}</p>
        </div>
        <div class="tour-ctrl">
          <button id="t-prev" title="上一座島">‹</button>
          <button id="t-pause" title="暫停／繼續">${state.tour.paused ? '▶' : '❚❚'}</button>
          <button id="t-next" title="下一座島">›</button>
          <button id="t-close" title="結束導覽">✕</button>
          <button id="t-detail" class="tour-more">進入群島看社團 ›</button>
        </div>
      </div>
      <div class="tour-dots">
        ${CATEGORIES.map(
          (it, i) => `
          <button class="${i === state.tour.idx ? 'on' : ''}" style="--c:${it.color}" data-tdot="${i}" title="${it.name}"></button>
        `
        ).join('')}
      </div>
    `;

    document.getElementById('t-prev').onclick = () => stepTour(-1);
    document.getElementById('t-next').onclick = () => stepTour(1);
    document.getElementById('t-pause').onclick = () => {
      state.tour.paused = !state.tour.paused;
      renderTour();
    };
    document.getElementById('t-close').onclick = () => stopTour();
    document.getElementById('t-detail').onclick = () => {
      const targetId = cat.id;
      stopTour();
      selectCategory(targetId);
    };
    el.querySelectorAll('[data-tdot]').forEach((b) => {
      b.onclick = () => {
        state.tour.idx = Number(b.dataset.tdot);
        state.tour.progress = 0;
        syncTourStep();
        renderTour();
      };
    });
  }

  setInterval(() => {
    if (state.tour && !state.tour.paused && state.animate) {
      state.tour.progress += 1.4;
      const bar = document.getElementById('tour-prog-bar');
      if (bar) bar.style.width = `${Math.min(100, state.tour.progress)}%`;
      if (state.tour.progress >= 100) {
        stepTour(1);
      }
    }
  }, 100);

  // =========================================================
  // 彈窗 1：1～6 年級社團選課導航矩陣 (Course Navigation Matrix)
  // =========================================================
  function openMatrixModal() {
    Sound.pop();
    const wrap = document.getElementById('modal-wrap');
    wrap.classList.remove('hidden');

    let rowsHtml = '';
    CATEGORIES.filter((c) => c.id !== 'hub').forEach((cat) => {
      const catClubs = CLUBS.filter((c) => c.cat === cat.id);
      catClubs.forEach((club, idx) => {
        rowsHtml += `
          <tr>
            ${
              idx === 0
                ? `<td rowspan="${catClubs.length}" class="cat-header" style="background:${cat.color}">${cat.short}</td>`
                : ''
            }
            <td style="font-weight:800;color:var(--muted);">#${club.no}</td>
            <td class="club-name" style="cursor:pointer;" data-mat-club="${club.id}">
              ${club.icon} ${club.name}
              ${club.allSchool ? `<span style="background:#ffedd5;color:#ea580c;font-size:10px;padding:1px 5px;border-radius:6px;margin-left:4px;">全校</span>` : ''}
            </td>
            ${[1, 2, 3, 4, 5, 6]
              .map((g) => {
                const ok = club.grades.includes(g);
                return `<td>${ok ? `<span class="check-dot" style="background:${cat.color}">✔</span>` : ''}</td>`;
              })
              .join('')}
          </tr>
        `;
      });
    });

    wrap.innerHTML = `
      <div class="modal-card" style="width:min(820px, 100%);">
        <button class="x modal-close" id="modal-x">×</button>
        <p class="eyebrow">COURSE NAVIGATION MATRIX</p>
        <h2 style="margin:0 0 6px;font-size:22px;font-weight:900;">📊 屏東縣復興國小 20 項社團選課導航矩陣</h2>
        <p style="margin:0 0 10px;font-size:13.5px;color:var(--ink-2);">
          一秒對應 1～6 年級可選修資格！點擊表格中任一社團名稱，即可駕駛鏡頭飛往該座 3D 社團展台：
        </p>
        <div style="overflow-x:auto;">
          <table class="matrix-table">
            <thead>
              <tr>
                <th style="width:42px;">群島</th>
                <th style="width:45px;">序號</th>
                <th>課程名稱（點擊飛往 3D 展台）</th>
                <th style="width:46px;">一年級</th>
                <th style="width:46px;">二年級</th>
                <th style="width:46px;">三年級</th>
                <th style="width:46px;">四年級</th>
                <th style="width:46px;">五年級</th>
                <th style="width:46px;">六年級</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('modal-x').onclick = () => wrap.classList.add('hidden');
    wrap.onclick = (e) => {
      if (e.target === wrap) wrap.classList.add('hidden');
    };
    wrap.querySelectorAll('[data-mat-club]').forEach((td) => {
      td.onclick = () => {
        wrap.classList.add('hidden');
        selectClub(td.dataset.matClub);
      };
    });
  }

  // =========================================================
  // 彈窗 2：福星社團適性探索小測驗 (Aptitude Quiz)
  // =========================================================
  function openQuizModal() {
    Sound.pop();
    const wrap = document.getElementById('modal-wrap');
    wrap.classList.remove('hidden');
    renderQuizContent();
  }

  function renderQuizContent() {
    const wrap = document.getElementById('modal-wrap');

    if (state.quizStep >= QUIZ.length) {
      const scores = { ball: 0, move: 0, music: 0, craft: 0, mind: 0 };
      state.quizAnswers.forEach((ansIdx, qIdx) => {
        const weights = QUIZ[qIdx].a[ansIdx][1];
        Object.entries(weights).forEach(([cid, w]) => {
          scores[cid] = (scores[cid] || 0) + w;
        });
      });

      const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
      const bestCatId = ranked[0][0];
      const bestCat = catMap[bestCatId];
      const recClubs = CLUBS.filter((c) => c.cat === bestCatId);

      wrap.innerHTML = `
        <div class="modal-card" style="width:min(600px, 100%);">
          <button class="x modal-close" id="modal-x">×</button>
          <p class="eyebrow">APTITUDE RESULT</p>
          <h2 style="margin:0 0 8px;font-size:22px;font-weight:900;color:${bestCat.color};">
            🎉 測驗完成！最適合你的群島是：【${bestCat.emoji} ${bestCat.name}】
          </h2>
          <p style="margin:0 0 12px;font-size:14px;color:var(--ink-2);font-weight:600;">
            ${bestCat.slogan} — ${bestCat.desc}
          </p>

          <h4 style="margin:12px 0 8px;font-size:14px;">🌟 為你推薦該島上的專屬社團（點擊立即飛往 3D 展台）：</h4>
          <div style="display:grid;gap:8px;">
            ${recClubs
              .map(
                (c) => `
              <div style="border:1.5px solid ${bestCat.color};background:var(--paper-2);border-radius:12px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px;">
                <div>
                  <b style="font-size:16px;">${c.icon} ${c.name}</b>
                  <span style="font-size:11.5px;color:${bestCat.color};font-weight:800;margin-left:6px;">${c.gradeTarget}</span>
                  <div style="font-size:12px;color:var(--ink-2);margin-top:2px;">${c.tagline}</div>
                </div>
                <button class="tour-btn" style="background:${bestCat.color};padding:7px 14px;" data-quiz-club="${c.id}">飛去看看 ›</button>
              </div>
            `
              )
              .join('')}
          </div>

          <div style="margin-top:16px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">
            <button class="tb" id="quiz-restart" style="background:var(--paper-2);">↻ 重新測驗</button>
            <div style="display:flex;gap:8px;">
              <button class="tour-btn" id="quiz-fly-island" style="background:${bestCat.color};">✈️ 飛往 ${bestCat.name}</button>
              <button class="reg-btn" id="quiz-to-slip">📝 加入選課志願回條 ›</button>
            </div>
          </div>
        </div>
      `;

      document.getElementById('modal-x').onclick = () => wrap.classList.add('hidden');
      document.getElementById('quiz-restart').onclick = () => {
        state.quizStep = 0;
        state.quizAnswers = [];
        renderQuizContent();
      };
      document.getElementById('quiz-fly-island').onclick = () => {
        wrap.classList.add('hidden');
        selectCategory(bestCatId);
      };
      document.getElementById('quiz-to-slip').onclick = () => {
        recClubs.forEach((c) => state.slip.selectedClubs.add(c.id));
        openSlipModal();
      };
      wrap.querySelectorAll('[data-quiz-club]').forEach((b) => {
        b.onclick = () => {
          wrap.classList.add('hidden');
          selectClub(b.dataset.quizClub);
        };
      });
      return;
    }

    const qObj = QUIZ[state.quizStep];
    wrap.innerHTML = `
      <div class="modal-card" style="width:min(560px, 100%);">
        <button class="x modal-close" id="modal-x">×</button>
        <p class="eyebrow">復興國小福星社團適性探索（第 ${state.quizStep + 1} / ${QUIZ.length} 題）</p>
        <h2 style="margin:4px 0 12px;font-size:20px;font-weight:900;">${state.quizStep + 1}. ${qObj.q}</h2>
        <div class="opts">
          ${qObj.a.map(([label], i) => `<button data-qans="${i}">${label}</button>`).join('')}
        </div>
        ${
          state.quizStep > 0
            ? `<button class="tb" id="quiz-prev" style="background:var(--paper-2);">‹ 上一題</button>`
            : ''
        }
      </div>
    `;

    document.getElementById('modal-x').onclick = () => wrap.classList.add('hidden');
    const prevBtn = document.getElementById('quiz-prev');
    if (prevBtn) {
      prevBtn.onclick = () => {
        state.quizStep--;
        renderQuizContent();
      };
    }
    wrap.querySelectorAll('[data-qans]').forEach((btn) => {
      btn.onclick = () => {
        Sound.click();
        state.quizAnswers[state.quizStep] = Number(btn.dataset.qans);
        state.quizStep++;
        renderQuizContent();
      };
    });
  }

  // =========================================================
  // 彈窗 3：數位化「社團選課志願回條」與年級資格自動檢核
  // =========================================================
  function openSlipModal() {
    Sound.pop();
    const wrap = document.getElementById('modal-wrap');
    wrap.classList.remove('hidden');
    renderSlipContent();
  }

  function renderSlipContent() {
    const wrap = document.getElementById('modal-wrap');
    const gNum = Number(state.slip.grade);
    const sel = state.slip.selectedClubs;

    // 移除不符合當前選擇年級的勾選
    CLUBS.forEach((c) => {
      if (!c.grades.includes(gNum) && sel.has(c.id)) {
        sel.delete(c.id);
      }
    });

    wrap.innerHTML = `
      <div class="modal-card" style="width:min(820px, 100%);">
        <button class="x modal-close" id="modal-x">×</button>
        <p class="eyebrow">DIGITAL REGISTRATION SLIP</p>
        <h2 style="margin:0 0 4px;font-size:21px;font-weight:900;">📝 屏東縣復興國小 學生社團選課志願回條試算</h2>
        <p style="margin:0 0 10px;font-size:13px;color:var(--ink-2);">
          選擇孩子的年級後，系統會自動過濾出該年級可報名的彈性社團，並可一鍵列印志願回條！
        </p>

        <div class="slip-form" id="printable-slip">
          <div style="text-align:center;font-weight:900;font-size:16.5px;margin-bottom:10px;border-bottom:1px dashed var(--line);padding-bottom:6px;">
            屏東縣復興國民小學 ${SCHOOL.term} 彈性課程【社團活動】選課志願表
          </div>
          <div class="slip-inputs">
            <label>
              目前年級（自動核對資格）
              <select id="slip-grade">
                <option value="1" ${gNum === 1 ? 'selected' : ''}>一年級</option>
                <option value="2" ${gNum === 2 ? 'selected' : ''}>二年級</option>
                <option value="3" ${gNum === 3 ? 'selected' : ''}>三年級</option>
                <option value="4" ${gNum === 4 ? 'selected' : ''}>四年級</option>
                <option value="5" ${gNum === 5 ? 'selected' : ''}>五年級</option>
                <option value="6" ${gNum === 6 ? 'selected' : ''}>六年級</option>
              </select>
            </label>
            <label>
              班級名稱
              <input type="text" id="slip-cls" value="${state.slip.cls}" placeholder="例：三年甲班" />
            </label>
            <label>
              座號
              <input type="text" id="slip-seat" value="${state.slip.seat}" placeholder="例：1" />
            </label>
            <label>
              學生姓名
              <input type="text" id="slip-name" value="${state.slip.name}" placeholder="請輸入學生姓名" />
            </label>
          </div>

          <div style="font-size:13px;font-weight:800;margin-bottom:8px;">
            🌟 符合【${gNum} 年級】資格之社團勾選（目前已勾選 <span style="color:var(--accent);font-size:15px;">${sel.size}</span> 項志願）：
          </div>

          <div class="slip-checks">
            ${CLUBS.map((c) => {
              const cat = catMap[c.cat];
              const eligible = c.grades.includes(gNum);
              const checked = sel.has(c.id) && eligible;
              return `
                <label class="slip-item ${checked ? 'checked' : ''} ${!eligible ? 'disabled' : ''}">
                  <input type="checkbox" data-slip-club="${c.id}" ${checked ? 'checked' : ''} ${!eligible ? 'disabled' : ''} />
                  <div>
                    <div style="font-weight:800;font-size:13px;">#${c.no} ${c.icon} ${c.short}</div>
                    <div style="font-size:10.5px;color:${cat.color};font-weight:700;">${cat.short}｜${eligible ? '✔ 符合資格' : `限 ${c.grades.join(',')} 年級`}</div>
                  </div>
                </label>
              `;
            }).join('')}
          </div>

          <div style="margin-top:14px;display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--ink-2);border-top:1px dashed var(--line);padding-top:10px;">
            <span>★ 選課三步驟：確認年級資格 → 排定志願 → 完成登記（詳洽學務處活動組）</span>
            <span style="font-weight:800;">家長簽名：___________________</span>
          </div>
        </div>

        <div style="margin-top:14px;display:flex;justify-content:flex-end;gap:8px;">
          <button class="tb" id="slip-close" style="background:var(--paper-2);">繼續探索群島</button>
          <button class="reg-btn" id="slip-print">🖨️ 列印志願單／儲存</button>
        </div>
      </div>
    `;

    document.getElementById('modal-x').onclick = () => wrap.classList.add('hidden');
    document.getElementById('slip-close').onclick = () => wrap.classList.add('hidden');

    document.getElementById('slip-grade').onchange = (e) => {
      state.slip.grade = e.target.value;
      const gn = Number(e.target.value);
      const cn = ['一', '二', '三', '四', '五', '六'][gn - 1];
      state.slip.cls = `${cn}年甲班`;
      renderSlipContent();
    };
    document.getElementById('slip-cls').oninput = (e) => (state.slip.cls = e.target.value);
    document.getElementById('slip-seat').oninput = (e) => (state.slip.seat = e.target.value);
    document.getElementById('slip-name').oninput = (e) => (state.slip.name = e.target.value);

    wrap.querySelectorAll('[data-slip-club]').forEach((cb) => {
      cb.onchange = () => {
        const cid = cb.dataset.slipClub;
        if (cb.checked) state.slip.selectedClubs.add(cid);
        else state.slip.selectedClubs.delete(cid);
        renderSlipContent();
      };
    });

    document.getElementById('slip-print').onclick = () => {
      showToast('✅ 已儲存選課志願！正在開啟列印預覽…');
      setTimeout(() => window.print(), 300);
    };
  }

  // =========================================================
  // 彈窗 4：學校社團簡介資料上傳／即時編輯管理系統 (Data Manager)
  // 滿足使用者「需要再上傳學校社團的簡介資料」之擴充需求！
  // =========================================================
  function openDataManagerModal(initialClubId = 'baseball') {
    Sound.pop();
    const wrap = document.getElementById('modal-wrap');
    wrap.classList.remove('hidden');

    let currentEditId = initialClubId || CLUBS[0].id;

    function renderMgr() {
      const club = clubMap[currentEditId] || CLUBS[0];
      const cat = catMap[club.cat];

      wrap.innerHTML = `
        <div class="modal-card" style="width:min(840px, 100%);">
          <button class="x modal-close" id="modal-x">×</button>
          <p class="eyebrow">CLUB DATA & BRIEFING UPLOAD MANAGER</p>
          <h2 style="margin:0 0 4px;font-size:21px;font-weight:900;">📥 復興國小 20 社團簡介資料上傳與即時編輯中心</h2>
          <p style="margin:0 0 12px;font-size:13px;color:var(--ink-2);">
            老師可在此直接選擇任一社團修改簡介、師資、上課地點與課程亮點，或<b>上傳 JSON / CSV 社團簡介檔</b>一鍵批次更新！修改後將即時套用至 3D 浮空島，亦可匯出最新 <code>data.js</code>。
          </p>

          <!-- 批次檔案上傳區 -->
          <div style="background:#f5f0ff;border:1.5px dashed #8b5cf6;border-radius:14px;padding:12px 16px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
            <div>
              <b style="color:#5b21b6;font-size:13.5px;">📂 批次匯入／上傳社團簡介檔案（支援 .json 或 .csv 格式）</b>
              <div style="font-size:11.5px;color:var(--ink-2);">CSV 欄位範例：<code>社團名稱,指導師資,上課地點,上課時間,社團簡介,課程重點</code></div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
              <input type="file" id="mgr-file-input" accept=".json,.csv,.txt" style="display:none;" />
              <button class="mgr-btn" id="mgr-trigger-file" style="padding:7px 14px;font-size:12.5px;">📤 選擇檔案上傳匯入</button>
              <button class="tb" id="mgr-export-json" style="background:#fff;border:1px solid var(--line);font-size:12px;">💾 匯出備份 JSON</button>
              <button class="tb" id="mgr-reset-default" style="background:#fff;border:1px solid var(--line);font-size:12px;color:#c62828;">↻ 還原預設</button>
            </div>
          </div>

          <!-- 單一社團即時編輯表單 -->
          <div style="background:var(--paper-2);border:1px solid var(--line);border-radius:14px;padding:14px;">
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:10px;">
              <label style="font-size:12px;font-weight:800;color:var(--ink-2);">
                選擇要編輯的社團（共 20 個）：
                <select id="mgr-select-club" style="width:100%;padding:7px 10px;border-radius:8px;border:1.5px solid ${cat.color};background:#fff;font-weight:800;margin-top:4px;">
                  ${CLUBS.map(
                    (c) => `
                    <option value="${c.id}" ${c.id === club.id ? 'selected' : ''}>
                      #${c.no} ${c.icon} ${c.name}（${catMap[c.cat].short}）
                    </option>
                  `
                  ).join('')}
                </select>
              </label>

              <label style="font-size:12px;font-weight:800;color:var(--ink-2);">
                指導師資：
                <input type="text" id="mgr-teacher" value="${club.teacher}" style="width:100%;padding:7px 10px;border-radius:8px;border:1px solid var(--line);background:#fff;margin-top:4px;" />
              </label>

              <label style="font-size:12px;font-weight:800;color:var(--ink-2);">
                上課教室／地點：
                <input type="text" id="mgr-location" value="${club.location}" style="width:100%;padding:7px 10px;border-radius:8px;border:1px solid var(--line);background:#fff;margin-top:4px;" />
              </label>

              <label style="font-size:12px;font-weight:800;color:var(--ink-2);">
                上課時間／時段說明：
                <input type="text" id="mgr-schedule" value="${club.schedule}" style="width:100%;padding:7px 10px;border-radius:8px;border:1px solid var(--line);background:#fff;margin-top:4px;" />
              </label>
            </div>

            <label style="display:block;font-size:12px;font-weight:800;color:var(--ink-2);margin-bottom:8px;">
              一句話特色標語 (Tagline)：
              <input type="text" id="mgr-tagline" value="${club.tagline}" style="width:100%;padding:7px 10px;border-radius:8px;border:1px solid var(--line);background:#fff;margin-top:4px;" />
            </label>

            <label style="display:block;font-size:12px;font-weight:800;color:var(--ink-2);margin-bottom:8px;">
              📖 社團詳細簡介說明：
              <textarea id="mgr-desc" rows="3" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--line);background:#fff;margin-top:4px;line-height:1.5;">${club.desc}</textarea>
            </label>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              <label style="font-size:12px;font-weight:800;color:var(--ink-2);">
                ✨ 核心學習內容（以逗號或換行分隔）：
                <textarea id="mgr-courses" rows="3" style="width:100%;padding:7px 10px;border-radius:8px;border:1px solid var(--line);background:#fff;margin-top:4px;">${(club.courses || []).join('\n')}</textarea>
              </label>

              <label style="font-size:12px;font-weight:800;color:var(--ink-2);">
                🏆 社團亮點與榮耀（每行一項）：
                <textarea id="mgr-highlights" rows="3" style="width:100%;padding:7px 10px;border-radius:8px;border:1px solid var(--line);background:#fff;margin-top:4px;">${(club.highlights || []).join('\n')}</textarea>
              </label>
            </div>
          </div>

          <div style="margin-top:14px;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:12px;color:var(--muted);">💡 儲存後自動寫入瀏覽器記憶，並立即更新 3D 浮空島面板</span>
            <div style="display:flex;gap:8px;">
              <button class="tb" id="mgr-close" style="background:var(--paper-2);">關閉</button>
              <button class="reg-btn" id="mgr-save-btn">✅ 儲存此社團簡介並飛往查看</button>
            </div>
          </div>
        </div>
      `;

      document.getElementById('modal-x').onclick = () => wrap.classList.add('hidden');
      document.getElementById('mgr-close').onclick = () => wrap.classList.add('hidden');

      document.getElementById('mgr-select-club').onchange = (e) => {
        currentEditId = e.target.value;
        renderMgr();
      };

      document.getElementById('mgr-save-btn').onclick = () => {
        club.teacher = document.getElementById('mgr-teacher').value.trim() || club.teacher;
        club.location = document.getElementById('mgr-location').value.trim() || club.location;
        club.schedule = document.getElementById('mgr-schedule').value.trim() || club.schedule;
        club.tagline = document.getElementById('mgr-tagline').value.trim() || club.tagline;
        club.desc = document.getElementById('mgr-desc').value.trim() || club.desc;

        const rawCourses = document.getElementById('mgr-courses').value;
        club.courses = rawCourses
          .split(/[\n,，、]+/)
          .map((s) => s.trim())
          .filter(Boolean);

        const rawHl = document.getElementById('mgr-highlights').value;
        club.highlights = rawHl
          .split(/\n+/)
          .map((s) => s.trim())
          .filter(Boolean);

        saveCustomClubData();
        wrap.classList.add('hidden');
        selectClub(club);
        showToast(`✅ 已成功更新【${club.name}】社團簡介資料！`);
      };

      // 檔案上傳解析 (支援 JSON 與 CSV)
      const fileInput = document.getElementById('mgr-file-input');
      document.getElementById('mgr-trigger-file').onclick = () => fileInput.click();
      fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const text = ev.target.result;
          try {
            if (file.name.endsWith('.json')) {
              const data = JSON.parse(text);
              let count = 0;
              if (Array.isArray(data)) {
                data.forEach((item) => {
                  const target = CLUBS.find(
                    (c) => c.id === item.id || c.name === item.name || c.short === item.name || c.no === Number(item.no)
                  );
                  if (target) {
                    Object.assign(target, item);
                    count++;
                  }
                });
              } else if (typeof data === 'object') {
                Object.keys(data).forEach((k) => {
                  if (clubMap[k]) {
                    Object.assign(clubMap[k], data[k]);
                    count++;
                  }
                });
              }
              saveCustomClubData();
              renderMgr();
              showToast(`🎉 成功從 JSON 匯入更新 ${count} 個社團簡介！`);
            } else {
              // 解析 CSV (社團名稱,指導師資,上課地點,上課時間,社團簡介,課程重點)
              const lines = text.split(/\r?\n/).filter((l) => l.trim());
              let count = 0;
              lines.forEach((line, idx) => {
                if (idx === 0 && line.includes('名稱')) return;
                const cols = line.split(',').map((s) => s.trim());
                if (cols.length >= 2) {
                  const nameKey = cols[0];
                  const target = CLUBS.find(
                    (c) => c.name.includes(nameKey) || c.short.includes(nameKey) || nameKey.includes(c.short)
                  );
                  if (target) {
                    if (cols[1]) target.teacher = cols[1];
                    if (cols[2]) target.location = cols[2];
                    if (cols[3]) target.schedule = cols[3];
                    if (cols[4]) target.desc = cols[4];
                    if (cols[5]) target.courses = cols[5].split(/[、/｜|]+/).filter(Boolean);
                    count++;
                  }
                }
              });
              saveCustomClubData();
              renderMgr();
              showToast(`🎉 成功從 CSV 匯入更新 ${count} 個社團簡介！`);
            }
          } catch (err) {
            showToast('⚠️ 檔案格式解析失敗，請確認為 UTF-8 編碼之 JSON 或 CSV');
          }
        };
        reader.readAsText(file, 'UTF-8');
      };

      // 匯出 JSON 備份
      document.getElementById('mgr-export-json').onclick = () => {
        const blob = new Blob([JSON.stringify(CLUBS, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'fuxing_20_clubs_data.json';
        a.click();
        URL.revokeObjectURL(url);
        showToast('💾 已下載社團簡介資料 JSON 備份檔！');
      };

      // 還原預設
      document.getElementById('mgr-reset-default').onclick = () => {
        localStorage.removeItem('fx_custom_clubs_v1');
        window.location.reload();
      };
    }

    renderMgr();
  }

  // =========================================================
  // 彈窗 5：漫遊小學生角色自訂換裝與取名
  // =========================================================
  function openAvatarModal() {
    Sound.pop();
    const wrap = document.getElementById('modal-wrap');
    wrap.classList.remove('hidden');
    renderAvatarModal();
  }

  function renderAvatarModal() {
    const wrap = document.getElementById('modal-wrap');
    const shirtColors = [
      { c: '#e63946', label: '熱情紅' },
      { c: '#3a86ff', label: '晴空藍' },
      { c: '#ffbe0b', label: '活力黃' },
      { c: '#2a9d8f', label: '青草綠' },
      { c: '#8338ec', label: '星夜紫' },
      { c: '#ea580c', label: '少棒橘' }
    ];
    const hatColors = [
      { c: '#2a9d8f', label: '湖水綠' },
      { c: '#e76f51', label: '晨曦橘' },
      { c: '#1d3557', label: '海軍藍' },
      { c: '#ffd166', label: '向日葵黃' },
      { c: '#d62828', label: '烈焰紅' }
    ];

    wrap.innerHTML = `
      <div class="modal-card" style="width:min(520px, 100%);">
        <button class="x modal-close" id="modal-x">×</button>
        <p class="eyebrow">CUSTOM EXPLORER CHARACTER</p>
        <h2 style="margin:0 0 8px;font-size:21px;font-weight:900;">🧑‍🚀 自訂我的復興小福星探險家</h2>
        <p style="margin:0 0 12px;font-size:13px;color:var(--ink-2);">
          為你的 3D 角色取一個名字與專屬稱號，換上喜歡的運動服與球帽，在福星群島的雲海木棧橋上自由奔跑！
        </p>

        <div style="background:var(--paper-2);border:1.5px solid var(--line);border-radius:14px;padding:14px;margin-bottom:14px;">
          <label style="display:block;font-size:12.5px;font-weight:800;color:var(--ink-2);margin-bottom:4px;">
            探險家暱稱／學生姓名：
          </label>
          <input type="text" id="av-name-input" value="${playerProfile.name}" placeholder="輸入你的名字" style="width:100%;font-size:15px;font-weight:800;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:#fff;" />

          <label style="display:block;font-size:12.5px;font-weight:800;color:var(--ink-2);margin:12px 0 4px;">
            選擇福星社團稱號徽章：
          </label>
          <select id="av-title-select" style="width:100%;font-size:14px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:#fff;">
            <option value="復興探險家" ${playerProfile.title === '復興探險家' ? 'selected' : ''}>🌟 復興探險家</option>
            <option value="少棒小國手" ${playerProfile.title === '少棒小國手' ? 'selected' : ''}>⚾ 少棒小國手</option>
            <option value="天籟合唱員" ${playerProfile.title === '天籟合唱員' ? 'selected' : ''}>🎤 天籟合唱員</option>
            <option value="追風直排輪" ${playerProfile.title === '追風直排輪' ? 'selected' : ''}>🛼 追風直排輪</option>
            <option value="柔道小武士" ${playerProfile.title === '柔道小武士' ? 'selected' : ''}>🥋 柔道小武士</option>
            <option value="巧手小藝術家" ${playerProfile.title === '巧手小藝術家' ? 'selected' : ''}>🎨 巧手小藝術家</option>
            <option value="Scratch創客王" ${playerProfile.title === 'Scratch創客王' ? 'selected' : ''}>💻 Scratch 創客王</option>
          </select>

          <label style="display:block;font-size:12.5px;font-weight:800;color:var(--ink-2);margin:12px 0 6px;">
            T-shirt 運動服顏色：
          </label>
          <div class="avatar-colors">
            ${shirtColors
              .map(
                (s) => `
              <div class="color-dot ${playerProfile.shirtColor === s.c ? 'on' : ''}" style="background:${s.c};" data-shirt="${s.c}" title="${s.label}"></div>
            `
              )
              .join('')}
          </div>

          <label style="display:block;font-size:12.5px;font-weight:800;color:var(--ink-2);margin:10px 0 6px;">
            運動棒球帽顏色：
          </label>
          <div class="avatar-colors" style="margin-bottom:0;">
            ${hatColors
              .map(
                (h) => `
              <div class="color-dot ${playerProfile.hatColor === h.c ? 'on' : ''}" style="background:${h.c};" data-hat="${h.c}" title="${h.label}"></div>
            `
              )
              .join('')}
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font-size:12px;color:var(--muted);">
            頭頂名牌預覽：<span style="background:${playerProfile.badgeColor};color:#fff;border-radius:999px;padding:1px 6px;font-size:10px;">${playerProfile.title}</span> <b>${playerProfile.name}</b>
          </div>
          <button class="reg-btn" id="av-save-btn" style="padding:10px 20px;">🚀 儲存造型並出發！</button>
        </div>
      </div>
    `;

    document.getElementById('modal-x').onclick = () => wrap.classList.add('hidden');

    wrap.querySelectorAll('[data-shirt]').forEach((dot) => {
      dot.onclick = () => {
        playerProfile.shirtColor = dot.dataset.shirt;
        playerProfile.badgeColor = dot.dataset.shirt;
        world.updatePlayerCustom(playerProfile);
        renderAvatarModal();
      };
    });

    wrap.querySelectorAll('[data-hat]').forEach((dot) => {
      dot.onclick = () => {
        playerProfile.hatColor = dot.dataset.hat;
        world.updatePlayerCustom(playerProfile);
        renderAvatarModal();
      };
    });

    document.getElementById('av-name-input').oninput = (e) => {
      playerProfile.name = e.target.value.trim() || '小福星';
      world.updatePlayerCustom(playerProfile);
    };

    document.getElementById('av-title-select').onchange = (e) => {
      playerProfile.title = e.target.value;
      world.updatePlayerCustom(playerProfile);
    };

    document.getElementById('av-save-btn').onclick = () => {
      playerProfile.customized = true;
      try {
        localStorage.setItem('fx_player_profile', JSON.stringify(playerProfile));
      } catch (e) {}
      world.updatePlayerCustom(playerProfile);
      wrap.classList.add('hidden');
      showToast(`✨ 探險家【${playerProfile.name}】造型設定完成！`);
    };
  }

  // =========================================================
  // 底部工具列渲染與綁定
  // =========================================================
  function renderToolbar() {
    const timeLabels = {
      auto: '🕒 即時天色',
      day: '☀️ 白天',
      dusk: '🌇 黃昏',
      night: '🌙 星夜'
    };

    document.getElementById('tb-panorama').classList.toggle('on', state.view === 'panorama');
    document.getElementById('tb-bird').classList.toggle('on', state.view === 'bird');
    document.getElementById('tb-list').classList.toggle('on', state.view === 'list');
    document.getElementById('tb-labels').classList.toggle('on', state.showLabels);
    const tbBubbles = document.getElementById('tb-bubbles');
    if (tbBubbles) tbBubbles.classList.toggle('on', state.showBubbles);
    document.getElementById('tb-links').classList.toggle('on', state.showLinks);
    document.getElementById('tb-anim').classList.toggle('on', !state.animate);
    document.getElementById('tb-anim').textContent = state.animate ? '暫停' : '播放';
    document.getElementById('tb-time').classList.toggle('on', state.timeMode !== 'auto');
    document.getElementById('tb-time').textContent = timeLabels[state.timeMode];
    document.getElementById('tb-fx').classList.toggle('on', state.fx);
    document.getElementById('tb-sound').classList.toggle('on', Sound.isEnabled());
    document.getElementById('tb-sound').textContent = Sound.isEnabled() ? '🔔 音效' : '🔕 靜音';
    document.getElementById('tb-log').classList.toggle('on', state.showLog);
    document.getElementById('btn-roam').classList.toggle('on', state.roam);
    document.getElementById('btn-tour').classList.toggle('on', !!state.tour);
    document.getElementById('btn-tour').textContent = state.tour ? '⏹ 結束導覽' : '✈️ 群島導覽';

    document.getElementById('legend-card').classList.toggle(
      'hidden',
      !state.showLinks || !!state.selectedId
    );
  }

  // =========================================================
  // 啟動入口
  // =========================================================
  window.addEventListener('DOMContentLoaded', () => {
    const stageEl = document.getElementById('stage-canvas');
    const labelLayerEl = document.getElementById('label-layer');

    world = new window.IslandWorld(stageEl, labelLayerEl, {
      onSelectCategory(catId) {
        Sound.click();
        selectCategory(catId);
      },
      onSelectClub(club) {
        selectClub(club);
      },
      onFindMascot(islandId, islandName) {
        Sound.chime();
        const isNew = !state.foundMascots.has(islandId);
        state.foundMascots.add(islandId);
        document.getElementById('mascot-count').textContent = state.foundMascots.size;
        showToast(
          isNew
            ? `🌟 找到躲在「${islandName}」的閃耀福星精靈！（${state.foundMascots.size} / ${CATEGORIES.length}）`
            : `🌟 「${islandName}」的福星精靈開心地向你閃耀光芒！`
        );
      },
      onPlayerNearChange(target) {
        state.nearTarget = target;
        const txt = document.getElementById('roam-near-text');
        const actBtn = document.getElementById('roam-action-btn');
        if (target.type === 'club' && target.data) {
          txt.textContent = `📍 靠近【${target.data.icon} ${target.data.name}】展台`;
          actBtn.style.display = 'inline-block';
          actBtn.textContent = `查看 ${target.data.short} (E)`;
        } else if (target.type === 'category' && catMap[target.id]) {
          const c = catMap[target.id];
          txt.textContent = `📍 目前在【${c.emoji} ${c.name}】`;
          if (target.id !== 'hub') {
            actBtn.style.display = 'inline-block';
            actBtn.textContent = `探索 ${c.short} (E)`;
          } else {
            actBtn.style.display = 'none';
          }
        }
      },
      onPlayerInteract(target) {
        if (!target) return;
        if (target.type === 'club' && target.data) {
          selectClub(target.data);
        } else if (target.type === 'category' && target.id !== 'hub') {
          selectCategory(target.id);
        }
      }
    });

    window.world = world;

    world.setTimeTheme(resolveTimeTheme(state.timeMode));
    world.updatePlayerCustom(playerProfile);
    world.applyFilter(() => true, ['ball', 'move', 'music', 'craft', 'mind']);

    renderQuote();
    updateClock();
    setInterval(updateClock, 15000);
    fetchPingtungWeather();
    renderSubTopbar();
    renderLiveLog();
    renderToolbar();

    // 品牌首頁重置
    document.getElementById('brand-home').onclick = () => {
      Sound.chime();
      state.view = 'panorama';
      renderListView();
      clearSelection();
    };

    document.getElementById('quote-next').onclick = () => {
      Sound.click();
      state.quoteIdx = (state.quoteIdx + 1) % QUOTES.length;
      renderQuote();
    };

    document.getElementById('mascot-trigger').onclick = () => {
      if (state.tour) stopTour();
      else startTour();
    };

    // 工具列按鈕綁定
    document.getElementById('tb-panorama').onclick = () => {
      Sound.click();
      state.view = 'panorama';
      renderListView();
      clearSelection();
    };

    document.getElementById('tb-bird').onclick = () => {
      Sound.click();
      state.view = 'bird';
      renderListView();
      clearSelection();
    };

    document.getElementById('tb-list').onclick = () => {
      Sound.click();
      state.view = state.view === 'list' ? 'panorama' : 'list';
      renderListView();
      renderToolbar();
    };

    document.getElementById('tb-labels').onclick = () => {
      Sound.click();
      state.showLabels = !state.showLabels;
      world.setShowLabels(state.showLabels);
      renderToolbar();
    };

    const tbBubblesEl = document.getElementById('tb-bubbles');
    if (tbBubblesEl) {
      tbBubblesEl.onclick = () => {
        Sound.click();
        state.showBubbles = !state.showBubbles;
        world.setShowBubbles(state.showBubbles);
        renderToolbar();
        showToast(state.showBubbles ? '💬 已開啟島上師生即時對話氣泡' : '💬 已隱藏島上對話氣泡');
      };
    }

    document.getElementById('tb-links').onclick = () => {
      Sound.click();
      state.showLinks = !state.showLinks;
      world.setShowLinks(state.showLinks);
      renderToolbar();
    };

    document.getElementById('tb-matrix').onclick = () => openMatrixModal();

    document.getElementById('tb-anim').onclick = () => {
      Sound.click();
      state.animate = !state.animate;
      world.animateEnabled = state.animate;
      renderToolbar();
    };

    document.getElementById('tb-time').onclick = () => {
      Sound.click();
      const order = ['auto', 'day', 'dusk', 'night'];
      state.timeMode = order[(order.indexOf(state.timeMode) + 1) % order.length];
      const theme = resolveTimeTheme(state.timeMode);
      world.setTimeTheme(theme);
      renderToolbar();
      if (state.selectedId && state.selectedType === 'club') {
        renderPanel();
      }
      const timeMsgs = {
        auto: '時段切換：依照當前實際時間自動調整',
        day: '☀️ 白天時段：社團上課中！師生全員在各島熱烈練習',
        dusk: '🌇 傍晚時段：放學時間，師生已返家，校園沉靜休憩',
        night: '🌙 星夜時段：夜間寧靜模式，校園點亮星空與暖光'
      };
      showToast(timeMsgs[state.timeMode] || `時段已切換為：${state.timeMode}`);
    };

    document.getElementById('tb-fx').onclick = () => {
      Sound.click();
      state.fx = !state.fx;
      document.getElementById('tilt-shift').classList.toggle('off', !state.fx);
      renderToolbar();
    };

    document.getElementById('tb-sound').onclick = () => {
      const on = Sound.toggle();
      if (on) Sound.chime();
      renderToolbar();
    };

    document.getElementById('tb-log').onclick = () => {
      Sound.click();
      state.showLog = !state.showLog;
      renderLiveLog();
      renderToolbar();
    };

    document.getElementById('btn-tour').onclick = () => {
      if (state.tour) stopTour();
      else startTour();
    };

    document.getElementById('btn-quiz').onclick = () => openQuizModal();
    document.getElementById('btn-slip').onclick = () => openSlipModal();
    document.getElementById('btn-data-mgr').onclick = () => openDataManagerModal();
    document.getElementById('btn-upload-doc').onclick = () => openDataManagerModal();

    // 漫遊模式切換
    function setRoamMode(active) {
      Sound.chime();
      state.roam = active;
      world.setRoamMode(active);
      if (active) world.updatePlayerCustom(playerProfile);
      document.getElementById('btn-roam').classList.toggle('on', active);
      document.getElementById('roam-hud').classList.toggle('hidden', !active);
      const isMobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 820;
      document.getElementById('virtual-controls').classList.toggle('hidden', !active || !isMobile);
      if (active) {
        showToast(`🎮 探險家【${playerProfile.name}】登場！使用 WASD 移動、空白鍵跳躍`);
        if (!playerProfile.customized) {
          setTimeout(openAvatarModal, 350);
        }
      }
    }

    document.getElementById('btn-roam').onclick = () => setRoamMode(!state.roam);
    document.getElementById('roam-custom-btn').onclick = () => openAvatarModal();
    document.getElementById('roam-exit-btn').onclick = () => setRoamMode(false);
    document.getElementById('roam-action-btn').onclick = () => {
      if (state.nearTarget.type === 'club' && state.nearTarget.data) {
        selectClub(state.nearTarget.data);
      } else if (state.nearTarget.type === 'category' && state.nearTarget.id !== 'hub') {
        selectCategory(state.nearTarget.id);
      }
    };

    // 行動裝置虛擬搖桿綁定
    const bindVKey = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        world.setVirtualInput(key, true);
      });
      el.addEventListener('pointerup', (e) => {
        e.preventDefault();
        world.setVirtualInput(key, false);
      });
      el.addEventListener('pointerleave', () => {
        world.setVirtualInput(key, false);
      });
    };

    bindVKey('v-up', 'forward');
    bindVKey('v-down', 'backward');
    bindVKey('v-left', 'left');
    bindVKey('v-right', 'right');
    bindVKey('v-jump', 'jump');

    const vInteract = document.getElementById('v-interact');
    if (vInteract) {
      vInteract.onclick = () => {
        if (state.nearTarget.type === 'club' && state.nearTarget.data) {
          selectClub(state.nearTarget.data);
        } else if (state.nearTarget.type === 'category' && state.nearTarget.id !== 'hub') {
          selectCategory(state.nearTarget.id);
        }
      };
    }

    // 鍵盤快捷鍵
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'Escape') {
        document.getElementById('modal-wrap').classList.add('hidden');
        if (state.roam) setRoamMode(false);
        else if (state.tour) stopTour();
        else if (state.selectedId) clearSelection();
      }
    });

    // 開場微縮模型組裝動畫 (Intro Splash)
    const steps = [
      '凝聚天空之城飛行石能量…',
      '雕琢福星中央主島與五大領域群島…',
      '擺設 20 座社團立體微縮動態展台…',
      '架設雲海空橋與復興號巡航飛空艇…',
      '歡迎來到「復興國小之福星社團翱翔島」！'
    ];
    const introEl = document.getElementById('intro-screen');
    const barEl = document.getElementById('intro-bar-fill');
    const stepEl = document.getElementById('intro-step-text');
    let sIdx = 0;
    const introTimer = setInterval(() => {
      sIdx++;
      if (sIdx < steps.length) {
        barEl.style.width = `${((sIdx + 1) / steps.length) * 100}%`;
        stepEl.textContent = steps[sIdx];
      } else {
        clearInterval(introTimer);
        introEl.classList.add('leave');
      }
    }, 400);

    document.getElementById('intro-skip').onclick = () => {
      clearInterval(introTimer);
      introEl.classList.add('leave');
    };
  });
})();
