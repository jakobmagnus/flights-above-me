import { AdsbLolProvider } from './adsbLolProvider';
import { FlightProvider } from './types';

export { UpstreamError, parseBoundsString, isInsideBounds } from './types';
export type { FlightProvider, ProviderId, BoundsBox } from './types';
export { recordTrailPositions, getCachedTrail } from './trailCache';

/**
 * Return the flight-data provider. The app currently uses adsb.lol as the
 * sole upstream source; no API key is required.
 */
export function getFlightProvider(): FlightProvider {
    return new AdsbLolProvider();
}
