import type { SavedRoute, Station } from "./types";

const KEY = "zugvogel.routes.v1";

/**
 * Location ids carry a `p=` timestamp from the moment they were looked up. The
 * upstream still resolves an id without it, so strip it before saving: a route
 * pinned today has to still work next spring, and a stale timestamp is exactly
 * the kind of thing that quietly rots.
 */
export function stableLid(lid: string): string {
  return lid.replace(/@p=\d+@/, "@");
}

function stable(station: Station): Station {
  return { ...station, lid: stableLid(station.lid) };
}

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
    return parsed
      .filter((r) => r && typeof r.id === "string" && r.from?.lid && r.to?.lid)
      .map((r) => ({
        ...r,
        from: stable(r.from),
        to: stable(r.to),
        addedAt: Number(r.addedAt) || 0,
      }))
      .sort((a, b) => a.addedAt - b.addedAt);
  } catch {
    return [];
  }
}

export function saveRoutes(routes: SavedRoute[]): boolean {
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify(routes.map((r) => ({ ...r, from: stable(r.from), to: stable(r.to) }))),
    );
    return true;
  } catch {
    // Private window, or storage is full or blocked. The board still works for
    // this session, but the caller should be able to say so.
    return false;
  }
}

export function routeId(from: Station, to: Station): string {
  return from.id + ">" + to.id;
}

export function makeRoute(from: Station, to: Station): SavedRoute {
  return {
    id: routeId(from, to),
    from: stable(from),
    to: stable(to),
    addedAt: Date.now(),
  };
}
