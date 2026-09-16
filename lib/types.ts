/** [lat, lon] — the order the upstream encodes geometry in, kept end to end. */
export type LatLon = [number, number];

export type Station = {
  id: string;
  lid: string;
  name: string;
  lat: number;
  lon: number;
  /** Product classes served here, as a bitmask. Sorts real stations above bus stops. */
  products: number;
  /** "S" station, "P" point of interest, "A" address. */
  kind: "S" | "P" | "A";
  /** Metres from the search point, when the station came from a geo lookup. */
  distance?: number;
};

/** Whether you can get a bicycle onto this train. */
export type BikeCarriage = "yes" | "limited" | "reservation" | "no" | null;

export type Leg = {
  kind: "ride" | "walk";
  /** "REX 51", "RJX 262", "U3" … or "Fussweg". */
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
  /** Walking legs only: how far, and how long the timetable allows for it. */
  distance: number | null;
  walkMinutes: number | null;
  /** On-board facilities as the operator words them. */
  attributes: string[];
  bike: BikeCarriage;
  stepFree: boolean;
  /** Route geometry, thinned for the wire. Empty when the upstream had none. */
  points: LatLon[];
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
  /** Total time on foot across the whole journey. */
  walkMinutes: number;
  cancelled: boolean;
  /** The weakest bike rule across all trains: one "no" makes the journey a no. */
  bike: BikeCarriage;
  stepFree: boolean;
  /** Which search strategy surfaced it first. Handy while we tune the fan-out. */
  via: string[];
};

export type Corridor = {
  /** Stable key: the transfer hubs joined. */
  key: string;
  /** "über St. Pölten", "Ohne Umstieg" … */
  label: string;
  hubs: string[];
  journeys: Journey[];
  /** Minutes slower than the fastest corridor, 0 for the winner. */
  penalty: number;
  fastest: number;
  changes: number;
};

/** One row on a station's departure board. */
export type Departure = {
  id: string;
  line: string;
  category: string;
  productClass: number;
  direction: string;
  planned: string;
  actual: string | null;
  delay: number;
  platform: string | null;
  cancelled: boolean;
};

export type SavedRoute = {
  id: string;
  from: Station;
  to: Station;
  addedAt: number;
};
