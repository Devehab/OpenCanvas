// @vitest-environment happy-dom

import { DEFAULT_TEXT_STYLE, type TextContent } from '@opencanvas/core';
import { describe, expect, it } from 'vitest';
import { htmlToTextContent, textContentToHtml } from '../src/dom/rich-text';
import { caretAtEnd } from '../src/dom/text-editor';

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

describe('caret when the text editor opens', () => {
  const paragraph = (text: string, style = {}) => ({
    runs: [{ text, style }],
    list: 'none' as const,
    indent: 0,
  });

  it('goes inside an empty paragraph, before its placeholder (so typing never adds a line)', () => {
    const el = document.createElement('div');
    el.innerHTML = textContentToHtml({ paragraphs: [paragraph('')] });
    const { node, offset } = caretAtEnd(el);
    expect(node).toBe(el.firstChild);
    expect(offset).toBe(0);
    // What the browser types there stays in that paragraph.
    (node as HTMLElement).insertBefore(document.createTextNode('مرحبا'), node.childNodes[offset] ?? null);
    expect(htmlToTextContent(el, base).paragraphs.map((p) => p.runs.map((r) => r.text).join(''))).toEqual([
      'مرحبا',
    ]);
  });

  it('goes to the end of the last run of the last paragraph', () => {
    const el = document.createElement('div');
    el.innerHTML = textContentToHtml({
      paragraphs: [
        paragraph('One'),
        { ...paragraph('Two '), runs: [{ text: 'bold', style: { fontWeight: 700 } }] },
      ],
    });
    const { node, offset } = caretAtEnd(el);
    expect(node.nodeType).toBe(Node.TEXT_NODE);
    expect(node.nodeValue).toBe('bold');
    expect(offset).toBe(4);
  });
});
