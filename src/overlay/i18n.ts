import type { ErrorCode } from "../shared/types.ts";
import type { Lang } from "../shared/config.ts";

const LABELS = {
  fr: { paused: "En pause", waiting: "Sillonette en attente…", nowPlaying: "En cours de lecture" },
  en: { paused: "Paused", waiting: "Sillonette is waiting…", nowPlaying: "Now playing" },
} as const;

export type LabelKey = keyof (typeof LABELS)["fr"];

export function label(lang: Lang, key: LabelKey): string {
  return LABELS[lang][key];
}

/** Short messages of the error badge. Plain text only. */
const ERRORS: Record<Lang, Record<ErrorCode, string>> = {
  fr: { E10: "Plusieurs onglets : un autre onglet YouTube Music joue déjà" },
  en: { E10: "Several tabs: another YouTube Music tab is already playing" },
};

export function errorMessage(lang: Lang, code: ErrorCode): string {
  return ERRORS[lang][code];
}
