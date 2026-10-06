/**
 * The plugin manifest (`opencanvas-plugin.json` at the root of a plugin
 * package). Documented in docs/plugins.md; every field is validated here
 * before anything is installed.
 */
import { z } from 'zod';

export const MANIFEST_FILE = 'opencanvas-plugin.json';
export const MANIFEST_VERSION = 1;

/**
 * What a plugin may do. Shown to the person before installing; every API
 * call is checked against the permissions the plugin declared.
 */
export const PERMISSIONS = [
  'design:read', // read the open design (pages, elements, selection)
  'design:write', // add, change and delete elements and pages
  'images:read', // read the pixels of images in the design
  'images:write', // replace images and add new ones
  'network', // make network requests (fetch) to the hosts it lists
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Where a command appears in the editor. */
export const COMMAND_CONTEXTS = ['plugins', 'image', 'page'] as const;

const id = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/, 'Use a reverse-domain id such as "com.example.my-plugin"');
const localId = z
  .string()
  .min(1)
  .max(48)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'Use lower-case letters, digits and dashes');
const text = (max: number) => z.string().trim().min(1).max(max);
/** A path inside the package: relative, no "..", no backslashes. */
const filePath = z
  .string()
  .max(200)
  .regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[\w\-./]+$/, 'Use a relative path inside the package');
const semver = z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'Use a version such as 1.0.0');
const host = z
  .string()
  .max(253)
  .regex(/^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/i, 'Use a host name such as api.example.com');

const localized = z.object({ name: text(64).optional(), description: text(400).optional() }).strict();

export const PluginManifestSchema = z
  .object({
    manifestVersion: z.literal(MANIFEST_VERSION),
    id,
    name: text(64),
    version: semver,
    description: text(400),
    author: text(100),
    homepage: z.string().url().max(300).optional(),
    license: text(40).optional(),
    /** Square SVG or PNG icon shown in Settings and the Plugins panel. */
    icon: filePath.optional(),
    /** Script that runs in the plugin sandbox. Plugins with only icons or fonts need none. */
    main: filePath.optional(),
    /** Show the plugin's own interface (its sandbox document) in the editor's Plugins panel. */
    panel: z
      .object({ height: z.number().int().min(80).max(1200).default(320) })
      .strict()
      .optional(),
    permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length).default([]),
    /** Hosts the plugin may contact (with the "network" permission). */
    network: z.array(host).max(20).default([]),
    contributes: z
      .object({
        commands: z
          .array(
            z
              .object({
                id: localId,
                title: text(64),
                context: z.enum(COMMAND_CONTEXTS).default('plugins'),
                titleAr: text(64).optional(),
              })
              .strict(),
          )
          .max(30)
          .default([]),
        iconPacks: z
          .array(z.object({ id: localId, name: text(64), path: filePath }).strict())
          .max(10)
          .default([]),
        fonts: z
          .array(
            z
              .object({
                family: text(64),
                path: filePath,
                weight: z.number().int().min(100).max(900).multipleOf(100).default(400),
                style: z.enum(['normal', 'italic']).default('normal'),
              })
              .strict(),
          )
          .max(40)
          .default([]),
      })
      .strict()
      .default({ commands: [], iconPacks: [], fonts: [] }),
    locales: z.object({ ar: localized.optional(), en: localized.optional() }).strict().optional(),
  })
  .strict()
  .superRefine((m, ctx) => {
    if (m.contributes.commands.length > 0 && !m.main) {
      ctx.addIssue({ code: 'custom', path: ['main'], message: 'Plugins with commands need a "main" script' });
    }
    if (m.panel && !m.main) {
      ctx.addIssue({ code: 'custom', path: ['main'], message: 'A panel needs a "main" script' });
    }
    if (m.network.length > 0 && !m.permissions.includes('network')) {
      ctx.addIssue({
        code: 'custom',
        path: ['network'],
        message: 'Listing hosts requires the "network" permission',
      });
    }
    const ids = m.contributes.commands.map((c) => c.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['contributes', 'commands'],
        message: 'Command ids must be unique',
      });
    }
  });

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

export class PluginError extends Error {
  constructor(
    message: string,
    /** Field-level problems from manifest validation. */
    readonly issues: string[] = [],
  ) {
    super(message);
    this.name = 'PluginError';
  }
}

/** Validates a parsed manifest, listing every problem found. */
export function parseManifest(value: unknown): PluginManifest {
  const result = PluginManifestSchema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.') || 'manifest'}: ${i.message}`);
    throw new PluginError('The plugin manifest is not valid', issues);
  }
  return result.data;
}

/** Compares two semantic versions (pre-release tags sort before the release). */
export function compareVersions(a: string, b: string): number {
  const [coreA = '', preA] = a.split('-');
  const [coreB = '', preB] = b.split('-');
  const pa = coreA.split('.').map(Number);
  const pb = coreB.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  if (preA === preB) return 0;
  if (!preA) return 1;
  if (!preB) return -1;
  return preA < preB ? -1 : 1;
}

/** Name and description in the person's language, if the plugin provides them. */
export function localizedManifest(m: PluginManifest, locale: string): { name: string; description: string } {
  const l = locale === 'ar' ? m.locales?.ar : m.locales?.en;
  return { name: l?.name ?? m.name, description: l?.description ?? m.description };
}
