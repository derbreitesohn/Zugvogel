import {
  ALL_PRODUCTS,
  PRODUCT,
  coordsOfLid,
  nameOfLid,
  nearbyStations,
  searchJourneys,
} from "./hafas";
import type { Corridor, Journey } from "./types";

/**
 * Everything that runs on rails between towns. Used to decide what counts as a
 * corridor: changing from the U3 to the U6 is not a route choice, boarding your
 * first train at Westbahnhof instead of Hauptbahnhof is.
 */
const RAIL =
  PRODUCT.longDistance |
  PRODUCT.night |
  PRODUCT.intercity |
  PRODUCT.interregional |
  PRODUCT.regional |
  PRODUCT.suburban;

const LONG_DISTANCE =
  PRODUCT.longDistance | PRODUCT.night | PRODUCT.intercity | PRODUCT.interregional;

/**
 * The point of the whole product.
 *
 * A journey planner answers "what is the best connection" and returns the winners
 * on one axis, which is why Wien Hbf to Boeheimkirchen only ever shows you the
 * route via St. Poelten. Ask the same engine several differently constrained
 * questions and the hidden corridors fall out by themselves. Taking long distance
 * trains off the table, for instance, forces the regional line out of Westbahnhof
 * into the open without anybody having to know that Westbahnhof exists.
 */
const STRATEGIES: Array<{
  id: string;
  products: number;
  maxChanges?: number;
  results?: number;
}> = [
  // What Scotty would have told you.
  { id: "standard", products: ALL_PRODUCTS, results: 6 },
  // No long distance: surfaces the regional corridor.
  { id: "regional", products: ALL_PRODUCTS & ~LONG_DISTANCE, results: 6 },
  // Trains only, no city transit gluing legs together.
  { id: "rail", products: RAIL, results: 6 },
  // Pure local traffic, usually the cheapest ticket.
  { id: "local", products: PRODUCT.regional | PRODUCT.suburban, results: 4 },
  // Anything without a change at all, which the ranked list often buries.
  { id: "direct", products: ALL_PRODUCTS, maxChanges: 0, results: 3 },
];

function shortStation(name: string): string {
  let n = name.replace(/\s*\(.*\)\s*$/, "").trim();
  n = n.replace(/\s+(Bahnhof|Bahnhst|Bhf)$/i, "");
  const wien = n.match(/^Wien\s+(.+)$/i);
  if (wien && !/^hbf$/i.test(wien[1])) n = wien[1];
  n = n.replace(/\s+Hbf$/i, "");
  return n;
}

/** The stations that actually define which way round you go. */
function corridorHubs(j: Journey): string[] {
  const rides = j.legs.filter((l) => l.kind === "ride");
  const rails = rides.filter((l) => l.productClass & RAIL);
  if (rails.length === 0) return [];

  const origin = j.legs[0]?.from;
  const hubs: string[] = [];
  if (rails[0].from !== origin) hubs.push(rails[0].from);
  for (let i = 0; i < rails.length - 1; i++) hubs.push(rails[i].to);

  return hubs.filter((h, i) => h !== hubs[i - 1]);
}

export type FanOutInput = {
  fromLid: string;
  toLid: string;
  when: string;
};

function bits(n: number): number {
  let c = 0;
  for (let v = n; v; v >>= 1) c += v & 1;
  return c;
}

/**
 * Big stations share a name with their own platform groups and park-and-ride
 * stops, which come back from the geo lookup under their own ids. Comparing the
 * bare name keeps "Wien Hbf (Bahnsteige 3-12)" from being offered as a detour
 * around Wien Hbf.
 */
function baseName(name: string): string {
  return name
    .replace(/\s*\(.*\)\s*$/, "")
    .replace(/\s+(Bahnhst|Bahnhof|Bhf)$/i, "")
    .trim()
    .toLowerCase();
}

/**
 * Which other station you could have started from. This is the half of the
 * problem the product filters cannot reach: leaving Vienna from Meidling instead
 * of Hauptbahnhof is a different route, but no product filter forces it, because
 * the same trains call at both. So we ask the map instead of the timetable.
 */
async function viaCandidates(input: FanOutInput): Promise<string[]> {
  const origin = coordsOfLid(input.fromLid);
  if (!origin) return [];

  const skip = new Set(
    [nameOfLid(input.fromLid), nameOfLid(input.toLid)]
      .filter((n): n is string => Boolean(n))
      .map(baseName),
  );

  // Sorted by distance upstream, so ask for a wide net and rank it ourselves:
  // the interesting alternative is a main station a few kilometres away, not the
  // suburban halt around the corner.
  const near = await nearbyStations(origin.x, origin.y, RAIL, 9000, 60);

  const seen = new Set<string>();
  return near
    .filter((s) => {
      const base = baseName(s.name);
      if (skip.has(base) || seen.has(base)) return false;
      // Somewhere a REX or a long distance train actually stops.
      if (!(s.products & (PRODUCT.regional | LONG_DISTANCE))) return false;
      seen.add(base);
      return true;
    })
    .map((s) => ({
      lid: s.lid,
      // Bigger station, better candidate: long distance service counts double.
      score: bits(s.products & RAIL) + (s.products & LONG_DISTANCE ? 4 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => s.lid);
}

export type FanOutOptions = {
  /**
   * Skip the fan-out and ask the one plain question. The saved-routes board only
   * wants "when does my next train go", and waiting three seconds for corridors
   * nobody asked for would make the home screen feel broken.
   */
  quick?: boolean;
  /** Treat `when` as "arrive by" instead of "depart at". */
  backward?: boolean;
};

export async function findCorridors(
  input: FanOutInput,
  options: FanOutOptions = {},
): Promise<Corridor[]> {
  const merged = new Map<string, Journey>();

  const collect = (results: PromiseSettledResult<Journey[]>[]) => {
    // One query failing is normal: "direct" has no answer on most routes, and a
    // via candidate can be unreachable. It must not take the whole search down.
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      for (const j of r.value) {
        const seen = merged.get(j.id);
        if (seen) seen.via.push(...j.via);
        else merged.set(j.id, j);
      }
    }
  };

  const run = (label: string, extra: Partial<Parameters<typeof searchJourneys>[0]>) =>
    searchJourneys({
      fromLid: input.fromLid,
      toLid: input.toLid,
      when: input.when,
      // The board only needs times; geometry is for the map on the results page.
      geometry: !options.quick,
      backward: options.backward,
      ...extra,
    }).then((journeys) => journeys.map((j) => ({ ...j, via: [label] })));

  const plan = options.quick ? STRATEGIES.slice(0, 1) : STRATEGIES;

  const [strategies, candidates] = await Promise.all([
    Promise.allSettled(
      plan.map((s) =>
        run(s.id, {
          products: s.products,
          maxChanges: s.maxChanges,
          results: options.quick ? 4 : s.results,
        }),
      ),
    ),
    options.quick ? [] : viaCandidates(input).catch(() => [] as string[]),
  ]);
  collect(strategies);

  collect(
    await Promise.allSettled(
      candidates.map((viaLid) => run("via", { products: RAIL, viaLid, results: 3 })),
    ),
  );

  const journeys = [...merged.values()].filter((j) => j.legs.length > 0);
  if (journeys.length === 0) return [];

  // Forcing a via point can send the router out of town on a local train and
  // straight back into the station it started from before the real journey
  // begins. That is an artefact of the question we asked, and it gives itself
  // away: one of the hubs is the origin or the destination under another name.
  // Station names nest, so "Wien" is the same place as "Wien Mitte" for this
  // purpose, while "Wien Westbahnhof" is a genuinely different choice.
  const ends = [nameOfLid(input.fromLid), nameOfLid(input.toLid)]
    .filter((n): n is string => Boolean(n))
    .map(baseName);

  const isEnd = (hub: string) => {
    const h = baseName(hub);
    return ends.some((e) => e === h || e.startsWith(h + " ") || h.startsWith(e + " "));
  };

  const groups = new Map<string, Journey[]>();
  for (const j of journeys) {
    const hubs = corridorHubs(j);
    if (hubs.some(isEnd)) continue;
    const key = hubs.join(" > ") || "direkt";
    const list = groups.get(key);
    if (list) list.push(j);
    else groups.set(key, [j]);
  }

  const corridors: Corridor[] = [...groups.entries()].map(([key, list]) => {
    const hubs = key === "direkt" ? [] : key.split(" > ");
    list.sort((a, b) => a.depPlanned.localeCompare(b.depPlanned));
    const changes = Math.min(...list.map((j) => j.changes));
    return {
      key,
      // No rail hub means you stay on the one train. Calling that "direkt" would
      // be a lie when a U-Bahn ride still waits at the end of it.
      label:
        hubs.length > 0
          ? "über " + hubs.map(shortStation).join(" und ")
          : changes === 0
            ? "Ohne Umstieg"
            : "Durchgehender Zug",
      hubs,
      journeys: list.slice(0, 4),
      penalty: 0,
      fastest: Math.min(...list.map((j) => j.duration)),
      changes,
    };
  });

  const best = Math.min(...corridors.map((c) => c.fastest));
  for (const c of corridors) c.penalty = c.fastest - best;

  // A corridor that takes more than twice as long is a replacement bus or a
  // sightseeing detour, not a choice anybody wants to weigh up. More than two
  // hubs is the other tell: forcing a via point can make the router leave town,
  // come straight back and carry on, which is an artefact of the question we
  // asked rather than a route a person would consider.
  return corridors
    .filter((c) => c.hubs.length <= 2 && c.fastest <= best * 1.7 + 12)
    .sort((a, b) => a.fastest - b.fastest)
    .slice(0, 4);
}
