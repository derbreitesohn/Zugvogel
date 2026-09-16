import { NextResponse } from "next/server";
import { searchStations } from "@/lib/hafas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  if (q.trim().length < 2) return NextResponse.json({ stations: [] });

  try {
    const stations = await searchStations(q);
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
