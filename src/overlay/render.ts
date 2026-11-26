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
  private pauseTimer: ReturnType<typeof setTimeout> | undefined;
  private tick: ReturnType<typeof setInterval> | undefined;
  private swapTimer: ReturnType<typeof setTimeout> | undefined;

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
    this.theme = theme;
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
    clearTimeout(this.pauseTimer);
    if (ev.state === "idle") {
      this.last = null;
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
    }
    this.last = ev;
    this.setState(ev.state);
    this.els.status.textContent = ev.state === "paused" ? label(this.theme.lg, "paused") : "";
    this.progress(ev);
    if (ev.state === "paused" && this.theme.pa === "hide") {
      if (this.theme.pt === 0) this.hide("paused");
      else {
        this.show();
        this.pauseTimer = setTimeout(() => this.hide("paused"), this.theme.pt * 1000);
      }
    } else {
      this.show();
    }
    if (changed) this.scheduleMarquee();
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
