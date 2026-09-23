# Flights Above Me ✈️

A real-time flight tracker that shows aircraft currently flying above your location. Using your device's geolocation, this application displays live flight information including airline details, flight paths, altitude, and aircraft registration on an interactive map.

[flights-above-me.vercel.app](https://flights-above-me.vercel.app)

## Flight data source

The app fetches live flight data from the free community ADS-B aggregator
[api.adsb.lol](https://api.adsb.lol). No API key is required and the app
works out of the box.

### Trade-offs of the free source

adsb.lol broadcasts raw ADS-B data and does not provide the curated metadata
that commercial APIs derive from their own pipelines:

- **Origin/destination** is enriched per callsign via adsb.lol's
  `routeset` endpoint (community route DB). Coverage is good for scheduled
  commercial flights and missing for GA/military; unknown routes are shown as
  placeholders in the UI.
- **No native flight trails** — adsb.lol does not expose per-flight historical
  track history in the format used by this app.
- **Airline name** is best-effort, derived from the callsign prefix via a
  built-in ICAO-to-airline lookup (`src/utils/providers/airlineCodes.ts`).
- Coverage depends on the community receiver network; expect gaps over oceans
  and remote areas.

See `.env.example` for available configuration options.
