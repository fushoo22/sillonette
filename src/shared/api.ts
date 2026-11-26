// Minimal typed view of the WebExtension APIs we use (no @types dependency).
// Chrome MV3 and Firefox both return promises; `browser` (Firefox) is preferred when present.

export interface StorageArea {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export interface MessageSender {
  id?: string;
  tab?: { id?: number };
  url?: string;
}

export interface ExtApi {
  runtime: {
    id: string;
    sendMessage(msg: unknown): Promise<unknown>;
    onMessage: {
      addListener(fn: (msg: unknown, sender: MessageSender, sendResponse: (r: unknown) => void) => boolean | void): void;
    };
  };
  storage: {
    local: StorageArea;
    session?: StorageArea;
    onChanged: { addListener(fn: (changes: Record<string, { newValue?: unknown }>, area: string) => void): void };
  };
  tabs?: {
    onRemoved: { addListener(fn: (tabId: number) => void): void };
    sendMessage(tabId: number, msg: unknown): Promise<unknown>;
  };
  i18n: { getMessage(name: string, subs?: string | string[]): string; getUILanguage(): string };
}

const g = globalThis as unknown as { browser?: ExtApi; chrome?: ExtApi };
export const api: ExtApi = (g.browser ?? g.chrome)!;
