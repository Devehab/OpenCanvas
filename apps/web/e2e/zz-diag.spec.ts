// Temporary diagnostics (Firefox text measuring); removed once understood.
import { expect, test } from './fixtures';
import { createDesign, insertNodes } from './support';

test('diag text measuring after a font loads', async ({ page }) => {
  await createDesign(page);
  const text = 'مرحبا بكم في OpenCanvas';
  await insertNodes(
    page,
    [
      {
        type: 'text',
        x: 80,
        y: 100,
        width: 920,
        sizing: 'auto-height',
        align: 'right',
        style: { fontFamily: 'Cairo', fontSize: 72, fontWeight: 700, color: '#ffffff' },
        content: { paragraphs: [{ runs: [{ text, style: {} }], list: 'none', indent: 0 }] },
      },
    ],
    { center: false },
  );
  const diag = (label: string) =>
    page.evaluate(
      ({ label, text }) => {
        const { editor, session } = window.__opencanvas!;
        const node = editor.store.getNodes().find((n) => n.type === 'text')!;
        const font = session.measurer.fontString({ family: 'Cairo', size: 72, weight: 700, style: 'normal' });
        const el = document.createElement('canvas').getContext('2d')!;
        el.font = font;
        const off = new OffscreenCanvas(8, 8).getContext('2d')!;
        off.font = font;
        const faces = [...document.fonts]
          .filter((f) => f.family.replace(/["']/g, '') === 'Cairo' && String(f.weight) === '700')
          .map((f) => `${f.unicodeRange.slice(0, 14)}=${f.status}`);
        return {
          label,
          height: node.height,
          font,
          appMeasure: session.measurer.measure(text, font, 0, 'rtl'),
          canvasEl: el.measureText(text).width,
          offscreen: off.measureText(text).width,
          check: document.fonts.check('700 72px Cairo', text),
          status: document.fonts.status,
          faces,
        };
      },
      { label, text },
    );
  const d1 = await diag('after insert + idle');
  await page.evaluate((t) => document.fonts.load('700 72px Cairo', t), text);
  await page.waitForTimeout(1000);
  const d2 = await diag('after explicit load');
  await page.evaluate(() => window.__opencanvas!.editor.remeasureAllText());
  const d3 = await diag('after remeasure');
  expect(JSON.stringify([d1, d2, d3], null, 1)).toBe('see the values');
});
