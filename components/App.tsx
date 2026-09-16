"use client";

import { useCallback, useEffect, useState } from "react";
import { Bird } from "./Bird";
import { CorridorList } from "./CorridorList";
import { SavedBoard } from "./SavedBoard";
import { StationField } from "./StationField";
import { nowLocal } from "@/lib/format";
import { loadRoutes, routeId, saveRoutes } from "@/lib/storage";
import type { Corridor, SavedRoute, Station } from "@/lib/types";

export function App() {
  const [from, setFrom] = useState<Station | null>(null);
  const [to, setTo] = useState<Station | null>(null);
  const [when, setWhen] = useState("");
  const [corridors, setCorridors] = useState<Corridor[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routes, setRoutes] = useState<SavedRoute[]>([]);

  useEffect(() => {
    setRoutes(loadRoutes());
  }, []);

  const search = useCallback(
    async (a: Station, b: Station, at: string) => {
      setLoading(true);
      setError(null);
      try {
        const url =
          "/api/journeys?from=" +
          encodeURIComponent(a.lid) +
          "&to=" +
          encodeURIComponent(b.lid) +
          (at ? "&when=" + encodeURIComponent(at) : "");
        const res = await fetch(url);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setCorridors(data.corridors ?? []);
      } catch (err) {
        setError(
          err instanceof Error
            ? "Die Fahrplanauskunft antwortet gerade nicht. " + err.message
            : "Unbekannter Fehler",
        );
        setCorridors(null);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (from && to) search(from, to, when);
  }

  function swap() {
    setFrom(to);
    setTo(from);
  }

  const saved = from && to ? routes.some((r) => r.id === routeId(from, to)) : false;

  function togglePin() {
    if (!from || !to) return;
    const id = routeId(from, to);
    const next = routes.some((r) => r.id === id)
      ? routes.filter((r) => r.id !== id)
      : [...routes, { id, from, to, addedAt: Date.now() }];
    setRoutes(next);
    saveRoutes(next);
  }

  function removeRoute(id: string) {
    const next = routes.filter((r) => r.id !== id);
    setRoutes(next);
    saveRoutes(next);
  }

  function openRoute(route: SavedRoute) {
    setFrom(route.from);
    setTo(route.to);
    setWhen("");
    search(route.from, route.to, "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="shell">
      <header className="masthead">
        <div className="brand">
          <Bird />
          <div>
            <strong>Zugvogel</strong>
            <span>Kennt deine Strecke.</span>
          </div>
        </div>
        <button
          type="button"
          className="ghost"
          onClick={() => setWhen(when ? "" : nowLocal())}
        >
          {when ? "jetzt" : "Zeit wählen"}
        </button>
      </header>

      <form className="card search" onSubmit={onSubmit}>
        <div className="field-row">
          <StationField
            label="Von"
            placeholder="Wien Hbf"
            value={from}
            onChange={setFrom}
          />
          <button type="button" className="swap" onClick={swap} aria-label="Tauschen">
            ⇅
          </button>
          <StationField
            label="Nach"
            placeholder="Böheimkirchen"
            value={to}
            onChange={setTo}
          />
        </div>

        <div className="controls">
          {when && (
            <input
              className="when tnum"
              type="datetime-local"
              value={when}
              onChange={(event) => setWhen(event.target.value)}
              aria-label="Abfahrtszeit"
            />
          )}
          <button className="primary" type="submit" disabled={!from || !to || loading}>
            {loading ? "sucht alle Wege …" : "Verbindungen suchen"}
          </button>
        </div>
      </form>

      {from && to && corridors && (
        <button
          type="button"
          className="pin"
          data-saved={saved}
          onClick={togglePin}
          aria-pressed={saved}
        >
          {saved ? "★ gemerkt" : "☆ Strecke merken"}
        </button>
      )}

      {error && (
        <div className="notice" style={{ marginTop: 20 }} role="alert">
          {error}
        </div>
      )}

      {loading && (
        <div style={{ marginTop: 28 }}>
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      )}

      {!loading && corridors && corridors.length > 0 && (
        <>
          <div className="section-title">
            <h2>
              {corridors.length} {corridors.length === 1 ? "Weg" : "Wege"}
            </h2>
            <p>nach Korridor gruppiert, nicht nach Abfahrt</p>
          </div>
          <CorridorList corridors={corridors} />
        </>
      )}

      {!loading && corridors && corridors.length === 0 && (
        <div className="card empty" style={{ marginTop: 24 }}>
          <h3>Keine Verbindung gefunden</h3>
          <p>Zu dieser Zeit fährt nichts. Probier einen anderen Tag oder eine andere Uhrzeit.</p>
        </div>
      )}

      <SavedBoard routes={routes} onRemove={removeRoute} onOpen={openRoute} />

      {!corridors && routes.length === 0 && (
        <div className="card empty" style={{ marginTop: 24 }}>
          <Bird size={38} />
          <h3>Such deine erste Strecke</h3>
          <p>
            Zugvogel fragt den Fahrplan mehrmals und zeigt dir auch die Wege, die
            eine normale Auskunft verschweigt. Gemerkte Strecken landen hier oben.
          </p>
        </div>
      )}

      <footer className="foot">
        Echtzeitdaten der ÖBB. Inoffizielles Projekt, keine Verbindung zu ÖBB,
        Westbahn oder einem Verkehrsverbund. Angaben ohne Gewähr.
      </footer>
    </div>
  );
}
