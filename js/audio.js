/* =========================================================
   屏東縣復興國民小學：「復興國小之福星社團翱翔島」
   Web Audio 音樂與音效引擎 (audio.js)
   - 即時生成背景音樂：依白天／黃昏／星夜／自由漫遊切換曲風
   - 天氣環境音：雨聲、風聲、雷聲、鳥鳴、蟬鳴、蟋蟀
   - 互動音效：點擊、彈出、鈴聲、跳躍、落地、福星閃耀、飛行呼嘯、錯誤提示
   全部以程式即時合成，不需任何外部音訊檔。
   ========================================================= */

(function () {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const STORE_KEY = 'fx_audio_prefs';

  let ctx = null;
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  let ambientBus = null;
  let noiseBuffer = null;

  const prefs = { sfx: true, music: true, style: 'auto' };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      if (typeof saved.sfx === 'boolean') prefs.sfx = saved.sfx;
      if (typeof saved.music === 'boolean') prefs.music = saved.music;
      if (typeof saved.style === 'string') prefs.style = saved.style;
    }
  } catch (e) {}

  function savePrefs() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(prefs));
    } catch (e) {}
  }

  const scene = { theme: 'day', weather: 'clear', roam: false };

  /* ---------------- 基礎建置 ---------------- */
  function ensureCtx() {
    if (!AudioCtx) return null;
    if (!ctx) {
      try {
        ctx = new AudioCtx();
      } catch (e) {
        return null;
      }
      master = ctx.createGain();
      master.gain.value = 0.9;
      // 輕度壓縮，避免多音疊加時爆音
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 12;
      comp.ratio.value = 4;
      comp.attack.value = 0.005;
      comp.release.value = 0.25;
      master.connect(comp);
      comp.connect(ctx.destination);

      sfxBus = ctx.createGain();
      sfxBus.gain.value = 1;
      sfxBus.connect(master);

      musicBus = ctx.createGain();
      musicBus.gain.value = 0;
      musicBus.connect(master);

      ambientBus = ctx.createGain();
      ambientBus.gain.value = 0;
      ambientBus.connect(master);

      const len = ctx.sampleRate * 2;
      noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended' && !document.hidden) {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function tone(freq, t, dur, o = {}) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.glideTo) osc.frequency.exponentialRampToValueAtTime(o.glideTo, t + (o.glideTime || dur));
    if (o.detune) osc.detune.setValueAtTime(o.detune, t);
    const vol = o.gain == null ? 0.1 : o.gain;
    const atk = o.attack || 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, atk + 0.01));
    let tail = g;
    if (o.cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.cutoff;
      g.connect(f);
      tail = f;
    }
    osc.connect(g);
    tail.connect(o.dest || sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function noiseBurst(t, dur, o = {}) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 1500, t);
    if (o.freqTo) f.frequency.exponentialRampToValueAtTime(o.freqTo, t + (o.freqTime || dur));
    f.Q.value = o.q || 1;
    const g = ctx.createGain();
    const vol = o.gain == null ? 0.1 : o.gain;
    const atk = o.attack || 0.003;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(o.dest || sfxBus);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  /* ---------------- 互動音效 ---------------- */
  function sfx(fn) {
    return function () {
      if (!prefs.sfx) return;
      try {
        if (!ensureCtx()) return;
        fn(ctx.currentTime + 0.005);
      } catch (e) {}
    };
  }

  const SFX = {
    click: sfx((t) => tone(880, t, 0.07, { gain: 0.07 })),
    pop: sfx((t) => tone(340, t, 0.12, { gain: 0.09, glideTo: 860, glideTime: 0.11 })),
    chime: sfx((t) => {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        tone(f, t + i * 0.055, 0.28, { type: 'triangle', gain: 0.065 });
      });
    }),
    success: sfx((t) => {
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
        tone(f, t + i * 0.07, 0.4, { type: 'triangle', gain: 0.06 });
      });
      tone(1567.98, t + 0.38, 0.7, { gain: 0.04 });
    }),
    error: sfx((t) => {
      tone(330, t, 0.14, { type: 'square', gain: 0.035, cutoff: 1400 });
      tone(247, t + 0.13, 0.22, { type: 'square', gain: 0.035, cutoff: 1200 });
    }),
    sparkle: sfx((t) => {
      [1318.5, 1567.98, 2093, 2637, 3136].forEach((f, i) => {
        tone(f, t + i * 0.06, 0.45, { gain: 0.045 });
        tone(f * 2.01, t + i * 0.06, 0.2, { gain: 0.012 });
      });
      noiseBurst(t, 0.6, { filter: 'highpass', freq: 6000, gain: 0.025, attack: 0.05 });
    }),
    jump: sfx((t) => tone(280, t, 0.18, { type: 'triangle', gain: 0.08, glideTo: 720, glideTime: 0.15 })),
    land: sfx((t) => {
      tone(150, t, 0.12, { gain: 0.12, glideTo: 55, glideTime: 0.1 });
      noiseBurst(t, 0.08, { filter: 'lowpass', freq: 900, gain: 0.05 });
    }),
    whoosh: sfx((t) => {
      noiseBurst(t, 0.6, { freq: 350, freqTo: 2200, freqTime: 0.3, q: 1.4, gain: 0.07, attack: 0.18 });
    }),
    cheer: sfx((t) => {
      [0, 4, 7, 12].forEach((s, i) => {
        tone(midiToFreq(72 + s), t + i * 0.09, 0.3, { type: 'square', gain: 0.025, cutoff: 2600 });
      });
      for (let i = 0; i < 6; i++) {
        noiseBurst(t + 0.05 + i * 0.07 + Math.random() * 0.03, 0.05, { freq: 2000, q: 2, gain: 0.04 });
      }
    })
  };

  /* ---------------- 背景音樂（即時生成） ---------------- */
  const MAJOR = [0, 2, 4, 5, 7, 9, 11];
  const PENTA = [0, 1, 2, 4, 5]; // 大調五聲音階（度數）

  const MOODS = {
    day: { root: 60, bpm: 96, prog: [0, 4, 5, 3], drums: 0.6, bass: [0, 3, 4, 6], arp: [0, 2, 4, 6], melody: 0.55, cutoff: 1700, padGain: 0.026 },
    dusk: { root: 57, bpm: 78, prog: [3, 0, 1, 4], drums: 0, bass: [0, 4], arp: [0, 3, 6], melody: 0.42, cutoff: 1150, padGain: 0.03 },
    night: { root: 53, bpm: 64, prog: [0, 5, 3, 4], drums: 0, bass: [0], arp: [0, 5], melody: 0.3, cutoff: 820, padGain: 0.032, musicBox: true },
    roam: { root: 55, bpm: 118, prog: [0, 3, 5, 4], drums: 1, bass: [0, 2, 4, 6], arp: [0, 1, 2, 3, 4, 5, 6, 7], melody: 0.62, cutoff: 2200, padGain: 0.022 },
    rain: { root: 58, bpm: 72, prog: [5, 3, 0, 4], drums: 0.3, bass: [0, 3, 4], arp: [0, 2, 5], melody: 0.4, cutoff: 1000, padGain: 0.03 },
    march: { root: 62, bpm: 112, prog: [0, 4, 3, 4], drums: 1, bass: [0, 2, 4, 6], arp: [0, 4], melody: 0.66, cutoff: 2400, padGain: 0.02, roll: true }
  };

  // 可供選擇的曲風
  const STYLES = [
    { id: 'auto', short: '自動', icon: '✨', name: '自動切換', desc: '依時段、天氣與漫遊模式自動變換曲風' },
    { id: 'day', short: '晨光', icon: '☀️', name: '晨光輕快', desc: '明亮輕快的上課時光' },
    { id: 'dusk', short: '黃昏', icon: '🌇', name: '黃昏溫柔', desc: '放學後慢慢走回家的溫柔旋律' },
    { id: 'night', short: '星夜', icon: '🌙', name: '星夜音樂盒', desc: '叮叮咚咚的安靜音樂盒' },
    { id: 'roam', short: '冒險', icon: '🎮', name: '冒險漫遊', desc: '節奏最快、最有活力的冒險曲' },
    { id: 'rain', short: '雨天', icon: '🌧️', name: '雨天沉思', desc: '帶點憂鬱、適合靜靜看書的雨天' },
    { id: 'march', short: '進行曲', icon: '🥁', name: '福星進行曲', desc: '鼓聲咚咚、精神抖擻的運動會風' }
  ];
  const styleIds = STYLES.map((x) => x.id);
  if (!styleIds.includes(prefs.style)) prefs.style = 'auto';

  // 「自動」模式下目前會選到的曲風
  function autoMoodId() {
    if (scene.roam) return 'roam';
    if (scene.weather === 'rain' || scene.weather === 'typhoon') return 'rain';
    return MOODS[scene.theme] ? scene.theme : 'day';
  }

  function currentMood() {
    if (prefs.style !== 'auto') return Object.assign({}, MOODS[prefs.style]);
    const base = MOODS[scene.roam ? 'roam' : scene.theme] || MOODS.day;
    const m = Object.assign({}, base);
    const w = scene.weather;
    if (w === 'rain' || w === 'typhoon') {
      m.prog = [5, 3, 0, 4]; // vi-IV-I-V 帶點憂鬱
      m.drums *= w === 'typhoon' ? 0 : 0.4;
      m.cutoff *= 0.75;
      m.melody *= 0.8;
      m.bpm *= 0.94;
    } else if (w === 'cold') {
      m.bpm *= 0.92;
      m.musicBox = true;
    } else if (w === 'heat') {
      m.cutoff *= 1.15;
    }
    return m;
  }

  const music = {
    playing: false,
    timer: null,
    nextTime: 0,
    step: 0,
    bar: 0,
    mood: null,
    phrase: null
  };

  function degToMidi(root, d) {
    const oct = Math.floor(d / 7);
    const idx = ((d % 7) + 7) % 7;
    return root + oct * 12 + MAJOR[idx];
  }

  // 生成 4 小節旋律動機（每小節 8 個八分音符），之後重複一次再更新，讓旋律有記憶點
  function makePhrase(mood) {
    const bars = [];
    let pos = 2;
    for (let b = 0; b < 4; b++) {
      const chordDeg = mood.prog[b % mood.prog.length];
      const steps = [];
      for (let s = 0; s < 8; s++) {
        const strong = s % 4 === 0;
        const density = strong ? Math.min(1, mood.melody + 0.3) : mood.melody * (s % 2 ? 0.6 : 1);
        if (Math.random() < density) {
          if (strong) {
            // 強拍落在和弦音上
            const tones = [chordDeg, chordDeg + 2, chordDeg + 4];
            steps.push({ deg: tones[Math.floor(Math.random() * 3)] % 7 + 7, len: Math.random() < 0.4 ? 2 : 1 });
          } else {
            pos = Math.max(0, Math.min(PENTA.length * 2 - 1, pos + Math.floor(Math.random() * 5) - 2));
            const deg = PENTA[pos % PENTA.length] + 7 * Math.floor(pos / PENTA.length) + 7;
            steps.push({ deg, len: 1 });
          }
        } else {
          steps.push(null);
        }
      }
      bars.push(steps);
    }
    return bars;
  }

  function scheduleStep(t) {
    const step = music.step;
    if (step === 0) {
      // 每小節開頭重新讀取曲風（場景變換在小節線上平順切換）
      const prevKey = music.mood && music.mood.root + ':' + music.mood.prog.join(',');
      music.mood = currentMood();
      const key = music.mood.root + ':' + music.mood.prog.join(',');
      if (!music.phrase || key !== prevKey || music.bar % 8 === 0) music.phrase = makePhrase(music.mood);
    }
    const m = music.mood;
    const stepDur = 60 / m.bpm / 2;
    const barDur = stepDur * 8;
    const chordDeg = m.prog[music.bar % m.prog.length];
    const dest = musicBus;

    // 1) 柔和鋪底和弦
    if (step === 0) {
      [0, 2, 4].forEach((iv, i) => {
        const f = midiToFreq(degToMidi(m.root, chordDeg + iv));
        [-7, 7].forEach((det) => {
          tone(f, t, barDur * 1.05, {
            type: 'triangle',
            gain: m.padGain * (i === 0 ? 1 : 0.85),
            attack: barDur * 0.3,
            detune: det,
            cutoff: m.cutoff,
            dest
          });
        });
      });
    }

    // 2) 貝斯
    if (m.bass.includes(step)) {
      const bdeg = step === 6 && m.bass.length > 3 ? chordDeg + 4 : chordDeg;
      const f = midiToFreq(degToMidi(m.root - 24, bdeg));
      tone(f, t, stepDur * 1.8, { gain: 0.12, attack: 0.01, cutoff: 600, dest });
      // 高八度泛音：讓手機與筆電小喇叭也聽得到貝斯
      tone(f * 2, t, stepDur * 1.5, { type: 'triangle', gain: 0.045, attack: 0.01, cutoff: 900, dest });
    }

    // 3) 琶音（鐘聲／音樂盒）
    if (m.arp.includes(step)) {
      const order = [0, 2, 4, 7, 4, 2, 0, 4];
      const deg = chordDeg + order[step % order.length];
      const f = midiToFreq(degToMidi(m.root + 12, deg));
      const g = m.musicBox ? 0.042 : 0.032;
      tone(f, t, m.musicBox ? 0.9 : 0.4, { gain: g, dest });
      tone(f * (m.musicBox ? 4 : 2), t, 0.15, { gain: g * 0.25, dest });
    }

    // 4) 主旋律
    const bars = music.phrase;
    const note = bars && bars[music.bar % bars.length][step];
    if (note) {
      const f = midiToFreq(degToMidi(m.root, note.deg));
      const dur = stepDur * (note.len === 2 ? 1.9 : 0.95);
      tone(f, t, dur + 0.15, { type: 'triangle', gain: 0.075, attack: 0.012, cutoff: m.cutoff * 1.6, dest });
      tone(f * 2, t, dur * 0.5, { gain: 0.008, dest });
    }

    // 5) 輕打擊
    if (m.drums > 0) {
      const d = m.drums;
      if (step === 0 || step === 4 || (d >= 1 && step === 5)) {
        tone(130, t, 0.18, { gain: 0.16 * d, glideTo: 42, glideTime: 0.14, dest });
      }
      if (step % 2 === 1 || d >= 1) {
        noiseBurst(t, 0.04, { filter: 'highpass', freq: 7500, gain: (step % 2 ? 0.03 : 0.015) * d, dest });
      }
      if (d >= 1 && (step === 2 || step === 6)) {
        noiseBurst(t, 0.13, { freq: 1900, q: 0.8, gain: 0.06 * d, dest });
      }
      // 進行曲小鼓滾奏
      if (m.roll && step === 7 && music.bar % 2 === 1) {
        [0, 0.33, 0.66].forEach((o) => noiseBurst(t + stepDur * o, 0.07, { freq: 2100, q: 0.9, gain: 0.04, dest }));
      }
    }

    music.step = (step + 1) % 8;
    if (music.step === 0) music.bar++;
    return stepDur;
  }

  function scheduler() {
    if (!ctx || !music.playing) return;
    while (music.nextTime < ctx.currentTime + 0.15) {
      music.nextTime += scheduleStep(music.nextTime);
    }
  }

  function startMusic() {
    if (!ensureCtx() || music.playing) return false;
    music.playing = true;
    music.step = 0;
    music.bar = 0;
    music.phrase = null;
    music.nextTime = ctx.currentTime + 0.1;
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setTargetAtTime(1, ctx.currentTime, 0.5);
    ambientBus.gain.cancelScheduledValues(ctx.currentTime);
    ambientBus.gain.setTargetAtTime(0.8, ctx.currentTime, 1);
    music.timer = setInterval(scheduler, 30);
    startAmbient();
    return true;
  }

  function stopMusic() {
    if (!ctx || !music.playing) return;
    music.playing = false;
    clearInterval(music.timer);
    music.timer = null;
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
    ambientBus.gain.cancelScheduledValues(ctx.currentTime);
    ambientBus.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
  }

  /* ---------------- 天氣環境音 ---------------- */
  const amb = { started: false, rainGain: null, windGain: null, windFilter: null, timer: null };

  function loopNoise() {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    src.start(0, Math.random() * 1.9);
    return src;
  }

  function startAmbient() {
    if (amb.started) {
      updateAmbient();
      return;
    }
    amb.started = true;

    // 雨聲：濾波白噪音
    const rainSrc = loopNoise();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 5200;
    amb.rainGain = ctx.createGain();
    amb.rainGain.gain.value = 0;
    rainSrc.connect(hp);
    hp.connect(lp);
    lp.connect(amb.rainGain);
    amb.rainGain.connect(ambientBus);

    // 風聲：低通噪音 + 隨機起伏
    const windSrc = loopNoise();
    amb.windFilter = ctx.createBiquadFilter();
    amb.windFilter.type = 'lowpass';
    amb.windFilter.frequency.value = 450;
    amb.windFilter.Q.value = 1.2;
    amb.windGain = ctx.createGain();
    amb.windGain.gain.value = 0;
    windSrc.connect(amb.windFilter);
    amb.windFilter.connect(amb.windGain);
    amb.windGain.connect(ambientBus);

    amb.timer = setInterval(ambientTick, 1200);
    updateAmbient();
  }

  function levels() {
    const w = scene.weather;
    return {
      rain: w === 'typhoon' ? 0.28 : w === 'rain' ? 0.15 : 0,
      wind: w === 'typhoon' ? 0.4 : w === 'cold' ? 0.16 : w === 'clouds' ? 0.06 : 0.025
    };
  }

  function updateAmbient() {
    if (!amb.started) return;
    const L = levels();
    const now = ctx.currentTime;
    amb.rainGain.gain.setTargetAtTime(L.rain, now, 1.2);
    amb.windGain.gain.setTargetAtTime(L.wind, now, 1.5);
  }

  function chirp(t) {
    const n = 2 + Math.floor(Math.random() * 3);
    const base = 2400 + Math.random() * 1200;
    for (let i = 0; i < n; i++) {
      tone(base, t + i * 0.09, 0.07, { gain: 0.02, glideTo: base * 1.45, glideTime: 0.06, dest: ambientBus });
    }
  }

  function cricket(t) {
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 3; i++) {
        tone(4500, t + r * 0.32 + i * 0.05, 0.03, { gain: 0.012, dest: ambientBus });
      }
    }
  }

  function cicada(t) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 5200;
    f.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 1);
    g.gain.setValueAtTime(0.05, t + 2.4);
    g.gain.linearRampToValueAtTime(0.0001, t + 3.6);
    const am = ctx.createGain();
    am.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 42;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.5;
    lfo.connect(lfoDepth);
    lfoDepth.connect(am.gain);
    src.connect(f);
    f.connect(am);
    am.connect(g);
    g.connect(ambientBus);
    src.start(t);
    lfo.start(t);
    src.stop(t + 3.7);
    lfo.stop(t + 3.7);
  }

  function thunder(t) {
    noiseBurst(t, 2.8, { filter: 'lowpass', freq: 260, freqTo: 90, freqTime: 2.5, gain: 0.35, attack: 0.08, dest: ambientBus });
  }

  function ambientTick() {
    if (!ctx || !music.playing) return;
    const t = ctx.currentTime + 0.05;
    const w = scene.weather;
    const wet = w === 'rain' || w === 'typhoon';
    const L = levels();

    // 風聲起伏
    amb.windGain.gain.setTargetAtTime(L.wind * (0.6 + Math.random() * 0.8), t, 0.8);
    amb.windFilter.frequency.setTargetAtTime(300 + Math.random() * (w === 'typhoon' ? 900 : 400), t, 0.8);

    if (scene.theme === 'day' && !wet && w !== 'cold' && Math.random() < 0.28) chirp(t);
    if (scene.theme === 'day' && w === 'heat' && Math.random() < 0.12) cicada(t);
    if (scene.theme !== 'day' && !wet && Math.random() < (scene.theme === 'night' ? 0.55 : 0.25)) cricket(t);
    if (w === 'typhoon' && Math.random() < 0.05) thunder(t);
  }

  /* ---------------- 對外介面 ---------------- */
  // 第一次使用者互動時呼叫：瀏覽器規定須有使用者手勢才能播放聲音
  let unlocked = false;

  // iPhone／iPad：側邊靜音開關打開時，iOS 預設會把網頁音訊整個靜音。
  // 將音訊工作階段設為「播放」（iOS 16.4+），舊版則播放一段無聲音檔來切換。
  let iosPrimed = false;
  let silentEl = null;
  function silentWavUrl() {
    const n = 800; // 0.1 秒、8kHz、16-bit 單聲道的無聲 WAV
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const str = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF');
    v.setUint32(4, 36 + n * 2, true);
    str(8, 'WAVEfmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true);
    v.setUint32(28, 16000, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    str(36, 'data');
    v.setUint32(40, n * 2, true);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }
  function primeIOS() {
    if (iosPrimed) return;
    iosPrimed = true;
    try {
      if (navigator.audioSession) {
        navigator.audioSession.type = 'playback';
        return;
      }
    } catch (e) {}
    const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!isIOS) return;
    try {
      silentEl = new Audio(silentWavUrl());
      silentEl.loop = true;
      silentEl.setAttribute('playsinline', '');
      silentEl.play().catch(() => {
        iosPrimed = false;
      });
    } catch (e) {
      iosPrimed = false;
    }
  }

  // 每次使用者手勢都呼叫，直到音訊真正開始運作為止（有些手勢瀏覽器不承認，需重試）
  // 回傳 true 代表「這次才第一次開始播放背景音樂」
  function unlock() {
    if (!ensureCtx()) return false;
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    primeIOS();
    unlocked = true;
    if (prefs.music && !music.playing) return startMusic();
    return false;
  }

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) {
      ctx.suspend().catch(() => {});
      if (silentEl) silentEl.pause();
    } else if (unlocked) {
      ctx.resume().catch(() => {});
      if (silentEl) silentEl.play().catch(() => {});
      if (music.playing) music.nextTime = Math.max(music.nextTime, ctx.currentTime + 0.05);
    }
  });

  window.FX_AUDIO = Object.assign({}, SFX, {
    unlock,
    isRunning: () => !!ctx && ctx.state === 'running',
    isMusicPlaying: () => music.playing && !!ctx && ctx.state === 'running',
    isEnabled: () => prefs.sfx,
    toggle() {
      prefs.sfx = !prefs.sfx;
      savePrefs();
      return prefs.sfx;
    },
    isMusicEnabled: () => prefs.music,
    toggleMusic() {
      prefs.music = !prefs.music;
      savePrefs();
      if (prefs.music) {
        unlocked = true;
        startMusic();
      } else {
        stopMusic();
      }
      return prefs.music;
    },
    styles: STYLES,
    getStyle: () => prefs.style,
    getAutoStyle: () => autoMoodId(),
    // 選擇曲風：立即從新的小節開始播放；若音樂關閉則一併開啟
    setStyle(id) {
      if (!styleIds.includes(id)) return;
      prefs.style = id;
      prefs.music = true;
      savePrefs();
      unlocked = true;
      if (music.playing) {
        music.step = 0;
        music.bar = 0;
        music.phrase = null;
        if (ctx) music.nextTime = Math.max(music.nextTime, ctx.currentTime + 0.05);
      } else {
        startMusic();
      }
    },
    setScene(next) {
      const before = scene.weather + scene.theme;
      if (next.theme) scene.theme = next.theme;
      if (next.weather) scene.weather = next.weather;
      if (typeof next.roam === 'boolean') scene.roam = next.roam;
      if (before !== scene.weather + scene.theme && amb.started) updateAmbient();
    }
  });
})();
