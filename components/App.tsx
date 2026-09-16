"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bird } from "./Bird";
import { CorridorList } from "./CorridorList";
import { CorridorMap } from "./CorridorMap";
import { NearbyBoard } from "./NearbyBoard";
import { SavedBoard } from "./SavedBoard";
import { StationField } from "./StationField";
import { nowLocal } from "@/lib/format";
import { loadRoutes, makeRoute, routeId, saveRoutes } from "@/lib/storage";
import type { Corridor, SavedRoute, Station } from "@/lib/types";

/**
 * A search lives in the address bar, so a connection can be sent to somebody.
 * Only the location ids and the time go in — they already carry the station
 * name, so there is nothing to look up again on the way back.
 */
function writeUrl(from: Station | null, to: Station | null, when: string) {
  const params = new URLSearchParams();
  if (from) params.set("von", from.lid);
  if (to) params.set("nach", to.lid);
  if (when) params.set("ab", when);
  const query = params.toString();
  window.history.replaceState(null, "", query ? "?" + query : window.location.pathname);
}

function stationFromLid(lid: string): Station {
  const name = lid.match(/(?:^|@)O=([^@]+)@/)?.[1] ?? lid;
  const x = Number(lid.match(/@X=(-?\d+)@/)?.[1] ?? 0);
  const y = Number(lid.match(/@Y=(-?\d+)@/)?.[1] ?? 0);
  const id = lid.match(/@L=(\d+)@/)?.[1] ?? lid;
  const kind = lid.match(/(?:^|@)A=(\d+)@/)?.[1];
  return {
    id,
    lid,
    name,
    lat: y / 1e6,
    lon: x / 1e6,
    products: 0,
    kind: kind === "2" ? "A" : kind === "4" ? "P" : "S",
  };
}

export function App() {
  const [from, setFrom] = useState<Station | null>(null);
  const [to, setTo] = useState<Station | null>(null);
  const [when, setWhen] = useState("");
  const [corridors, setCorridors] = useState<Corridor[] | null>(null);
  const [focus, setFocus] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routes, setRoutes] = useState<SavedRoute[]>([]);

  const search = useCallback(async (a: Station, b: Station, at: string) => {
    setLoading(true);
    setError(null);
    writeUrl(a, b, at);
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
  }, []);

  // A shared link should show the connection, not an empty form.
  const restored = useRef(false);
  useEffect(() => {
    setRoutes(loadRoutes());
    if (restored.current) return;
    restored.current = true;

    const params = new URLSearchParams(window.location.search);
    const von = params.get("von");
    const nach = params.get("nach");
    const ab = params.get("ab") ?? "";
    if (!von || !nach) return;

    const a = stationFromLid(von);
    const b = stationFromLid(nach);
    setFrom(a);
    setTo(b);
    setWhen(ab);
    search(a, b, ab);
  }, [search]);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (from && to) search(from, to, when);
  }

  function swap() {
    setFrom(to);
    setTo(from);
  }

  const saved = from && to ? routes.some((r) => r.id === routeId(from, to)) : false;

  /** Writing failed — private window, blocked or full storage. Say so once. */
  const [storageWarning, setStorageWarning] = useState(false);
  /** The last removed route, so a misclick is one click away from undone. */
  const [undo, setUndo] = useState<SavedRoute | null>(null);

  const commit = useCallback((next: SavedRoute[]) => {
    setRoutes(next);
    setStorageWarning(!saveRoutes(next));
  }, []);

  function togglePin() {
    if (!from || !to) return;
    const id = routeId(from, to);
    if (routes.some((r) => r.id === id)) {
      removeRoute(id);
      return;
    }
    setUndo(null);
    commit([...routes, makeRoute(from, to)]);
  }

  function removeRoute(id: string) {
    const gone = routes.find((r) => r.id === id) ?? null;
    commit(routes.filter((r) => r.id !== id));
    setUndo(gone);
  }

  function restore() {
    if (!undo) return;
    commit([...routes.filter((r) => r.id !== undo.id), undo]);
    setUndo(null);
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
          <StationField label="Von" placeholder="Wien Hbf" value={from} onChange={setFrom} />
          <button type="button" className="swap" onClick={swap} aria-label="Tauschen">
            ⇅
          </button>
          <StationField
            label="Nach"
            placeholder="Bahnhof, Adresse oder Ort"
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

      <div className="actionbar">
        <NearbyBoard onUseAsOrigin={setFrom} />
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
      </div>

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
          <CorridorMap corridors={corridors} focus={focus} />
          <CorridorList corridors={corridors} onFocus={setFocus} />
        </>
      )}

      {!loading && corridors && corridors.length === 0 && (
        <div className="card empty" style={{ marginTop: 24 }}>
          <h3>Keine Verbindung gefunden</h3>
          <p>Zu dieser Zeit fährt nichts. Probier einen anderen Tag oder eine andere Uhrzeit.</p>
        </div>
      )}

      {storageWarning && (
        <div className="notice" style={{ marginTop: 16 }}>
          Dein Browser lässt nichts speichern (privates Fenster oder Speicher voll).
          Gemerkte Strecken halten dann nur, solange der Tab offen ist.
        </div>
      )}

      {undo && (
        <div className="undo">
          <span>
            {undo.from.name} → {undo.to.name} entfernt.
          </span>
          <button type="button" className="linkish" onClick={restore}>
            rückgängig
          </button>
        </div>
      )}

      <SavedBoard routes={routes} onRemove={removeRoute} onOpen={openRoute} />

      {!corridors && routes.length === 0 && (
        <div className="card empty" style={{ marginTop: 24 }}>
          <Bird size={38} />
          <h3>Such deine erste Strecke</h3>
          <p>
            Zugvogel fragt den Fahrplan mehrmals und zeigt dir auch die Wege, die eine
            normale Auskunft verschweigt. Gemerkte Strecken landen hier oben.
          </p>
        </div>
      )}

      <footer className="foot">
        Echtzeitdaten der ÖBB. Inoffizielles Projekt, keine Verbindung zu ÖBB, Westbahn
        oder einem Verkehrsverbund. Angaben ohne Gewähr.
      </footer>
    </div>
  );
}
