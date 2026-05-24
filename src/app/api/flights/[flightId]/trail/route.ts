import { NextRequest, NextResponse } from 'next/server';
import {
    getCachedTrail,
    getFlightProvider,
    UpstreamError,
} from '@/utils/providers';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ flightId: string }> }
) {
    const { flightId } = await params;

    if (!flightId) {
        return NextResponse.json({ error: 'Flight ID is required' }, { status: 400 });
    }

    const provider = getFlightProvider();

    try {
        const trail = await provider.getFlightTrail(flightId);
        if (trail) {
            return NextResponse.json(trail);
        }
    } catch (error) {
        const status = error instanceof UpstreamError ? error.status : 500;
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Flight trail provider (${provider.id}) error:`, message);
        // Don't fail outright if a cached fallback is available below.
        if (provider.supportsTrails) {
            return NextResponse.json(
                { error: error instanceof UpstreamError ? `Upstream API Error: ${status}` : message },
                { status },
            );
        }
    }

    // Providers without native trail support (adsb.lol, OpenSky) fall back to
    // the in-memory positional cache populated from successive bounds polls.
    const cached = getCachedTrail(flightId);
    if (cached) {
        return NextResponse.json(cached);
    }

    // No trail available yet. Return an empty track set so the UI can
    // gracefully render the live position without a polyline.
    return NextResponse.json({ fr24_id: flightId, tracks: [] });
}
