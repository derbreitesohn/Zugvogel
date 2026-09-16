export type Station = {
  id: string;
  lid: string;
  name: string;
  lat: number;
  lon: number;
  /** Product classes served here, as a bitmask. Used to sort real stations above bus stops. */
  products: number;
};

export type Leg = {
  kind: "ride" | "walk";
  /** "REX 51", "RJX 262", "U3" … */
  line: string;
  /** Human label for the product class: "Regionalzug", "U-Bahn" … */
  category: string;
  /** Bitmask class, so the UI can colour-code without string matching. */
  productClass: number;
  direction: string | null;
  from: string;
  to: string;
  depPlanned: string;
  depActual: string | null;
  depDelay: number;
  depPlatform: string | null;
  arrPlanned: string;
  arrActual: string | null;
  arrDelay: number;
  arrPlatform: string | null;
  cancelled: boolean;
};

export type Journey = {
  id: string;
  depPlanned: string;
  depActual: string | null;
  depDelay: number;
  arrPlanned: string;
  arrActual: string | null;
  arrDelay: number;
  /** Scheduled travel time in minutes. */
  duration: number;
  changes: number;
  legs: Leg[];
  /** Stations where you change between rides — this is what defines the corridor. */
  transferHubs: string[];
  /** Tightest scheduled transfer in minutes, null when there is no transfer. */
  minTransfer: number | null;
  cancelled: boolean;
  /** Which search strategy surfaced it first. Handy while we tune the fan-out. */
  via: string[];
};

export type Corridor = {
  /** Stable key: the transfer hubs joined. */
  key: string;
  /** "über St. Pölten Hbf", "direkt" … */
  label: string;
  hubs: string[];
  journeys: Journey[];
  /** Minutes slower than the fastest corridor, 0 for the winner. */
  penalty: number;
  fastest: number;
  changes: number;
};

export type SavedRoute = {
  id: string;
  from: Station;
  to: Station;
  addedAt: number;
};
