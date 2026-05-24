import { NextRequest, NextResponse } from 'next/server';
import { AIRPORT_COORDINATES } from '@/utils/airportCoordinates';
import type { AirportInfo } from '@/utils/airportInfo';

export type { AirportInfo };

// In-memory cache to reduce API calls
// Note: This cache is per-instance and will be lost on serverless cold starts
// or in multi-instance deployments. For production with high traffic, consider
// using a shared cache solution (e.g., Redis, Vercel KV) for better performance.
const airportCache = new Map<string, { data: AirportInfo | null; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

async function fetchFromAirportsApi(code: string): Promise<AirportInfo | null> {
    try {
        const response = await fetch(`https://airportsapi.com/api/airports/${code}`, {
            headers: {
                'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(5000), // 5 second timeout
        });

        if (response.ok) {
            const data = await response.json();
            
            return {
                iata: code,
                name: data.name || data.airport_name || '',
                city: data.city || data.municipality || '',
                country: data.country || data.country_code || '',
                lat: parseFloat(data.latitude || data.lat || 0),
                lon: parseFloat(data.longitude || data.lon || 0),
            };
        }
    } catch (error) {
        console.log(`airportsapi.com failed for ${code}:`, error instanceof Error ? error.message : 'Unknown error');
    }
    return null;
}

async function fetchFromApiNinjas(code: string): Promise<AirportInfo | null> {
    // API Ninjas requires an API key - skip if not configured
    const apiKey = process.env.API_NINJAS_KEY;
    if (!apiKey) {
        return null;
    }

    try {
        const response = await fetch(`https://api.api-ninjas.com/v1/airports?iata=${code}`, {
            headers: {
                'Accept': 'application/json',
                'X-Api-Key': apiKey,
            },
            signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
            const data = await response.json();
            if (data && data.length > 0) {
                const airport = data[0];
                return {
                    iata: code,
                    name: airport.name || '',
                    city: airport.city || '',
                    country: airport.country || '',
                    lat: parseFloat(airport.latitude || 0),
                    lon: parseFloat(airport.longitude || 0),
                };
            }
        }
    } catch (error) {
        console.log(`API Ninjas failed for ${code}:`, error instanceof Error ? error.message : 'Unknown error');
    }
    return null;
}

function getFromLocalDatabase(code: string): AirportInfo | null {
    const local = AIRPORT_COORDINATES[code];
    if (local) {
        return {
            iata: code,
            name: local.name,
            city: local.city,
            country: '', // Local database doesn't have country
            lat: local.lat,
            lon: local.lon,
        };
    }
    return null;
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ iataCode: string }> }
) {
    const { iataCode } = await params;
    
    if (!iataCode || iataCode.length !== 3) {
        return NextResponse.json(
            { error: 'Valid IATA code required (3 letters)' },
            { status: 400 }
        );
    }

    const code = iataCode.toUpperCase();

    // Check cache first
    const cached = airportCache.get(code);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        if (cached.data) {
            return NextResponse.json(cached.data);
        } else {
            return NextResponse.json(
                { error: 'Airport not found' },
                { status: 404 }
            );
        }
    }

    try {
        // Try multiple sources in parallel and use the first successful (non-null) response
        // This is faster than sequential calls while preserving fallback behavior
        let airportInfo: AirportInfo | null = null;

        // Build array of API promises to execute in parallel
        const apiPromises: Promise<AirportInfo | null>[] = [
            fetchFromAirportsApi(code)
        ];
        
        // Only include API Ninjas if configured
        if (process.env.API_NINJAS_KEY) {
            apiPromises.push(fetchFromApiNinjas(code));
        }
        
        // Execute all APIs in parallel and wait for all to complete
        const results = await Promise.allSettled(apiPromises);
        
        // Find the first successful (fulfilled and non-null) result
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value !== null) {
                airportInfo = result.value;
                break;
            }
        }
        
        // If no API succeeded, fallback to local database
        if (!airportInfo) {
            airportInfo = getFromLocalDatabase(code);
        }

        if (airportInfo) {
            // Cache the successful result
            airportCache.set(code, { data: airportInfo, timestamp: Date.now() });
            return NextResponse.json(airportInfo);
        }

        // Cache the failure to avoid repeated lookups
        airportCache.set(code, { data: null, timestamp: Date.now() });
        
        return NextResponse.json(
            { error: 'Airport not found' },
            { status: 404 }
        );

    } catch (error) {
        console.error(`Error fetching airport ${code}:`, error);
        
        // On error, try local database as last resort
        const localInfo = getFromLocalDatabase(code);
        if (localInfo) {
            return NextResponse.json(localInfo);
        }
        
        return NextResponse.json(
            { error: 'Failed to fetch airport information' },
            { status: 500 }
        );
    }
}
