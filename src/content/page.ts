// Real-page implementation of PageLike (the only place touching the YouTube Music DOM).
import type { MetadataLike, PageLike } from "./types.ts";
import { SELECTORS } from "./ytmusic.ts";

export function domPage(doc: Document, nav: Navigator): PageLike {
  return {
    metadata(): MetadataLike | null {
      const m = nav.mediaSession?.metadata;
      if (!m) return null;
      return { title: m.title ?? "", artist: m.artist ?? "", album: m.album ?? "", artwork: Array.from(m.artwork ?? []) };
    },
    media() {
      return doc.querySelector<HTMLMediaElement>(SELECTORS.media);
    },
    text(sel) {
      return doc.querySelector(sel)?.textContent?.trim() ?? "";
    },
    attr(sel, name) {
      return doc.querySelector(sel)?.getAttribute(name) ?? "";
    },
    exists(sel) {
      return doc.querySelector(sel) !== null;
    },
  };
}
