/**
 * @opencanvas/core — the OpenCanvas design engine.
 *
 * Structured document model · atomic store · named commands · undo/redo ·
 * geometry · text layout (incl. RTL/Arabic) · canonical serialization.
 */

export * from './color';
export * from './commands/builtin';
export * from './commands/execute';
export * from './commands/registry';
export * from './fractional-index';
export * from './geometry/hit-test';
export * from './geometry/outline';
export * from './geometry/path';
export * from './geometry/shapes';
export * from './geometry/transforms';
export * from './history/history';
export * from './ids';
export * from './math';
export * from './model/defaults';
export * from './model/factory';
export * from './model/limits';
export * from './model/schema';
export * from './model/text-content';
export * from './model/types';
export * from './operations/group';
export * from './operations/nodes';
export * from './operations/order';
export * from './operations/pages';
export * from './operations/resize';
export * from './operations/text';
export * from './operations/transform';
export * from './presets/formats';
export * from './serialization/canonical';
export * from './serialization/document';
export * from './serialization/integrity';
export * from './serialization/migrations';
export * from './snapping/snapping';
export * from './store/diff';
export * from './store/equality';
export * from './store/store';
export * from './text/bidi';
export * from './text/layout';
export * from './text/linebreak';
export * from './text/measurer';
