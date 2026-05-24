import { Flight, FlightTrackResponse } from '@/types/flight';
import type { AirportInfo } from '@/utils/airportInfo';
import { transformFlightData } from '@/utils/flightDataTransform';
import { BoundsBox, FlightProvider, ProviderId, UpstreamError } from './types';

/**
 * Flightradar24 provider. Wraps the commercial FR24 API and preserves the
 * existing behavior previously inlined in the route handlers. Requires a
 * `FLIGHTRADAR24_API_KEY` environment variable.
 */
export class Fr24Provider implements FlightProvider {
    readonly id: ProviderId = 'fr24';
    readonly supportsTrails = true;

    constructor(private readonly apiKey: string) {}

    private headers(): HeadersInit {
        return {
            'Accept': 'application/json',
            'Accept-Version': 'v1',
            'Authorization': `Bearer ${this.apiKey}`,
        };
    }

    async getFlightsInBounds(bounds: BoundsBox): Promise<Flight[]> {
        const { north, south, west, east } = bounds;
        const boundsParam = `${north},${south},${west},${east}`;
        const url = `https://fr24api.flightradar24.com/api/live/flight-positions/full?bounds=${boundsParam}`;

        const res = await fetch(url, {
            method: 'GET',
            headers: this.headers(),
            next: { revalidate: 30 },
        });
        if (!res.ok) {
            const errText = await res.text();
            throw new UpstreamError(`FR24 API Error: ${res.status} - ${errText}`, res.status);
        }
        const data = await res.json();
        // FR24 returns either an array of flights or an object with a `data` array.
        const flights: Flight[] = Array.isArray(data)
            ? data
            : Array.isArray((data as { data?: Flight[] }).data)
                ? (data as { data: Flight[] }).data
                : [];
        return transformFlightData(flights);
    }

    async getFlightTrail(flightId: string): Promise<FlightTrackResponse | null> {
        const url = `https://fr24api.flightradar24.com/api/flight-tracks?flight_id=${encodeURIComponent(flightId)}`;
        const res = await fetch(url, {
            method: 'GET',
            headers: this.headers(),
            next: { revalidate: 10 },
        });
        if (!res.ok) {
            const errText = await res.text();
            throw new UpstreamError(`FR24 API Error: ${res.status} - ${errText}`, res.status);
        }
        const data = await res.json();
        // FR24 returns an array of {fr24_id, tracks}; surface the first entry.
        if (Array.isArray(data) && data.length > 0) {
            return data[0] as FlightTrackResponse;
        }
        return data as FlightTrackResponse;
    }

    // FR24 doesn't have a free airport lookup we use; the airport route has
    // its own multi-source resolution. Returning null keeps that flow.
    async getAirport(): Promise<AirportInfo | null> {
        return null;
    }
}

