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
const ROUTESET_TIMEOUT_MS = 4500;

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
    /** ICAO airline designator, e.g. "SAS". */
    airline_code?: string;
    /** "ICAO-ICAO" airport pair, or "unknown". */
    airport_codes?: string;
    /** "IATA-IATA" airport pair (server-derived), or "unknown". */
    _airport_codes_iata?: string;
    /** Resolved airport records, in route order. */
    _airports?: RoutesetAirport[];
    plausible?: boolean | number;
}

function parseRouteResult(entry: RoutesetResultEntry): RouteInfo | null {
    // "unknown" or missing means the route is not in the DB.
    const codes = entry.airport_codes;
    if (!codes || codes === 'unknown') return null;

    const info: RouteInfo = {};

    // Primary source: ICAO codes from `airport_codes` ("ICAO-ICAO").
    const [origIcao, destIcao] = codes.split('-');
    if (origIcao) info.orig_icao = origIcao;
    if (destIcao) info.dest_icao = destIcao;

    // IATA codes from the server-derived `_airport_codes_iata` ("IATA-IATA"),
    // used as a fallback when `_airports` records are unavailable.
    const iataCodes = entry._airport_codes_iata;
    if (iataCodes && iataCodes !== 'unknown') {
        const [origIata, destIata] = iataCodes.split('-');
        // Only treat as IATA if it actually differs from the ICAO form (3 chars).
        if (origIata && origIata.length === 3) info.orig_iata = origIata;
        if (destIata && destIata.length === 3) info.dest_iata = destIata;
    }

    // Most reliable: the resolved airport records (have both iata + icao).
    const airports = Array.isArray(entry._airports) ? entry._airports : [];
    if (airports.length >= 1 && airports[0]) {
        info.orig_iata = airports[0].iata || info.orig_iata;
        info.orig_icao = airports[0].icao || info.orig_icao;
    }
    if (airports.length >= 2 && airports[airports.length - 1]) {
        const last = airports[airports.length - 1];
        info.dest_iata = last.iata || info.dest_iata;
        info.dest_icao = last.icao || info.dest_icao;
    }

    if (!info.orig_iata && !info.dest_iata && !info.orig_icao && !info.dest_icao) {
        return null;
    }

    if (entry.airline_code && entry.airline_code !== 'unknown') {
        info.airline_icao = entry.airline_code;
    }
    return info;
}

async function fetchRoutesetBatch(planes: RoutesetPlane[]): Promise<Map<string, RouteInfo | null>> {
    const result = new Map<string, RouteInfo | null>();
    if (planes.length === 0) return result;

    // Bound the request so a slow routeset response never stalls /api/flights.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ROUTESET_TIMEOUT_MS);

    let res: Response;
    try {
        res = await fetch(ROUTESET_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'flights-above-me/1.0 (+https://github.com/jakobmagnus/flights-above-me)',
            },
            body: JSON.stringify({ planes }),
            // We maintain our own route cache, so don't let the framework cache
            // this POST (POST + Next.js data cache is unsupported and can error).
            cache: 'no-store',
            signal: controller.signal,
        });
    } catch (err) {
        // Network failure / timeout: leave the result empty so callers fall
        // back gracefully without failing the whole flights request.
        console.warn('[routeCache] routeset request failed:', err instanceof Error ? err.message : err);
        return result;
    } finally {
        clearTimeout(timeout);
    }
    if (!res.ok) {
        console.warn(`[routeCache] routeset responded ${res.status}`);
        return result;
    }

    let data: unknown;
    try {
        data = await res.json();
    } catch {
        return result;
    }
    // adsb.lol returns a bare JSON array (one entry per requested plane). Some
    // older/proxied deployments wrap it in `{ response: [...] }`; accept both.
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
