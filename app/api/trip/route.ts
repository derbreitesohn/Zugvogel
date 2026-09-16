import { NextResponse } from "next/server";
import { tripStops } from "@/lib/hafas";

export const dynamic = "force-dynamic";
// The timetable backend sits in Austria: every hop from another continent
// is paid twice, once out and once back.
export const preferredRegion = "fra1";

/** Every stop one train makes, with live times. */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id ist erforderlich" }, { status: 400 });
  }

  try {
    const trip = await tripStops(id);
    return NextResponse.json(trip, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    return NextResponse.json({ error: message, stops: [] }, { status: 502 });
  }
}
