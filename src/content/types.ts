// What the YouTube Music connector reports.
export interface TrackState {
  state: "playing" | "paused";
  title: string;
  artist: string;
  album: string;
  art: string; // https URL or ""
  dur: number; // ms, 0 = unknown / live
  pos: number; // ms
  rate: number;
  ad: boolean; // an advertisement is playing: never shown as a track
  ready: boolean; // false while the player is between two items (never sent)
}

export interface MediaLike {
  currentTime: number;
  duration: number;
  paused: boolean;
  ended: boolean;
  playbackRate: number;
  readyState?: number;
  seeking?: boolean;
}

export interface ArtworkLike {
  src: string;
  sizes?: string;
}

export interface MetadataLike {
  title: string;
  artist: string;
  album: string;
  artwork: readonly ArtworkLike[];
}

/** Everything a connector may read from the page: injectable for tests. */
export interface PageLike {
  metadata(): MetadataLike | null;
  media(): MediaLike | null;
  text(selector: string): string;
  attr(selector: string, name: string): string;
  exists(selector: string): boolean;
}

export interface Connector {
  id: "ytmusic";
  read(page: PageLike): TrackState | null;
}
