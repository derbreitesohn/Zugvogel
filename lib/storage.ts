import type { SavedRoute, Station } from "./types";

const KEY = "zugvogel.routes.v1";

/**
 * Saved routes live in the browser, so there is no account to create before the
 * app is useful. Every access is guarded: localStorage throws in private windows
 * and comes back empty when site data is cleared, and neither is a reason for the
 * page to break.
 */
export function loadRoutes(): SavedRoute[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r) => r && typeof r.id === "string" && r.from?.lid && r.to?.lid,
    );
  } catch {
    return [];
  }
}

export function saveRoutes(routes: SavedRoute[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(routes));
  } catch {
    // Nothing to do: the board still works for this session.
  }
}

export function routeId(from: Station, to: Station): string {
  return from.id + ">" + to.id;
}
