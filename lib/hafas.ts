import type {
  BikeCarriage,
  Departure,
  Journey,
  LatLon,
  Leg,
  Station,
  Trip,
  TripStop,
} from "./types";

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

/** "000730" -> 7 (minutes, rounded up so a 30 second walk is not "0 min"). */
function durationMinutes(raw: string | undefined): number | null {
  if (!raw) return null;
  const s = raw.padStart(6, "0");
  const seconds =
    Number(s.slice(0, s.length - 4)) * 3600 +
    Number(s.slice(-4, -2)) * 60 +
    Number(s.slice(-2));
  return Math.max(1, Math.round(seconds / 60));
}

function platformOf(node: any, prefix: "d" | "a"): string | null {
  const modern = node?.[prefix + "PltfR"] ?? node?.[prefix + "PltfS"];
  if (modern && typeof modern === "object" && modern.txt) return String(modern.txt);
  const legacy = node?.[prefix + "PlatfR"] ?? node?.[prefix + "PlatfS"];
  return legacy ? String(legacy) : null;
}

/* ------------------------------------------------------------ geometry ---- */

/**
 * Google's polyline algorithm, which is what `polyEnc: "GPA"` asks the upstream
 * for. Coordinates arrive as latitude then longitude.
 */
function decodePolyline(encoded: string): LatLon[] {
  const points: LatLon[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lon += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lat / 1e5, lon / 1e5]);
  }
  return points;
}

/**
 * A single long distance leg can carry hundreds of points, and nobody can see
 * the difference on a phone. Keep the ends exactly and thin the middle.
 */
function thin(points: LatLon[], max = 60): LatLon[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const out: LatLon[] = [];
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
  return out;
}

function geometryOf(polyG: any, decoded: LatLon[][]): LatLon[] {
  const indices: number[] = polyG?.polyXL ?? [];
  const joined: LatLon[] = [];
  for (const i of indices) if (decoded[i]) joined.push(...decoded[i]);
  return thin(joined);
}

/* ----------------------------------------------------------- attributes ---- */

function bikeFrom(texts: string[]): BikeCarriage {
  const bike = texts.find((t) => /fahrrad/i.test(t));
  if (!bike) return null;
  if (/keine|nicht möglich|nicht moeglich/i.test(bike)) return "no";
  if (/reservierung/i.test(bike)) return "reservation";
  if (/begrenzt|beschränkt|beschraenkt/i.test(bike)) return "limited";
  return "yes";
}

function stepFreeFrom(texts: string[]): boolean {
  return texts.some((t) => /rollstuhl|niederflur|einstiegshilfe/i.test(t));
}

/**
 * Disruptions: engineering work, replacement buses, lifts out of order. These
 * are the notes that can make an otherwise perfect connection useless, so they
 * are pulled out separately from the amenity notes above.
 */
function warningsOf(section: any, himL: any[]): string[] {
  const out: string[] = [];
  for (const msg of section?.jny?.msgL ?? []) {
    if (msg.type !== "HIM") continue;
    const him = himL[msg.himX];
    if (!him) continue;
    const text = String(him.head ?? him.lead ?? him.text ?? "").trim();
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}

/** Facility notes the operator attached to this train. */
function attributesOf(section: any, remL: any[]): string[] {
  const out: string[] = [];
  for (const msg of section?.jny?.msgL ?? []) {
    if (msg.type !== "REM") continue;
    const rem = remL[msg.remX];
    // "A" is an amenity note; the other types are disruptions and timetable
    // remarks, which belong in a different part of the UI.
    if (!rem || rem.type !== "A") continue;
    const text = String(rem.txtN ?? rem.txtS ?? "").trim();
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}

/* ------------------------------------------------------------- stations ---- */

function toStation(l: any): Station {
  const type = l.type === "P" || l.type === "A" ? l.type : "S";
  return {
    id: String(l.extId ?? l.lid),
    lid: String(l.lid),
    name: String(l.name),
    lat: (l.crd?.y ?? 0) / 1e6,
    lon: (l.crd?.x ?? 0) / 1e6,
    products: Number(l.pCls ?? 0),
    kind: type,
    ...(typeof l.dist === "number" ? { distance: l.dist } : {}),
  };
}

export async function searchStations(
  query: string,
  limit = 8,
  /** Include addresses and points of interest, not only stations. */
  includePlaces = false,
): Promise<Station[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const res = await call("LocMatch", {
    input: {
      loc: { type: includePlaces ? "ALL" : "S", name: q + "?" },
      maxLoc: limit,
      field: "S",
    },
  });
  const locs: any[] = res?.match?.locL ?? [];
  return locs.filter((l) => l.lid).map(toStation);
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

export function nameOfLid(lid: string): string | null {
  const m = lid.match(/@O=([^@]+)@/);
  return m ? m[1] : null;
}

/** Stations within `maxDist` metres, nearest first. */
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
  return locs.filter((l) => l.type === "S" && l.extId).map(toStation);
}

/* ----------------------------------------------------------- departures ---- */

export async function departures(
  lid: string,
  when: string,
  limit = 12,
  products: number = ALL_PRODUCTS,
): Promise<Departure[]> {
  const date = when.slice(0, 10).replace(/-/g, "");
  const time = when.slice(11, 13) + when.slice(14, 16) + "00";

  const res = await call("StationBoard", {
    type: "DEP",
    stbLoc: { type: "S", lid },
    date,
    time,
    maxJny: limit,
    jnyFltrL: [{ type: "PROD", mode: "INC", value: String(products) }],
  });

  const prodL: any[] = res?.common?.prodL ?? [];
  const jnyL: any[] = res?.jnyL ?? [];

  return jnyL.map((j) => {
    const stop = j.stbStop ?? {};
    const prod = prodL[stop.dProdX ?? j.prodX] ?? {};
    const cls = Number(prod.cls ?? 0);
    const planned = toLocal(j.date, stop.dTimeS) ?? "";
    const actual = toLocal(j.date, stop.dTimeR);
    return {
      id: String(j.jid ?? planned + prod.name),
      line: String(prod.name ?? "")
        .replace(/\s*\(Zug-Nr\.\s*\d+\)/, "")
        .trim(),
      category: categoryOf(cls),
      productClass: cls,
      direction: String(j.dirTxt ?? ""),
      planned,
      actual,
      delay: minutesBetween(planned, actual),
      platform: platformOf(stop, "d"),
      cancelled: Boolean(j.isCncl || stop.dCncl),
    };
  });
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
  /** Route geometry costs payload, so only the detailed search asks for it. */
  geometry?: boolean;
  /**
   * Treat `when` as an arrival deadline rather than a departure time: give me
   * what gets there by then. Not the same as "earlier departures", which is
   * just a shifted clock.
   */
  backward?: boolean;
};

export async function searchJourneys(opts: TripOptions): Promise<Journey[]> {
  const date = opts.when.slice(0, 10).replace(/-/g, "");
  const time = opts.when.slice(11, 13) + opts.when.slice(14, 16) + "00";

  const req: any = {
    depLocL: [{ type: locTypeOf(opts.fromLid), lid: opts.fromLid }],
    arrLocL: [{ type: locTypeOf(opts.toLid), lid: opts.toLid }],
    outDate: date,
    outTime: time,
    outFrwd: !opts.backward,
    getPasslist: false,
    getPolyline: Boolean(opts.geometry),
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
  const remL: any[] = common.remL ?? [];
  const himL: any[] = common.himL ?? [];
  const cons: any[] = res?.outConL ?? [];

  const decoded: LatLon[][] = (common.polyL ?? []).map((p: any) =>
    p?.crdEncYX ? decodePolyline(String(p.crdEncYX)) : [],
  );

  const nameOf = (i: number | undefined) =>
    typeof i === "number" && locL[i] ? String(locL[i].name) : "?";

  return cons.map((c) => parseJourney(c, nameOf, prodL, remL, himL, decoded));
}

/**
 * Addresses and points of interest are not stations and have to be asked for as
 * what they are. The kind is the leading `A=` of the location id: 1 station,
 * 2 address, 4 point of interest.
 */
function locTypeOf(lid: string): "S" | "P" | "A" {
  const m = lid.match(/(?:^|@)A=(\d+)@/);
  if (m?.[1] === "2") return "A";
  if (m?.[1] === "4") return "P";
  return "S";
}

function parseJourney(
  c: any,
  nameOf: (i: number | undefined) => string,
  prodL: any[],
  remL: any[],
  himL: any[],
  decoded: LatLon[][],
): Journey {
  const date: string = c.date;
  const legs: Leg[] = [];
  const warnings: string[] = [];

  for (const s of c.secL ?? []) {
    const isRide = s.type === "JNY";
    const prod = isRide ? prodL[s.jny?.prodX] ?? {} : {};
    const cls = Number(prod.cls ?? 0);

    const depPlanned = toLocal(date, s.dep?.dTimeS);
    const depActual = toLocal(date, s.dep?.dTimeR);
    const arrPlanned = toLocal(date, s.arr?.aTimeS);
    const arrActual = toLocal(date, s.arr?.aTimeR);
    if (!depPlanned || !arrPlanned) continue;

    const attributes = isRide ? attributesOf(s, remL) : [];
    const polyG = isRide ? s.jny?.polyG : s.gis?.polyG;

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
      distance: isRide ? null : (s.gis?.dist ?? null),
      walkMinutes: isRide
        ? null
        : (durationMinutes(s.gis?.durS) ?? minutesBetween(depPlanned, arrPlanned)),
      attributes,
      bike: isRide ? bikeFrom(attributes) : null,
      stepFree: isRide ? stepFreeFrom(attributes) : false,
      points: geometryOf(polyG, decoded),
      tripId: isRide && s.jny?.jid ? String(s.jny.jid) : null,
    });

    if (isRide) for (const w of warningsOf(s, himL)) if (!warnings.includes(w)) warnings.push(w);
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

  // One train that refuses bicycles decides the whole journey.
  const bikeRanking: BikeCarriage[] = ["no", "reservation", "limited", "yes"];
  let bike: BikeCarriage = rides.length > 0 ? "yes" : null;
  for (const ride of rides) {
    if (ride.bike === null) continue;
    if (bikeRanking.indexOf(ride.bike) < bikeRanking.indexOf(bike ?? "yes")) {
      bike = ride.bike;
    }
  }

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
    walkMinutes: legs.reduce((sum, l) => sum + (l.walkMinutes ?? 0), 0),
    cancelled: legs.some((l) => l.cancelled),
    warnings,
    bike,
    stepFree: rides.length > 0 && rides.every((r) => r.stepFree),
    via: [],
  };
}

/* ----------------------------------------------------------------- trip ---- */

/**
 * Every stop a train makes, with live times. This is the view you open while
 * standing on the platform: not "which connection", but "where is it now and
 * when does it reach me".
 */
export async function tripStops(jid: string): Promise<Trip> {
  const res = await call("JourneyDetails", {
    jid,
    getPolyline: false,
    getPasslist: true,
  });

  const journey = res?.journey ?? {};
  const locL: any[] = res?.common?.locL ?? [];
  const prod = res?.common?.prodL?.[journey.prodX] ?? {};
  const date: string = journey.date;

  const stops: TripStop[] = (journey.stopL ?? []).map((stop: any) => {
    const arrPlanned = toLocal(date, stop.aTimeS);
    const arrActual = toLocal(date, stop.aTimeR);
    const depPlanned = toLocal(date, stop.dTimeS);
    const depActual = toLocal(date, stop.dTimeR);
    return {
      name: locL[stop.locX] ? String(locL[stop.locX].name) : "?",
      arrPlanned,
      arrActual,
      depPlanned,
      depActual,
      delay:
        minutesBetween(depPlanned, depActual) || minutesBetween(arrPlanned, arrActual),
      platform: platformOf(stop, "d") ?? platformOf(stop, "a"),
      cancelled: Boolean(stop.dCncl || stop.aCncl),
    };
  });

  return {
    line: String(prod.name ?? "")
      .replace(/\s*\(Zug-Nr\.\s*\d+\)/, "")
      .trim(),
    direction: String(journey.dirTxt ?? ""),
    stops,
  };
}
