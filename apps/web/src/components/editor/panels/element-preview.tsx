'use client';

/**
 * Small SVG previews of element props (shapes, lines, paths, frames and
 * groups of them), drawn from the same geometry the renderer uses.
 */
import {
  type AnyNodeProps,
  type ArrowHead,
  type Fill,
  getShapePath,
  pathToSvg,
  type ShapeKind,
  type Stroke,
} from '@opencanvas/core';
import { type ReactNode, useId } from 'react';

type Props = Record<string, unknown> & { type: string; children?: Props[] };

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

function fillColor(fill: Fill | null | undefined): string {
  if (!fill) return 'none';
  if (fill.type === 'solid') return fill.color;
  if ('stops' in fill && fill.stops.length) return fill.stops[0]!.color;
  return '#cbd5e1';
}

function strokeAttrs(stroke: Partial<Stroke> | null | undefined, scale = 1) {
  if (!stroke) return {};
  const width = num(stroke.width, 2) * scale;
  return {
    stroke: stroke.color ?? '#111827',
    strokeWidth: width,
    strokeLinecap: stroke.cap ?? 'round',
    strokeLinejoin: stroke.join ?? 'round',
    strokeDasharray:
      stroke.style === 'dashed'
        ? `${width * 3} ${width * 2}`
        : stroke.style === 'dotted'
          ? `0.01 ${width * 2}`
          : undefined,
  } as const;
}

function arrowHead(
  kind: ArrowHead,
  x: number,
  y: number,
  dir: 1 | -1,
  w: number,
  color: string,
  key: string,
) {
  const s = Math.max(6, w * 2.6);
  switch (kind) {
    case 'arrow':
      return (
        <polyline
          key={key}
          points={`${x - dir * s} ${y - s * 0.6} ${x} ${y} ${x - dir * s} ${y + s * 0.6}`}
          fill="none"
          stroke={color}
          strokeWidth={w}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case 'triangle':
      return (
        <polygon
          key={key}
          points={`${x - dir * s} ${y - s * 0.6} ${x} ${y} ${x - dir * s} ${y + s * 0.6}`}
          fill={color}
        />
      );
    case 'circle':
      return <circle key={key} cx={x - (dir * s) / 2} cy={y} r={s / 2} fill={color} />;
    case 'square':
      return <rect key={key} x={x - (dir > 0 ? s : 0)} y={y - s / 2} width={s} height={s} fill={color} />;
    case 'bar':
      return (
        <line key={key} x1={x} y1={y - s * 0.7} x2={x} y2={y + s * 0.7} stroke={color} strokeWidth={w} />
      );
    default:
      return null;
  }
}

function NodePreview({ node, uid, root }: { node: Props; uid: string; root?: boolean }): ReactNode {
  const w = num(node.width, 100);
  const h = num(node.height, 100);
  const x = root ? 0 : num(node.x);
  const y = root ? 0 : num(node.y);
  const rotation = num(node.rotation);
  const transform = `translate(${x} ${y})${rotation ? ` rotate(${rotation} ${w / 2} ${h / 2})` : ''}`;
  const shadow = node.shadow ? { filter: 'drop-shadow(0 2px 3px rgb(15 23 42 / 0.25))' } : undefined;

  switch (node.type) {
    case 'group':
      return (
        <g transform={transform}>
          {(node.children ?? []).map((child, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static preview, children never reorder
            <NodePreview key={i} node={child} uid={`${uid}-${i}`} />
          ))}
        </g>
      );
    case 'shape': {
      const d = pathToSvg(
        getShapePath(node.shape as ShapeKind, w, h, {
          cornerRadius: num(node.cornerRadius),
          sides: num(node.sides, 5),
          innerRatio: num(node.innerRatio, 0.5),
        }),
      );
      return (
        <path
          transform={transform}
          d={d}
          fill={fillColor(node.fill as Fill | null)}
          style={shadow}
          {...strokeAttrs(node.stroke as Stroke | null)}
        />
      );
    }
    case 'frame': {
      const kind = node.shape as ShapeKind;
      const d = pathToSvg(
        getShapePath(kind, w, h, {
          cornerRadius: num(node.cornerRadius),
          sides: kind === 'scallop' ? 12 : 5,
          innerRatio: 0.5,
        }),
      );
      const clip = `${uid}-clip`;
      const sky = `${uid}-sky`;
      return (
        <g transform={transform}>
          <defs>
            <clipPath id={clip}>
              <path d={d} />
            </clipPath>
            <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#c9e6fb" />
              <stop offset="1" stopColor="#eef8ff" />
            </linearGradient>
          </defs>
          <g clipPath={`url(#${clip})`}>
            <rect width={w} height={h} fill={`url(#${sky})`} />
            <circle cx={w * 0.72} cy={h * 0.3} r={Math.min(w, h) * 0.08} fill="#ffffff" />
            <path
              d={`M0 ${h * 0.78} Q${w * 0.3} ${h * 0.55} ${w * 0.55} ${h * 0.72} T${w} ${h * 0.66} V${h} H0Z`}
              fill="#cfdf8f"
            />
            <path d={`M0 ${h * 0.9} Q${w * 0.4} ${h * 0.72} ${w} ${h * 0.86} V${h} H0Z`} fill="#8fa33a" />
          </g>
        </g>
      );
    }
    case 'line': {
      const stroke = (node.stroke ?? {}) as Partial<Stroke>;
      const sw = num(stroke.width, 4);
      const color = stroke.color ?? '#111827';
      const cy = h / 2;
      const start = (node.startArrow as ArrowHead) ?? 'none';
      const end = (node.endArrow as ArrowHead) ?? 'none';
      return (
        <g transform={transform}>
          <line
            x1={start === 'none' ? 0 : sw}
            y1={cy}
            x2={end === 'none' ? w : w - sw}
            y2={cy}
            {...strokeAttrs({ ...stroke, width: sw })}
          />
          {arrowHead(start, 0, cy, -1, sw, color, 'start')}
          {arrowHead(end, w, cy, 1, sw, color, 'end')}
        </g>
      );
    }
    case 'path': {
      const vb = (node.viewBox ?? { x: 0, y: 0, width: w, height: h }) as {
        x: number;
        y: number;
        width: number;
        height: number;
      };
      const sx = w / vb.width;
      const sy = h / vb.height;
      return (
        <g transform={`${transform} scale(${sx} ${sy}) translate(${-vb.x} ${-vb.y})`}>
          <path
            d={String(node.path ?? '')}
            fill={fillColor(node.fill as Fill | null)}
            fillRule={(node.fillRule as 'evenodd' | 'nonzero') ?? 'nonzero'}
            {...strokeAttrs(node.stroke as Stroke | null)}
          />
        </g>
      );
    }
    default:
      return null;
  }
}

/** Preview of element props, fitted into its box with a little padding. */
export function ElementPreview({ props, className }: { props: AnyNodeProps; className?: string }) {
  const uid = useId().replace(/:/g, '');
  const node = props as unknown as Props;
  const w = num(node.width, 100);
  const h = Math.max(num(node.height, 100), node.type === 'line' ? 24 : 1);
  const pad = Math.max(w, h) * (node.type === 'line' ? 0.04 : 0.08);
  const y = node.type === 'line' ? -(h - num(node.height, 4)) / 2 : 0;
  return (
    <svg
      viewBox={`${-pad} ${y - pad} ${w + 2 * pad} ${h + 2 * pad}`}
      className={className}
      overflow="visible"
      aria-hidden
    >
      <NodePreview node={node} uid={uid} root />
    </svg>
  );
}
