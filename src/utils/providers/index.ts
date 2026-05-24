import { AdsbLolProvider } from './adsbLolProvider';
import { Fr24Provider } from './fr24Provider';
import { OpenSkyProvider } from './openSkyProvider';
import { FlightProvider, ProviderId } from './types';

export { UpstreamError, parseBoundsString, isInsideBounds } from './types';
export type { FlightProvider, ProviderId, BoundsBox } from './types';
export { recordTrailPositions, getCachedTrail } from './trailCache';

/**
 * Resolve which flight-data provider to use based on environment configuration.
 *
 * Precedence:
 * 1. Explicit `FLIGHT_DATA_PROVIDER` env var (`fr24` | `adsblol` | `opensky`).
 * 2. If a `FLIGHTRADAR24_API_KEY` is configured, default to `fr24`.
 * 3. Otherwise default to `adsblol` so the app works for free out of the box.
 *
 * If `fr24` is requested but no API key is configured, falls back to
 * `adsblol` with a console warning.
 */
export function getFlightProvider(): FlightProvider {
    const explicit = (process.env.FLIGHT_DATA_PROVIDER || '').trim().toLowerCase();
    const apiKey = process.env.FLIGHTRADAR24_API_KEY;

    let id: ProviderId;
    if (explicit === 'fr24' || explicit === 'adsblol' || explicit === 'opensky') {
        id = explicit;
    } else {
        id = apiKey ? 'fr24' : 'adsblol';
    }

    if (id === 'fr24') {
        if (!apiKey) {
            console.warn('⚠️  FLIGHT_DATA_PROVIDER=fr24 but FLIGHTRADAR24_API_KEY is not set. Falling back to adsb.lol.');
            return new AdsbLolProvider();
        }
        return new Fr24Provider(apiKey);
    }
    if (id === 'opensky') {
        return new OpenSkyProvider(
            process.env.OPENSKY_USERNAME,
            process.env.OPENSKY_PASSWORD,
        );
    }
    return new AdsbLolProvider();
}
