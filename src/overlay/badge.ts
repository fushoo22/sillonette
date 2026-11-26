// Error badge of the overlay: a small pill "E10 · message" so that the streamer understands in OBS
// what is wrong. Text only ever goes through textContent.
import type { ErrorCode } from "../shared/types.ts";
import type { Lang } from "../shared/config.ts";
import { errorMessage } from "./i18n.ts";

export interface BadgeEls {
  root: HTMLElement;
  code: HTMLElement;
  msg: HTMLElement;
}

export function getBadgeEls(doc: Document): BadgeEls | null {
  const root = doc.querySelector<HTMLElement>(".sillonette-err");
  const code = root?.querySelector<HTMLElement>(".code");
  const msg = root?.querySelector<HTMLElement>(".msg");
  return root && code && msg ? { root, code, msg } : null;
}

export class ErrorBadge {
  private els: BadgeEls | null;
  private lang: Lang;
  private enabled: boolean;
  private current: ErrorCode | "" = "";
  private fixed: ErrorCode | null = null;

  /** enabled = false ("er=0" in a preview fragment): nothing is ever shown. */
  constructor(els: BadgeEls | null, lang: Lang, enabled: boolean) {
    this.els = els;
    this.lang = lang;
    this.enabled = enabled;
    this.render();
  }

  /** Error sent by the extension with the event ("" = over). */
  set(code: ErrorCode | ""): void {
    this.current = code;
    this.render();
  }

  /** Demo mode: always show this code ("#demo=1&err=E10"). */
  setFixed(code: ErrorCode | null): void {
    this.fixed = code;
    this.render();
  }

  /** The code shown right now ("" = none). */
  get code(): ErrorCode | "" {
    if (!this.enabled) return "";
    return this.fixed ?? this.current;
  }

  private render(): void {
    const e = this.els;
    if (!e) return;
    const code = this.code;
    if (code === "") {
      e.root.hidden = true;
      e.root.dataset.code = "";
      e.code.textContent = "";
      e.msg.textContent = "";
      return;
    }
    e.code.textContent = code;
    e.msg.textContent = errorMessage(this.lang, code);
    e.root.dataset.code = code;
    e.root.hidden = false;
  }
}
