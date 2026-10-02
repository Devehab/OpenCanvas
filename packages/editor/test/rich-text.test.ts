// @vitest-environment happy-dom

import { DEFAULT_TEXT_STYLE, type TextContent } from '@opencanvas/core';
import { describe, expect, it } from 'vitest';
import { htmlToTextContent, textContentToHtml } from '../src/dom/rich-text';

const base = { ...DEFAULT_TEXT_STYLE };

function roundTrip(content: TextContent): TextContent {
  const el = document.createElement('div');
  el.innerHTML = textContentToHtml(content);
  return htmlToTextContent(el, base);
}

describe('rich text DOM conversion', () => {
  it('round-trips paragraphs, runs, lists and soft breaks', () => {
    const content: TextContent = {
      paragraphs: [
        {
          runs: [
            { text: 'Hello ', style: {} },
            { text: 'bold', style: { fontWeight: 700 } },
          ],
          list: 'none',
          indent: 0,
        },
        { runs: [{ text: '', style: {} }], list: 'none', indent: 0 },
        { runs: [{ text: 'مرحبا بالعالم', style: { color: '#ff0000' } }], list: 'bullet', indent: 1 },
      ],
    };
    expect(roundTrip(content)).toEqual(content);
  });

  it('escapes markup in text', () => {
    const el = document.createElement('div');
    el.innerHTML = textContentToHtml({
      paragraphs: [{ runs: [{ text: '<img src=x onerror=alert(1)>', style: {} }], list: 'none', indent: 0 }],
    });
    expect(el.querySelector('img')).toBeNull();
    expect(htmlToTextContent(el, base).paragraphs[0]!.runs[0]!.text).toBe('<img src=x onerror=alert(1)>');
  });

  it('reads browser-generated formatting', () => {
    const el = document.createElement('div');
    el.innerHTML =
      '<div>plain <b>bold</b> <i>it</i> <u>u</u> <span style="color: rgb(0, 128, 0)">green</span></div><div><br></div><div>x&nbsp;y</div><script>evil()</script>';
    const c = htmlToTextContent(el, base);
    expect(c.paragraphs).toHaveLength(3);
    const runs = c.paragraphs[0]!.runs;
    expect(runs.find((r) => r.text === 'bold')!.style.fontWeight).toBe(700);
    expect(runs.find((r) => r.text === 'it')!.style.fontStyle).toBe('italic');
    expect(runs.find((r) => r.text === 'u')!.style.underline).toBe(true);
    expect(runs.find((r) => r.text === 'green')!.style.color).toBe('rgb(0, 128, 0)');
    expect(c.paragraphs[2]!.runs[0]!.text).toBe('x y');
    expect(JSON.stringify(c)).not.toContain('evil');
  });

  it('handles text typed directly into the root (no block wrapper)', () => {
    const el = document.createElement('div');
    el.textContent = 'typed';
    expect(htmlToTextContent(el, base).paragraphs[0]!.runs[0]!.text).toBe('typed');
  });
});
