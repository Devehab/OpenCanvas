/**
 * The script that runs inside a plugin's sandboxed frame. It installs the
 * `opencanvas` API (every call is a message to the editor, which checks it
 * against the plugin's permissions), then runs the plugin's code, which the
 * editor sends exactly once.
 *
 * Kept as a plain string so it can be served inline by the sandbox route.
 */
export const SANDBOX_BOOTSTRAP = `(() => {
  'use strict';
  const host = window.parent;
  const send = (message) => host.postMessage(Object.assign({ __opencanvas: 1 }, message), '*');
  const pending = new Map();
  const commands = new Map();
  let nextId = 1;
  let started = false;
  let info = { locale: 'en', dir: 'ltr', pluginId: '', permissions: [] };

  const call = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      send({ kind: 'call', id, method, params: params === undefined ? null : params });
    });

  const api = {
    version: 1,
    get locale() { return info.locale; },
    get dir() { return info.dir; },
    get pluginId() { return info.pluginId; },
    get permissions() { return info.permissions.slice(); },
    commands: {
      register(id, handler) {
        if (typeof id !== 'string' || typeof handler !== 'function') throw new TypeError('register(id, handler)');
        commands.set(id, handler);
      },
    },
    design: {
      get: () => call('design.get'),
      page: (pageId) => call('design.page', { pageId: pageId ?? null }),
      selection: () => call('design.selection'),
      insert: (nodes, options) => call('design.insert', { nodes, options: options ?? {} }),
      update: (ids, patch) => call('design.update', { ids, patch }),
      remove: (ids) => call('design.remove', { ids }),
      select: (ids) => call('design.select', { ids }),
      execute: (command, params) => call('design.execute', { command, params }),
    },
    images: {
      get: (nodeId) => call('images.get', { nodeId }),
      replace: (nodeId, blob) => call('images.replace', { nodeId, blob }),
      add: (blob, options) => call('images.add', { blob, options: options ?? {} }),
    },
    files: { get: (path) => call('files.get', { path }) },
    ui: {
      toast: (message, kind) => call('ui.toast', { message: String(message), kind: kind ?? 'info' }),
      resize: (height) => call('ui.resize', { height }),
    },
  };
  Object.defineProperty(window, 'opencanvas', { value: Object.freeze(api), enumerable: true });

  window.addEventListener('message', async (event) => {
    if (event.source !== host) return;
    const m = event.data;
    if (!m || m.__opencanvas !== 1) return;
    if (m.kind === 'init') {
      if (started) return;
      started = true;
      info = m.info;
      document.documentElement.lang = info.locale;
      document.documentElement.dir = info.dir;
      const url = URL.createObjectURL(new Blob([m.code], { type: 'text/javascript' }));
      try {
        await import(url);
        send({ kind: 'ready' });
      } catch (error) {
        send({ kind: 'failed', message: String((error && error.message) || error) });
      } finally {
        URL.revokeObjectURL(url);
      }
    } else if (m.kind === 'result') {
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error));
      else p.resolve(m.result);
    } else if (m.kind === 'run') {
      const handler = commands.get(m.command);
      if (!handler) {
        send({ kind: 'run-result', runId: m.runId, error: 'Command "' + m.command + '" is not registered' });
        return;
      }
      try {
        await handler(m.context);
        send({ kind: 'run-result', runId: m.runId });
      } catch (error) {
        send({ kind: 'run-result', runId: m.runId, error: String((error && error.message) || error) });
      }
    }
  });
  send({ kind: 'hello' });
})();`;
