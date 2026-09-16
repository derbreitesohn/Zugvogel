"use client";

import { useCallback, useEffect, useState } from "react";
import { countdownLabel, delayLabel, hhmm } from "@/lib/format";
import type { Corridor, Journey, SavedRoute } from "@/lib/types";

type Props = {
  routes: SavedRoute[];
  onRemove: (id: string) => void;
  onOpen: (route: SavedRoute) => void;
};

type Board = Record<string, Journey[] | "loading" | "error">;

export function SavedBoard({ routes, onRemove, onOpen }: Props) {
  const [board, setBoard] = useState<Board>({});

  const refresh = useCallback(async () => {
    for (const route of routes) {
      setBoard((b) => (b[route.id] ? b : { ...b, [route.id]: "loading" }));
      try {
        const url =
          "/api/journeys?quick=1&from=" +
          encodeURIComponent(route.from.lid) +
          "&to=" +
          encodeURIComponent(route.to.lid);
        const res = await fetch(url);
        const data = await res.json();
        const journeys = (data.corridors ?? [])
          .flatMap((c: Corridor) => c.journeys)
          .sort((a: Journey, b: Journey) => a.depPlanned.localeCompare(b.depPlanned));
        setBoard((b) => ({ ...b, [route.id]: journeys.slice(0, 3) }));
      } catch {
        setBoard((b) => ({ ...b, [route.id]: "error" }));
      }
    }
  }, [routes]);

  useEffect(() => {
    refresh();
    // Delays move; a board nobody refreshes is worse than no board.
    const timer = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  if (routes.length === 0) return null;

  return (
    <>
      <div className="section-title">
        <h2>Gemerkte Strecken</h2>
        <p>aktualisiert jede Minute</p>
      </div>
      <div className="saved-grid">
        {routes.map((route) => {
          const state = board[route.id];
          const journeys = Array.isArray(state) ? state : [];
          const next = journeys[0];
          const delay = next ? delayLabel(next) : null;

          return (
            <article className="card saved" key={route.id}>
              <button
                type="button"
                className="remove"
                aria-label="Strecke entfernen"
                onClick={() => onRemove(route.id)}
              >
                ×
              </button>
              <button
                type="button"
                onClick={() => onOpen(route)}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  display: "block",
                  width: "100%",
                }}
              >
                <div className="saved-route">
                  {route.from.name} <em>→</em> {route.to.name}
                </div>

                {state === "loading" && (
                  <div className="saved-then" style={{ marginTop: 12 }}>
                    wird geladen …
                  </div>
                )}
                {state === "error" && (
                  <div className="saved-then" style={{ marginTop: 12 }}>
                    gerade nicht erreichbar
                  </div>
                )}

                {next && (
                  <>
                    <div className="saved-next">
                      <span className="clock tnum">{hhmm(next.depPlanned)}</span>
                      {delay && (
                        <span className="delay tnum" data-tone={delay.tone}>
                          {delay.text}
                        </span>
                      )}
                      <span className="meta tnum">{countdownLabel(next)}</span>
                    </div>
                    {journeys.length > 1 && (
                      <div className="saved-then tnum">
                        danach {journeys.slice(1).map((j) => hhmm(j.depPlanned)).join(", ")}
                      </div>
                    )}
                  </>
                )}
              </button>
            </article>
          );
        })}
      </div>
    </>
  );
}
