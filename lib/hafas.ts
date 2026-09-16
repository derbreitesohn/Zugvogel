import type { Journey, Leg, Station } from "./types";

/**
 * The backend OEBB Scotty itself talks to. Undocumented but stable, and the only
 * source that gives live delays without a registered API key. Swapping it for the
 * national GTFS-RT feed later means reimplementing this file and nothing else:
 * everything above it only knows the types in ./types.
 */
const ENDPOINT = "https://fahrplan.oebb.at/bin/mgate.exe";

const CLIENT = {
  client: { id: "OEBB", type: "IPH", v: "6030600", name: "oebbPROD-ADHOC" },
  ext: "OEBB.1",
  ver: "1.57",
  lang: "de",
  auth: { type: "AID", aid: "OWDL4fE4ixNiPBBm" },
};

/** Product class bitmask, read off the live API rather than guessed. */
export const PRODUCT = {
  longDistance: 1, // RJ, RJX, ICE
  night: 2, // NJ, EN
  intercity: 4, // EC, IC
  interregional: 8,
  regional: 16, // REX, R, CJX
  suburban: 32, // S-Bahn
  bus: 64,
  ferry: 128,
  subway: 256, // U-Bahn
  tram: 512,
} as const;

export const ALL_PRODUCTS = 1023;

const CATEGORY: Array<[number, string]> = [
  [PRODUCT.longDistance, "Fernverkehr"],
  [PRODUCT.night, "Nachtzug"],
  [PRODUCT.intercity, "Fernverkehr"],
  [PRODUCT.interregional, "Fernverkehr"],
  [PRODUCT.regional, "Regionalzug"],
  [PRODUCT.suburban, "S-Bahn"],
  [PRODUCT.bus, "Bus"],
  [PRODUCT.ferry, "Schiff"],
  [PRODUCT.subway, "U-Bahn"],
  [PRODUCT.tram, "Strassenbahn"],
];

function categoryOf(cls: number): string {
  for (const [bit, label] of CATEGORY) if (cls & bit) return label;
  return "Verkehrsmittel";
}

async function call(meth: string, req: unknown): Promise<any> {
  const body = { ...CLIENT, svcReqL: [{ cfg: { polyEnc: "GPA" }, meth, req }] };
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "User-Agent": "Mozilla/5.0",
    },
    body: JSON.stringify(body),
    // The upstream has no cache semantics of its own and we want live delays.
    cache: "no-store",
  });
  if (!res.ok) throw new Error("HAFAS HTTP " + res.status);
  const json = await res.json();
  const svc = json?.svcResL?.[0];
  if (!svc) throw new Error("HAFAS: empty response");
  if (svc.err && svc.err !== "OK") {
    throw new Error("HAFAS " + svc.err + ": " + (svc.errTxt ?? ""));
  }
  return svc.res;
}

/* ---------------------------------------------------------------- time ---- */

/**
 * HAFAS times are local wall clock, "HHMMSS", optionally prefixed with a two
 * digit day offset. We keep everything as naive local strings: the data is
 * Austrian local time and it is displayed as Austrian local time, so routing it
 * through UTC would only invite off-by-an-hour bugs around the DST switch.
 */
function toLocal(baseDate: string, raw: string | undefined): string | null {
  if (!raw) return null;
  let offset = 0;
  let t = raw;
  if (raw.length === 8) {
    offset = Number(raw.slice(0, 2));
    t = raw.slice(2);
  }
  const y = Number(baseDate.slice(0, 4));
  const m = Number(baseDate.slice(4, 6));
  const d = Number(baseDate.slice(6, 8));
  const day = new Date(Date.UTC(y, m - 1, d + offset));
  const iso = day.toISOString().slice(0, 10);
  return iso + "T" + t.slice(0, 2) + ":" + t.slice(2, 4) + ":" + t.slice(4, 6);
}

function minutesBetween(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  return Math.round((Date.parse(b + "Z") - Date.parse(a + "Z")) / 60000);
}

function platformOf(node: any, prefix: "d" | "a"): string | null {
  const modern = node?.[prefix + "PltfR"] ?? node?.[prefix + "PltfS"];
  if (modern && typeof modern === "object" && modern.txt) return String(modern.txt);
  const legacy = node?.[prefix + "PlatfR"] ?? node?.[prefix + "PlatfS"];
  return legacy ? String(legacy) : null;
}

/* ------------------------------------------------------------- stations ---- */

export async function searchStations(query: string, limit = 8): Promise<Station[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const res = await call("LocMatch", {
    input: { loc: { type: "S", name: q + "?" }, maxLoc: limit, field: "S" },
  });
  const locs: any[] = res?.match?.locL ?? [];
  return locs
    .filter((l) => l.type === "S" && l.extId)
    .map((l) => ({
      id: String(l.extId),
      lid: String(l.lid),
      name: String(l.name),
      lat: (l.crd?.y ?? 0) / 1e6,
      lon: (l.crd?.x ?? 0) / 1e6,
      products: Number(l.pCls ?? 0),
    }));
}

/**
 * Location ids carry their own coordinates, so asking "what else is near the
 * start" costs no extra round trip to resolve the station first.
 */
export function coordsOfLid(lid: string): { x: number; y: number } | null {
  const x = lid.match(/@X=(-?\d+)@/);
  const y = lid.match(/@Y=(-?\d+)@/);
  if (!x || !y) return null;
  return { x: Number(x[1]), y: Number(y[1]) };
}

export function idOfLid(lid: string): string | null {
  const m = lid.match(/@L=(\d+)@/);
  return m ? m[1] : null;
}

export function nameOfLid(lid: string): string | null {
  const m = lid.match(/@O=([^@]+)@/);
  return m ? m[1] : null;
}

/** Stations within `maxDist` metres, busiest first. */
export async function nearbyStations(
  x: number,
  y: number,
  products: number,
  maxDist = 6000,
  limit = 12,
): Promise<Station[]> {
  const res = await call("LocGeoPos", {
    ring: { cCrd: { x, y }, minDist: 0, maxDist },
    getPOIs: false,
    getStops: true,
    maxLoc: limit,
    locFltrL: [{ type: "PROD", mode: "INC", value: String(products) }],
  });
  const locs: any[] = res?.locL ?? [];
  return locs
    .filter((l) => l.type === "S" && l.extId)
    .map((l) => ({
      id: String(l.extId),
      lid: String(l.lid),
      name: String(l.name),
      lat: (l.crd?.y ?? 0) / 1e6,
      lon: (l.crd?.x ?? 0) / 1e6,
      products: Number(l.pCls ?? 0),
    }));
}

/* ------------------------------------------------------------- journeys ---- */

export type TripOptions = {
  fromLid: string;
  toLid: string;
  /** Local departure time, "YYYY-MM-DDTHH:MM". */
  when: string;
  products?: number;
  viaLid?: string;
  maxChanges?: number;
  results?: number;
};

export async function searchJourneys(opts: TripOptions): Promise<Journey[]> {
  const date = opts.when.slice(0, 10).replace(/-/g, "");
  const time = opts.when.slice(11, 13) + opts.when.slice(14, 16) + "00";

  const req: any = {
    depLocL: [{ type: "S", lid: opts.fromLid }],
    arrLocL: [{ type: "S", lid: opts.toLid }],
    outDate: date,
    outTime: time,
    outFrwd: true,
    getPasslist: false,
    getPolyline: false,
    numF: opts.results ?? 6,
    jnyFltrL: [
      { type: "PROD", mode: "INC", value: String(opts.products ?? ALL_PRODUCTS) },
    ],
  };
  if (opts.viaLid) req.viaLocL = [{ loc: { type: "S", lid: opts.viaLid }, min: 5 }];
  if (typeof opts.maxChanges === "number") req.maxChg = opts.maxChanges;

  const res = await call("TripSearch", req);
  const common = res?.common ?? {};
  const locL: any[] = common.locL ?? [];
  const prodL: any[] = common.prodL ?? [];
  const cons: any[] = res?.outConL ?? [];

  const nameOf = (i: number | undefined) =>
    typeof i === "number" && locL[i] ? String(locL[i].name) : "?";

  return cons.map((c) => parseJourney(c, nameOf, prodL));
}

function parseJourney(
  c: any,
  nameOf: (i: number | undefined) => string,
  prodL: any[],
): Journey {
  const date: string = c.date;
  const legs: Leg[] = [];

  for (const s of c.secL ?? []) {
    const isRide = s.type === "JNY";
    const prod = isRide ? prodL[s.jny?.prodX] ?? {} : {};
    const cls = Number(prod.cls ?? 0);

    const depPlanned = toLocal(date, s.dep?.dTimeS);
    const depActual = toLocal(date, s.dep?.dTimeR);
    const arrPlanned = toLocal(date, s.arr?.aTimeS);
    const arrActual = toLocal(date, s.arr?.aTimeR);
    if (!depPlanned || !arrPlanned) continue;

    legs.push({
      kind: isRide ? "ride" : "walk",
      line: isRide
        ? String(prod.name ?? "")
            .replace(/\s*\(Zug-Nr\.\s*\d+\)/, "")
            .trim()
        : "Fussweg",
      category: isRide ? categoryOf(cls) : "Fussweg",
      productClass: cls,
      direction: isRide && s.jny?.dirTxt ? String(s.jny.dirTxt) : null,
      from: nameOf(s.dep?.locX),
      to: nameOf(s.arr?.locX),
      depPlanned,
      depActual,
      depDelay: minutesBetween(depPlanned, depActual),
      depPlatform: platformOf(s.dep, "d"),
      arrPlanned,
      arrActual,
      arrDelay: minutesBetween(arrPlanned, arrActual),
      arrPlatform: platformOf(s.arr, "a"),
      cancelled: Boolean(s.jny?.isCncl || s.dep?.dCncl || s.arr?.aCncl),
    });
  }

  const rides = legs.filter((l) => l.kind === "ride");
  const transferHubs = rides.slice(0, -1).map((l) => l.to);

  let minTransfer: number | null = null;
  for (let i = 0; i < rides.length - 1; i++) {
    const gap = minutesBetween(rides[i].arrPlanned, rides[i + 1].depPlanned);
    if (minTransfer === null || gap < minTransfer) minTransfer = gap;
  }

  const depPlanned = toLocal(date, c.dep?.dTimeS) ?? legs[0]?.depPlanned ?? "";
  const depActual = toLocal(date, c.dep?.dTimeR);
  const arrPlanned =
    toLocal(date, c.arr?.aTimeS) ?? legs[legs.length - 1]?.arrPlanned ?? "";
  const arrActual = toLocal(date, c.arr?.aTimeR);

  const dur = String(c.dur ?? "000000").padStart(6, "0");
  const duration =
    Number(dur.slice(0, dur.length - 4)) * 60 + Number(dur.slice(-4, -2));

  return {
    id: rides.map((l) => l.line + "@" + l.depPlanned).join("|") || depPlanned,
    depPlanned,
    depActual,
    depDelay: minutesBetween(depPlanned, depActual),
    arrPlanned,
    arrActual,
    arrDelay: minutesBetween(arrPlanned, arrActual),
    duration,
    changes: Number(c.chg ?? Math.max(0, rides.length - 1)),
    legs,
    transferHubs,
    minTransfer,
    cancelled: legs.some((l) => l.cancelled),
    via: [],
  };
}
