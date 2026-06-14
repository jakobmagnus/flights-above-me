import { Flight, FlightTrackResponse } from '@/types/flight';
import type { AirportInfo } from '@/utils/airportInfo';
import { lookupAirlineFromCallsign } from './airlineCodes';
import { lookupRoutes, RouteInfo } from './routeCache';
import {
    BoundsBox,
    FlightProvider,
    ProviderId,
    UpstreamError,
    isInsideBounds,
} from './types';

/** Maximum radius accepted by adsb.lol /v2/point endpoint (nautical miles). */
const ADSBLOL_MAX_RADIUS_NM = 250;

/** Shape of a single aircraft entry from api.adsb.lol /v2/point. */
interface AdsbLolAircraft {
    hex?: string;
    flight?: string;
    r?: string;          // registration
    t?: string;          // aircraft type code
    desc?: string;       // human-readable aircraft description
    lat?: number;
    lon?: number;
    alt_baro?: number | 'ground';
    alt_geom?: number;
    gs?: number;         // ground speed in knots
    track?: number;
    baro_rate?: number;  // vertical rate in feet/min (already decoded)
    squawk?: string;
    category?: string;
    seen?: number;
    seen_pos?: number;
}

interface AdsbLolResponse {
    ac?: AdsbLolAircraft[];
    now?: number;
}

/**
 * Free flight-data provider backed by the community ADS-B aggregator at
 * api.adsb.lol. The endpoint we use returns aircraft within a radius of a
 * point, so we approximate a bounding-box query by querying the center with
 * a radius that covers the diagonal, then filtering locally.
 *
 * Trade-offs vs FR24:
 * - No historical trail endpoint (a per-route in-memory cache fills the gap).
 * - Origin/destination metadata is enriched via a secondary routeset lookup
 *   (community DB; coverage is best for scheduled commercial flights).
 * - Coverage is crowdsourced and weaker over oceans / remote areas.
 */
export class AdsbLolProvider implements FlightProvider {
    readonly id: ProviderId = 'adsblol';
    readonly supportsTrails = false;

    async getFlightsInBounds(bounds: BoundsBox): Promise<Flight[]> {
        const center = boundsCenter(bounds);
        const radiusNm = Math.min(
            Math.ceil(boundsRadiusNm(bounds, center)),
            ADSBLOL_MAX_RADIUS_NM,
        );

        const url = `https://api.adsb.lol/v2/point/${center.lat.toFixed(5)}/${center.lon.toFixed(5)}/${radiusNm}`;

        const res = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            next: { revalidate: 30 },
        });
        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new UpstreamError(`adsb.lol error: ${res.status} - ${errText}`, res.status);
        }

        const data = (await res.json()) as AdsbLolResponse;
        const aircraft = Array.isArray(data.ac) ? data.ac : [];
        const nowIso = new Date().toISOString();

        const flights = aircraft
            .filter(ac =>
                typeof ac.lat === 'number' &&
                typeof ac.lon === 'number' &&
                isInsideBounds(ac.lat, ac.lon, bounds),
            )
            .map(ac => mapAircraftToFlight(ac, nowIso));

        // Enrich with origin/destination via adsb.lol's routeset endpoint.
        // adsb.lol's /v2/point feed lacks route info, so we look it up by
        // callsign and merge the results in. Best-effort: any failure leaves
        // the flights unenriched rather than failing the whole request.
        await enrichWithRoutes(flights);

        return flights;
    }

    async getFlightTrail(): Promise<FlightTrackResponse | null> {
        // adsb.lol does not expose a per-flight historical trail in the
        // same shape as FR24. Returning null lets callers fall back to the
        // in-memory positional cache populated from successive bounds polls.
        return null;
    }

    async getAirport(): Promise<AirportInfo | null> {
        return null;
    }
}

/** Earth radius in nautical miles (mean). */
const EARTH_RADIUS_NM = 3440.065;

function toRad(deg: number): number {
    return (deg * Math.PI) / 180;
}

/** Great-circle distance between two points, in nautical miles. */
function haversineNm(aLat: number, aLon: number, bLat: number, bLon: number): number {
    const dLat = toRad(bLat - aLat);
    const dLon = toRad(bLon - aLon);
    const lat1 = toRad(aLat);
    const lat2 = toRad(bLat);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);
    const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
    return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function boundsCenter(bounds: BoundsBox): { lat: number; lon: number } {
    const lat = (bounds.north + bounds.south) / 2;
    // For boxes crossing the antimeridian, average across the discontinuity.
    let lon = (bounds.west + bounds.east) / 2;
    if (bounds.west > bounds.east) {
        // Crossing antimeridian: shift east by 360 to compute midpoint, then normalize.
        lon = (bounds.west + (bounds.east + 360)) / 2;
        if (lon > 180) lon -= 360;
    }
    return { lat, lon };
}

function boundsRadiusNm(bounds: BoundsBox, center: { lat: number; lon: number }): number {
    // Distance from center to a corner. The east corner suffices because
    // boundsCenter handles antimeridian wrap.
    const cornerLon = bounds.east;
    const cornerLat = bounds.north;
    return haversineNm(center.lat, center.lon, cornerLat, cornerLon);
}

function mapAircraftToFlight(ac: AdsbLolAircraft, nowIso: string): Flight {
    const callsign = ac.flight?.trim();
    const airline = lookupAirlineFromCallsign(callsign);
    const altitude = typeof ac.alt_baro === 'number'
        ? ac.alt_baro
        : ac.alt_baro === 'ground'
            ? 0
            : ac.alt_geom;

    const flight: Flight = {
        // Identifiers. Use the hex (ICAO 24-bit address) as the stable id.
        fr24_id: ac.hex,
        flight_id: ac.hex,
        hex: ac.hex,

        // Callsign / flight number
        callsign,
        flight: callsign,
        flight_number: callsign,

        // Position & motion
        lat: ac.lat,
        lon: ac.lon,
        latitude: ac.lat,
        longitude: ac.lon,
        alt: altitude,
        altitude,
        gspeed: ac.gs,
        // adsb.lol returns vertical rate already in ft/min. transformFlightData
        // would multiply by 64 (FR24's encoding) so we bypass it and pre-encode.
        // The route handler does NOT apply transformFlightData to free providers.
        vspeed: ac.baro_rate,
        track: ac.track,
        heading: ac.track,
        squawk: ac.squawk,

        // Aircraft metadata
        type: ac.t,
        reg: ac.r,
        registration: ac.r,

        // Airline enrichment (best effort)
        operating_as: airline?.icao,
        airline_icao: airline?.icao,
        airline_iata: airline?.iata,

        // Timestamps
        timestamp: nowIso,
        source: 'ADSB',
    };

    return flight;
}

/**
 * Mutate `flights` in-place to add origin/destination IATA/ICAO codes from
 * adsb.lol's routeset endpoint, keyed by callsign. Existing values on a
 * Flight are preserved; only missing fields are filled in.
 */
async function enrichWithRoutes(flights: Flight[]): Promise<void> {
    const positions = new Map<string, { lat: number; lon: number }>();
    for (const f of flights) {
        const cs = f.callsign?.trim();
        if (!cs) continue;
        if (positions.has(cs)) continue;
        const lat = typeof f.lat === 'number' ? f.lat : 0;
        const lon = typeof f.lon === 'number' ? f.lon : 0;
        positions.set(cs, { lat, lon });
    }
    if (positions.size === 0) return;

    let routes: Map<string, RouteInfo>;
    try {
        routes = await lookupRoutes(positions);
    } catch {
        return;
    }

    for (const f of flights) {
        const cs = f.callsign?.trim();
        if (!cs) continue;
        const r = routes.get(cs);
        if (!r) continue;
        if (!f.orig_iata && r.orig_iata) f.orig_iata = r.orig_iata;
        if (!f.orig_icao && r.orig_icao) f.orig_icao = r.orig_icao;
        if (!f.dest_iata && r.dest_iata) f.dest_iata = r.dest_iata;
        if (!f.dest_icao && r.dest_icao) f.dest_icao = r.dest_icao;
        if (!f.airline_icao && r.airline_icao) f.airline_icao = r.airline_icao;
        if (!f.airline_iata && r.airline_iata) f.airline_iata = r.airline_iata;
        if (!f.operating_as && r.airline_icao) f.operating_as = r.airline_icao;
    }
}
