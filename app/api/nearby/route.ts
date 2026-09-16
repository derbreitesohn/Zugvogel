import { NextResponse } from "next/server";
import { PRODUCT, nearbyStations } from "@/lib/hafas";

export const dynamic = "force-dynamic";
// The timetable backend sits in Austria: every hop from another continent
// is paid twice, once out and once back.
export const preferredRegion = "fra1";

const RAIL =
  PRODUCT.longDistance |
  PRODUCT.night |
  PRODUCT.intercity |
  PRODUCT.interregional |
  PRODUCT.regional |
  PRODUCT.suburban;

/**
 * Stations around a coordinate. The browser sends its position here, we resolve
 * it and send station names back. Nothing about the position is written down.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  // Include buses and trams by default: at a bus stop in a village, the bus is
  // the answer, and pretending otherwise would just show an empty board.
  const railOnly = params.get("rail") === "1";

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      { stations: [], error: "lat und lon sind erforderlich" },
      { status: 400 },
    );
  }

  try {
    const stations = await nearbyStations(
      Math.round(lon * 1e6),
      Math.round(lat * 1e6),
      railOnly ? RAIL : PRODUCT.bus | PRODUCT.tram | PRODUCT.subway | RAIL,
      railOnly ? 12000 : 3000,
      12,
    );
    return NextResponse.json(
      { stations },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    return NextResponse.json({ stations: [], error: message }, { status: 502 });
  }
}
