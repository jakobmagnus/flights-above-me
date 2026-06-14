/**
 * In-memory cache + lookup for flight routes (origin/destination airports)
 * keyed by callsign. The data source is the community endpoint
 *   POST https://api.adsb.lol/api/0/routeset
 * which proxies adsbdb's airline/route database. adsb.lol's `/v2/point` feed
 * does not include origin/destination, so we enrich flights here.
 *
 * Routes are stable per callsign for at least a day, so we cache aggressively.
 * Negative results (unknown route) are cached with a shorter TTL so that
 * routes which become known later are picked up reasonably quickly.
 */

export interface RouteInfo {
    orig_iata?: string;
    orig_icao?: string;
    dest_iata?: string;
    dest_icao?: string;
    /** Optional airline ICAO/IATA derived from the routeset response. */
    airline_icao?: string;
    airline_iata?: string;
}

interface CacheEntry {
    info: RouteInfo;
    expiresAt: number;
}

const POSITIVE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const NEGATIVE_TTL_MS = 60 * 60 * 1000;       // 1h
const MAX_ENTRIES = 5000;
const ROUTESET_URL = 'https://api.adsb.lol/api/0/routeset';
const ROUTESET_BATCH_SIZE = 100;

const cache = new Map<string, CacheEntry>();

/** Tail-number (registration) callsign? Routes don't apply to these. */
function isTailNumberCallsign(cs: string): boolean {
    // Common patterns: N12345 (US), G-ABCD, D-ABCD, OY-KAL, etc.
    if (/^N[0-9]/.test(cs)) return true;
    if (/^[A-Z]{1,2}-[A-Z0-9]+$/.test(cs)) return true;
    return false;
}

function pruneIfNeeded() {
    if (cache.size <= MAX_ENTRIES) return;
    const now = Date.now();
    for (const [k, v] of cache) {
        if (v.expiresAt <= now) cache.delete(k);
    }
    if (cache.size <= MAX_ENTRIES) return;
    // Still over capacity: drop oldest insertions (Map preserves insertion order).
    const overflow = cache.size - MAX_ENTRIES;
    let i = 0;
    for (const k of cache.keys()) {
        if (i++ >= overflow) break;
        cache.delete(k);
    }
}

/** Read a cached route, or `undefined` if missing or expired. */
export function getCachedRoute(callsign: string): RouteInfo | undefined {
    const entry = cache.get(callsign);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
        cache.delete(callsign);
        return undefined;
    }
    return entry.info;
}

function setCached(callsign: string, info: RouteInfo, ttlMs: number) {
    cache.set(callsign, { info, expiresAt: Date.now() + ttlMs });
    pruneIfNeeded();
}

interface RoutesetPlane {
    callsign: string;
    lat: number;
    lng: number;
}

interface RoutesetAirport {
    iata?: string;
    icao?: string;
}

interface RoutesetResultEntry {
    callsign?: string;
    airline_code_icao?: string;
    airline_code_iata?: string;
    airport_codes?: string;
    _airport_codes_iata?: string;
    _airports?: RoutesetAirport[];
}

function parseRouteResult(entry: RoutesetResultEntry): RouteInfo | null {
    // "unknown" or missing means the route is not in the DB.
    const codes = entry.airport_codes;
    if (!codes || codes === 'unknown') return null;

    const info: RouteInfo = {};
    const airports = Array.isArray(entry._airports) ? entry._airports : [];
    const [origIcao, destIcao] = codes.split('-');
    if (origIcao) info.orig_icao = origIcao;
    if (destIcao) info.dest_icao = destIcao;

    if (airports.length >= 1 && airports[0]) {
        info.orig_iata = airports[0].iata || info.orig_iata;
        info.orig_icao = airports[0].icao || info.orig_icao;
    }
    if (airports.length >= 2 && airports[1]) {
        info.dest_iata = airports[1].iata || info.dest_iata;
        info.dest_icao = airports[1].icao || info.dest_icao;
    }

    if (!info.orig_iata && !info.dest_iata && !info.orig_icao && !info.dest_icao) {
        return null;
    }

    if (entry.airline_code_icao) info.airline_icao = entry.airline_code_icao;
    if (entry.airline_code_iata) info.airline_iata = entry.airline_code_iata;
    return info;
}

async function fetchRoutesetBatch(planes: RoutesetPlane[]): Promise<Map<string, RouteInfo | null>> {
    const result = new Map<string, RouteInfo | null>();
    if (planes.length === 0) return result;

    let res: Response;
    try {
        res = await fetch(ROUTESET_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ planes }),
            // Routes change rarely; allow Next.js to dedupe identical requests briefly.
            next: { revalidate: 60 },
        });
    } catch {
        // Network failure: leave the result empty so callers fall back gracefully.
        return result;
    }
    if (!res.ok) return result;

    let data: unknown;
    try {
        data = await res.json();
    } catch {
        return result;
    }
    // adsb.lol returns an array aligned with the input planes (or an object
    // with `routes`/`response` wrapping it in older versions). Be liberal.
    const list: RoutesetResultEntry[] = Array.isArray(data)
        ? data as RoutesetResultEntry[]
        : Array.isArray((data as { response?: unknown }).response)
            ? (data as { response: RoutesetResultEntry[] }).response
            : [];

    for (const entry of list) {
        const cs = entry.callsign?.trim();
        if (!cs) continue;
        result.set(cs, parseRouteResult(entry));
    }
    return result;
}

/**
 * Look up routes for the given callsigns, using the cache where possible and
 * falling back to a single batched POST to adsb.lol's routeset endpoint.
 *
 * `positions` provides a representative lat/lng per callsign (the routeset
 * endpoint uses this to disambiguate ambiguous callsigns). Any callsigns
 * without a position are still queried with `0,0`.
 *
 * Returns a map of callsign → RouteInfo for callsigns that have a known route.
 * Unknown / failed lookups are cached negatively but not returned.
 */
export async function lookupRoutes(
    positions: Map<string, { lat: number; lon: number }>,
): Promise<Map<string, RouteInfo>> {
    const out = new Map<string, RouteInfo>();
    const toFetch: RoutesetPlane[] = [];

    for (const [cs, pos] of positions) {
        if (!cs || isTailNumberCallsign(cs)) continue;
        const cached = getCachedRoute(cs);
        if (cached) {
            out.set(cs, cached);
            continue;
        }
        if (cache.has(cs)) {
            // Entry exists but has no useful info (negative cache, unexpired).
            continue;
        }
        toFetch.push({ callsign: cs, lat: pos.lat, lng: pos.lon });
    }

    for (let i = 0; i < toFetch.length; i += ROUTESET_BATCH_SIZE) {
        const batch = toFetch.slice(i, i + ROUTESET_BATCH_SIZE);
        const results = await fetchRoutesetBatch(batch);
        for (const plane of batch) {
            const info = results.get(plane.callsign) ?? null;
            if (info) {
                setCached(plane.callsign, info, POSITIVE_TTL_MS);
                out.set(plane.callsign, info);
            } else {
                setCached(plane.callsign, {}, NEGATIVE_TTL_MS);
            }
        }
    }

    return out;
}

/** Test-only helper. */
export function _clearRouteCacheForTests() {
    cache.clear();
}
