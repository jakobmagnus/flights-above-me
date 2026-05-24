# Flights Above Me ✈️

A real-time flight tracker that shows aircraft currently flying above your location. Using your device's geolocation, this application displays live flight information including airline details, flight paths, altitude, and aircraft registration on an interactive map.

[flights-above-me.vercel.app](https://flights-above-me.vercel.app)

## Flight data providers

The app supports three upstream flight-data sources, selected with the
`FLIGHT_DATA_PROVIDER` environment variable:

| Provider  | Cost | Key required | Trails | Origin / destination | Notes |
|-----------|------|--------------|--------|----------------------|-------|
| `adsblol` (default) | Free | No | Best-effort (in-memory) | ✗ | Community ADS-B aggregator at api.adsb.lol. Good EU/NA coverage. |
| `opensky` | Free | Optional | Best-effort (in-memory) | ✗ | OpenSky Network REST API. Anonymous access is rate-limited; supply `OPENSKY_USERNAME`/`OPENSKY_PASSWORD` for higher limits. |
| `fr24`    | Paid | Yes (`FLIGHTRADAR24_API_KEY`) | Native | ✓ | Flightradar24 commercial API. Richest metadata (airline, route, aircraft type). |

If `FLIGHT_DATA_PROVIDER` is not set, the app uses `fr24` when
`FLIGHTRADAR24_API_KEY` is configured, and `adsblol` otherwise — so the app
works out of the box for free.

### Free-provider trade-offs

The free providers (`adsblol`, `opensky`) broadcast raw ADS-B data and do not
expose flight metadata that FR24 derives from its own pipelines:

- **No origin/destination airport** — the UI hides those fields when missing.
- **No native flight trails** — the server keeps a short in-memory positional
  history per aircraft from successive `/api/flights` polls and serves that as
  a fallback trail. Trails reset on server restart and are short on serverless
  cold starts.
- **Airline name** is best-effort, derived from the callsign prefix via a
  built-in ICAO-to-airline lookup (`src/utils/providers/airlineCodes.ts`).
- Coverage depends on the community receiver network; expect gaps over oceans
  and remote areas.

See `.env.example` for all configuration options.
