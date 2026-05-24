import { Flight, FlightTrackResponse } from '@/types/flight';
import type { AirportInfo } from '@/utils/airportInfo';
import { lookupAirlineFromCallsign } from './airlineCodes';
import {
    BoundsBox,
    FlightProvider,
    ProviderId,
    UpstreamError,
} from './types';

/**
 * Tuple shape returned by OpenSky's /states/all endpoint. Indices are
 * documented at https://openskynetwork.github.io/opensky-api/rest.html
 */
type OpenSkyState = [
    string,            // 0  icao24 (hex)
    string | null,     // 1  callsign
    string | null,     // 2  origin country
    number | null,     // 3  time_position (epoch s)
    number | null,     // 4  last_contact
    number | null,     // 5  longitude
    number | null,     // 6  latitude
    number | null,     // 7  baro_altitude (m)
    boolean,           // 8  on_ground
    number | null,     // 9  velocity (m/s)
    number | null,     // 10 true_track (deg)
    number | null,     // 11 vertical_rate (m/s)
    number[] | null,   // 12 sensors
    number | null,     // 13 geo_altitude (m)
    string | null,     // 14 squawk
    boolean,           // 15 spi
    number,            // 16 position_source
];

interface OpenSkyStatesResponse {
    time: number;
    states: OpenSkyState[] | null;
}

const METERS_TO_FEET = 3.28084;
const MPS_TO_KNOTS = 1.94384;
const MPS_TO_FPM = 196.85; // m/s -> ft/min

/**
 * Free flight-data provider backed by the OpenSky Network REST API.
 * Anonymous access is supported but rate-limited; supplying
 * `OPENSKY_USERNAME` + `OPENSKY_PASSWORD` (legacy Basic auth) raises limits.
 */
export class OpenSkyProvider implements FlightProvider {
    readonly id: ProviderId = 'opensky';
    readonly supportsTrails = false;

    constructor(
        private readonly username?: string,
        private readonly password?: string,
    ) {}

    private headers(): HeadersInit {
        const h: Record<string, string> = { 'Accept': 'application/json' };
        if (this.username && this.password) {
            const token = Buffer.from(`${this.username}:${this.password}`).toString('base64');
            h['Authorization'] = `Basic ${token}`;
        }
        return h;
    }

    async getFlightsInBounds(bounds: BoundsBox): Promise<Flight[]> {
        // OpenSky's bounding-box parameters; antimeridian-crossing boxes are
        // not supported by the API, so split into two queries when needed.
        const boxes: BoundsBox[] = bounds.west <= bounds.east
            ? [bounds]
            : [
                { ...bounds, east: 180 },
                { ...bounds, west: -180 },
            ];

        const results = await Promise.all(boxes.map(b => this.fetchBox(b)));
        return results.flat();
    }

    private async fetchBox(bounds: BoundsBox): Promise<Flight[]> {
        const params = new URLSearchParams({
            lamin: bounds.south.toString(),
            lomin: bounds.west.toString(),
            lamax: bounds.north.toString(),
            lomax: bounds.east.toString(),
        });
        const url = `https://opensky-network.org/api/states/all?${params.toString()}`;

        const res = await fetch(url, {
            method: 'GET',
            headers: this.headers(),
            next: { revalidate: 30 },
        });
        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new UpstreamError(`OpenSky error: ${res.status} - ${errText}`, res.status);
        }

        const data = (await res.json()) as OpenSkyStatesResponse;
        const states = data.states ?? [];
        const nowIso = new Date(data.time * 1000).toISOString();
        return states.map(s => mapStateToFlight(s, nowIso));
    }

    async getFlightTrail(): Promise<FlightTrackResponse | null> {
        return null;
    }

    async getAirport(): Promise<AirportInfo | null> {
        return null;
    }
}

function mapStateToFlight(s: OpenSkyState, nowIso: string): Flight {
    const callsign = s[1]?.trim() || undefined;
    const airline = lookupAirlineFromCallsign(callsign);
    const lat = s[6] ?? undefined;
    const lon = s[5] ?? undefined;
    const baroAltM = s[7];
    const geoAltM = s[13];
    const altM = baroAltM ?? geoAltM;
    const altFt = altM != null ? Math.round(altM * METERS_TO_FEET) : undefined;
    const velocityKt = s[9] != null ? Math.round(s[9] * MPS_TO_KNOTS) : undefined;
    const vRateFpm = s[11] != null ? Math.round(s[11] * MPS_TO_FPM) : undefined;
    const track = s[10] ?? undefined;
    const hex = s[0];
    const tsSec = s[4] ?? s[3];
    const timestamp = tsSec != null ? new Date(tsSec * 1000).toISOString() : nowIso;
    const source = sourceLabel(s[16]);

    return {
        fr24_id: hex,
        flight_id: hex,
        hex,
        callsign,
        flight: callsign,
        flight_number: callsign,
        lat,
        lon,
        latitude: lat,
        longitude: lon,
        alt: altFt,
        altitude: altFt,
        gspeed: velocityKt,
        vspeed: vRateFpm,
        track,
        heading: track,
        squawk: s[14] ?? undefined,
        operating_as: airline?.icao,
        airline_icao: airline?.icao,
        airline_iata: airline?.iata,
        timestamp,
        source,
    };
}

function sourceLabel(code: number): string {
    switch (code) {
        case 0: return 'ADSB';
        case 1: return 'ASTERIX';
        case 2: return 'MLAT';
        case 3: return 'FLARM';
        default: return 'UNKNOWN';
    }
}
