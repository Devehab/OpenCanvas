/**
 * Cross-tab notifications (BroadcastChannel): lets the dashboard refresh and
 * lets two tabs editing the same design detect each other's saves.
 */
export type ChannelMessage =
  | { type: 'design-saved'; designId: string; revision: number; tabId: string }
  | { type: 'designs-changed'; tabId: string }
  | { type: 'thumbnail-updated'; designId: string; tabId: string }
  | { type: 'uploads-changed'; tabId: string }
  | { type: 'folders-changed'; tabId: string }
  | { type: 'brands-changed'; tabId: string }
  | { type: 'fonts-changed'; tabId: string }
  | { type: 'icons-changed'; tabId: string }
  | { type: 'plugins-changed'; tabId: string }
  | { type: 'cloud-synced'; tabId: string };

export const TAB_ID =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random());

let channel: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  channel ??= new BroadcastChannel('opencanvas');
  return channel;
}

const localHandlers = new Set<(message: ChannelMessage) => void>();

/** Sends a message to other tabs; with `self`, this tab's listeners receive it too. */
export function broadcast(message: ChannelMessage, options: { self?: boolean } = {}): void {
  getChannel()?.postMessage(message);
  if (options.self) for (const handler of [...localHandlers]) handler(message);
}

export function onChannelMessage(handler: (message: ChannelMessage) => void): () => void {
  localHandlers.add(handler);
  const c = getChannel();
  const listener = (e: MessageEvent<ChannelMessage>) => {
    if (e.data && e.data.tabId !== TAB_ID) handler(e.data);
  };
  c?.addEventListener('message', listener);
  return () => {
    localHandlers.delete(handler);
    c?.removeEventListener('message', listener);
  };
}
