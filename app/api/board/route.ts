import { NextResponse } from "next/server";
import { departures } from "@/lib/hafas";
import { nowInVienna } from "@/lib/clock";

export const dynamic = "force-dynamic";
// The timetable backend sits in Austria: every hop from another continent
// is paid twice, once out and once back.
export const preferredRegion = "fra1";

/** What is leaving from one station, with live delays. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const station = params.get("station");
  const when = params.get("when") || nowInVienna();
  const limit = Math.min(Number(params.get("limit")) || 12, 30);

  if (!station) {
    return NextResponse.json(
      { departures: [], error: "station ist erforderlich" },
      { status: 400 },
    );
  }

  try {
    const rows = await departures(station, when, limit);
    return NextResponse.json(
      { departures: rows, when },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    return NextResponse.json({ departures: [], error: message }, { status: 502 });
  }
}
