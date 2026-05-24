import { NextRequest, NextResponse } from 'next/server';
import { mockFlights } from '@/utils/mockFlightData';
import { transformFlightData } from '@/utils/flightDataTransform';
import {
    getFlightProvider,
    parseBoundsString,
    recordTrailPositions,
    UpstreamError,
} from '@/utils/providers';

// Helper to return mock flights with refreshed timestamps. Mock data uses the
// FR24 encoding for vertical speed, so we run it through transformFlightData.
function getMockFlights() {
    const currentTime = new Date().toISOString();
    const flightsWithTimestamp = mockFlights.map(flight => ({
        ...flight,
        timestamp: currentTime,
    }));
    return transformFlightData(flightsWithTimestamp);
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const bounds = searchParams.get('bounds');

    if (!bounds) {
        return NextResponse.json({ error: 'Bounds parameter is required' }, { status: 400 });
    }

    const parsedBounds = parseBoundsString(bounds);
    if (!parsedBounds) {
        return NextResponse.json({ error: 'Invalid bounds format. Expected "north,south,west,east".' }, { status: 400 });
    }

    const isDevelopment = process.env.NODE_ENV === 'development';
    const mockDataExplicitlyEnabled = process.env.USE_MOCK_FLIGHT_DATA === 'true';
    const mockDataExplicitlyDisabled = process.env.USE_MOCK_FLIGHT_DATA === 'false';
    const useMockData = mockDataExplicitlyEnabled || (isDevelopment && !mockDataExplicitlyDisabled);

    // Explicit opt-in to mock data short-circuits provider resolution.
    if (mockDataExplicitlyEnabled) {
        return NextResponse.json(getMockFlights());
    }

    const provider = getFlightProvider();

    try {
        const flights = await provider.getFlightsInBounds(parsedBounds);
        // Build up an in-memory trail history since adsb.lol has no native
        // trail endpoint.
        if (!provider.supportsTrails) {
            recordTrailPositions(flights);
        }
        return NextResponse.json(flights);
    } catch (error) {
        const status = error instanceof UpstreamError ? error.status : 500;
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Flight provider (${provider.id}) error:`, message);

        // In development, fall back to mock data on any upstream failure to
        // keep the UI usable without network/API access.
        if (useMockData) {
            console.log('📍 Falling back to mock flight data due to upstream error');
            return NextResponse.json(getMockFlights());
        }
        return NextResponse.json(
            { error: error instanceof UpstreamError ? `Upstream API Error: ${status}` : message },
            { status },
        );
    }
}
