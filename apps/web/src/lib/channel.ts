/**
 * Cross-tab notifications (BroadcastChannel): lets the dashboard refresh and
 * lets two tabs editing the same design detect each other's saves.
 */
export type ChannelMessage =
  | { type: 'design-saved'; designId: string; revision: number; tabId: string }
  | { type: 'designs-changed'; tabId: string };

export const TAB_ID =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random());

let channel: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  channel ??= new BroadcastChannel('opencanvas');
  return channel;
}

export function broadcast(message: ChannelMessage): void {
  getChannel()?.postMessage(message);
}

export function onChannelMessage(handler: (message: ChannelMessage) => void): () => void {
  const c = getChannel();
  if (!c) return () => {};
  const listener = (e: MessageEvent<ChannelMessage>) => {
    if (e.data && e.data.tabId !== TAB_ID) handler(e.data);
  };
  c.addEventListener('message', listener);
  return () => c.removeEventListener('message', listener);
}
