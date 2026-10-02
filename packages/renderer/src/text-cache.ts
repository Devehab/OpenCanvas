/**
 * Text layout cache. Records are immutable and moving a node only replaces
 * x/y, so the `content` and `style` objects keep their identity — layouts are
 * looked up by those objects plus the remaining layout inputs.
 */
import {
  layoutText,
  type TextLayout,
  type TextMeasurer,
  type TextNode,
  textLayoutInput,
} from '@opencanvas/core';

interface Entry {
  node: TextNode;
  layout: TextLayout;
}

const sameInputs = (a: TextNode, b: TextNode) =>
  a.style === b.style &&
  a.width === b.width &&
  a.height === b.height &&
  a.sizing === b.sizing &&
  a.autoFit === b.autoFit &&
  a.align === b.align &&
  a.verticalAlign === b.verticalAlign &&
  a.direction === b.direction &&
  a.lineHeight === b.lineHeight &&
  a.paragraphSpacing === b.paragraphSpacing;

export class TextLayoutCache {
  private cache = new WeakMap<object, Entry[]>();

  constructor(private measurer: TextMeasurer) {}

  get(node: TextNode): TextLayout {
    let entries = this.cache.get(node.content);
    if (!entries) {
      entries = [];
      this.cache.set(node.content, entries);
    }
    const hit = entries.find((e) => sameInputs(e.node, node));
    if (hit) return hit.layout;
    const layout = layoutText(textLayoutInput(node), this.measurer);
    entries.push({ node, layout });
    if (entries.length > 8) entries.shift();
    return layout;
  }

  /** Drops all layouts (call after fonts load or the measurer changes). */
  clear(measurer?: TextMeasurer): void {
    if (measurer) this.measurer = measurer;
    this.cache = new WeakMap();
  }
}
