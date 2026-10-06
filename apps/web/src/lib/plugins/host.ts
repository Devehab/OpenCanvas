/**
 * Runs plugins in the editor. Each enabled plugin with a script gets one
 * sandboxed frame (see app/plugin-sandbox/route.ts), created when first
 * needed. The frame talks to the editor only through messages; every call is
 * checked against the permissions in the plugin's manifest, and every change
 * goes through the editor's validated, undoable commands.
 */
import type { AnyNodeProps, Id, NodeRecord } from '@opencanvas/core';
import type { Editor } from '@opencanvas/editor';
import { placeImage } from '../place-image';
import type { EditorSession } from '../session';
import { getAssetBlob } from '../storage/assets';
import type { InstalledPlugin } from '../storage/plugins';
import { prepareImage } from '../upload';
import type { Permission } from './manifest';

/** How long a plugin may take to start and to run one command. */
const START_TIMEOUT_MS = 15_000;
const RUN_TIMEOUT_MS = 120_000;
const MAX_PENDING_CALLS = 64;

export interface PluginHostOptions {
  editor: Editor;
  session: EditorSession;
  locale: string;
  dir: 'ltr' | 'rtl';
  toast: (message: string, kind?: 'info' | 'success' | 'error') => void;
}

type Message = { __opencanvas: 1; kind: string; [key: string]: unknown };

/** Which permission each API method needs (methods not listed need none). */
const METHOD_PERMISSIONS: Record<string, Permission[]> = {
  'design.get': ['design:read'],
  'design.page': ['design:read'],
  'design.selection': ['design:read'],
  'design.insert': ['design:write'],
  'design.update': ['design:write'],
  'design.remove': ['design:write'],
  'design.select': ['design:read'],
  'design.execute': ['design:write'],
  'images.get': ['images:read'],
  'images.replace': ['images:write'],
  'images.add': ['images:write', 'design:write'],
  'files.get': [],
  'ui.toast': [],
  'ui.resize': [],
};

class PluginInstance {
  readonly frame: HTMLIFrameElement;
  private state: 'starting' | 'ready' | 'failed' | 'disposed' = 'starting';
  private ready: Promise<void>;
  private resolveReady!: () => void;
  private rejectReady!: (error: Error) => void;
  private hellos = 0;
  private pendingCalls = 0;
  private readonly runs = new Map<number, { resolve: () => void; reject: (e: Error) => void }>();
  private nextRun = 1;
  /** Panel height requested by the plugin. */
  height: number;

  constructor(
    readonly plugin: InstalledPlugin,
    private readonly host: PluginHost,
    container: HTMLElement,
  ) {
    this.height = plugin.manifest.panel?.height ?? 320;
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.ready.catch(() => undefined);
    const frame = document.createElement('iframe');
    // Scripts only: an opaque origin, no popups, forms, downloads or navigation of the editor.
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('allow', '');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.title = plugin.manifest.name;
    frame.dataset.pluginId = plugin.id;
    const net = plugin.manifest.permissions.includes('network') ? plugin.manifest.network.join(',') : '';
    frame.src = `/plugin-sandbox${net ? `?net=${encodeURIComponent(net)}` : ''}`;
    Object.assign(frame.style, {
      position: 'fixed',
      border: '0',
      display: 'none',
      background: 'transparent',
      zIndex: '30',
    });
    container.appendChild(frame);
    this.frame = frame;
    setTimeout(() => {
      if (this.state === 'starting') this.fail(new Error('The plugin did not start in time'));
    }, START_TIMEOUT_MS);
  }

  get window(): Window | null {
    return this.frame.contentWindow;
  }

  whenReady(): Promise<void> {
    return this.ready;
  }

  private post(message: Record<string, unknown>, transfer: Transferable[] = []): void {
    // The frame has an opaque origin, so "*" is the only possible target; messages
    // are only ever sent to this frame's own window.
    this.window?.postMessage({ __opencanvas: 1, ...message }, '*', transfer);
  }

  private fail(error: Error): void {
    if (this.state === 'disposed') return;
    this.state = 'failed';
    this.rejectReady(error);
    for (const run of this.runs.values()) run.reject(error);
    this.runs.clear();
  }

  async handle(message: Message): Promise<void> {
    switch (message.kind) {
      case 'hello': {
        // A second hello means the frame reloaded or navigated: never run the code again.
        if (++this.hellos > 1) {
          this.fail(new Error('The plugin frame reloaded'));
          this.host.dispose(this.plugin.id);
          return;
        }
        const main = this.plugin.manifest.main ? this.plugin.files[this.plugin.manifest.main] : undefined;
        if (!main) {
          this.fail(new Error('The plugin has no script'));
          return;
        }
        this.post({
          kind: 'init',
          code: await main.text(),
          info: {
            locale: this.host.options.locale,
            dir: this.host.options.dir,
            pluginId: this.plugin.id,
            permissions: this.plugin.manifest.permissions,
          },
        });
        return;
      }
      case 'ready':
        if (this.state === 'starting') {
          this.state = 'ready';
          this.resolveReady();
        }
        return;
      case 'failed':
        this.fail(new Error(String(message.message ?? 'The plugin failed to start').slice(0, 300)));
        return;
      case 'run-result': {
        const run = this.runs.get(Number(message.runId));
        if (!run) return;
        this.runs.delete(Number(message.runId));
        if (message.error) run.reject(new Error(String(message.error).slice(0, 300)));
        else run.resolve();
        return;
      }
      case 'call': {
        const id = Number(message.id);
        const method = String(message.method);
        if (this.pendingCalls >= MAX_PENDING_CALLS) {
          this.post({ kind: 'result', id, error: 'Too many calls at once' });
          return;
        }
        this.pendingCalls++;
        try {
          const result = await this.host.call(this, method, message.params);
          this.post({ kind: 'result', id, result: result ?? null });
        } catch (error) {
          this.post({ kind: 'result', id, error: (error as Error).message || 'Failed' });
        } finally {
          this.pendingCalls--;
        }
        return;
      }
    }
  }

  async run(command: string, context: unknown): Promise<void> {
    await this.ready;
    const runId = this.nextRun++;
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.runs.delete(runId);
        reject(new Error('The plugin took too long'));
      }, RUN_TIMEOUT_MS);
      this.runs.set(runId, {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.post({ kind: 'run', runId, command, context });
    });
  }

  dispose(): void {
    this.state = 'disposed';
    this.fail(new Error('The plugin was stopped'));
    this.frame.remove();
  }
}

/** Plain, cloneable copies of records for plugins. */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class PluginHost {
  private readonly instances = new Map<string, PluginInstance>();
  private plugins = new Map<string, InstalledPlugin>();
  private readonly container: HTMLElement;
  private readonly listeners = new Set<() => void>();
  /** The plugin whose command is running (for the busy indicator). */
  running: { pluginId: string; command: string } | null = null;

  constructor(readonly options: PluginHostOptions) {
    this.container = document.createElement('div');
    this.container.dataset.opencanvas = 'plugin-frames';
    document.body.appendChild(this.container);
    window.addEventListener('message', this.onMessage);
  }

  /** Updates the set of installed plugins (stopping removed or disabled ones). */
  setPlugins(list: readonly InstalledPlugin[]): void {
    const enabled = list.filter((p) => p.enabled);
    const next = new Map(enabled.map((p) => [p.id, p]));
    for (const [id, instance] of this.instances) {
      const updated = next.get(id);
      if (!updated || updated.updatedAt !== instance.plugin.updatedAt) this.dispose(id);
    }
    this.plugins = next;
    this.emit();
  }

  get enabledPlugins(): InstalledPlugin[] {
    return [...this.plugins.values()];
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Changes whenever plugins, panel sizes or the running command change. */
  version = 0;

  private emit(): void {
    this.version++;
    for (const l of [...this.listeners]) l();
  }

  /** The plugin's frame, started if needed. */
  instance(pluginId: string): PluginInstance {
    let instance = this.instances.get(pluginId);
    if (!instance) {
      const plugin = this.plugins.get(pluginId);
      if (!plugin) throw new Error('The plugin is not enabled');
      instance = new PluginInstance(plugin, this, this.container);
      this.instances.set(pluginId, instance);
    }
    return instance;
  }

  dispose(pluginId: string): void {
    this.instances.get(pluginId)?.dispose();
    this.instances.delete(pluginId);
  }

  destroy(): void {
    window.removeEventListener('message', this.onMessage);
    for (const id of [...this.instances.keys()]) this.dispose(id);
    this.container.remove();
    this.listeners.clear();
  }

  private readonly onMessage = (event: MessageEvent): void => {
    const data = event.data as Message | null;
    if (!data || data.__opencanvas !== 1 || typeof data.kind !== 'string') return;
    // Only messages from a plugin frame this host created count.
    for (const instance of this.instances.values()) {
      if (event.source === instance.window) {
        void instance.handle(data);
        return;
      }
    }
  };

  /** Runs a plugin command as one undo step. */
  async runCommand(pluginId: string, command: string): Promise<void> {
    if (this.running) throw new Error('Another plugin is running');
    const plugin = this.plugins.get(pluginId);
    const declared = plugin?.manifest.contributes.commands.find((c) => c.id === command);
    if (!plugin || !declared) throw new Error('Unknown plugin command');
    const { editor } = this.options;
    this.running = { pluginId, command };
    this.emit();
    editor.history.beginBatch(declared.title);
    try {
      await this.instance(pluginId).run(command, {
        command,
        pageId: editor.pageId,
        selection: [...editor.selectedIds],
      });
    } finally {
      editor.history.endBatch();
      this.running = null;
      this.emit();
    }
  }

  /** Handles an API call from a plugin, after checking its permissions. */
  async call(instance: PluginInstance, method: string, params: unknown): Promise<unknown> {
    const needed = METHOD_PERMISSIONS[method];
    if (!needed) throw new Error(`Unknown method ${method}`);
    const granted = instance.plugin.manifest.permissions;
    const missing = needed.filter((p) => !granted.includes(p));
    if (missing.length) throw new Error(`Permission needed: ${missing.join(', ')}`);
    const p = (params ?? {}) as Record<string, unknown>;
    const { editor } = this.options;
    const ids = (value: unknown): Id[] =>
      Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').slice(0, 10_000) : [];

    switch (method) {
      case 'design.get': {
        const doc = editor.store.getDocument();
        return {
          title: doc?.title ?? '',
          pageId: editor.pageId,
          selection: [...editor.selectedIds],
          pages: editor.store.getPages().map((page) => plain(page)),
        };
      }
      case 'design.page': {
        const pageId = typeof p.pageId === 'string' ? p.pageId : editor.pageId;
        const page = editor.store.getPage(pageId);
        if (!page) throw new Error('No such page');
        const nodes = editor.store
          .getDescendantIds(pageId)
          .map((id) => editor.store.getNode(id))
          .filter((n): n is NodeRecord => !!n);
        return { page: plain(page), nodes: plain(nodes) };
      }
      case 'design.selection':
        return plain(editor.selectedIds.map((id) => editor.store.getNode(id)).filter(Boolean));
      case 'design.insert': {
        const nodes = Array.isArray(p.nodes) ? (p.nodes.slice(0, 1000) as AnyNodeProps[]) : [];
        const options = (p.options ?? {}) as { center?: boolean };
        return editor.insertNodes(nodes, { center: options.center === true });
      }
      case 'design.update':
        return editor.execute('node.update', { ids: ids(p.ids), patch: p.patch }) ?? null;
      case 'design.remove':
        return editor.execute('node.delete', { ids: ids(p.ids) }) ?? null;
      case 'design.select':
        editor.select(ids(p.ids).filter((id) => editor.store.getNode(id)));
        return null;
      case 'design.execute': {
        const command = String(p.command ?? '');
        if (!editor.commands.has(command)) throw new Error(`Unknown command ${command}`);
        return plain(editor.execute(command, p.params ?? {}) ?? null);
      }
      case 'images.get': {
        const node = this.imageNode(String(p.nodeId ?? ''));
        const asset = editor.store.getAsset(node.assetId);
        const blob = asset ? await getAssetBlob(asset.hash) : null;
        if (!asset || !blob) throw new Error('The image file is not available');
        return { nodeId: node.id, blob, width: asset.width, height: asset.height, mimeType: asset.mimeType };
      }
      case 'images.replace': {
        const node = this.imageNode(String(p.nodeId ?? ''));
        const asset = await this.prepare(p.blob, editor.store.getAsset(node.assetId)?.name ?? 'image');
        editor.execute('asset.add', { asset });
        editor.execute('image.replace', { id: node.id, assetId: asset.id });
        return node.id;
      }
      case 'images.add': {
        const asset = await this.prepare(p.blob, 'image');
        return placeImage(editor, { ...asset, size: asset.size });
      }
      case 'files.get': {
        const path = String(p.path ?? '');
        const file = instance.plugin.files[path];
        if (!file) throw new Error(`No file ${path} in the plugin`);
        return file;
      }
      case 'ui.toast': {
        const kind = p.kind === 'error' || p.kind === 'success' ? p.kind : 'info';
        this.options.toast(String(p.message ?? '').slice(0, 300), kind);
        return null;
      }
      case 'ui.resize': {
        const height = Number(p.height);
        if (Number.isFinite(height)) instance.height = Math.max(80, Math.min(1200, Math.round(height)));
        this.emit();
        return null;
      }
    }
    throw new Error(`Unknown method ${method}`);
  }

  /** An image element, or the image inside a frame. */
  private imageNode(id: Id) {
    const { store } = this.options.editor;
    let node = store.getNode(id);
    if (node?.type === 'frame') node = store.getChildren(node.id).find((c) => c.type === 'image');
    if (node?.type !== 'image') throw new Error('Not an image');
    return node;
  }

  /** Validates image bytes from a plugin like any upload and adds them to the library. */
  private async prepare(blob: unknown, name: string) {
    if (!(blob instanceof Blob)) throw new Error('Expected a Blob');
    const prepared = await prepareImage(blob, name);
    if (!prepared.ok) throw new Error(`Image refused: ${prepared.reason}`);
    this.options.session.images.put(prepared.asset.hash, prepared.image);
    return prepared.asset;
  }
}
