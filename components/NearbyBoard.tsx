"use client";

import { useCallback, useEffect, useState } from "react";
import { delayTone, hhmm, lineKind } from "@/lib/format";
import { PinIcon } from "./Icons";
import type { Departure, Station } from "@/lib/types";

type State =
  | { phase: "idle" }
  | { phase: "locating" }
  | { phase: "denied" | "failed"; message: string }
  | { phase: "ready"; stations: Station[]; station: Station; rows: Departure[] };

/**
 * The commuter case: you are standing somewhere and want to know what leaves
 * from here and whether it is late. No typing, no route, just the board.
 *
 * The trigger belongs in the row of buttons and the board belongs underneath it
 * at full width, so the state lives here and the two pieces render separately.
 */
export function useNearby() {
  const [state, setState] = useState<State>({ phase: "idle" });

  const loadBoard = useCallback(async (station: Station, stations: Station[]) => {
    const res = await fetch(
      "/api/board?limit=8&station=" + encodeURIComponent(station.lid),
    );
    const data = await res.json();
    setState({ phase: "ready", stations, station, rows: data.departures ?? [] });
  }, []);

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setState({ phase: "failed", message: "Kein Standort verfügbar." });
      return;
    }
    setState({ phase: "locating" });
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const res = await fetch("/api/nearby?lat=" + latitude + "&lon=" + longitude);
          const data = await res.json();
          const stations: Station[] = data.stations ?? [];
          if (stations.length === 0) {
            setState({ phase: "failed", message: "In der Nähe hält nichts." });
            return;
          }
          await loadBoard(stations[0], stations);
        } catch {
          setState({ phase: "failed", message: "Abfahrten nicht erreichbar." });
        }
      },
      (error) => {
        setState(
          error.code === error.PERMISSION_DENIED
            ? { phase: "denied", message: "Standort abgelehnt — tipp die Station ein." }
            : { phase: "failed", message: "Standort nicht ermittelbar." },
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }, [loadBoard]);

  const close = useCallback(() => setState({ phase: "idle" }), []);

  // Keep the board alive while it is open: delays are the whole point. Closing
  // it drops the interval too, so nothing keeps polling in the background.
  useEffect(() => {
    if (state.phase !== "ready") return;
    const { station, stations } = state;
    const timer = window.setInterval(() => loadBoard(station, stations), 60_000);
    return () => window.clearInterval(timer);
  }, [state, loadBoard]);

  return { state, locate, close, loadBoard };
}

export type Nearby = ReturnType<typeof useNearby>;

export function NearbyTrigger({ nearby }: { nearby: Nearby }) {
  const { state, locate, close } = nearby;

  if (state.phase === "locating") {
    return (
      <button type="button" className="pin" disabled>
        <PinIcon /> Standort …
      </button>
    );
  }

  if (state.phase === "ready") {
    return (
      <button type="button" className="pin" data-saved onClick={close}>
        <PinIcon /> Nähe ausblenden
      </button>
    );
  }

  return (
    <button type="button" className="pin" onClick={locate}>
      <PinIcon /> In meiner Nähe
    </button>
  );
}

export function NearbyPanel({
  nearby,
  onUseAsOrigin,
}: {
  nearby: Nearby;
  onUseAsOrigin: (station: Station) => void;
}) {
  const { state, locate, close, loadBoard } = nearby;

  if (state.phase === "denied" || state.phase === "failed") {
    return (
      <div className="notice notice-row" style={{ marginTop: 16 }}>
        <span>{state.message}</span>
        <button type="button" className="linkish" onClick={locate}>
          nochmal
        </button>
        <button type="button" className="close" onClick={close} aria-label="Schließen">
          ×
        </button>
      </div>
    );
  }

  if (state.phase !== "ready") return null;
  const { station, stations, rows } = state;

  return (
    <>
      <div className="section-title">
        <h2>Von hier</h2>
        <button type="button" className="linkish" onClick={close}>
          ausblenden
        </button>
      </div>

      <section className="card">
        <header className="corridor-head">
          <h3>{station.name}</h3>
          {typeof station.distance === "number" && (
            <span className="badge tnum">{station.distance} m</span>
          )}
          <button
            type="button"
            className="badge linkish"
            onClick={() => onUseAsOrigin(station)}
          >
            als Start
          </button>
          <button type="button" className="close" onClick={close} aria-label="Schließen">
            ×
          </button>
        </header>

        {stations.length > 1 && (
          <div className="station-switch">
            {stations.slice(0, 5).map((s) => (
              <button
                key={s.id}
                type="button"
                data-active={s.id === station.id}
                onClick={() => loadBoard(s, stations)}
              >
                {s.name.replace(/^St\.\s?Pölten\s|^Wien\s/, "")}
              </button>
            ))}
          </div>
        )}

        {rows.length === 0 && (
          <p className="empty" style={{ padding: 24 }}>
            Hier fährt gerade nichts.
          </p>
        )}

        {rows.map((row) => (
          <div className="departure" key={row.id}>
            <span className="clock tnum">{hhmm(row.planned)}</span>
            {row.cancelled ? (
              <span className="delay" data-tone="bad">
                entfällt
              </span>
            ) : (
              row.delay > 0 && (
                <span className="delay tnum" data-tone={delayTone(row.delay)}>
                  +{row.delay}
                </span>
              )
            )}
            <span className="line" data-kind={lineKind(row.productClass)}>
              {row.line}
            </span>
            <span className="direction">{row.direction}</span>
            {row.platform && <span className="platform tnum">Gl. {row.platform}</span>}
          </div>
        ))}
      </section>
    </>
  );
}
