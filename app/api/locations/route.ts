import { NextResponse } from "next/server";
import { searchStations } from "@/lib/hafas";

export const dynamic = "force-dynamic";
// The timetable backend sits in Austria: every hop from another continent
// is paid twice, once out and once back.
export const preferredRegion = "fra1";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = params.get("q") ?? "";
  // Addresses and points of interest, so a destination can be a street rather
  // than a station and the last walk comes back with the journey.
  const places = params.get("places") !== "0";
  if (q.trim().length < 2) return NextResponse.json({ stations: [] });

  try {
    const stations = await searchStations(q, 8, places);
    return NextResponse.json(
      { stations },
      // Station names do not change minute to minute, so let the edge hold them
      // briefly. Keeps autocomplete snappy without hammering the upstream.
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    return NextResponse.json({ stations: [], error: message }, { status: 502 });
  }
}
