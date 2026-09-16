# Zugvogel

Kennt deine Strecke.

Echtzeit-Abfahrten für Österreich, und vor allem: **alle Wege von A nach B**, auch
die, die eine normale Fahrplanauskunft verschweigt.

## Das Problem

Wien Hbf nach Böheimkirchen, Scotty zeigt sechs Verbindungen — alle über St. Pölten.
Dass man auch über Westbahnhof oder Meidling fahren kann, erfährt man nie, weil diese
Wege auf der einen Achse verlieren, nach der sortiert wird.

## Die Lösung

Dieselbe Engine mehrmals unterschiedlich fragen (`lib/corridors.ts`):

| Strategie   | Produktfilter                   | Was sie aufdeckt                         |
| ----------- | ------------------------------- | ---------------------------------------- |
| `standard`  | alles                           | was Scotty zeigen würde                  |
| `regional`  | ohne Fernverkehr                | den REX-Korridor ab Westbahnhof          |
| `rail`      | nur Züge                        | Wege ohne U-Bahn/Bus als Kitt            |
| `local`     | nur REX/R/S                     | die billigste Variante                   |
| `direct`    | max. 0× umsteigen               | Direktzüge, die die Rangliste vergräbt   |
| `via`       | erzwungener Umstiegspunkt       | andere Startbahnhöfe in derselben Stadt  |

Die via-Kandidaten kommen aus einer Umkreissuche um den Startort: welcher andere
größere Bahnhof liegt in Reichweite. Danach werden alle Ergebnisse zusammengelegt,
dedupliziert und **nach Korridor gruppiert** statt nach Abfahrtszeit.

Ein Korridor ist definiert über die Bahnhöfe, an denen man zwischen *Zügen*
wechselt. Ein Umstieg von der U3 auf die U6 ist keine Routenentscheidung, das
erste Einsteigen in Westbahnhof statt Hauptbahnhof schon.

## Datenquelle

Die HAFAS-Schnittstelle, mit der ÖBB Scotty selbst spricht. Inoffiziell, aber die
einzige Quelle mit Live-Verspätungen ohne registrierten API-Key.

Alles, was darüber liegt, kennt nur die Typen aus `lib/types.ts` — ein späterer
Umstieg auf die nationalen GTFS/GTFS-RT-Feeds (dort ist auch die **Westbahn**
drin, die in den ÖBB-Daten komplett fehlt) betrifft nur `lib/hafas.ts`.

## Entwickeln

```bash
npm install
npm run dev     # http://localhost:3010
```

## Aufbau

```
app/api/locations   Stationssuche (Autocomplete)
app/api/journeys    Korridorsuche; ?quick=1 für das Board auf der Startseite
lib/hafas.ts        HAFAS-Client, die einzige Stelle mit Upstream-Wissen
lib/corridors.ts    Fan-out, Zusammenlegen, Korridor-Gruppierung
lib/storage.ts      gemerkte Strecken im localStorage, ohne Account
components/         UI
```

## Offen

- Push bei Verspätung, Ausfall und Gleiswechsel für gemerkte Züge
- Echtzeitdaten mitloggen → Umstiegsrisiko („4 min Umstieg, klappt an 62% der Tage")
- Westbahn über den nationalen Datensatz
- Service Worker, damit die PWA auch offline den letzten Stand zeigt

---

Inoffizielles Projekt, keine Verbindung zu ÖBB, Westbahn oder einem
Verkehrsverbund. Angaben ohne Gewähr.
