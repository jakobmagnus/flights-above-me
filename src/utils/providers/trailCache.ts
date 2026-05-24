import { Flight, FlightTrackPoint, FlightTrackResponse } from '@/types/flight';

/**
 * Lightweight in-memory cache that accumulates per-aircraft position history
 * from successive `getFlightsInBounds` calls. Used to provide a "best effort"
 * flight trail for providers (adsb.lol, OpenSky) that don't expose a native
 * trail endpoint.
 *
 * Notes:
 * - This cache is per-server-instance and ephemeral. On serverless cold
 *   starts or multi-instance deployments trails will be short or empty.
 * - Older entries are evicted on a sliding TTL so memory stays bounded.
 */

interface CacheEntry {
    points: FlightTrackPoint[];
    lastSeen: number;
}

const MAX_POINTS_PER_FLIGHT = 200;
const ENTRY_TTL_MS = 60 * 60 * 1000;       // 1h since last update
const MAX_TRACKED_FLIGHTS = 5000;          // hard memory cap

const cache = new Map<string, CacheEntry>();

function flightKey(flight: Flight): string | undefined {
    return flight.hex || flight.fr24_id || flight.flight_id;
}

function pointFromFlight(flight: Flight): FlightTrackPoint | null {
    const lat = flight.lat ?? flight.latitude;
    const lon = flight.lon ?? flight.longitude;
    if (lat === undefined || lon === undefined) return null;
    return {
        timestamp: flight.timestamp ?? new Date().toISOString(),
        lat,
        lon,
        alt: flight.alt ?? flight.altitude ?? 0,
        gspeed: flight.gspeed ?? 0,
        vspeed: flight.vspeed ?? 0,
        track: flight.track ?? flight.heading ?? 0,
        squawk: flight.squawk,
        callsign: flight.callsign ?? flight.flight,
        source: flight.source ?? 'ADSB',
    };
}

/** Record positions from a batch of flights for later trail retrieval. */
export function recordTrailPositions(flights: Flight[]): void {
    const now = Date.now();
    for (const flight of flights) {
        const key = flightKey(flight);
        if (!key) continue;
        const point = pointFromFlight(flight);
        if (!point) continue;

        const existing = cache.get(key);
        if (existing) {
            const last = existing.points[existing.points.length - 1];
            // De-duplicate identical successive positions (stationary aircraft).
            if (!last || last.lat !== point.lat || last.lon !== point.lon) {
                existing.points.push(point);
                if (existing.points.length > MAX_POINTS_PER_FLIGHT) {
                    existing.points.splice(0, existing.points.length - MAX_POINTS_PER_FLIGHT);
                }
            }
            existing.lastSeen = now;
        } else {
            cache.set(key, { points: [point], lastSeen: now });
        }
    }
    pruneCache(now);
}

/** Retrieve the cached trail for a flight id, or null if unknown. */
export function getCachedTrail(flightId: string): FlightTrackResponse | null {
    const entry = cache.get(flightId);
    if (!entry || entry.points.length === 0) return null;
    return {
        fr24_id: flightId,
        tracks: entry.points,
    };
}

function pruneCache(now: number): void {
    // TTL eviction
    if (cache.size > 0) {
        for (const [key, entry] of cache) {
            if (now - entry.lastSeen > ENTRY_TTL_MS) {
                cache.delete(key);
            }
        }
    }
    // Hard cap: drop the oldest entries if still over the limit.
    if (cache.size > MAX_TRACKED_FLIGHTS) {
        const sorted = [...cache.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen);
        const toRemove = cache.size - MAX_TRACKED_FLIGHTS;
        for (let i = 0; i < toRemove; i++) {
            cache.delete(sorted[i][0]);
        }
    }
}

/** Test/debug helper to wipe the cache (not exported from the public API). */
export function _clearTrailCache(): void {
    cache.clear();
}
