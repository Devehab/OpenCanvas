/**
 * The whole element catalog, loaded on demand by `loadElementCatalog`.
 */
import type { ElementCatalog } from '../element-library';
import { FRAME_SECTIONS } from './frames';
import { GRID_SECTIONS } from './grids';
import { LINE_SECTIONS } from './lines';
import { MOCKUP_SECTIONS } from './mockups';
import { PHOTO_FRAME_SECTIONS } from './photo-frames';
import { SHAPE_SECTIONS } from './shapes';

const sections: ElementCatalog['sections'] = {
  lines: LINE_SECTIONS,
  shapes: SHAPE_SECTIONS,
  frames: FRAME_SECTIONS,
  'photo-frames': PHOTO_FRAME_SECTIONS,
  grids: GRID_SECTIONS,
  mockups: MOCKUP_SECTIONS,
};

export const CATALOG: ElementCatalog = {
  sections,
  all: Object.values(sections).flatMap((list) => list.flatMap((s) => s.items)),
};
