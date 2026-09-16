import type { Journey } from "./types";

/** "2026-09-18T08:28:00" -> "08:28". Naive on purpose, see lib/hafas.ts. */
export function hhmm(local: string): string {
  return local.slice(11, 16);
}

export function durationLabel(minutes: number): string {
  if (minutes < 60) return minutes + " min";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? h + " h" : h + " h " + String(m).padStart(2, "0");
}

export function changesLabel(changes: number): string {
  if (changes === 0) return "direkt";
  return changes + "× umsteigen";
}

export type Tone = "ok" | "warn" | "bad";

export function delayTone(minutes: number): Tone {
  if (minutes >= 10) return "bad";
  if (minutes >= 3) return "warn";
  return "ok";
}

/**
 * What to put next to the departure time. Nothing at all when a train is on
 * time and we know it: a board covered in green "pünktlich" labels is noise,
 * and the eye should only be pulled to the trains that need attention.
 */
export function delayLabel(journey: Journey): { text: string; tone: Tone } | null {
  if (journey.cancelled) return { text: "entfällt", tone: "bad" };
  if (journey.depActual === null) return null;
  if (journey.depDelay <= 0) return null;
  return { text: "+" + journey.depDelay, tone: delayTone(journey.depDelay) };
}

export type LineKind = "long" | "regional" | "suburban" | "city";

export function lineKind(productClass: number): LineKind {
  if (productClass & (1 | 2 | 4 | 8)) return "long";
  if (productClass & 16) return "regional";
  if (productClass & 32) return "suburban";
  return "city";
}

/** Local wall clock in Vienna as "YYYY-MM-DDTHH:MM", the format the API speaks. */
export function nowLocal(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Vienna",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date())
    .replace(" ", "T");
}

/** Minutes from now until a departure, for "in 7 min" on the board. */
export function minutesUntil(local: string): number {
  return Math.round((Date.parse(local + "Z") - Date.parse(nowLocal() + ":00Z")) / 60000);
}

export function countdownLabel(journey: Journey): string {
  const mins = minutesUntil(journey.depActual ?? journey.depPlanned);
  if (mins < 0) return "abgefahren";
  if (mins === 0) return "jetzt";
  if (mins < 60) return "in " + mins + " min";
  return hhmm(journey.depPlanned);
}
