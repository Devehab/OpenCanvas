/**
 * Starter templates that ship with OpenCanvas. They are drawn in code (shapes
 * and text only, no files), in the language of the interface: the Arabic
 * versions are mirrored and set in Arabic fonts. They are read-only; using
 * one makes a new design, and "Copy to my templates" makes an editable one.
 */
import {
  type AnyNodeProps,
  createDocumentSnapshot,
  createNodes,
  createRandomIdGenerator,
  type DocumentSnapshot,
  DocumentStore,
  type Fill,
  serializeDocument,
} from '@opencanvas/core';

export type StarterLang = 'en' | 'ar';

export type StarterCategory = 'social' | 'events' | 'presentations' | 'video' | 'business';

/** Slides: one list of elements per page. */
type Pages = AnyNodeProps[][];

export interface StarterTemplate {
  id: string;
  category: StarterCategory;
  formatId: string;
  width: number;
  height: number;
  title: Record<StarterLang, string>;
  backgrounds: Fill[];
  pages: (lang: StarterLang) => Pages;
}

const solid = (color: string): Fill => ({ type: 'solid', color });
const linear = (angle: number, from: string, to: string): Fill => ({
  type: 'linear-gradient',
  angle,
  stops: [
    { offset: 0, color: from },
    { offset: 1, color: to },
  ],
});

interface TextOptions {
  font: string;
  size: number;
  weight?: number;
  color: string;
  align?: 'left' | 'center' | 'right';
  lineHeight?: number;
  letterSpacing?: number;
  height?: number;
  opacity?: number;
}

function text(x: number, y: number, width: number, value: string, o: TextOptions): AnyNodeProps {
  const lines = value.split('\n');
  return {
    type: 'text',
    x,
    y,
    width,
    height: o.height ?? Math.round(o.size * (o.lineHeight ?? 1.3) * lines.length),
    sizing: 'auto-height',
    align: o.align ?? 'left',
    lineHeight: o.lineHeight ?? 1.3,
    opacity: o.opacity ?? 1,
    style: {
      fontFamily: o.font,
      fontSize: o.size,
      fontWeight: o.weight ?? 400,
      color: o.color,
      letterSpacing: o.letterSpacing ?? 0,
    },
    content: {
      paragraphs: lines.map((line) => ({ runs: [{ text: line, style: {} }], list: 'none', indent: 0 })),
    },
  } as AnyNodeProps;
}

function shape(
  kind: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: Fill | null,
  extra: Record<string, unknown> = {},
): AnyNodeProps {
  return { type: 'shape', shape: kind, x, y, width, height, fill, ...extra } as AnyNodeProps;
}

function line(x: number, y: number, width: number, color: string, weight: number): AnyNodeProps {
  return {
    type: 'line',
    x,
    y,
    width,
    height: weight,
    stroke: { color, width: weight, style: 'solid', cap: 'round', join: 'round' },
  } as AnyNodeProps;
}

/** Arabic layouts are the English ones mirrored: right-aligned text, shapes flipped across. */
function mirror(nodes: AnyNodeProps[], pageWidth: number): AnyNodeProps[] {
  return nodes.map((node) => {
    const n = node as AnyNodeProps & {
      x: number;
      width: number;
      align?: string;
      flipX?: boolean;
    };
    const out: Record<string, unknown> = { ...n, x: pageWidth - n.x - n.width };
    if (n.type === 'text') out.align = n.align === 'left' ? 'right' : n.align === 'right' ? 'left' : n.align;
    if (n.type === 'shape') out.flipX = !n.flipX;
    return out as AnyNodeProps;
  });
}

const pick = (lang: StarterLang, en: string, ar: string) => (lang === 'ar' ? ar : en);

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: 'summer-sale',
    category: 'social',
    formatId: 'instagram-post',
    width: 1080,
    height: 1080,
    title: { en: 'Summer sale', ar: 'تخفيضات الصيف' },
    backgrounds: [solid('#0f172a')],
    pages: (lang) => {
      const ar = lang === 'ar';
      const head = ar ? 'Cairo' : 'Poppins';
      const body = ar ? 'Tajawal' : 'Montserrat';
      return [
        [
          shape('ellipse', 470, -260, 900, 900, linear(135, '#f97316', '#db2777')),
          shape('ellipse', -140, 780, 400, 400, solid('#6366f1'), { opacity: 0.9 }),
          text(90, 120, 640, pick(lang, 'LIMITED TIME', 'لفترة محدودة'), {
            font: body,
            size: ar ? 34 : 28,
            weight: 700,
            color: '#fbbf24',
            letterSpacing: ar ? 0 : 300,
          }),
          text(90, 180, 900, pick(lang, 'SUMMER\nSALE', 'تخفيضات\nالصيف'), {
            font: head,
            size: ar ? 140 : 150,
            weight: ar ? 900 : 800,
            color: '#ffffff',
            lineHeight: ar ? 1.2 : 1,
          }),
          text(90, 540, 800, pick(lang, 'Up to 50% off everything', 'خصم يصل إلى 50٪ على كل شيء'), {
            font: body,
            size: 44,
            weight: 500,
            color: '#ffffff',
          }),
          shape('rect', 90, 660, 360, 110, solid('#ffffff'), { cornerRadius: 55 }),
          text(90, 689, 360, pick(lang, 'Shop now', 'تسوّق الآن'), {
            font: head,
            size: 38,
            weight: 700,
            color: '#db2777',
            align: 'center',
            lineHeight: 1.3,
          }),
          text(90, 950, 600, 'yourstore.com', {
            font: 'Montserrat',
            size: 28,
            weight: 500,
            color: '#ffffff',
            opacity: 0.75,
          }),
        ],
      ];
    },
  },
  {
    id: 'gala-invitation',
    category: 'events',
    formatId: 'instagram-portrait',
    width: 1080,
    height: 1350,
    title: { en: 'Gala invitation', ar: 'دعوة حفل' },
    backgrounds: [solid('#0b1d3a')],
    pages: (lang) => {
      const ar = lang === 'ar';
      const gold = '#d4af37';
      const display = ar ? 'El Messiri' : 'Playfair Display';
      const body = ar ? 'Tajawal' : 'Montserrat';
      return [
        [
          shape('rect', 50, 50, 980, 1250, null, {
            stroke: { color: gold, width: 3, style: 'solid', cap: 'butt', join: 'miter' },
          }),
          shape('rect', 72, 72, 936, 1206, null, {
            stroke: { color: gold, width: 1, style: 'solid', cap: 'butt', join: 'miter' },
            opacity: 0.6,
          }),
          shape('star', 500, 150, 80, 80, solid(gold), { sides: 5, innerRatio: 0.45 }),
          text(90, 280, 900, pick(lang, "YOU'RE INVITED", 'يسعدنا حضوركم'), {
            font: body,
            size: ar ? 40 : 30,
            weight: 600,
            color: gold,
            align: 'center',
            letterSpacing: ar ? 0 : 400,
          }),
          text(90, 370, 900, pick(lang, 'Annual Gala\nNight', 'حفل العشاء\nالسنوي'), {
            font: display,
            size: ar ? 110 : 120,
            weight: 700,
            color: '#ffffff',
            align: 'center',
            lineHeight: ar ? 1.3 : 1.1,
          }),
          line(390, 720, 300, gold, 2),
          text(
            90,
            770,
            900,
            pick(lang, 'Saturday, 14 November · 7:00 PM', 'السبت 14 نوفمبر · الساعة 7 مساءً'),
            { font: body, size: ar ? 40 : 34, weight: 500, color: '#ffffff', align: 'center' },
          ),
          text(90, 830, 900, pick(lang, 'The Grand Hall, City Center', 'القاعة الكبرى، وسط المدينة'), {
            font: body,
            size: ar ? 36 : 30,
            color: '#ffffff',
            align: 'center',
            opacity: 0.8,
          }),
          text(90, 1120, 900, pick(lang, 'RSVP by 1 November', 'يُرجى تأكيد الحضور قبل 1 نوفمبر'), {
            font: body,
            size: ar ? 32 : 26,
            weight: 600,
            color: gold,
            align: 'center',
            letterSpacing: ar ? 0 : 200,
          }),
        ],
      ];
    },
  },
  {
    id: 'quote-story',
    category: 'social',
    formatId: 'instagram-story',
    width: 1080,
    height: 1920,
    title: { en: 'Quote story', ar: 'ستوري اقتباس' },
    backgrounds: [linear(160, '#fdf2f8', '#e0e7ff')],
    pages: (lang) => {
      const ar = lang === 'ar';
      const display = ar ? 'El Messiri' : 'Playfair Display';
      const body = ar ? 'Tajawal' : 'Montserrat';
      return [
        [
          shape('ellipse', 560, -220, 720, 720, solid('#c7d2fe'), { opacity: 0.6 }),
          shape('ellipse', -220, 1420, 620, 620, solid('#fbcfe8'), { opacity: 0.7 }),
          text(100, 420, 300, '“', {
            font: 'Playfair Display',
            size: 360,
            weight: 700,
            color: '#6366f1',
            lineHeight: 1,
          }),
          text(
            100,
            760,
            880,
            pick(lang, 'Creativity is intelligence having fun.', 'الإبداع هو الذكاء حين يستمتع.'),
            { font: display, size: ar ? 84 : 88, weight: 700, color: '#1e1b4b', lineHeight: ar ? 1.5 : 1.2 },
          ),
          line(100, 1200, 120, '#6366f1', 6),
          text(100, 1250, 880, pick(lang, '— Albert Einstein', '— ألبرت أينشتاين'), {
            font: body,
            size: 40,
            weight: 600,
            color: '#4338ca',
          }),
          text(100, 1760, 880, '@yourname', { font: 'Montserrat', size: 32, color: '#64748b' }),
        ],
      ];
    },
  },
  {
    id: 'company-strategy',
    category: 'presentations',
    formatId: 'presentation',
    width: 1920,
    height: 1080,
    title: { en: 'Company strategy', ar: 'استراتيجية الشركة' },
    backgrounds: [solid('#ffffff'), solid('#f8fafc')],
    pages: (lang) => {
      const ar = lang === 'ar';
      const head = ar ? 'Cairo' : 'Poppins';
      const body = ar ? 'Tajawal' : 'Montserrat';
      const goals = ar
        ? [
            ['النمو', 'الوصول إلى 10,000 عميل جديد في ثلاثة أسواق جديدة.'],
            ['إسعاد العملاء', 'رفع رضا العملاء إلى 95٪ بخدمة أسرع وأوضح.'],
            ['الابتكار', 'إطلاق منتجين جديدين مبنيين على ما يطلبه عملاؤنا.'],
          ]
        : [
            ['Grow', 'Reach 10,000 new customers in three new markets.'],
            ['Delight', 'Raise customer satisfaction to 95% with faster, clearer support.'],
            ['Innovate', 'Launch two new products built on what customers ask for.'],
          ];
      return [
        [
          shape('rect', 0, 0, 760, 1080, linear(160, '#4f46e5', '#7c3aed')),
          shape('ellipse', 420, 620, 560, 560, solid('#ffffff'), { opacity: 0.08 }),
          shape('ellipse', -160, -160, 420, 420, solid('#ffffff'), { opacity: 0.06 }),
          text(100, 780, 500, '01', {
            font: 'Poppins',
            size: 180,
            weight: 800,
            color: '#ffffff',
            opacity: 0.9,
            lineHeight: 1,
          }),
          text(880, 340, 940, pick(lang, '2026 · Q1 REVIEW', 'مراجعة الربع الأول · 2026'), {
            font: body,
            size: ar ? 34 : 28,
            weight: 700,
            color: '#4f46e5',
            letterSpacing: ar ? 0 : 300,
          }),
          text(880, 410, 940, pick(lang, 'Company\nStrategy', 'استراتيجية\nالشركة'), {
            font: head,
            size: ar ? 110 : 124,
            weight: 800,
            color: '#0f172a',
            lineHeight: ar ? 1.25 : 1.05,
          }),
          text(880, 730, 940, pick(lang, 'Presented by Your Name', 'تقديم: اسمك هنا'), {
            font: body,
            size: 38,
            color: '#64748b',
          }),
        ],
        [
          text(120, 100, 1680, pick(lang, 'Our goals this year', 'أهدافنا لهذا العام'), {
            font: head,
            size: 76,
            weight: 700,
            color: '#0f172a',
          }),
          shape('rect', 120, 225, 120, 10, solid('#7c3aed'), { cornerRadius: 5 }),
          ...goals.flatMap(([title, detail], i) => {
            const x = 120 + i * 580;
            return [
              shape('rect', x, 340, 520, 580, solid('#ffffff'), {
                cornerRadius: 28,
                shadow: { color: '#0f172a1f', offsetX: 0, offsetY: 14, blur: 40 },
              }),
              shape('ellipse', x + 48, 392, 100, 100, linear(135, '#4f46e5', '#7c3aed')),
              text(x + 48, 416, 100, String(i + 1), {
                font: 'Poppins',
                size: 40,
                weight: 700,
                color: '#ffffff',
                align: 'center',
                lineHeight: 1.3,
              }),
              text(x + 48, 540, 424, title!, { font: head, size: 46, weight: 700, color: '#0f172a' }),
              text(x + 48, 620, 424, detail!, {
                font: body,
                size: 30,
                color: '#475569',
                lineHeight: 1.5,
              }),
            ];
          }),
        ],
      ];
    },
  },
  {
    id: 'video-thumbnail',
    category: 'video',
    formatId: 'youtube-thumbnail',
    width: 1280,
    height: 720,
    title: { en: 'Video thumbnail', ar: 'صورة مصغّرة لفيديو' },
    backgrounds: [solid('#111827')],
    pages: (lang) => {
      const ar = lang === 'ar';
      return [
        [
          shape('parallelogram', 640, 0, 760, 720, linear(120, '#facc15', '#f97316')),
          shape('ellipse', 860, 160, 380, 380, solid('#111827')),
          text(860, 225, 380, '!', {
            font: 'Poppins',
            size: 240,
            weight: 800,
            color: '#facc15',
            align: 'center',
            lineHeight: 1,
          }),
          text(60, 110, 680, pick(lang, '10 DESIGN\nTIPS', '10 نصائح\nللتصميم'), {
            font: ar ? 'Lalezar' : 'Bebas Neue',
            size: ar ? 130 : 180,
            color: '#ffffff',
            lineHeight: ar ? 1.3 : 0.95,
          }),
          shape('rect', 60, 540, 440, 96, solid('#ef4444'), { cornerRadius: 48 }),
          text(60, 556, 440, pick(lang, 'FOR BEGINNERS', 'للمبتدئين'), {
            font: ar ? 'Cairo' : 'Bebas Neue',
            size: ar ? 44 : 54,
            weight: ar ? 800 : 400,
            color: '#ffffff',
            align: 'center',
            lineHeight: 1.2,
          }),
        ],
      ];
    },
  },
  {
    id: 'business-card',
    category: 'business',
    formatId: 'business-card',
    width: 1050,
    height: 600,
    title: { en: 'Business card', ar: 'بطاقة عمل' },
    backgrounds: [solid('#ffffff')],
    pages: (lang) => {
      const ar = lang === 'ar';
      const head = ar ? 'Cairo' : 'Poppins';
      const body = ar ? 'Tajawal' : 'Montserrat';
      return [
        [
          shape('rect', 0, 0, 380, 600, linear(160, '#0f766e', '#115e59')),
          shape('ellipse', 105, 205, 170, 170, solid('#ffffff'), { opacity: 0.15 }),
          text(105, 248, 170, pick(lang, 'YN', 'أس'), {
            font: head,
            size: 64,
            weight: 700,
            color: '#ffffff',
            align: 'center',
            lineHeight: 1.3,
          }),
          text(440, 140, 560, pick(lang, 'Your Name', 'اسمك هنا'), {
            font: head,
            size: 58,
            weight: ar ? 800 : 700,
            color: '#0f172a',
          }),
          text(440, 225, 560, pick(lang, 'Product Designer', 'مصمّم منتجات'), {
            font: body,
            size: 30,
            weight: 600,
            color: '#0f766e',
          }),
          line(440, 300, 80, '#0f766e', 4),
          text(440, 340, 560, '+1 234 567 890\nhello@yourname.com\nyourname.com', {
            font: 'Montserrat',
            size: 26,
            color: '#475569',
            lineHeight: 1.7,
          }),
        ],
      ];
    },
  },
];

export function getStarterTemplate(id: string): StarterTemplate | undefined {
  return STARTER_TEMPLATES.find((s) => s.id === id);
}

/** The document of a starter template, in the given language. */
export function buildStarter(starter: StarterTemplate, lang: StarterLang): DocumentSnapshot {
  const createId = createRandomIdGenerator();
  const title = starter.title[lang];
  const pages = starter.pages(lang);
  const base = createDocumentSnapshot({
    title,
    formatId: starter.formatId,
    width: starter.width,
    height: starter.height,
    pages: pages.length,
    createId,
  });
  const store = new DocumentStore(base.records, { freeze: false });
  store.transact(
    (tx) => {
      store.getPageIds().forEach((pageId, i) => {
        const page = tx.getPage(pageId)!;
        tx.put({ ...page, background: starter.backgrounds[i] ?? starter.backgrounds[0]! });
        const nodes = pages[i] ?? [];
        createNodes(tx, pageId, lang === 'ar' ? mirror(nodes, starter.width) : nodes, { createId });
      });
    },
    { source: 'load' },
  );
  return serializeDocument(store);
}
