/*
 * OpenCanvas promo video, drawn frame by frame.
 *
 * Every visual is a pure function of time: render.mjs calls
 * `await window.renderAt(seconds)` and takes a screenshot. Scenes follow the
 * voiceover (beats measured from the narration of each language) and register
 * their sound effects in window.CUES for the audio mix.
 */
(() => {
  const W = 1920;
  const H = 1080;
  const params = new URLSearchParams(location.search);
  const LANG = params.get('lang') === 'ar' ? 'ar' : 'en';
  const AR = LANG === 'ar';
  document.documentElement.classList.add(LANG);
  document.documentElement.lang = LANG;
  const ROOT = '/scripts/promo-video/';
  const footage = (lang) => `${ROOT}.work/footage/${lang}/`;
  const F = footage(LANG);

  // ---------------------------------------------------------------------------
  // Narration beats (seconds), measured on each voiceover.

  const BEATS = {
    en: {
      end: 66.7,
      hookLine: 0.83,
      hookBig: 2.33,
      no1: 3.9,
      no2: 4.91,
      no3: 6.1,
      pause1: 7.15,
      meet: 8.13,
      meetName: 8.59,
      free: 9.96,
      openSource: 10.65,
      every: 12.57,
      unlocked: 13.85,
      create: 14.9,
      social: 15.2,
      presentations: 16.71,
      print: 18.12,
      crop: 19.75,
      frames: 20.5,
      layers: 21.35,
      effects: 22.2,
      brand: 23.37,
      brandColors: 23.9,
      brandFonts: 24.85,
      brandKits: 26.0,
      icons: 27.46,
      iconsNum: 28.5,
      sizes: 30.62,
      fonts: 32.87,
      rtl: 35.14,
      rtlFlip: 35.75,
      pause2: 38.02,
      best: 38.71,
      yours: 40.51,
      save: 42.75,
      offline: 45.11,
      cloud: 46.7,
      cloudSync: 47.1,
      r2: 50.55,
      s3: 51.15,
      noLocked: 52.01,
      noBill: 53.5,
      control: 54.9,
      try: 57.62,
      link: 59.57,
      endCard: 61.39,
      tags: [62.67, 63.75, 64.86],
    },
    ar: {
      end: 57.5,
      hookLine: 0.72,
      hookBig: 1.75,
      no1: 2.94,
      no2: 4.04,
      no3: 5.57,
      pause1: 7.43,
      meet: 7.99,
      meetName: 8.6,
      free: 9.66,
      openSource: 10.71,
      every: 12.51,
      unlocked: 13.25,
      create: 14.9,
      social: 15.2,
      presentations: 16.84,
      print: 17.96,
      crop: 19.45,
      frames: 20.37,
      layers: 21.6,
      effects: 22.31,
      brand: 23.14,
      brandColors: 23.55,
      brandFonts: 24.1,
      brandKits: 24.69,
      icons: 26.3,
      iconsNum: 26.85,
      sizes: 28.78,
      fonts: 30.37,
      rtl: 32.44,
      rtlFlip: 32.75,
      pause2: 34.0,
      best: 34.51,
      yours: 35.35,
      save: 36.43,
      offline: 38.31,
      cloud: 40.24,
      cloudSync: 40.7,
      r2: 43.3,
      s3: 43.95,
      noLocked: 44.81,
      noBill: 46.14,
      control: 47.71,
      try: 49.69,
      link: 50.9,
      endCard: 52.64,
      tags: [52.64, 53.88],
    },
  };
  const B = BEATS[LANG];

  const COPY = {
    en: {
      hookLine: 'What if you could create',
      hookBig: 'professional designs?',
      nos: ['No subscription', 'No watermark', 'No account'],
      meet: 'Meet',
      free: 'Free',
      freeSub: 'Every feature, forever',
      openSource: 'Open source',
      openSourceSub: 'MIT license',
      unlocked: 'Every feature unlocked',
      features: ['Frames', 'Crop', 'Brand kits', 'PDF export', 'Templates', 'Layers', 'Effects', 'Guides'],
      social: 'Social media',
      presentations: 'Presentations',
      print: 'Print',
      tools: ['Crop', 'Frames', 'Layers', 'Effects'],
      brandKits: 'Brand kits',
      brandSub: 'Logos · Colors · Fonts',
      icons: 'icons',
      sizes: 'ready-made sizes',
      fonts: 'Arabic font families',
      rtlTitle: 'Fully right-to-left',
      ltr: 'Left to right',
      rtl: 'Right to left',
      best: ['And', "here's", 'the', 'best', 'part'],
      yours: ['Your', 'work', 'stays', 'yours.'],
      yoursGrad: 2,
      saved: 'Saved on this computer',
      offline: 'Offline: saved on this computer',
      offlineTitle: 'Keep designing offline',
      savingCount: (n) => `Saving to your cloud (${n} of 7)…`,
      synced: 'Saved to your cloud',
      cloudTitle: 'Your own cloud',
      statements: ['No locked features.', 'No monthly bill.', 'More control over your work.'],
      tryTitle: 'Try OpenCanvas today',
      scan: 'Scan to open',
      tags: ['Your designs.', 'Your device.', 'Your choice.'],
      footer: 'Free · Open source · MIT',
    },
    ar: {
      hookLine: 'تخيّل تعمل',
      hookBig: 'تصاميم احترافية',
      nos: ['بلا اشتراك', 'بلا علامة مائية', 'بلا حساب'],
      meet: 'تعرّف على',
      free: 'مجاني',
      freeSub: 'كل الميزات، للأبد',
      openSource: 'مفتوح المصدر',
      openSourceSub: 'رخصة MIT',
      unlocked: 'كل الميزات متاحة من البداية',
      features: ['إطارات', 'قصّ', 'حزم هوية', 'تصدير PDF', 'قوالب', 'طبقات', 'تأثيرات', 'أدلة'],
      social: 'سوشال ميديا',
      presentations: 'عروض تقديمية',
      print: 'طباعة',
      tools: ['قصّ الصور', 'إطارات', 'طبقات', 'تأثيرات'],
      brandKits: 'حزم الهوية',
      brandSub: 'شعارات · ألوان · خطوط',
      icons: 'أيقونة',
      sizes: 'مقاسًا جاهزًا',
      fonts: 'عائلة خطوط عربية',
      rtlTitle: 'واجهة عربية كاملة',
      ltr: 'من اليسار لليمين',
      rtl: 'من اليمين لليسار',
      best: ['والأهم؟'],
      yours: ['شغلك', 'إلك.'],
      yoursGrad: 1,
      saved: 'محفوظ على هذا الجهاز',
      offline: 'دون اتصال: محفوظ على هذا الجهاز',
      offlineTitle: 'اشتغل حتى من دون إنترنت',
      savingCount: (n) => `جارٍ الحفظ في سحابتك (${n} من 7)…`,
      synced: 'محفوظ في سحابتك',
      cloudTitle: 'سحابتك الخاصة',
      statements: ['بلا ميزات محجوبة', 'بلا اشتراكات شهرية', 'بلا تنازل عن خصوصيتك'],
      tryTitle: 'جرّب OpenCanvas اليوم',
      scan: 'امسح الرمز',
      tags: ['صمّم بحرّيتك', 'وخلي أدواتك وملفاتك بإيدك'],
      footer: 'مجاني · مفتوح المصدر · MIT',
    },
  };
  const C = COPY[LANG];

  // ---------------------------------------------------------------------------
  // Math and easing

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, p) => a + (b - a) * p;
  const EASE = {
    linear: (p) => p,
    inQuad: (p) => p * p,
    outQuad: (p) => 1 - (1 - p) ** 2,
    inCubic: (p) => p ** 3,
    outCubic: (p) => 1 - (1 - p) ** 3,
    inOutCubic: (p) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2),
    outQuart: (p) => 1 - (1 - p) ** 4,
    inQuart: (p) => p ** 4,
    outQuint: (p) => 1 - (1 - p) ** 5,
    outExpo: (p) => (p >= 1 ? 1 : 1 - 2 ** (-10 * p)),
    inExpo: (p) => (p <= 0 ? 0 : 2 ** (10 * p - 10)),
    inOutExpo: (p) =>
      p <= 0 ? 0 : p >= 1 ? 1 : p < 0.5 ? 2 ** (20 * p - 10) / 2 : (2 - 2 ** (-20 * p + 10)) / 2,
    outBack: (p) => {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2;
    },
    outBackSoft: (p) => {
      const c1 = 1.1;
      const c3 = c1 + 1;
      return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2;
    },
    outElastic: (p) =>
      p <= 0 ? 0 : p >= 1 ? 1 : 2 ** (-10 * p) * Math.sin((p * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
  };
  /** Eased progress of an animation starting at t0 lasting d seconds. */
  const ramp = (t, t0, d, ease = 'outCubic') => EASE[ease](clamp((t - t0) / d));
  /** In at a (over din), out at b (over dout). */
  const env = (t, a, din, b, dout, ein = 'outCubic', eout = 'inCubic') =>
    Math.min(ramp(t, a, din, ein), 1 - ramp(t, b, dout, eout));
  /** Mirrors a horizontal position for right-to-left layouts. */
  const X = (x) => (AR ? W - x : x);
  const dirSign = AR ? -1 : 1;

  /** Deterministic pseudo-random numbers. */
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // ---------------------------------------------------------------------------
  // DOM helpers

  function h(tag, cls, parent, html) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html != null) el.innerHTML = html;
    if (parent) parent.appendChild(el);
    return el;
  }

  /**
   * Positions an element by its center (cx, cy) with a 3D transform.
   * Elements need a known size (w, h) for centering.
   */
  function put(el, o) {
    const { x = 0, y = 0, z = 0, s = 1, sx = 1, sy = 1, r = 0, rx = 0, ry = 0, op, blur } = o;
    el.style.transform =
      `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,${z.toFixed(2)}px) ` +
      `translate(-50%,-50%) rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg) ` +
      `rotate(${r.toFixed(3)}deg) scale(${(s * sx).toFixed(4)},${(s * sy).toFixed(4)})`;
    if (op !== undefined) {
      el.style.opacity = clamp(op).toFixed(3);
      el.style.visibility = op <= 0.002 ? 'hidden' : 'visible';
    }
    if (blur !== undefined) el.style.filter = blur > 0.1 ? `blur(${blur.toFixed(2)}px)` : 'none';
  }

  /** Lucide / Tabler icons from the app's own icon library. */
  const ICONS = {};
  function icon(name, { size = 28, stroke = 2, color = 'currentColor', filled = false } = {}) {
    const d = ICONS[name];
    if (!d) throw new Error(`icon ${name}`);
    return filled
      ? `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${color}"><path d="${d}"/></svg>`
      : `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
  }

  /** A line of words that rise from a mask. */
  function words(parent, list, cls, { gradFrom = Infinity } = {}) {
    const line = h('div', `line ${cls}`, parent);
    line.dir = AR ? 'rtl' : 'ltr';
    const inner = [];
    list.forEach((word, i) => {
      if (i) line.appendChild(document.createTextNode(' '));
      const w = h('span', 'w', line);
      inner.push(h('span', `wi${i >= gradFrom ? ' grad' : ''}`, w, word));
    });
    return { line, inner };
  }

  function revealWords(ws, t, t0, { stagger = 0.08, dur = 0.55, out = Infinity, outDur = 0.35 } = {}) {
    ws.inner.forEach((el, i) => {
      const p = ramp(t, t0 + i * stagger, dur, 'outQuart');
      const q = ramp(t, out, outDur, 'inCubic');
      el.style.transform = `translateY(${((1 - p) * 105 - q * 105).toFixed(2)}%)`;
      el.style.opacity = (p * (1 - q)).toFixed(3);
    });
  }

  // ---------------------------------------------------------------------------
  // Assets

  const images = new Map();
  function image(url) {
    if (!images.has(url)) {
      const img = new Image();
      img.decoding = 'sync';
      img.src = url;
      images.set(url, {
        img,
        ready: img.decode().then(
          () => img,
          () => {
            throw new Error(`cannot load ${url}`);
          },
        ),
      });
    }
    return images.get(url);
  }
  /** An <img> of a preloaded asset (cloned so it can sit in several places). */
  function pic(url, cls, parent) {
    const el = h('img', cls, parent);
    el.src = url;
    image(url);
    return el;
  }

  const bitmaps = new Map();
  function bitmap(url) {
    if (!bitmaps.has(url)) {
      bitmaps.set(
        url,
        fetch(url)
          .then((r) => r.blob())
          .then((b) => createImageBitmap(b)),
      );
      if (bitmaps.size > 48) {
        const [oldest] = bitmaps.keys();
        bitmaps.get(oldest).then((bm) => bm.close?.());
        bitmaps.delete(oldest);
      }
    }
    return bitmaps.get(url);
  }

  const sequences = {};
  async function loadSequence(lang, name) {
    const res = await fetch(`${footage(lang)}${name}.json`);
    const data = await res.json();
    let at = 0;
    data.ends = data.frames.map((f) => (at += f.hold));
    data.duration = at / data.fps;
    data.base = footage(lang);
    sequences[`${lang}/${name}`] = data;
    return data;
  }
  /** Frame index of a sequence at local time lt (clamped). */
  function frameAt(seq, lt) {
    const n = clamp(lt, 0, seq.duration - 1e-6) * seq.fps;
    let lo = 0;
    let hi = seq.ends.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (seq.ends[mid] > n) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }

  /** Work the current frame must wait for (image draws). */
  let pending = [];

  /** The app in a browser window: 1440×900 viewport, cursor drawn on top. */
  function AppWindow(parent, { url = 'localhost:4790/design', chrome = true, cls = 'window' } = {}) {
    const root = h('div', cls, parent);
    if (chrome) {
      const bar = h('div', 'chrome', root);
      for (const c of ['#ff5f57', '#febc2e', '#28c840']) h('span', 'dot', bar).style.background = c;
      h('div', 'url', bar, url);
    } else {
      root.style.height = '900px';
    }
    const vp = h('div', 'vp', root);
    if (!chrome) vp.style.top = '0';
    const canvas = h('canvas', '', vp);
    canvas.width = 2880;
    canvas.height = 1800;
    const ctx = canvas.getContext('2d');
    const cursor = h('div', 'cursor', vp, CURSOR_SVG);
    const ripple = h('div', 'ripple', vp);
    cursor.style.visibility = 'hidden';
    ripple.style.visibility = 'hidden';
    let current = null;
    const draw = (url) => {
      if (url === current) return;
      current = url;
      pending.push(
        bitmap(url).then((bm) => {
          if (current === url) ctx.drawImage(bm, 0, 0, canvas.width, canvas.height);
        }),
      );
    };
    return {
      root,
      vp,
      still(url) {
        draw(url);
        cursor.style.visibility = 'hidden';
        ripple.style.visibility = 'hidden';
      },
      /** Shows a sequence at local time lt. */
      play(seq, lt) {
        const i = frameAt(seq, lt);
        const f = seq.frames[i];
        draw(seq.base + f.file);
        if (f.cursor) {
          cursor.style.visibility = 'visible';
          const down = f.cursor.down ? 0.88 : 1;
          cursor.style.transform = `translate(${f.cursor.x - 6}px,${f.cursor.y - 3}px) scale(${down})`;
        } else cursor.style.visibility = 'hidden';
        // The click ripple: time since the last click frame.
        let j = i;
        while (j >= 0 && !seq.frames[j].click) j--;
        if (j >= 0) {
          const since = lt - (j ? seq.ends[j - 1] : 0) / seq.fps;
          const p = clamp(since / 0.45);
          if (p < 1) {
            const c = seq.frames[j].cursor ?? f.cursor;
            ripple.style.visibility = 'visible';
            ripple.style.transform = `translate(${c.x}px,${c.y}px) scale(${0.4 + p * 1.4})`;
            ripple.style.opacity = (1 - p).toFixed(3);
          } else ripple.style.visibility = 'hidden';
        } else ripple.style.visibility = 'hidden';
      },
    };
  }

  const CURSOR_SVG =
    '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M5 2.5l14 9.2-6.3 1.3-3.4 6.5z" fill="#0f172a" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';

  // ---------------------------------------------------------------------------
  // Sound cues (read by render.mjs, synthesized by sound.py)

  const CUES = [];
  const cue = (type, t, opts = {}) => CUES.push({ type, t: +t.toFixed(3), ...opts });

  // ---------------------------------------------------------------------------
  // Stage, background and global layers

  const stage = document.getElementById('stage');
  const bg = h('div', '', stage);
  bg.id = 'bg';
  const blobs = [
    { c: 'rgba(124,108,248,0.55)', x: 0.2, y: 0.25, r: 1.0, sp: 0.07, ph: 0 },
    { c: 'rgba(217,70,239,0.38)', x: 0.82, y: 0.3, r: 0.9, sp: 0.05, ph: 2 },
    { c: 'rgba(75,55,209,0.55)', x: 0.55, y: 0.9, r: 1.2, sp: 0.06, ph: 4 },
    { c: 'rgba(255,184,107,0.16)', x: 0.9, y: 0.85, r: 0.7, sp: 0.08, ph: 1 },
  ].map((b) => {
    const el = h('div', 'blob', bg);
    el.style.background = `radial-gradient(closest-side, ${b.c}, transparent)`;
    return { ...b, el };
  });
  const grid = h('div', 'grid', bg);
  const dim = h('div', '', stage);
  dim.id = 'dim';
  const scenesRoot = h('div', 'layer', stage);
  const flash = h('div', '', stage);
  flash.id = 'flash';
  const vignette = h('div', '', stage);
  vignette.id = 'vignette';
  const grain = h('div', '', stage);
  grain.id = 'grain';
  {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const img = g.createImageData(256, 256);
    const r = rng(7);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.floor(r() * 255);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    grain.style.backgroundImage = `url(${c.toDataURL()})`;
  }

  const FLASHES = [];
  const SHAKES = [];
  /** A white flash and a small camera shake at t. */
  function impact(t, strength = 1) {
    FLASHES.push({ t, strength });
    SHAKES.push({ t, strength });
  }

  function updateGlobal(t) {
    blobs.forEach((b, i) => {
      const x = (b.x + Math.sin(t * b.sp * 2 * Math.PI * 0.35 + b.ph) * 0.08) * W;
      const y = (b.y + Math.cos(t * b.sp * 2 * Math.PI * 0.3 + b.ph) * 0.08) * H;
      b.el.style.transform = `translate(${x}px,${y}px) scale(${b.r + Math.sin(t * 0.4 + i) * 0.05})`;
    });
    grid.style.transform = `translate(${(t * 6) % 80}px, ${(t * 4) % 80}px)`;
    let fl = 0;
    for (const x of FLASHES) {
      const d = t - x.t;
      if (d >= 0 && d < 0.5) fl = Math.max(fl, x.strength * 0.55 * (1 - EASE.outCubic(d / 0.5)));
    }
    flash.style.opacity = fl.toFixed(3);
    let sx = 0;
    let sy = 0;
    for (const s of SHAKES) {
      const d = t - s.t;
      if (d >= 0 && d < 0.35) {
        const a = s.strength * 9 * (1 - d / 0.35);
        sx += Math.sin(d * 90) * a;
        sy += Math.cos(d * 75) * a * 0.7;
      }
    }
    scenesRoot.style.transform = `translate(${sx.toFixed(2)}px,${sy.toFixed(2)}px)`;
    // Dim during "the best part".
    dim.style.opacity = (0.55 * env(t, B.pause2 - 0.1, 0.5, B.yours - 0.25, 0.4)).toFixed(3);
  }

  // ---------------------------------------------------------------------------
  // Scenes

  const SCENES = [];
  const builders = [];
  /** Registers a scene; it is built once the assets are loaded. */
  function scene(name, t0, t1, build) {
    builders.push(() => {
      const root = h('div', 'scene', scenesRoot);
      root.dataset.name = name;
      const update = build(root);
      SCENES.push({ name, t0, t1, root, update });
    });
  }

  /** Sparkle particles bursting from (cx, cy) at t0. */
  function Burst(parent, n, seed, { color = '#ffde59', spread = 520, size = 1 } = {}) {
    const r = rng(seed);
    const parts = Array.from({ length: n }, () => {
      const el = h('div', 'spark', parent, sparkSvg(r() < 0.5 ? color : '#ffffff'));
      return {
        el,
        a: r() * Math.PI * 2,
        d: spread * (0.4 + r() * 0.6),
        s: size * (0.5 + r() * 0.9),
        rot: r() * 180,
      };
    });
    return (t, t0, cx, cy) => {
      for (const p of parts) {
        const k = clamp((t - t0) / 1.2);
        if (k <= 0 || k >= 1) {
          p.el.style.visibility = 'hidden';
          continue;
        }
        const e = EASE.outExpo(k);
        put(p.el, {
          x: cx + Math.cos(p.a) * p.d * e,
          y: cy + Math.sin(p.a) * p.d * e + k * k * 60,
          s: p.s * (1 - k * 0.6),
          r: p.rot + k * 120,
          op: 1 - EASE.inCubic(k),
        });
      }
    };
  }
  const sparkSvg = (c) =>
    `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 0c.6 6.2 5.8 11.4 12 12-6.2.6-11.4 5.8-12 12C11.4 17.8 6.2 12.6 0 12 6.2 11.4 11.4 6.2 12 0z" fill="${c}"/></svg>`;

  /** The OpenCanvas logo, assembled piece by piece from t0. */
  function Logo(parent) {
    const root = h('div', 'logo', parent);
    const sq = h('div', 'sq', root);
    const ci = h('div', 'ci', root);
    const ye = h('div', 'ye', root);
    return {
      root,
      build(t, t0) {
        const a = ramp(t, t0, 0.55, 'outBack');
        sq.style.transform = `scale(${a}) rotate(${(1 - a) * -25}deg)`;
        sq.style.opacity = clamp(a * 3).toFixed(3);
        const b = ramp(t, t0 + 0.22, 0.6, 'outElastic');
        ci.style.transform = `translateY(${(1 - b) * -260}px) scale(${0.4 + b * 0.6})`;
        ci.style.opacity = ramp(t, t0 + 0.22, 0.1).toFixed(3);
        const c = ramp(t, t0 + 0.36, 0.55, 'outBack');
        ye.style.transform = `translateX(${(1 - c) * 240}px) rotate(${(1 - c) * 90}deg)`;
        ye.style.opacity = ramp(t, t0 + 0.36, 0.1).toFixed(3);
      },
    };
  }

  // ---- 1. Hook ---------------------------------------------------------------
  scene('hook', 0, B.meet, (root) => {
    const cardsLayer = h('div', 'layer p3d', root);
    const starters = [
      ['starter-summer-sale.png', 1, -720, -300, -300],
      ['starter-quote-story.png', 0.5625, 760, -250, -250],
      ['starter-video-thumbnail.png', 16 / 9, -820, 330, -450],
      ['starter-gala-invitation.png', 0.8, 820, 320, -420],
      ['starter-business-card.png', 1.75, -150, -430, -900],
      ['starter-company-strategy-1.png', 16 / 9, 330, -420, -1000],
    ];
    const cards = starters.map(([file, ratio, x, y, z], i) => {
      const el = h('div', 'card', cardsLayer);
      const hgt = ratio < 1 ? 330 : 300 / ratio + 40;
      const wid = hgt * ratio;
      el.style.width = `${wid}px`;
      el.style.height = `${hgt}px`;
      pic(F + file, '', el);
      return { el, x, y, z, i };
    });
    const line1 = h('div', 'line h-s typebox', root);
    line1.dir = AR ? 'rtl' : 'ltr';
    h('span', 'typeicon', line1, icon('sparkles', { size: 34, color: '#b6a8ff' }));
    const typed = h('span', '', line1);
    h('span', 'caret', line1);
    const caret = line1.lastChild;
    const big = words(root, C.hookBig.split(' '), 'h-xl', { gradFrom: 0 });
    const chips = C.nos.map((text, i) => {
      const pill = h('div', 'pill', root);
      const ico = h('div', 'ico', pill, icon(['credit-card', 'stamp', 'user-round'][i], { size: 28 }));
      const strike = h(
        'svg',
        'strike',
        ico,
        '<line x1="9" y1="37" x2="37" y2="9" stroke="#ff6b8b" stroke-width="4" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>',
      );
      strike.setAttribute('viewBox', '0 0 46 46');
      h('span', '', pill, text);
      return { pill, line: strike.firstChild };
    });
    const nos = [B.no1, B.no2, B.no3];
    nos.forEach((t) => {
      cue('pop', t, { gain: 0.8 });
      cue('strike', t + 0.18, { gain: 0.5 });
    });
    cue('whoosh', B.hookBig - 0.12, { gain: 0.6, dur: 0.6 });
    cue('whooshBig', B.pause1 - 0.05, { gain: 0.9 });

    return (t) => {
      const exit = ramp(t, B.pause1, 0.75, 'inCubic');
      // Floating designs, rushing past at the end.
      for (const c of cards) {
        const p = ramp(t, B.hookBig - 0.3 + c.i * 0.12, 1.2, 'outCubic');
        const drift = Math.sin(t * 0.6 + c.i) * 14;
        put(c.el, {
          x: W / 2 + c.x * (1 + exit * 1.8),
          y: H / 2 + c.y * (1 + exit * 1.8) + drift + (1 - p) * 120,
          z: c.z + t * 26 + exit * 1400,
          ry: (c.x > 0 ? -1 : 1) * 14,
          rx: 6,
          op: p * 0.8 * (1 - exit),
          blur: (1 - p) * 10 + exit * 8 + Math.max(0, -c.z - 600) / 120,
        });
      }
      // Typed question.
      const text = C.hookLine;
      const n = Math.round(text.length * ramp(t, 0.05, B.hookBig - 0.5, 'linear'));
      typed.textContent = text.slice(0, n);
      caret.style.opacity = n < text.length || Math.floor(t * 2.2) % 2 === 0 ? '1' : '0';
      const lift = ramp(t, B.hookBig - 0.1, 0.6, 'outCubic');
      const boxIn = ramp(t, 0, 0.45, 'outBack');
      put(line1, {
        x: W / 2,
        y: H / 2 - 40 - lift * 150,
        s: (0.85 + boxIn * 0.15) * (1 + exit * 0.6) * (1 - lift * 0.12),
        op: (1 - exit) * clamp(boxIn * 2),
        blur: exit * 12,
      });
      line1.style.boxShadow = `0 0 0 ${2 + (1 - lift) * 4}px rgba(143,124,255,${(0.45 * (1 - lift)).toFixed(3)}), 0 30px 80px rgba(4,2,20,.5)`;
      put(big.line, {
        x: W / 2,
        y: H / 2 + 10 - lift * 40,
        s: 1 + (t - B.hookBig) * 0.012 + exit * 0.8,
        op: 1 - exit,
        blur: exit * 14,
      });
      revealWords(big, t, B.hookBig, { stagger: 0.12, dur: 0.7 });
      // The three "no" chips.
      const gap = 40;
      const widths = chips.map((c) => c.pill.offsetWidth);
      const total = widths.reduce((a, b) => a + b, 0) + gap * 2;
      let cursorX = W / 2 - total / 2;
      chips.forEach((c, i) => {
        const p = ramp(t, nos[i], 0.5, 'outBack');
        const cx = cursorX + widths[i] / 2;
        cursorX += widths[i] + gap;
        put(c.pill, {
          x: AR ? W - cx : cx,
          y: 760 + (1 - p) * 60 + exit * 260,
          s: (0.6 + p * 0.4) * (1 + exit * 0.4),
          op: clamp(p * 1.6) * (1 - exit),
          blur: exit * 10,
        });
        c.line.setAttribute('stroke-dashoffset', (1 - ramp(t, nos[i] + 0.18, 0.3, 'outCubic')).toFixed(3));
      });
    };
  });

  // ---- 2. Logo reveal ------------------------------------------------------
  scene('meet', B.pause1, B.free + 0.7, (root) => {
    const group = h('div', 'layer', root);
    const rings = [0, 1, 2].map(() => h('div', 'ring', group));
    const logo = Logo(group);
    const label = h('div', 'line eyebrow', group, C.meet);
    label.dir = AR ? 'rtl' : 'ltr';
    const mark = h('div', 'line wordmark', group);
    const letters = [...'OpenCanvas'].map((ch, i) => h('span', i >= 4 ? 'grad' : '', mark, ch));
    letters.forEach((l) => {
      l.style.display = 'inline-block';
    });
    const burst = Burst(group, 26, 11, { spread: 620 });
    cue('riser', B.pause1, { dur: B.meet - B.pause1, gain: 0.8 });
    cue('pop', B.pause1 + 0.25, { gain: 0.6, pitch: 0.7 });
    cue('thud', B.pause1 + 0.47, { gain: 0.6 });
    cue('pop', B.pause1 + 0.6, { gain: 0.5, pitch: 1.2 });
    cue('impact', B.meet, { gain: 1 });
    cue('shimmer', B.meetName, { gain: 0.6 });
    impact(B.meet, 0.9);

    return (t) => {
      const out = ramp(t, B.free - 0.05, 0.6, 'inCubic');
      const settle = ramp(t, B.meet, 0.8, 'outCubic');
      const s = (1 + 0.06 * Math.sin(clamp((t - B.meet) / 0.4) * Math.PI)) * (1 - out * 0.4);
      const ly = lerp(540, 430, settle) - out * 220;
      logo.build(t, B.pause1 + 0.2);
      put(logo.root, { x: W / 2, y: ly, s, op: 1 - out, blur: out * 8 });
      rings.forEach((ring, i) => {
        const k = clamp((t - B.meet - i * 0.12) / 1.1);
        const size = 260 + EASE.outExpo(k) * (700 + i * 260);
        ring.style.width = ring.style.height = `${size}px`;
        put(ring, { x: W / 2, y: ly, op: k > 0 && k < 1 ? (1 - k) * 0.7 : 0 });
      });
      burst(t, B.meet, W / 2, ly);
      const lp = ramp(t, B.meet, 0.5, 'outCubic');
      put(label, { x: W / 2, y: ly - 230 + (1 - lp) * 30, op: lp * (1 - out) });
      letters.forEach((l, i) => {
        const p = ramp(t, B.meetName - 0.1 + i * 0.035, 0.6, 'outBack');
        l.style.transform = `translateY(${(1 - p) * 80}px) rotate(${(1 - p) * 8}deg)`;
        l.style.opacity = clamp(p * 1.5).toFixed(3);
      });
      put(mark, { x: W / 2, y: ly + 250 - out * 40, op: 1 - out, blur: out * 10 });
    };
  });

  // ---- 3. Free & open source, every feature unlocked ----------------------
  scene('free', B.free - 0.2, B.create + 0.7, (root) => {
    const cam = h('div', 'layer p3d', root);
    const win = AppWindow(cam);
    win.still(`${F}editor.jpg`);
    const badgeFree = h('div', 'badge', cam);
    h('div', 'ico', badgeFree, icon('badge-dollar-sign', { size: 32 }));
    h('div', '', badgeFree, `${C.free}<small>${C.freeSub}</small>`);
    const badgeOpen = h('div', 'badge', cam);
    h('div', 'ico', badgeOpen, icon('code-xml', { size: 32 }));
    h('div', '', badgeOpen, `${C.openSource}<small>${C.openSourceSub}</small>`);
    const lockWrap = h('div', 'big-ico', cam);
    lockWrap.style.width = lockWrap.style.height = '170px';
    lockWrap.style.borderRadius = '48px';
    lockWrap.style.background = 'linear-gradient(135deg,#ffde59,#ffb86b)';
    lockWrap.style.boxShadow = '0 30px 80px rgba(255,190,90,.45)';
    lockWrap.innerHTML =
      '<svg viewBox="0 0 24 24" width="104" height="104" fill="none" stroke="#2b1a00" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2.5"/><path class="shackle" d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
    const shackle = lockWrap.querySelector('.shackle');
    const unlockedLabel = words(cam, C.unlocked.split(' '), 'h-m');
    const feats = C.features.map((f) => h('div', 'pill light', cam, f));
    feats.forEach((p) => {
      p.style.fontSize = '30px';
      p.style.padding = '14px 26px';
    });
    const burst = Burst(cam, 22, 5, { spread: 560, color: '#ffde59' });
    cue('whooshUp', B.free - 0.2, { gain: 0.8 });
    cue('pop', B.free + 0.25, { gain: 0.7 });
    cue('pop', B.openSource + 0.1, { gain: 0.7, pitch: 1.15 });
    cue('pop', B.every, { gain: 0.5, pitch: 0.8 });
    cue('unlock', B.unlocked, { gain: 1 });
    cue('shimmer', B.unlocked + 0.05, { gain: 0.6 });
    feats.forEach((_, i) => cue('tick', B.unlocked + 0.1 + i * 0.06, { gain: 0.25, pitch: 1 + i * 0.08 }));
    impact(B.unlocked, 0.45);

    return (t) => {
      const inP = ramp(t, B.free - 0.2, 1.1, 'outQuart');
      const out = ramp(t, B.create - 0.3, 0.45, 'inCubic');
      const push = (t - B.free) * 0.012;
      put(win.root, {
        x: W / 2 - out * 1400 * dirSign,
        y: 640 + (1 - inP) * 760,
        z: 0,
        rx: lerp(38, 9, inP) - push * 60,
        ry: out * -30 * dirSign,
        s: 0.78 + push,
        op: clamp(inP * 2) * (1 - out),
      });
      const fb = ramp(t, B.free + 0.2, 0.6, 'outBack');
      put(badgeFree, {
        x: X(250) - out * 900 * dirSign,
        y: 330 + (1 - fb) * 40 + Math.sin(t * 1.4) * 8,
        z: 120,
        s: 0.7 + fb * 0.3,
        op: clamp(fb * 1.5) * (1 - out),
      });
      const ob = ramp(t, B.openSource + 0.05, 0.6, 'outBack');
      put(badgeOpen, {
        x: X(1670) - out * 900 * dirSign,
        y: 330 + (1 - ob) * 40 + Math.sin(t * 1.2 + 1) * 8,
        z: 120,
        s: 0.7 + ob * 0.3,
        op: clamp(ob * 1.5) * (1 - out),
      });
      // The padlock opens.
      const lk = ramp(t, B.every - 0.1, 0.5, 'outBack');
      const open = ramp(t, B.unlocked, 0.35, 'outBack');
      shackle.setAttribute('transform', `translate(${open * 4.2} ${-open * 2.6}) rotate(${open * 28} 16 11)`);
      const lockGone = ramp(t, B.unlocked + 0.4, 0.3, 'inCubic');
      put(lockWrap, {
        x: W / 2,
        y: 205 + Math.sin(t * 2) * 5,
        z: 200,
        s: (0.4 + lk * 0.6) * (1 + open * 0.08) * (1 - lockGone * 0.6),
        r: Math.sin(clamp((t - B.unlocked) / 0.4) * Math.PI * 3) * 6 * (1 - open * 0.5),
        op: clamp(lk * 1.6) * (1 - lockGone) * (1 - out),
      });
      burst(t, B.unlocked, W / 2, 205);
      // Feature chips fly out of the lock.
      feats.forEach((el, i) => {
        const p = ramp(t, B.unlocked + 0.08 + i * 0.05, 0.9, 'outExpo');
        const side = i % 2 ? 1 : -1;
        const row = Math.floor(i / 2);
        const tx = W / 2 + side * 760;
        const ty = 470 + row * 135;
        put(el, {
          x: lerp(W / 2, tx, p) - out * 900 * dirSign,
          y: lerp(205, ty, p) + Math.sin(t * 1.6 + i) * 5,
          z: 260,
          s: 0.4 + p * 0.6,
          op: clamp(p * 3) * (1 - out),
        });
      });
      put(unlockedLabel.line, { x: W / 2, y: 195, z: 200, op: 1 - out });
      revealWords(unlockedLabel, t, B.unlocked + 0.62, { stagger: 0.06, out: B.create - 0.3 });
    };
  });

  // ---- 4. Social, presentations, print ------------------------------------
  scene('create', B.create - 0.25, B.crop + 0.5, (root) => {
    const cam = h('div', 'layer p3d', root);
    // Social: a phone with a story, and a square post.
    const phone = h('div', 'phone', cam);
    const ps = h('div', 'screen', phone);
    pic(`${F}starter-quote-story.png`, '', ps);
    h('div', 'notch', phone);
    const post = h('div', 'card', cam);
    post.style.width = post.style.height = '330px';
    pic(`${F}starter-summer-sale.png`, '', post);
    // Presentations: a monitor with two slides.
    const mon = h('div', 'monitor', cam);
    mon.style.width = '640px';
    const bezel = h('div', 'bezel', mon);
    const ms = h('div', 'screen', bezel);
    ms.style.width = '612px';
    ms.style.height = '344px';
    const slide1 = pic(`${F}starter-company-strategy-1.png`, '', ms);
    const slide2 = pic(`${F}starter-company-strategy-2.png`, '', ms);
    for (const s of [slide1, slide2])
      Object.assign(s.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    h('div', 'stand', mon);
    h('div', 'foot', mon);
    // Print: an invitation and a business card.
    const invite = h('div', 'card', cam);
    invite.style.width = '340px';
    invite.style.height = '425px';
    invite.style.borderRadius = '6px';
    pic(`${F}starter-gala-invitation.png`, '', invite);
    const bcard = h('div', 'card', cam);
    bcard.style.width = '350px';
    bcard.style.height = '200px';
    bcard.style.borderRadius = '10px';
    pic(`${F}starter-business-card.png`, '', bcard);
    const labels = [C.social, C.presentations, C.print].map((text) => h('div', 'label', cam, text));
    const beats = [B.social, B.presentations, B.print];
    beats.forEach((b, i) => cue('whoosh', b - 0.12, { gain: 0.55, dur: 0.45, pitch: 1 + i * 0.12 }));
    beats.forEach((b) => cue('pop', b + 0.25, { gain: 0.35 }));
    // Columns: social, presentations, print (mirrored in Arabic).
    const cols = [X(360), X(1000), X(1580)];

    return (t) => {
      const out = ramp(t, B.crop - 0.45, 0.45, 'inCubic');
      const pan = (t - B.create) * 10 * dirSign;
      const enter = (i) => ramp(t, beats[i] - 0.2, 0.9, 'outQuart');
      const common = (i, p) => ({
        ry: (1 - p) * 70 * dirSign + Math.sin(t * 0.8 + i) * 3,
        op: clamp(p * 2) * (1 - out),
        blur: (1 - p) * 8 + out * 10,
      });
      let p = enter(0);
      put(phone, {
        x: cols[0] - 40 * dirSign - pan,
        y: 500 + (1 - p) * 140 - out * 80,
        ...common(0, p),
        s: 0.92,
      });
      const pp = ramp(t, beats[0] + 0.15, 0.9, 'outBack');
      put(post, {
        x: cols[0] + 110 * dirSign - pan,
        y: 640 + (1 - pp) * 160 - out * 80,
        r: -6 * dirSign,
        ...common(0, pp),
        z: 80,
      });
      p = enter(1);
      put(mon, { x: cols[1] - pan, y: 520 + (1 - p) * 140 - out * 80, ...common(1, p) });
      const swap = ramp(t, beats[1] + 0.9, 0.5, 'inOutCubic');
      slide2.style.opacity = swap.toFixed(3);
      p = enter(2);
      put(invite, {
        x: cols[2] - 30 * dirSign - pan,
        y: 480 + (1 - p) * 140 - out * 80,
        r: 4 * dirSign,
        ...common(2, p),
      });
      const bp = ramp(t, beats[2] + 0.15, 0.9, 'outBack');
      put(bcard, {
        x: cols[2] + 40 * dirSign - pan,
        y: 700 + (1 - bp) * 160 - out * 80,
        r: -8 * dirSign,
        ...common(2, bp),
        z: 80,
      });
      labels.forEach((l, i) => {
        const lp = ramp(t, beats[i] + 0.25, 0.5, 'outCubic');
        put(l, { x: cols[i] - pan, y: 930 + (1 - lp) * 30, op: lp * (1 - out) });
      });
    };
  });

  // ---- 5. Crop, frames, layers, effects -----------------------------------
  scene('tools', B.crop - 0.3, B.brand + 0.5, (root) => {
    const clips = [
      { name: 'crop', roi: [150, 70, 1000, 760], from: 0.2, rate: 1.55 },
      { name: 'frames', roi: [380, 80, 1150, 840], from: 0.1, rate: 1.4 },
      { name: 'layers', roi: [0, 60, 1150, 880], from: 0.0, rate: 1.15 },
      { name: 'effects', roi: [380, 60, 1440, 880], from: 0.0, rate: 1.25 },
    ];
    const beats = [B.crop, B.frames, B.layers, B.effects];
    const TW = 800;
    const TH = 450;
    const tiles = clips.map((c, i) => {
      const tile = h('div', 'tile', root);
      tile.style.width = `${TW}px`;
      tile.style.height = `${TH}px`;
      const win = AppWindow(tile, { chrome: false, cls: 'vp-holder' });
      win.root.style.position = 'absolute';
      win.root.style.width = '1440px';
      win.root.style.height = '900px';
      win.root.style.transformOrigin = '0 0';
      // The Arabic interface is mirrored: so is the region worth showing.
      const [x0, y0, x1, y1] = AR ? [1440 - c.roi[2], c.roi[1], 1440 - c.roi[0], c.roi[3]] : c.roi;
      const k = Math.max(TW / (x1 - x0), TH / (y1 - y0));
      const ox = (TW - (x1 - x0) * k) / 2;
      const oy = (TH - (y1 - y0) * k) / 2;
      win.root.style.transform = `translate(${ox - x0 * k}px,${oy - y0 * k}px) scale(${k})`;
      const label = h('div', 'tile-label', root);
      h('span', 'num', label, `0${i + 1}`);
      h('span', '', label, C.tools[i]);
      return { tile, win, label };
    });
    clips.forEach((c) => {
      c.seq = sequences[`${LANG}/${c.name}`];
    });
    cue('whooshBig', B.crop - 0.3, { gain: 0.55 });
    beats.forEach((b, i) => cue('click', b, { gain: 0.55, pitch: 1 + i * 0.1 }));
    const pos = [
      [W / 2 - 420, 300],
      [W / 2 + 420, 300],
      [W / 2 - 420, 790],
      [W / 2 + 420, 790],
    ];

    return (t) => {
      const out = ramp(t, B.brand - 0.35, 0.35, 'inCubic');
      const active = beats.reduce((a, b, i) => (t >= b - 0.05 ? i : a), 0);
      tiles.forEach((tl, i) => {
        const c = clips[i];
        const p = ramp(t, B.crop - 0.2 + i * 0.08, 0.7, 'outBack');
        const focus = ramp(t, beats[active] - 0.05, 0.3, 'outCubic');
        const isActive = i === active ? focus : i === active - 1 ? 1 - focus : 0;
        const [px, py] = pos[i];
        put(tl.tile, {
          x: X(px),
          y: py + (1 - p) * 120 - out * 120,
          s: (0.7 + p * 0.3) * (0.94 + isActive * 0.1),
          op: clamp(p * 2) * (0.55 + isActive * 0.45) * (1 - out),
          blur: out * 8,
        });
        tl.tile.style.boxShadow =
          isActive > 0.5
            ? '0 0 0 4px rgba(182,168,255,.9), 0 40px 90px rgba(4,2,20,.55), 0 0 80px rgba(143,124,255,.5)'
            : '';
        tl.tile.style.zIndex = isActive > 0.5 ? '2' : '1';
        tl.win.play(c.seq, c.from + (t - (B.crop - 0.3)) * c.rate);
        put(tl.label, {
          x:
            X(px) + (-TW / 2 + 40) * dirSign * (0.94 + isActive * 0.1) + (tl.label.offsetWidth / 2) * dirSign,
          y: py - TH / 2 - 8 + (1 - p) * 120 - out * 120,
          s: 0.9 + isActive * 0.15,
          op: clamp(p * 2) * (0.6 + isActive * 0.4) * (1 - out),
        });
        tl.label.style.zIndex = '3';
      });
    };
  });

  // ---- 6. Brand kits --------------------------------------------------------
  scene('brand', B.brand - 0.25, B.icons + 0.5, (root) => {
    const cam = h('div', 'layer p3d', root);
    const win = AppWindow(cam, { url: 'localhost:4790/brand' });
    win.still(`${F}brand.jpg`);
    const colors = ['#7c6cf8', '#111827', '#f8fafc', '#cbd5e1', '#f59e0b', '#10b981'];
    const sw = colors.map((c) => {
      const el = h('div', 'swatch', cam);
      el.style.background = c;
      h('span', '', el, c.toUpperCase());
      return el;
    });
    const spec = h('div', 'specimen', cam);
    spec.dir = AR ? 'rtl' : 'ltr';
    const big = h('div', 'big', spec, AR ? 'أبجد' : 'Aa');
    big.style.fontFamily = AR ? "'Cairo'" : "'Poppins'";
    big.style.fontWeight = '700';
    h('div', 'name', spec, AR ? 'Cairo · 700' : 'Poppins · 700');
    const title = words(cam, C.brandKits.split(' '), 'h-l', { gradFrom: AR ? 1 : 1 });
    const sub = h('div', 'line h-s', cam, C.brandSub);
    sub.dir = AR ? 'rtl' : 'ltr';
    cue('whooshUp', B.brand - 0.25, { gain: 0.6 });
    colors.forEach((_, i) => cue('pop', B.brandColors + i * 0.07, { gain: 0.4, pitch: 0.9 + i * 0.09 }));
    cue('whoosh', B.brandFonts - 0.1, { gain: 0.5, dur: 0.4 });
    cue('shimmer', B.brandKits, { gain: 0.4 });

    return (t) => {
      const inP = ramp(t, B.brand - 0.25, 0.9, 'outQuart');
      const out = ramp(t, B.icons - 0.35, 0.35, 'inCubic');
      const drift = (t - B.brand) * 6;
      const wx = X(690);
      put(win.root, {
        x: wx - (1 - inP) * 300 * dirSign - out * 300 * dirSign,
        y: 600 - drift,
        ry: 16 * dirSign - drift * 0.3 * dirSign,
        rx: 4,
        s: 0.66,
        op: clamp(inP * 2) * (1 - out),
        blur: out * 8,
      });
      sw.forEach((el, i) => {
        const p = ramp(t, B.brandColors + i * 0.07, 0.7, 'outBack');
        const col = i % 3;
        const row = Math.floor(i / 3);
        put(el, {
          x: X(1265 + col * 180) - (1 - p) * 400 * dirSign + out * 300 * dirSign,
          y: 405 + row * 215 + (1 - p) * 60 + Math.sin(t * 1.5 + i) * 5,
          z: 100,
          s: 0.4 + p * 0.6,
          r: (1 - p) * -30,
          op: clamp(p * 2) * (1 - out),
        });
      });
      const fp = ramp(t, B.brandFonts, 0.8, 'outBack');
      put(spec, {
        x: X(1445) + out * 300 * dirSign,
        y: 900 + (1 - fp) * 120,
        z: 140,
        r: (1 - fp) * 6,
        s: 0.75 + fp * 0.25,
        op: clamp(fp * 2) * (1 - out),
      });
      put(title.line, { x: X(1445), y: 150, op: 1 - out });
      revealWords(title, t, B.brandKits - 0.15, { stagger: 0.1 });
      const sp = ramp(t, B.brandKits + 0.1, 0.5);
      put(sub, { x: X(1445), y: 238 + (1 - sp) * 20, op: sp * (1 - out) });
    };
  });

  // ---- 7. Icons --------------------------------------------------------------
  scene('icons', B.icons - 0.25, B.sizes + 0.45, (root) => {
    const wall = h('div', 'iconwall', root);
    const r = rng(42);
    const names = Object.keys(ICONS).filter((n) => !n.startsWith('tf:'));
    const filled = Object.keys(ICONS).filter((n) => n.startsWith('tf:'));
    const COLS = 26;
    const ROWS = 16;
    const cell = 92;
    const tints = ['#b6a8ff', '#f0abfc', '#ffde59', '#86efac', '#7dd3fc'];
    const items = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const useFilled = r() < 0.3;
        const list = useFilled ? filled : names;
        const name = list[Math.floor(r() * list.length)];
        const color = r() < 0.18 ? tints[Math.floor(r() * tints.length)] : 'rgba(255,255,255,0.55)';
        const el = h('div', 'abs', wall, icon(name, { size: 44, filled: useFilled, color, stroke: 1.8 }));
        const x = (col - (COLS - 1) / 2) * cell;
        const y = (row - (ROWS - 1) / 2) * cell;
        items.push({ el, x, y, d: Math.hypot(x, y * 1.4), seed: r() });
      }
    }
    const glow = h('div', 'abs', root);
    glow.style.width = '1200px';
    glow.style.height = '700px';
    glow.style.background =
      'radial-gradient(closest-side, rgba(11,10,26,0.94), rgba(11,10,26,0.75) 55%, transparent)';
    const num = h('div', 'line counter grad', root, '0');
    const lab = h('div', 'line h-m', root, C.icons);
    lab.dir = AR ? 'rtl' : 'ltr';
    cue('whooshBig', B.icons - 0.25, { gain: 0.6 });
    cue('counter', B.iconsNum, { dur: 1.3, gain: 0.45 });
    cue('pop', B.iconsNum + 1.3, { gain: 0.6, pitch: 1.3 });

    return (t) => {
      const out = ramp(t, B.sizes - 0.35, 0.35, 'inCubic');
      const tilt = 24 - (t - B.icons) * 2;
      wall.style.transform = `translate(-50%,-50%) perspective(1600px) rotateX(${tilt}deg) rotateZ(${-6 + (t - B.icons) * 1.2}deg) scale(${1.05 + (t - B.icons) * 0.03 + out * 0.6})`;
      for (const it of items) {
        const appear = B.icons - 0.25 + it.d / 2600;
        const p = ramp(t, appear, 0.5, 'outBack');
        const wave = Math.sin((t - B.icons) * 3 - it.d / 220) * 0.5 + 0.5;
        it.el.style.transform = `translate(${it.x - 22}px,${it.y - 22}px) scale(${(0.2 + p * 0.8) * (0.9 + wave * 0.18)})`;
        it.el.style.opacity = (clamp(p * 1.5) * (0.45 + wave * 0.55) * (1 - out)).toFixed(3);
      }
      const cp = ramp(t, B.iconsNum, 1.3, 'outExpo');
      num.textContent = Math.round(2900 * cp).toLocaleString('en-US');
      const np = ramp(t, B.iconsNum - 0.2, 0.5, 'outBack');
      put(glow, { x: W / 2, y: H / 2, op: clamp(np * 1.5) * (1 - out) });
      put(num, {
        x: W / 2,
        y: 470,
        s: 0.6 + np * 0.4 + out * 0.4,
        op: clamp(np * 2) * (1 - out),
        blur: out * 10,
      });
      const lp = ramp(t, B.iconsNum + 0.3, 0.5);
      put(lab, { x: W / 2, y: 660 + (1 - lp) * 20, op: lp * (1 - out) });
    };
  });

  // ---- 8. 70 sizes ------------------------------------------------------------
  scene('sizes', B.sizes - 0.25, B.fonts + 0.45, (root) => {
    const formats = [
      ['Instagram Post', 'منشور إنستغرام', 1080, 1080, '1080 × 1080'],
      ['Instagram Story', 'قصة إنستغرام', 1080, 1920, '1080 × 1920'],
      ['YouTube Thumbnail', 'صورة مصغّرة ليوتيوب', 1280, 720, '1280 × 720'],
      ['Presentation', 'عرض تقديمي', 1920, 1080, '1920 × 1080'],
      ['A4 Document', 'مستند A4', 210, 297, '210 × 297 mm'],
      ['Business Card', 'بطاقة عمل', 350, 200, '3.5 × 2 in'],
      ['Poster', 'ملصق', 18, 24, '18 × 24 in'],
      ['LinkedIn Banner', 'لافتة لينكدإن', 1584, 396, '1584 × 396'],
      ['Facebook Cover', 'غلاف فيسبوك', 1640, 624, '1640 × 624'],
      ['Logo', 'شعار', 500, 500, '500 × 500'],
      ['TikTok Video', 'فيديو تيك توك', 1080, 1920, '1080 × 1920'],
      ['Pinterest Pin', 'دبوس بنترست', 1000, 1500, '1000 × 1500'],
    ];
    // Hand-placed collage: [index, cx, cy, height]
    const place = [
      [1, 170, 330, 360],
      [0, 420, 250, 220],
      [11, 430, 520, 200],
      [8, 215, 625, 110],
      [2, 300, 830, 200],
      [5, 760, 900, 140],
      [7, 1180, 960, 80],
      [9, 1530, 860, 150],
      [10, 1800, 700, 260],
      [6, 1600, 560, 240],
      [4, 1800, 390, 250],
      [3, 1530, 210, 180],
    ];
    const boxes = place.map(([i, cx, cy, hh]) => {
      const [en, ar, w, hgt, dims] = formats[i];
      const el = h('div', 'fmt', root);
      const ww = Math.min(560, (hh * w) / hgt);
      el.style.width = `${ww}px`;
      el.style.height = `${hh}px`;
      el.dir = AR ? 'rtl' : 'ltr';
      h('b', '', el, AR ? ar : en);
      h('i', '', el, dims);
      if (hh < 130) el.style.padding = '8px 14px';
      return { el, cx: X(cx), cy };
    });
    const num = h('div', 'line counter grad', root, '0');
    const lab = h('div', 'line h-m', root, C.sizes);
    lab.dir = AR ? 'rtl' : 'ltr';
    cue('whoosh', B.sizes - 0.25, { gain: 0.5, dur: 0.5 });
    boxes.forEach((_, i) => cue('pop', B.sizes + 0.05 + i * 0.09, { gain: 0.28, pitch: 0.8 + i * 0.05 }));
    cue('counter', B.sizes + 0.05, { dur: 0.9, gain: 0.35 });

    return (t) => {
      const out = ramp(t, B.fonts - 0.35, 0.3, 'inCubic');
      boxes.forEach((b, i) => {
        const p = ramp(t, B.sizes + 0.05 + i * 0.09, 0.6, 'outBack');
        const dx = b.cx - W / 2;
        const dy = b.cy - H / 2;
        put(b.el, {
          x: W / 2 + dx * (0.3 + p * 0.7) * (1 + out * 0.5),
          y: H / 2 + dy * (0.3 + p * 0.7) * (1 + out * 0.5) + Math.sin(t * 1.3 + i) * 4,
          s: 0.3 + p * 0.7,
          r: (1 - p) * (i % 2 ? 12 : -12),
          op: clamp(p * 2) * (1 - out),
          blur: out * 6,
        });
      });
      const cp = ramp(t, B.sizes + 0.05, 0.9, 'outExpo');
      num.textContent = String(Math.round(70 * cp));
      const np = ramp(t, B.sizes - 0.1, 0.5, 'outBack');
      put(num, { x: W / 2, y: 470, s: 0.6 + np * 0.4, op: clamp(np * 2) * (1 - out) });
      const lp = ramp(t, B.sizes + 0.25, 0.5);
      put(lab, { x: W / 2, y: 660 + (1 - lp) * 20, op: lp * (1 - out) });
    };
  });

  // ---- 9. 30 Arabic font families -------------------------------------------
  const ARABIC_FONTS = [
    'Cairo',
    'Tajawal',
    'Almarai',
    'IBM Plex Sans Arabic',
    'Noto Sans Arabic',
    'Noto Kufi Arabic',
    'Readex Pro',
    'Noto Naskh Arabic',
    'Amiri',
    'Markazi Text',
    'Changa',
    'El Messiri',
    'Reem Kufi',
    'Lalezar',
    'Rubik',
    'Vazirmatn',
    'Alexandria',
    'Lemonada',
    'Harmattan',
    'Lateef',
    'Scheherazade New',
    'Mada',
    'Baloo Bhaijaan 2',
    'Aref Ruqaa',
    'Rakkas',
    'Marhey',
    'Kufam',
    'Zain',
    'Beiruti',
    'Playpen Sans Arabic',
  ];
  scene('fonts', B.fonts - 0.25, B.rtl + 0.45, (root) => {
    const rows = [0, 1].map((k) => {
      const m = h('div', 'marquee', root);
      m.dir = 'rtl';
      const list = ARABIC_FONTS.slice(k * 15, k * 15 + 15).concat(ARABIC_FONTS.slice(k * 15, k * 15 + 15));
      for (const f of list) {
        const s = h('span', '', m, 'خطّ عربي');
        s.style.fontFamily = `'${f}'`;
      }
      return m;
    });
    const word = h('div', 'line', root, 'إبداع');
    word.style.fontSize = '240px';
    word.style.lineHeight = '1.3';
    const fname = h('div', 'line', root, '');
    fname.style.font = "600 30px 'Inter'";
    fname.style.color = 'rgba(255,255,255,0.7)';
    fname.style.letterSpacing = '0.08em';
    const num = h('div', 'line counter grad', root, '0');
    num.style.fontSize = '200px';
    const lab = h('div', 'line h-m', root, C.fonts);
    lab.dir = AR ? 'rtl' : 'ltr';
    lab.style.fontSize = '58px';
    // Font switches: fast at first, slowing down.
    const switches = [];
    let at = B.fonts + 0.05;
    let step = 0.075;
    for (let i = 0; at < B.rtl - 0.3 && i < 60; i++) {
      switches.push(at);
      at += step;
      step *= 1.06;
    }
    switches.forEach((s, i) => i % 2 === 0 && cue('tick', s, { gain: 0.18, pitch: 1.4 }));
    cue('whoosh', B.fonts - 0.25, { gain: 0.5, dur: 0.5 });
    cue('counter', B.fonts + 0.05, { dur: 0.8, gain: 0.3 });

    return (t) => {
      const out = ramp(t, B.rtl - 0.35, 0.3, 'inCubic');
      const inP = ramp(t, B.fonts - 0.25, 0.6, 'outCubic');
      rows.forEach((m, k) => {
        const speed = (k % 2 ? 1 : -1) * 120;
        const x = W / 2 + (((t - B.fonts) * speed) % 1400);
        put(m, { x, y: 130 + k * 820, op: inP * (1 - out) * 0.9 });
      });
      let idx = 0;
      for (let i = 0; i < switches.length; i++) if (t >= switches[i]) idx = i;
      const f = ARABIC_FONTS[idx % ARABIC_FONTS.length];
      word.style.fontFamily = `'${f}'`;
      fname.textContent = f.toUpperCase();
      const wp = ramp(t, B.fonts - 0.1, 0.6, 'outBack');
      put(word, { x: X(1180), y: 470, s: 0.6 + wp * 0.4, op: clamp(wp * 2) * (1 - out), blur: out * 8 });
      put(fname, { x: X(1180), y: 650, op: wp * (1 - out) });
      const cp = ramp(t, B.fonts + 0.05, 0.8, 'outExpo');
      num.textContent = String(Math.round(30 * cp));
      const np = ramp(t, B.fonts - 0.05, 0.5, 'outBack');
      put(num, { x: X(470), y: 440, s: 0.6 + np * 0.4, op: clamp(np * 2) * (1 - out) });
      const lp = ramp(t, B.fonts + 0.2, 0.5);
      put(lab, { x: X(470), y: 600 + (1 - lp) * 20, op: lp * (1 - out) });
    };
  });

  // ---- 10. Right to left -----------------------------------------------------
  scene('rtl', B.rtl - 0.25, B.pause2 + 0.4, (root) => {
    const cam = h('div', 'layer p3d', root);
    const flip = h('div', 'abs p3d', cam);
    flip.style.width = '1440px';
    flip.style.height = '944px';
    const front = AppWindow(flip);
    const back = AppWindow(flip);
    front.still(`${footage('en')}editor.jpg`);
    back.still(`${footage('ar')}editor.jpg`);
    front.root.style.backfaceVisibility = 'hidden';
    back.root.style.backfaceVisibility = 'hidden';
    back.root.style.transform = 'rotateY(180deg)';
    const title = words(root, C.rtlTitle.split(' '), 'h-m', { gradFrom: AR ? 1 : 1 });
    const dirLabel = h('div', 'pill', root);
    const arrow = h('div', 'ico', dirLabel, icon('arrow-right', { size: 28 }));
    const dirText = h('span', '', dirLabel, C.ltr);
    cue('whooshUp', B.rtl - 0.25, { gain: 0.5 });
    cue('flip', B.rtlFlip, { gain: 0.8 });

    return (t) => {
      const inP = ramp(t, B.rtl - 0.1, 0.8, 'outQuart');
      const out = ramp(t, B.pause2 - 0.1, 0.5, 'inCubic');
      const f = ramp(t, B.rtlFlip, 0.9, 'inOutCubic');
      put(flip, {
        x: W / 2,
        y: 610 + (1 - inP) * 500,
        s: 0.72 * (1 - Math.sin(f * Math.PI) * 0.12) * (1 - out * 0.2),
        ry: f * 180,
        rx: 4,
        op: clamp(inP * 2) * (1 - out),
        blur: out * 10,
      });
      put(title.line, { x: W / 2, y: 120, op: 1 - out });
      revealWords(title, t, B.rtl, { stagger: 0.08 });
      dirText.textContent = f < 0.5 ? C.ltr : C.rtl;
      arrow.style.transform = `scaleX(${f < 0.5 ? 1 : -1})`;
      const dp = ramp(t, B.rtl + 0.2, 0.5, 'outBack');
      put(dirLabel, { x: W / 2, y: 225, s: 0.6 + dp * 0.4, op: clamp(dp * 2) * (1 - out) });
    };
  });

  // ---- 11. The best part / your work stays yours ----------------------------
  scene('best', B.pause2, B.save + 0.2, (root) => {
    const best = words(root, C.best, 'h-l');
    const yours = words(root, C.yours, 'h-xl', { gradFrom: C.yoursGrad });
    const beam = h('div', 'abs', root);
    beam.style.width = '1400px';
    beam.style.height = '1400px';
    beam.style.background = 'radial-gradient(closest-side, rgba(182,168,255,0.28), transparent)';
    const burst = Burst(root, 30, 99, { spread: 760, color: '#b6a8ff' });
    cue('swell', B.best - 0.4, { dur: B.yours - B.best + 0.4, gain: 0.55 });
    cue('impact', B.yours, { gain: 0.8 });
    impact(B.yours, 0.6);

    return (t) => {
      const outBest = B.yours - 0.25;
      put(best.line, { x: W / 2, y: H / 2, s: 1 + (t - B.best) * 0.03 });
      revealWords(best, t, B.best - 0.05, { stagger: 0.09, dur: 0.5, out: outBest, outDur: 0.25 });
      const yp = ramp(t, B.yours, 0.7, 'outExpo');
      const out = ramp(t, B.save - 0.25, 0.4, 'inCubic');
      put(yours.line, {
        x: W / 2,
        y: H / 2,
        s: (1.25 - yp * 0.25) * (1 + out * 0.3),
        blur: (1 - yp) * 10 + out * 10,
        op: 1 - out,
      });
      revealWords(yours, t, B.yours, { stagger: AR ? 0.15 : 0.1, dur: 0.5 });
      put(beam, { x: W / 2, y: H / 2, s: 0.6 + yp * 0.6, op: yp * (1 - out) });
      burst(t, B.yours, W / 2, H / 2);
    };
  });

  // ---- 12. Saved locally, offline, synced to your cloud ----------------------
  scene('cloud', B.save - 0.3, B.noLocked + 0.4, (root) => {
    const cam = h('div', 'layer', root);
    // Laptop with the editor on screen.
    const laptop = h('div', 'laptop', cam);
    laptop.style.width = '760px';
    const lid = h('div', 'lid', laptop);
    const lscreen = h('div', 'screen', lid);
    lscreen.style.width = '728px';
    lscreen.style.height = '455px';
    const lwin = AppWindow(lscreen, { chrome: false, cls: 'vp-holder' });
    Object.assign(lwin.root.style, {
      position: 'absolute',
      width: '1440px',
      height: '900px',
      transformOrigin: '0 0',
      transform: `scale(${728 / 1440})`,
    });
    h('div', 'base', laptop);
    // Second device.
    const mon = h('div', 'monitor', cam);
    mon.style.width = '620px';
    const bezel = h('div', 'bezel', mon);
    const ms = h('div', 'screen', bezel);
    ms.style.width = '592px';
    ms.style.height = '370px';
    const mwin = AppWindow(ms, { chrome: false, cls: 'vp-holder' });
    Object.assign(mwin.root.style, {
      position: 'absolute',
      width: '1440px',
      height: '900px',
      transformOrigin: '0 0',
      transform: `scale(${592 / 1440})`,
    });
    mwin.still(`${F}dashboard.jpg`);
    h('div', 'stand', mon);
    h('div', 'foot', mon);
    // Cloud.
    const cloud = h('div', 'big-ico', cam, icon('cloud', { size: 300, stroke: 1.3, color: '#fff' }));
    cloud.style.width = cloud.style.height = '300px';
    cloud.style.filter = 'drop-shadow(0 0 40px rgba(143,124,255,.8))';
    const tagR2 = h('div', 'tag', cam, 'R2');
    const tagS3 = h('div', 'tag', cam, 'S3');
    // Paths and packets.
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'path-svg');
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    cam.insertBefore(svg, cam.firstChild);
    const pathUp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const pathDown = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    for (const p of [pathUp, pathDown]) {
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', 'rgba(182,168,255,0.85)');
      p.setAttribute('stroke-width', '5');
      p.setAttribute('stroke-dasharray', '2 16');
      p.setAttribute('stroke-linecap', 'round');
      svg.appendChild(p);
    }
    const thumbs = [
      'starter-summer-sale.png',
      'starter-video-thumbnail.png',
      'starter-quote-story.png',
      'starter-gala-invitation.png',
      'starter-business-card.png',
      'starter-company-strategy-1.png',
      'starter-summer-sale.png',
    ];
    const packets = thumbs.map((f) => {
      const el = h('div', 'packet', cam);
      pic(F + f, '', el);
      return el;
    });
    // Status chip (one, like the app) and the wifi badge.
    const status = h('div', 'status', cam);
    const sIcon = h('span', '', status);
    const sText = h('span', '', status);
    status.dir = AR ? 'rtl' : 'ltr';
    const wifi = h('div', 'big-ico', cam);
    wifi.style.width = wifi.style.height = '110px';
    wifi.style.borderRadius = '32px';
    wifi.style.background = '#fff';
    wifi.innerHTML = `${icon('wifi', { size: 64, color: '#1b1640', stroke: 2.2 })}<svg viewBox="0 0 110 110" style="position:absolute;inset:0" width="110" height="110"><line class="slash" x1="22" y1="22" x2="88" y2="88" stroke="#ef4444" stroke-width="9" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/></svg>`;
    const slash = wifi.querySelector('.slash');
    const titles = [C.offlineTitle, C.cloudTitle].map((s) => {
      const l = words(cam, s.split(' '), 'h-m', { gradFrom: AR ? 1 : 2 });
      return l;
    });

    const offlineSeq = sequences[`${LANG}/frames`];
    cue('whooshUp', B.save - 0.3, { gain: 0.6 });
    cue('pop', B.save + 0.35, { gain: 0.6 });
    thumbs
      .slice(0, 4)
      .forEach((_, i) => cue('suck', B.save + 0.6 + i * 0.22, { gain: 0.3, pitch: 1 + i * 0.1 }));
    cue('disconnect', B.offline + 0.1, { gain: 0.6 });
    cue('pop', B.offline + 0.2, { gain: 0.4, pitch: 0.9 });
    cue('connect', B.cloud + 0.05, { gain: 0.6 });
    cue('whoosh', B.cloud, { gain: 0.5, dur: 0.6 });
    for (let i = 0; i < 7; i++)
      cue('data', B.cloudSync + 0.3 + i * ((B.r2 - B.cloudSync - 0.6) / 7), {
        gain: 0.3,
        pitch: 1 + i * 0.06,
      });
    cue('ding', B.r2 - 0.2, { gain: 0.7 });
    cue('pop', B.r2, { gain: 0.6 });
    cue('pop', B.s3, { gain: 0.6, pitch: 1.2 });

    // Status per time.
    const syncEnd = B.r2 - 0.2;
    const statusAt = (t) => {
      if (t < B.offline + 0.1) return { icon: 'monitor-check', text: C.saved };
      if (t < B.cloud + 0.2) return { icon: 'cloud-off', text: C.offline };
      if (t < syncEnd) {
        const n = 1 + Math.floor(clamp((t - B.cloudSync) / (syncEnd - B.cloudSync)) * 6.999);
        return { icon: 'refresh-cw', text: C.savingCount(n), spin: true };
      }
      return { icon: 'cloud-check', text: C.synced };
    };
    let lastIcon = '';

    return (t) => {
      const inP = ramp(t, B.save - 0.3, 0.9, 'outQuart');
      const out = ramp(t, B.noLocked - 0.35, 0.35, 'inCubic');
      const toCloud = ramp(t, B.cloud - 0.1, 0.9, 'inOutCubic');
      // Laptop: center, then to the side.
      const lx = lerp(W / 2, X(470), toCloud);
      const ly = lerp(590, 700, toCloud);
      const ls = lerp(1.0, 0.72, toCloud);
      put(laptop, {
        x: lx - (1 - inP) * 900 * dirSign,
        y: ly,
        s: ls,
        op: clamp(inP * 2) * (1 - out),
        blur: out * 8,
      });
      // Screen: editor, then designing offline (frames clip).
      if (t < B.offline) lwin.still(`${F}editor.jpg`);
      else lwin.play(offlineSeq, (t - B.offline) * 1.3);
      const mp = ramp(t, B.cloud + 0.25, 0.8, 'outQuart');
      put(mon, {
        x: X(1460) + (1 - mp) * 500 * dirSign,
        y: 700,
        s: 0.72,
        op: clamp(mp * 2) * (1 - out),
        blur: out * 8,
      });
      const cp = ramp(t, B.cloud, 0.8, 'outBack');
      const cy = 300 + Math.sin(t * 1.4) * 8;
      put(cloud, { x: W / 2, y: cy, s: 0.5 + cp * 0.5, op: clamp(cp * 2) * (1 - out) });
      // Paths between devices through the cloud.
      const a = { x: lx, y: ly - 210 * ls };
      const c = { x: W / 2, y: cy + 60 };
      const m = { x: X(1460), y: 700 - 190 };
      pathUp.setAttribute(
        'd',
        `M${a.x},${a.y} Q${(a.x + c.x) / 2},${c.y - 120} ${c.x - 110 * dirSign},${c.y}`,
      );
      pathDown.setAttribute(
        'd',
        `M${c.x + 110 * dirSign},${c.y} Q${(m.x + c.x) / 2},${c.y - 120} ${m.x},${m.y}`,
      );
      const pathOp = clamp(cp * 1.5) * (1 - out);
      pathUp.style.opacity = pathOp;
      pathDown.style.opacity = pathOp * mp;
      pathUp.style.strokeDashoffset = String(-t * 60);
      pathDown.style.strokeDashoffset = String(-t * 60);
      // Packets: into the laptop when saving, then up and over when syncing.
      packets.forEach((el, i) => {
        if (t < B.cloud) {
          const s0 = B.save + 0.6 + i * 0.22;
          const p = ramp(t, s0, 0.55, 'inCubic');
          const r0 = rng(i + 3);
          const sx = i % 2 ? 1500 + r0() * 250 : 170 + r0() * 250;
          const sy = 220 + r0() * 600;
          put(el, {
            x: lerp(sx, lx, p),
            y: lerp(sy, ly - 40, p),
            s: 1.7 - p * 1.3,
            r: (1 - p) * 20,
            op: i < 4 ? clamp((t - s0 + 0.2) * 5) * (1 - p) : 0,
          });
          return;
        }
        const span = (syncEnd - B.cloudSync - 0.1) / 7;
        const s0 = B.cloudSync + i * span;
        const p = ramp(t, s0, span * 1.8, 'inOutCubic');
        let pt;
        if (p < 0.5) {
          const k = p * 2;
          pt = quad(a, { x: (a.x + c.x) / 2, y: c.y - 120 }, { x: c.x - 110 * dirSign, y: c.y }, k);
        } else {
          const k = (p - 0.5) * 2;
          pt = quad({ x: c.x + 110 * dirSign, y: c.y }, { x: (m.x + c.x) / 2, y: c.y - 120 }, m, k);
        }
        put(el, {
          x: pt.x,
          y: pt.y,
          s: 0.75,
          op: p > 0 && p < 1 ? Math.sin(p * Math.PI) * 1.4 * (1 - out) : 0,
        });
      });
      // Status chip.
      const st = statusAt(t);
      if (st.icon !== lastIcon) {
        sIcon.innerHTML = icon(st.icon, { size: 32, color: '#fff' });
        lastIcon = st.icon;
      }
      sText.textContent = st.text;
      sIcon.style.transform = st.spin ? `rotate(${t * 360}deg)` : '';
      const sp = ramp(t, B.save + 0.3, 0.5, 'outBack');
      const bump = [B.offline + 0.1, B.cloud + 0.2, syncEnd].reduce(
        (m2, b) => Math.max(m2, 1 - clamp(Math.abs(t - b - 0.08) / 0.12)),
        0,
      );
      put(status, {
        x: lerp(W / 2, W / 2, toCloud),
        y: lerp(235, 468, toCloud),
        s: (0.6 + sp * 0.4) * (1 + bump * 0.08),
        op: clamp(sp * 2) * (1 - out),
      });
      // Wifi: cut when offline, back for the cloud.
      const wp = ramp(t, B.offline, 0.5, 'outBack');
      const wout = ramp(t, B.cloud + 0.3, 0.4, 'inCubic');
      slash.setAttribute(
        'stroke-dashoffset',
        (1 - ramp(t, B.offline + 0.1, 0.3) + ramp(t, B.cloud, 0.25)).toFixed(3),
      );
      put(wifi, {
        x: lx + 420 * dirSign,
        y: ly - 250,
        s: 0.5 + wp * 0.5,
        op: clamp(wp * 2) * (1 - wout) * (1 - out),
      });
      // Titles.
      const [tOff, tCloud] = titles;
      put(tOff.line, { x: W / 2, y: 1010, op: 1 - out });
      revealWords(tOff, t, B.offline + 0.05, { stagger: 0.07, out: B.cloud - 0.15, outDur: 0.3 });
      put(tCloud.line, { x: W / 2, y: 1010, op: 1 - out });
      revealWords(tCloud, t, B.cloud + 0.3, { stagger: 0.07 });
      // R2 and S3.
      const r2p = ramp(t, B.r2, 0.5, 'outBack');
      const s3p = ramp(t, B.s3, 0.5, 'outBack');
      put(tagR2, {
        x: W / 2 - 250 * dirSign,
        y: cy - 60,
        s: 0.5 + r2p * 0.5,
        r: -8,
        op: clamp(r2p * 2) * (1 - out),
      });
      put(tagS3, {
        x: W / 2 + 250 * dirSign,
        y: cy - 60,
        s: 0.5 + s3p * 0.5,
        r: 8,
        op: clamp(s3p * 2) * (1 - out),
      });
    };
  });
  function quad(a, c, b, k) {
    const u = 1 - k;
    return { x: u * u * a.x + 2 * u * k * c.x + k * k * b.x, y: u * u * a.y + 2 * u * k * c.y + k * k * b.y };
  }

  // ---- 13. Statements ----------------------------------------------------------
  scene('statements', B.noLocked - 0.25, B.try + 0.4, (root) => {
    const beats = [B.noLocked, B.noBill, B.control];
    const icons = ['lock-open', 'receipt-text', AR ? 'shield-check' : 'sliders-horizontal'];
    const rows = C.statements.map((text, i) => {
      const row = h('div', 'statement', root);
      row.dir = AR ? 'rtl' : 'ltr';
      h('div', 'ico', row, icon(icons[i], { size: 66, color: '#fff', stroke: 2 }));
      const tx = h('div', 'h-l', row, text);
      tx.style.fontSize = '96px';
      return row;
    });
    beats.forEach((b) => {
      cue('slam', b, { gain: 0.9 });
      impact(b, 0.35);
    });

    return (t) => {
      const out = ramp(t, B.try - 0.35, 0.35, 'inCubic');
      const active = beats.reduce((a, b, i) => (t >= b - 0.05 ? i : a), 0);
      // The stack stays centered as lines land.
      const landed = beats.reduce((acc, b) => acc + ramp(t, b, 0.45, 'outExpo'), 0);
      rows.forEach((row, i) => {
        const p = ramp(t, beats[i], 0.45, 'outExpo');
        const shift = beats.reduce((acc, b, j) => acc + (j > i ? ramp(t, b, 0.45, 'outExpo') : 0), 0);
        const y = H / 2 + (i - (Math.max(1, landed) - 1) / 2) * 190;
        put(row, {
          x: W / 2,
          y: y - out * 60,
          s: (1.6 - p * 0.6) * (1 - shift * 0.12),
          op: clamp(p * 3) * (i === active ? 1 : 0.42) * (1 - out),
          blur: (1 - p) * 14 + out * 8,
        });
      });
    };
  });

  // ---- 14. Try it today -----------------------------------------------------------
  scene('try', B.try - 0.25, B.endCard + 0.5, (root) => {
    const title = words(root, C.tryTitle.split(' '), 'h-l', { gradFrom: AR ? 1 : 1 });
    const addr = h('div', 'addr', root);
    h('div', 'lock', addr, icon('lock', { size: 44, color: '#10b981', stroke: 2.4 }));
    const typed = h('span', '', addr);
    const caret = h('span', 'caret', addr);
    const URL_TEXT = 'devehab.github.io/OpenCanvas';
    const qr = h('div', 'qr', root);
    pic(`${ROOT}assets/qr.svg`, '', qr);
    h('div', '', qr, C.scan);
    qr.dir = AR ? 'rtl' : 'ltr';
    const cursor = h('div', 'cursor', root, CURSOR_SVG);
    cursor.style.width = cursor.style.height = '54px';
    cursor.querySelector('svg').setAttribute('width', '54');
    cursor.querySelector('svg').setAttribute('height', '54');
    const typeStart = B.try + 0.25;
    const typeDur = Math.min(1.5, B.link - typeStart - 0.15);
    for (let i = 0; i < URL_TEXT.length; i++)
      cue('key', typeStart + (i / URL_TEXT.length) * typeDur, {
        gain: 0.35,
        pitch: 0.9 + ((i * 7) % 5) * 0.06,
      });
    cue('click', B.link + 0.35, { gain: 0.8 });
    cue('pop', B.link + 0.55, { gain: 0.6 });

    return (t) => {
      const out = ramp(t, B.endCard - 0.4, 0.35, 'inCubic');
      put(title.line, { x: W / 2, y: 250, op: 1 - out });
      revealWords(title, t, B.try - 0.1, { stagger: 0.08 });
      const ap = ramp(t, B.try, 0.7, 'outBack');
      const qp = ramp(t, B.link + 0.5, 0.6, 'outBack');
      const shift = qp * 190 * dirSign;
      put(addr, {
        x: W / 2 - shift,
        y: 560,
        s: (0.7 + ap * 0.3) * (1 - qp * 0.12),
        op: clamp(ap * 2) * (1 - out),
      });
      const n = Math.round(URL_TEXT.length * ramp(t, typeStart, typeDur, 'linear'));
      typed.innerHTML =
        n > 18
          ? `<span class="host">${URL_TEXT.slice(0, 18)}</span>${URL_TEXT.slice(18, n)}`
          : `<span class="host">${URL_TEXT.slice(0, n)}</span>`;
      caret.style.opacity = n < URL_TEXT.length || Math.floor(t * 2.4) % 2 === 0 ? '1' : '0';
      // Cursor clicks the address.
      const cm = ramp(t, B.link - 0.2, 0.5, 'inOutCubic');
      const click = ramp(t, B.link + 0.35, 0.15) - ramp(t, B.link + 0.5, 0.15);
      put(cursor, {
        x: lerp(W / 2 + 500, W / 2 + 120 - shift, cm),
        y: lerp(900, 590, cm),
        s: 1 - click * 0.15,
        op: cm * (1 - out),
      });
      addr.style.boxShadow = `0 0 0 ${8 + click * 10}px rgba(143,124,255,${0.25 + click * 0.4}), 0 50px 100px rgba(4,2,20,.55)`;
      put(qr, {
        x: W / 2 + 560 * dirSign - shift * 0.2,
        y: 600,
        s: 0.6 + qp * 0.4,
        r: (1 - qp) * 10,
        op: clamp(qp * 2) * (1 - out),
      });
    };
  });

  // ---- 15. End card ------------------------------------------------------------
  scene('end', B.endCard - 0.3, B.end + 1, (root) => {
    const logo = Logo(root);
    const mark = h('div', 'line wordmark', root, 'Open<span class="grad">Canvas</span>');
    mark.style.fontSize = '130px';
    const tags = C.tags.map((text) => {
      const el = h('div', 'line h-m', root, text);
      el.dir = AR ? 'rtl' : 'ltr';
      el.style.fontSize = AR ? '62px' : '64px';
      return el;
    });
    const url = h('div', 'line', root, 'devehab.github.io/OpenCanvas');
    url.style.font = "600 40px 'Inter'";
    url.style.color = '#c9c1ff';
    const foot = h('div', 'line h-s', root, C.footer);
    foot.dir = AR ? 'rtl' : 'ltr';
    foot.style.fontSize = '30px';
    const burst = Burst(root, 30, 77, { spread: 700 });
    cue('impact', B.endCard, { gain: 0.9 });
    B.tags.forEach((b, i) => cue('pop', b + 0.05, { gain: 0.5, pitch: 1 + i * 0.12 }));
    cue('shimmer', B.endCard + 0.3, { gain: 0.6 });
    impact(B.endCard, 0.7);

    return (t) => {
      const fade = ramp(t, B.end - 0.7, 0.7, 'inCubic');
      const lp = ramp(t, B.endCard - 0.3, 0.6, 'outBack');
      logo.build(t, B.endCard - 0.3);
      const y0 = AR ? 320 : 300;
      put(logo.root, { x: W / 2, y: y0, s: 0.62 + (t - B.endCard) * 0.004, op: 1 - fade });
      put(mark, {
        x: W / 2,
        y: y0 + 200,
        s: 0.8 + lp * 0.2,
        op: clamp(lp * 2) * (1 - fade),
        blur: (1 - lp) * 8,
      });
      burst(t, B.endCard, W / 2, y0);
      const tagY = y0 + 360;
      if (AR) {
        tags.forEach((el, i) => {
          const p = ramp(t, B.tags[i], 0.6, 'outBack');
          put(el, {
            x: W / 2,
            y: tagY + i * 84 + (1 - p) * 30,
            s: 0.8 + p * 0.2,
            op: clamp(p * 2) * (1 - fade),
          });
          el.classList.toggle('grad', i === 1);
        });
      } else {
        const gap = 34;
        const widths = tags.map((el) => el.offsetWidth);
        const total = widths.reduce((a, b) => a + b, 0) + gap * (tags.length - 1);
        let x = W / 2 - total / 2;
        tags.forEach((el, i) => {
          const p = ramp(t, B.tags[i], 0.6, 'outBack');
          const cx = x + widths[i] / 2;
          x += widths[i] + gap;
          el.classList.toggle('grad', i === 2);
          put(el, { x: cx, y: tagY + (1 - p) * 30, s: 0.8 + p * 0.2, op: clamp(p * 2) * (1 - fade) });
        });
      }
      const up = ramp(t, B.tags[B.tags.length - 1] + 0.4, 0.6);
      const bottom = AR ? 920 : 860;
      put(url, { x: W / 2, y: bottom + (1 - up) * 20, op: up * (1 - fade) });
      put(foot, { x: W / 2, y: bottom + 64 + (1 - up) * 20, op: up * (1 - fade) });
      stage.style.opacity = String(1 - fade);
    };
  });

  // ---------------------------------------------------------------------------
  // Render loop

  async function init() {
    const [lucide, tabler, fonts] = await Promise.all([
      fetch('/apps/web/src/lib/icon-library/lucide.json').then((r) => r.json()),
      fetch('/apps/web/src/lib/icon-library/tabler-filled.json').then((r) => r.json()),
      fetch('/__fonts.json').then((r) => r.json()),
    ]);
    for (const [name, d] of lucide.icons) ICONS[name] = d;
    for (const [name, d] of tabler.icons) ICONS[`tf:${name}`] = d;
    await Promise.all(
      fonts.map(async (f) => {
        const face = new FontFace(f.family, `url(${f.url})`, {
          weight: String(f.weight),
          unicodeRange: f.unicodeRange,
        });
        document.fonts.add(face);
        try {
          await face.load();
        } catch (e) {
          console.warn('font', f.family, f.url, e);
        }
      }),
    );
    await Promise.all(
      [LANG].flatMap((lang) =>
        ['crop', 'frames', 'layers', 'effects', 'create', 'icons'].map((n) => loadSequence(lang, n)),
      ),
    );
  }

  window.DURATION = B.end;
  window.CUES = CUES;
  window.BEATS = B;
  window.ready = (async () => {
    await init();
    // Scenes are built after assets (they read the sequences and icons).
    for (const build of builders) build();
    await Promise.all([...images.values()].map((x) => x.ready));
    await document.fonts.ready;
  })();

  window.renderAt = async (t) => {
    pending = [];
    updateGlobal(t);
    for (const s of SCENES) {
      const on = t >= s.t0 && t < s.t1;
      s.root.style.display = on ? 'block' : 'none';
      if (on) s.update(t);
    }
    await Promise.all(pending);
  };
})();
