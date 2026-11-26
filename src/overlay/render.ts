// Renders track events. Text only ever goes through textContent.
import type { NpEvent, StreamEvent } from "../shared/types.ts";
import type { Theme } from "../shared/config.ts";
import { label } from "./i18n.ts";

export interface Els {
  root: HTMLElement;
  img: HTMLImageElement;
  title: HTMLElement;
  titleText: HTMLElement;
  artist: HTMLElement;
  album: HTMLElement;
  status: HTMLElement;
  fill: HTMLElement;
  cur: HTMLElement;
  dur: HTMLElement;
}

export function getEls(doc: Document): Els {
  const q = <T extends HTMLElement>(sel: string) => {
    const el = doc.querySelector<T>(sel);
    if (!el) throw new Error("missing " + sel);
    return el;
  };
  return {
    root: q(".sillonette"), img: q(".art img"), title: q(".title"), titleText: q(".title > span"),
    artist: q(".artist"), album: q(".album"), status: q(".status"), fill: q(".fill"),
    cur: q(".time .cur"), dur: q(".time .dur"),
  };
}

export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = (s < 10 ? "0" : "") + s;
  return h > 0 ? h + ":" + (m < 10 ? "0" : "") + m + ":" + ss : m + ":" + ss;
}

export class Overlay {
  private els: Els;
  private theme: Theme;
  private now: () => number;
  private offset = 0; // extension clock - overlay clock
  private last: NpEvent | null = null;
  private tick: ReturnType<typeof setInterval> | undefined;
  private swapTimer: ReturnType<typeof setTimeout> | undefined;
  /** Next moment the visibility must be decided again (end of the "a few seconds" window, or of the pause delay). */
  private visTimer: ReturnType<typeof setTimeout> | undefined;
  /** Overlay clock (ms) at which the current track's "a few seconds" window ends (setting nt > 0). */
  private briefUntil = 0;
  /** Overlay clock (ms) at which the current pause began (null: not paused). The extension resends the
   *  state every 5 s: the pause delay counts from the first paused event, not from the latest one. */
  private pausedAt: number | null = null;

  constructor(els: Els, theme: Theme, now: () => number = Date.now) {
    this.els = els;
    this.theme = theme;
    this.now = now;
    els.img.addEventListener("error", () => {
      els.root.classList.remove("art-loading");
      els.root.classList.add("no-art");
    });
    els.img.addEventListener("load", () => els.root.classList.remove("no-art", "art-loading"));
  }

  /** The settings arrive with each event and may change. */
  setTheme(theme: Theme): void {
    const before = this.theme;
    this.theme = theme;
    // "A few seconds" just switched on or changed: show the current track for that long, from now.
    if (theme.nt > 0 && theme.nt !== before.nt) this.briefUntil = this.now() + theme.nt * 1000;
    if (this.last) {
      this.progress(this.last);
      this.visibility();
    }
  }

  /** Measures the long-title scrolling again: call it once a skin's stylesheet or a font has loaded,
   *  or when the source is resized (the first measure may have used a fallback font). */
  refreshMarquee(): void {
    if (this.last) this.scheduleMarquee();
  }

  get state(): string {
    return this.els.root.dataset.state ?? "hidden";
  }

  handle(ev: StreamEvent): void {
    this.offset = ev.now - this.now();
    if (ev.state === "idle") {
      clearTimeout(this.visTimer);
      this.last = null;
      this.pausedAt = null;
      this.stopTick();
      if (this.theme.id === "wait") {
        this.setText("", label(this.theme.lg, "waiting"), "", "");
        this.els.root.classList.add("no-art");
        this.setState("waiting");
        this.show();
      } else {
        this.hide("idle");
      }
      return;
    }
    const changed = !this.last || this.last.title !== ev.title || this.last.artist !== ev.artist || this.last.art !== ev.art;
    const wasVisible = this.els.root.classList.contains("is-visible");
    if (changed) {
      this.setText(ev.art, ev.title, ev.artist, ev.album);
      if (wasVisible) this.swap();
      // A new track opens the "a few seconds" window (only a new track: not a resume after a pause).
      this.briefUntil = this.now() + this.theme.nt * 1000;
    }
    if (ev.state !== "paused") this.pausedAt = null;
    else if (changed || this.pausedAt === null) this.pausedAt = this.now();
    this.last = ev;
    this.setState(ev.state);
    this.els.status.textContent = ev.state === "paused" ? label(this.theme.lg, "paused") : "";
    this.progress(ev);
    this.visibility();
    if (changed) this.scheduleMarquee();
  }

  /** Shows or hides the card for the current track, and plans the next decision. */
  private visibility(): void {
    clearTimeout(this.visTimer);
    const ev = this.last;
    if (!ev) return;
    const now = this.now();
    let next = Infinity;
    if (this.theme.nt > 0) {
      if (now >= this.briefUntil) {
        // Window over: hidden until the next track. The state (playing / paused) stays; an error
        // badge stays visible (it is a separate element).
        this.conceal();
        return;
      }
      next = this.briefUntil;
    }
    if (ev.state === "paused" && this.theme.pa === "hide") {
      const hideAt = (this.pausedAt ?? now) + this.theme.pt * 1000;
      if (now >= hideAt) {
        this.hide("paused");
        return;
      }
      next = Math.min(next, hideAt);
    }
    this.show();
    if (next !== Infinity) this.visTimer = setTimeout(() => this.visibility(), Math.max(0, next - now));
  }

  private sourceNow(): number {
    return this.now() + this.offset;
  }

  private setState(s: string): void {
    this.els.root.dataset.state = s;
  }

  private show(): void {
    this.els.root.classList.add("is-visible");
    this.els.root.removeAttribute("aria-hidden");
  }

  /** Hidden by the "a few seconds" mode: the state stays as it is. */
  private conceal(): void {
    this.els.root.classList.remove("is-visible");
    this.els.root.setAttribute("aria-hidden", "true");
  }

  private hide(reason: string): void {
    this.els.root.classList.remove("is-visible");
    this.els.root.setAttribute("aria-hidden", "true");
    this.setState(reason);
    this.stopTick();
  }

  private setText(art: string, title: string, artist: string, album: string): void {
    const e = this.els;
    e.titleText.textContent = title;
    e.artist.textContent = artist;
    e.album.textContent = album;
    e.root.classList.toggle("no-artist", artist === "");
    e.root.classList.toggle("no-album", album === "");
    e.title.classList.remove("marquee");
    if (art) {
      if (e.img.getAttribute("src") !== art) {
        // Until the new artwork is there, show none: never the previous track's one with the new title.
        e.root.classList.add("art-loading");
        e.img.src = art; // the CSP img-src allow-list applies
      }
    } else {
      e.img.removeAttribute("src");
      e.root.classList.remove("art-loading");
      e.root.classList.add("no-art");
    }
  }

  private swap(): void {
    const root = this.els.root;
    root.classList.remove("swap");
    void root.offsetWidth; // restart the CSS animation
    root.classList.add("swap");
    clearTimeout(this.swapTimer);
    this.swapTimer = setTimeout(() => root.classList.remove("swap"), 600);
  }

  private progress(ev: NpEvent): void {
    const { fill } = this.els;
    const playing = ev.state === "playing" && ev.rate > 0;
    let pos = ev.pos + (playing ? (this.sourceNow() - ev.at) * ev.rate : 0);
    if (ev.dur > 0) pos = Math.min(pos, ev.dur);
    pos = Math.max(0, pos);
    this.els.root.classList.toggle("no-dur", ev.dur <= 0);
    const ratio = ev.dur > 0 ? pos / ev.dur : 0;
    fill.style.transition = "none";
    fill.style.transform = "scaleX(" + ratio.toFixed(4) + ")";
    if (playing && ev.dur > 0) {
      void fill.offsetWidth; // commit the start position, then let CSS animate to the end
      fill.style.transition = "transform " + Math.round((ev.dur - pos) / ev.rate) + "ms linear";
      fill.style.transform = "scaleX(1)";
    }
    this.els.dur.textContent = ev.dur > 0 ? formatTime(ev.dur) : "";
    this.updateTime();
    this.stopTick();
    if (playing && this.theme.sh.includes("time")) this.tick = setInterval(() => this.updateTime(), 1000);
  }

  private updateTime(): void {
    const ev = this.last;
    if (!ev) return;
    const playing = ev.state === "playing";
    let pos = ev.pos + (playing ? (this.sourceNow() - ev.at) * ev.rate : 0);
    if (ev.dur > 0) pos = Math.min(pos, ev.dur);
    this.els.cur.textContent = formatTime(pos);
  }

  private stopTick(): void {
    clearInterval(this.tick);
    this.tick = undefined;
  }

  private scheduleMarquee(): void {
    const { title } = this.els;
    title.classList.remove("marquee");
    if (!this.theme.mq) return;
    const win = title.ownerDocument.defaultView;
    if (!win) return;
    win.requestAnimationFrame(() => {
      const overflow = title.scrollWidth - title.clientWidth;
      if (overflow > 4) {
        // Right-to-left title (dir="auto"): the hidden part is on the left, scroll to the right.
        const rtl = win.getComputedStyle(title).direction === "rtl";
        title.style.setProperty("--_mq-dist", (rtl ? overflow : -overflow) + "px");
        title.style.setProperty("--_mq-time", Math.max(6, overflow / 30 + 4).toFixed(1) + "s");
        title.classList.add("marquee");
      }
    });
  }
}
