import { Flight, FlightTrackResponse } from '@/types/flight';
import type { AirportInfo } from '@/utils/airportInfo';

/**
 * Identifier for the flight-data provider in use.
 * - `fr24`: Flightradar24 commercial API (requires FLIGHTRADAR24_API_KEY)
 * - `adsblol`: Free community ADS-B aggregator (api.adsb.lol)
 * - `opensky`: Free OpenSky Network REST API
 */
export type ProviderId = 'fr24' | 'adsblol' | 'opensky';

/**
 * Bounding box in the format used throughout the app: "north,south,west,east".
 */
export interface BoundsBox {
    north: number;
    south: number;
    west: number;
    east: number;
}

/**
 * Abstraction over upstream flight-data sources. Implementations may delegate
 * to commercial APIs (Flightradar24) or free community datasets (adsb.lol,
 * OpenSky). The route handlers depend only on this interface.
 */
export interface FlightProvider {
    /** Stable identifier for logging and feature detection. */
    readonly id: ProviderId;

    /** Whether this provider can return historical trails for a flight. */
    readonly supportsTrails: boolean;

    /** Fetch live flights inside the given bounding box. */
    getFlightsInBounds(bounds: BoundsBox): Promise<Flight[]>;

    /**
     * Fetch the historical trail for a flight, or `null` if the provider does
     * not support trails (callers should fall back to a local cache).
     */
    getFlightTrail(flightId: string): Promise<FlightTrackResponse | null>;

    /** Resolve airport info by IATA code, or `null` if not found. */
    getAirport(iataCode: string): Promise<AirportInfo | null>;
}

/**
 * Error wrapper used by providers to surface upstream HTTP status codes so the
 * route handler can mirror them back to the client.
 */
export class UpstreamError extends Error {
    constructor(message: string, public readonly status: number) {
        super(message);
        this.name = 'UpstreamError';
    }
}

/**
 * Parse a "north,south,west,east" bounds string into a {@link BoundsBox}.
 * Returns `null` if the string is malformed.
 */
export function parseBoundsString(bounds: string): BoundsBox | null {
    const parts = bounds.split(',').map(Number);
    if (parts.length !== 4 || parts.some(n => !Number.isFinite(n))) {
        return null;
    }
    const [north, south, west, east] = parts;
    return { north, south, west, east };
}

/**
 * Check whether a lat/lon point lies inside a bounding box, correctly handling
 * boxes that cross the antimeridian (where west > east).
 */
export function isInsideBounds(lat: number, lon: number, bounds: BoundsBox): boolean {
    if (lat < bounds.south || lat > bounds.north) return false;
    if (bounds.west <= bounds.east) {
        return lon >= bounds.west && lon <= bounds.east;
    }
    // Crosses the antimeridian
    return lon >= bounds.west || lon <= bounds.east;
}
