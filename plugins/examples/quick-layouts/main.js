// Quick layouts: an example OpenCanvas plugin that builds whole designs.
// It reads the page size, then inserts shapes and text through the API, so
// everything it makes is ordinary, editable elements (and one undo step).

const ar = opencanvas.locale === 'ar';
const font = ar ? 'Cairo' : 'Poppins';
const say = (en, arabic) => (ar ? arabic : en);

const text = (value, x, y, width, size, color, weight = 700, align = 'center') => ({
  type: 'text',
  x,
  y,
  width,
  sizing: 'auto-height',
  align,
  content: { paragraphs: [{ runs: [{ text: value, style: {} }], list: 'none', indent: 0 }] },
  style: { fontFamily: font, fontSize: size, fontWeight: weight, color },
});
// Several lines in one auto-height text box, so long lines push the next ones down.
const stack = (x, y, width, lines, align = 'center') => ({
  type: 'text',
  x,
  y,
  width,
  sizing: 'auto-height',
  align,
  paragraphSpacing: lines[0].size * 0.35,
  content: {
    paragraphs: lines.map((l) => ({
      runs: [{ text: l.text, style: { fontSize: l.size, fontWeight: l.weight, color: l.color } }],
      list: 'none',
      indent: 0,
    })),
  },
  style: { fontFamily: font, fontSize: lines[0].size, fontWeight: lines[0].weight, color: lines[0].color },
});
const rect = (x, y, width, height, fill, cornerRadius = 0) => ({
  type: 'shape',
  shape: 'rect',
  x,
  y,
  width,
  height,
  cornerRadius,
  fill,
});
const ellipse = (x, y, width, height, color) => ({
  type: 'shape',
  shape: 'ellipse',
  x,
  y,
  width,
  height,
  fill: { type: 'solid', color },
});
const gradient = (angle, ...colors) => ({
  type: 'linear-gradient',
  angle,
  stops: colors.map((color, i) => ({ offset: i / (colors.length - 1), color })),
});

const LAYOUTS = {
  poster({ width: w, height: h }, title, subtitle) {
    const m = Math.min(w, h);
    return [
      rect(0, 0, w, h, gradient(135, '#2b1055', '#7c3aed', '#db2777')),
      ellipse(w * 0.55, -m * 0.25, m * 0.8, m * 0.8, '#ffffff1f'),
      ellipse(-m * 0.2, h - m * 0.45, m * 0.6, m * 0.6, '#ffffff14'),
      stack(w * 0.08, h * 0.24, w * 0.84, [
        { text: title, size: m * 0.1, weight: 800, color: '#ffffff' },
        { text: subtitle, size: m * 0.045, weight: 500, color: '#f5f3ff' },
      ]),
      rect(w / 2 - m * 0.2, h * 0.78, m * 0.4, m * 0.09, { type: 'solid', color: '#ffffff' }, m * 0.045),
      text(
        say('Learn more', 'اعرف المزيد'),
        w / 2 - m * 0.2,
        h * 0.78 + m * 0.018,
        m * 0.4,
        m * 0.035,
        '#5b21b6',
        700,
      ),
    ];
  },
  quote({ width: w, height: h }, title, subtitle) {
    const m = Math.min(w, h);
    return [
      rect(0, 0, w, h, { type: 'solid', color: '#fef3c7' }),
      rect(w * 0.06, h * 0.06, w * 0.88, h * 0.88, { type: 'solid', color: '#ffffff' }, m * 0.04),
      text('“', w * 0.1, h * 0.1, w * 0.3, m * 0.3, '#f59e0b', 800, ar ? 'right' : 'left'),
      stack(w * 0.14, h * 0.34, w * 0.72, [
        { text: title, size: m * 0.065, weight: 700, color: '#1f2937' },
        { text: subtitle, size: m * 0.04, weight: 500, color: '#b45309' },
      ]),
    ];
  },
  sale({ width: w, height: h }, title, subtitle) {
    const m = Math.min(w, h);
    const stripes = [];
    for (let i = -2; i < 8; i++) {
      stripes.push({
        ...rect(i * m * 0.22, -h * 0.2, m * 0.08, h * 1.4, { type: 'solid', color: '#fde04722' }),
        rotation: 20,
      });
    }
    return [
      rect(0, 0, w, h, { type: 'solid', color: '#111827' }),
      ...stripes,
      stack(w * 0.06, h * 0.18, w * 0.88, [
        { text: title, size: m * 0.15, weight: 900, color: '#fde047' },
        { text: subtitle, size: m * 0.055, weight: 600, color: '#ffffff' },
      ]),
      rect(w * 0.3, h * 0.74, w * 0.4, m * 0.1, { type: 'solid', color: '#ef4444' }, m * 0.05),
      text(say('Shop now', 'تسوّق الآن'), w * 0.3, h * 0.74 + m * 0.022, w * 0.4, m * 0.04, '#ffffff', 700),
    ];
  },
};

const DEFAULTS = {
  poster: [
    say('Design without limits', 'صمّم بلا حدود'),
    say('Free, open and private', 'مجاني ومفتوح ويحفظ خصوصيتك'),
  ],
  quote: [
    say('Simplicity is the ultimate sophistication.', 'البساطة قمّة الأناقة.'),
    say('— Leonardo da Vinci', '— ليوناردو دافنشي'),
  ],
  sale: [say('SALE', 'تخفيضات'), say('Up to 50% off this week', 'خصم حتى 50% هذا الأسبوع')],
};

async function build(kind, title, subtitle) {
  const design = await opencanvas.design.get();
  const page = design.pages.find((p) => p.id === design.pageId);
  const [t, s] = DEFAULTS[kind];
  const ids = await opencanvas.design.insert(LAYOUTS[kind](page, title || t, subtitle || s));
  await opencanvas.design.select(ids);
}

opencanvas.commands.register('poster', () => build('poster'));

// The panel: a small form rendered in the plugin's own sandboxed document.
document.body.innerHTML = `
  <style>
    body { padding: 12px; }
    label { display: block; font-size: 12px; font-weight: 600; color: #475569; margin: 8px 0 4px; }
    input { width: 100%; box-sizing: border-box; height: 34px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0 10px; font: inherit; }
    .row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 12px; }
    button { height: 64px; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; font: inherit; font-size: 13px; font-weight: 600; color: #1e293b; cursor: pointer; }
    button:hover { border-color: #a78bfa; background: #f5f3ff; }
    p { font-size: 12px; color: #64748b; margin: 10px 0 0; }
  </style>
  <label for="title">${say('Headline', 'العنوان')}</label>
  <input id="title" placeholder="${say('Design without limits', 'صمّم بلا حدود')}" />
  <label for="subtitle">${say('Second line', 'السطر الثاني')}</label>
  <input id="subtitle" placeholder="${say('Free, open and private', 'مجاني ومفتوح ويحفظ خصوصيتك')}" />
  <div class="row">
    <button data-kind="poster">${say('Poster', 'ملصق')}</button>
    <button data-kind="quote">${say('Quote', 'اقتباس')}</button>
    <button data-kind="sale">${say('Sale', 'تخفيضات')}</button>
  </div>
  <p>${say('Everything stays editable. Undo removes the whole layout.', 'كل العناصر تبقى قابلة للتعديل، والتراجع يزيل التخطيط كله.')}</p>
`;
for (const button of document.querySelectorAll('button')) {
  button.addEventListener('click', () =>
    build(
      button.dataset.kind,
      document.getElementById('title').value.trim(),
      document.getElementById('subtitle').value.trim(),
    ).catch((e) => opencanvas.ui.toast(e.message, 'error')),
  );
}
