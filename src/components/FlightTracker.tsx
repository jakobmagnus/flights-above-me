'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import FlightCard from './FlightCard';
import FlightDetail from './FlightDetail';
import ThemeToggle from './ThemeToggle';
import { Flight } from '@/types/flight';

// Dynamically import the map component to avoid SSR issues with Leaflet
const FlightMap = dynamic(() => import('./FlightMap'), {
    ssr: false,
    loading: () => (
        <div className="w-full h-full bg-gray-200 dark:bg-[#1e1e1e] flex items-center justify-center">
            <span className="text-gray-500">Loading map...</span>
        </div>
    )
});

const DEFAULT_LAT = 59.6519;
const DEFAULT_LON = 17.9186;

// Normalize and validate flight data
function normalizeValue(value: string | null | undefined): string {
    return value ? value.trim().toUpperCase() : '';
}

function isInvalidPlaceholder(value: string): boolean {
    return !value || value === 'N/A' || value === '---';
}

function isFlightValid(flight: Flight): boolean {
    const rawFlightNumber = flight.callsign || flight.flight_number || flight.flight;
    const rawOriginCode = flight.orig_iata || flight.origin_airport_iata;
    const rawDestCode = flight.dest_iata || flight.destination_airport_iata;

    const flightNumber = normalizeValue(rawFlightNumber);
    const originCode = normalizeValue(rawOriginCode);
    const destCode = normalizeValue(rawDestCode);
    
    // Filter out flights with N/A, ---, or missing essential fields
    return !(
        isInvalidPlaceholder(flightNumber) ||
        isInvalidPlaceholder(originCode) ||
        isInvalidPlaceholder(destCode)
    );
}

export default function FlightTracker() {
    const [userLat, setUserLat] = useState<number>(DEFAULT_LAT);
    const [userLon, setUserLon] = useState<number>(DEFAULT_LON);
    const [locationName, setLocationName] = useState<string>('Loading...');
    const [flights, setFlights] = useState<Flight[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
    const [mapBounds, setMapBounds] = useState<string | null>(null);
    
    // Use refs to persist cache state, fetch timing, and request status across renders
    const lastFetchTimeRef = useRef<number>(0);
    const cachedFlightsRef = useRef<{ bounds: string; flights: Flight[]; timestamp: number } | null>(null);
    const inFlightRef = useRef<boolean>(false);

    const handleBoundsChange = useCallback((bounds: string) => {
        setMapBounds(bounds);
    }, []);

    const handleFlightSelect = useCallback((flight: Flight) => {
        setSelectedFlight(flight);
    }, []);

    const handleCloseDetail = useCallback(() => {
        setSelectedFlight(null);
    }, []);

    // Keep selectedFlight in sync with the latest flights list
    useEffect(() => {
        if (!selectedFlight) {
            return;
        }

        // Normalize once before the loop
        const selectedId = normalizeValue(
            selectedFlight.callsign ||
            selectedFlight.flight_number ||
            selectedFlight.flight
        );

        if (!selectedId) {
            // If we can't identify the flight reliably, clear the selection
            setSelectedFlight(null);
            return;
        }

        const updatedFlight = flights.find((flight) => {
            // Normalize once per flight in the loop
            const currentId = normalizeValue(
                flight.callsign ||
                flight.flight_number ||
                flight.flight
            );
            return currentId === selectedId;
        });

        if (!updatedFlight) {
            // Flight no longer present in the list; clear selection
            setSelectedFlight(null);
        } else if (updatedFlight !== selectedFlight) {
            // Update to the fresh object from the latest flights array
            setSelectedFlight(updatedFlight);
        }
    }, [flights, selectedFlight]);

    const fetchLocationName = useCallback(async (lat: number, lon: number) => {
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`
            );
            const data = await response.json();

            const name = data.address?.city ||
                data.address?.town ||
                data.address?.village ||
                data.address?.suburb ||
                data.address?.municipality ||
                data.address?.county ||
                'Your Location';

            setLocationName(name);
        } catch (err) {
            console.error('Failed to get location name:', err);
            setLocationName('Your Location');
        }
    }, []);

    const fetchFlights = useCallback(async (bounds: string) => {
        const now = Date.now();
        const CACHE_DURATION = 15000; // 15 seconds client-side cache
        const MIN_REQUEST_INTERVAL = 10000; // Minimum 10 seconds between requests

        // Check if we have cached data for these bounds
        const cachedData = cachedFlightsRef.current;
        if (cachedData && cachedData.bounds === bounds) {
            const cacheAge = now - cachedData.timestamp;
            if (cacheAge < CACHE_DURATION) {
                // Use cached data without changing loading state
                setFlights(cachedData.flights);
                setError(null);
                return;
            }
        }

        // Prevent concurrent requests
        if (inFlightRef.current) {
            if (process.env.NODE_ENV === 'development') {
                console.debug('Request already in flight, skipping');
            }
            return;
        }

        // Rate limiting: prevent too frequent requests
        const timeSinceLastFetch = now - lastFetchTimeRef.current;
        if (timeSinceLastFetch < MIN_REQUEST_INTERVAL) {
            if (process.env.NODE_ENV === 'development') {
                console.debug('Rate limit: waiting before next request');
            }
            // Use cached data for the same bounds if available, without changing loading state
            if (cachedData && cachedData.bounds === bounds) {
                setFlights(cachedData.flights);
                setError(null);
            }
            return;
        }

        inFlightRef.current = true;
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`/api/flights?bounds=${bounds}`);

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            const json = await response.json();

            // Robust data parsing
            let flightList: Flight[] = [];
            if (Array.isArray(json)) {
                flightList = json;
            } else if (json.data && Array.isArray(json.data)) {
                flightList = json.data;
            } else if (typeof json === 'object') {
                flightList = Object.values(json).filter((item): item is Flight =>
                    item !== null && typeof item === 'object' && ('lat' in item || 'latitude' in item || 'flight_id' in item)
                );
            }

            // Filter out flights with incomplete data
            const validFlights = flightList.filter(isFlightValid);

            setFlights(validFlights);
            
            // Update cache with fresh timestamp after successful fetch
            const fetchCompletedTime = Date.now();
            cachedFlightsRef.current = {
                bounds,
                flights: validFlights,
                timestamp: fetchCompletedTime
            };
            
            // Update last fetch time only after successful response
            lastFetchTimeRef.current = fetchCompletedTime;
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Failed to load flights');
        } finally {
            inFlightRef.current = false;
            setLoading(false);
        }
    }, []);

    const updateLocation = useCallback(() => {
        setLocationName('Updating...');

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;
                    setUserLat(lat);
                    setUserLon(lon);
                    fetchLocationName(lat, lon);
                },
                () => {
                    // Fallback to default
                    setUserLat(DEFAULT_LAT);
                    setUserLon(DEFAULT_LON);
                    setLocationName('Arlanda (default)');
                }
            );
        } else {
            setUserLat(DEFAULT_LAT);
            setUserLon(DEFAULT_LON);
            setLocationName('Arlanda (default)');
        }
    }, [fetchLocationName]);

    // Initial load
    useEffect(() => {
        updateLocation();
    }, [updateLocation]);

    // Fetch flights when map bounds change
    useEffect(() => {
        if (mapBounds) {
            fetchFlights(mapBounds);
        }
    }, [mapBounds, fetchFlights]);

    return (
        <div className="w-full h-screen grid grid-rows-[55vh_1fr] md:grid-rows-1 md:grid-cols-[1fr_380px] overflow-hidden">
            {/* Map View */}
            <div className="w-full h-full min-h-[320px] bg-gray-200 dark:bg-[#1e1e1e] relative z-0 md:order-1">
                <FlightMap 
                    userLat={userLat} 
                    userLon={userLon} 
                    flights={flights}
                    onFlightSelect={handleFlightSelect}
                    selectedFlight={selectedFlight}
                    onBoundsChange={handleBoundsChange}
                />
            </div>

            {/* Sidebar */}
            <div className={`overflow-y-auto max-h-[calc(100vh-55vh)] md:max-h-screen md:h-screen md:w-[380px] md:border-l md:border-gray-300 md:dark:border-gray-800 md:order-2 ${selectedFlight ? 'bg-white dark:bg-[#111]' : 'bg-gray-100 dark:bg-black p-5'}`}>
                {/* Header - only show when no flight selected */}
                {!selectedFlight && (
                    <div className="flex justify-between items-center mb-5 gap-3">
                        <h1 className="text-2xl md:text-[28px] font-bold text-gray-900 dark:text-white truncate">{locationName}</h1>
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={updateLocation}
                                className="flex items-center gap-2 bg-transparent border border-gray-300 dark:border-gray-700 rounded-full px-4 py-2 text-gray-900 dark:text-white text-sm hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
                            >
                                <svg className="w-3.5 h-3.5 text-orange-500" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
                                </svg>
                                <span className="hidden sm:inline">Update location</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Flight Detail View */}
                {selectedFlight && (
                    <FlightDetail flight={selectedFlight} onClose={handleCloseDetail} />
                )}

                {/* Flight List - only show when no flight selected */}
                {!selectedFlight && (
                    <div className="flex flex-col gap-3">
                        {loading && (
                            <div className="text-center text-gray-500 py-10">
                                Locating planes above you...
                            </div>
                        )}

                        {error && (
                            <div className="text-center text-gray-500 py-10">
                                Failed to load flights: {error}
                            </div>
                        )}

                        {!loading && !error && flights.length === 0 && (
                            <div className="text-center text-gray-500 py-10">
                                No flights found in this area.
                            </div>
                        )}

                        {!loading && !error && flights.map((flight, index) => (
                            <FlightCard 
                                key={flight.flight_id || index} 
                                flight={flight}
                                onClick={() => handleFlightSelect(flight)}
                            />
                        ))}

                        {/* Theme toggle below the card stack */}
                        <div className="flex justify-center my-2">
                            <ThemeToggle />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
