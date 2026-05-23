'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Flight, FlightTrackPoint } from '@/types/flight';
import { useTheme } from './ThemeProvider';

interface FlightMapProps {
    userLat: number;
    userLon: number;
    flights: Flight[];
    onFlightSelect?: (flight: Flight) => void;
    selectedFlight?: Flight | null;
    onBoundsChange?: (bounds: string) => void;
}

const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const LIGHT_TILES = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

export default function FlightMap({ userLat, userLon, flights, onFlightSelect, selectedFlight, onBoundsChange }: FlightMapProps) {
    const mapRef = useRef<L.Map | null>(null);
    const tileLayerRef = useRef<L.TileLayer | null>(null);
    const markersRef = useRef<Map<string, L.Marker>>(new Map()); // Changed to Map for efficient lookups
    const trailRef = useRef<L.Polyline | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [flightTrail, setFlightTrail] = useState<FlightTrackPoint[]>([]);
    const onBoundsChangeRef = useRef(onBoundsChange);
    const { resolvedTheme } = useTheme();
    const resolvedThemeRef = useRef(resolvedTheme);

    // Keep resolvedTheme ref updated so the init effect can read the latest value
    // without depending on it (which would otherwise tear down and rebuild the map).
    useEffect(() => {
        resolvedThemeRef.current = resolvedTheme;
    }, [resolvedTheme]);

    // Keep the ref updated
    useEffect(() => {
        onBoundsChangeRef.current = onBoundsChange;
    }, [onBoundsChange]);

    // Fetch flight trail when selectedFlight changes
    useEffect(() => {
        // Use fr24_id first, fall back to flight_id
        const flightId = selectedFlight?.fr24_id || selectedFlight?.flight_id;
        
        if (!flightId) {
            console.log('No flight ID available for trail. Flight data:', selectedFlight);
            setFlightTrail([]);
            return;
        }

        console.log('Fetching trail for flight:', flightId);

        // Create an AbortController to cancel the fetch if the selected flight changes
        const abortController = new AbortController();

        const fetchTrail = async () => {
            try {
                const response = await fetch(`/api/flights/${flightId}/trail`, {
                    signal: abortController.signal
                });
                console.log('Trail API response status:', response.status);
                
                if (response.ok) {
                    const data = await response.json();
                    console.log('Trail data received:', data);
                    
                    // Handle both array response [{tracks: [...]}] and object response {tracks: [...]}
                    const flightData = Array.isArray(data) ? data[0] : data;
                    let tracks = flightData?.tracks;
                    
                    if (tracks && Array.isArray(tracks) && tracks.length > 0) {
                        // Filter to only show past track points (before current position)
                        const currentTimestamp = selectedFlight?.timestamp;
                        if (currentTimestamp) {
                            const currentTime = new Date(currentTimestamp).getTime();
                            tracks = tracks.filter((point: FlightTrackPoint) => {
                                const pointTime = new Date(point.timestamp).getTime();
                                return pointTime <= currentTime;
                            });
                        }
                        
                        console.log('Setting trail with', tracks.length, 'points');
                        setFlightTrail(tracks);
                    } else {
                        console.log('No tracks in response. flightData:', flightData);
                        setFlightTrail([]);
                    }
                } else {
                    console.error('Trail API error:', response.status);
                    setFlightTrail([]);
                }
            } catch (error) {
                // Ignore AbortError as it's expected when the effect is cleaned up
                if (error instanceof Error && error.name === 'AbortError') {
                    console.log('Fetch aborted for flight:', flightId);
                    return;
                }
                console.error('Failed to fetch flight trail:', error);
                setFlightTrail([]);
            }
        };

        fetchTrail();

        // Cleanup function to abort the fetch if the selected flight changes
        return () => {
            abortController.abort();
        };
    }, [selectedFlight?.fr24_id, selectedFlight?.flight_id, selectedFlight]);

    // Update trail on map when flightTrail changes
    useEffect(() => {
        const map = mapRef.current;
        console.log('Trail effect - map exists:', !!map, 'trail points:', flightTrail.length);
        
        if (!map) return;

        // Remove existing trail
        if (trailRef.current) {
            map.removeLayer(trailRef.current);
            trailRef.current = null;
        }

        // Add new trail if we have track points
        if (flightTrail.length > 1) {
            console.log('Drawing trail with', flightTrail.length, 'points');
            const latlngs: L.LatLngExpression[] = flightTrail.map(point => [point.lat, point.lon]);
            console.log('First point:', latlngs[0], 'Last point:', latlngs[latlngs.length - 1]);
            
            const trail = L.polyline(latlngs, {
                color: '#facc15',
                weight: 3,
                opacity: 0.8,
                dashArray: '8, 4',
                lineCap: 'round',
                lineJoin: 'round'
            }).addTo(map);

            trailRef.current = trail;
        }
    }, [flightTrail]);

    // Initialize map
    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;

        const map = L.map(containerRef.current, {
            center: [userLat, userLon],
            zoom: 10,
            zoomControl: true
        });

        const tileLayer = L.tileLayer(resolvedThemeRef.current === 'light' ? LIGHT_TILES : DARK_TILES, {
            attribution: '&copy; OpenStreetMap &copy; CARTO',
            maxZoom: 19
        }).addTo(map);
        tileLayerRef.current = tileLayer;

        L.circleMarker([userLat, userLon], {
            color: '#3388ff',
            radius: 8
        }).addTo(map).bindPopup("You");

        mapRef.current = map;

        // Emit bounds on map move/zoom
        const emitBounds = () => {
            const bounds = map.getBounds();
            const boundsStr = `${bounds.getNorth()},${bounds.getSouth()},${bounds.getWest()},${bounds.getEast()}`;
            if (onBoundsChangeRef.current) {
                onBoundsChangeRef.current(boundsStr);
            }
        };

        // Emit initial bounds after map is ready
        setTimeout(() => emitBounds(), 100);

        // Listen for map movement
        map.on('moveend', emitBounds);
        map.on('zoomend', emitBounds);

        // Handle resize with debounced timeout
        let resizeTimeout: NodeJS.Timeout | null = null;
        const handleResize = () => {
            if (resizeTimeout) {
                clearTimeout(resizeTimeout);
            }
            resizeTimeout = setTimeout(() => {
                if (mapRef.current) {
                    mapRef.current.invalidateSize(true);
                }
            }, 150);
        };

        window.addEventListener('resize', handleResize);
        
        // Single initial invalidate after a short delay to ensure DOM is ready
        const initTimeout = setTimeout(() => {
            if (mapRef.current) {
                mapRef.current.invalidateSize(true);
            }
        }, 150);

        return () => {
            window.removeEventListener('resize', handleResize);
            if (resizeTimeout) {
                clearTimeout(resizeTimeout);
            }
            clearTimeout(initTimeout);
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, [userLat, userLon]);

    // Update view when location changes
    useEffect(() => {
        if (mapRef.current) {
            mapRef.current.setView([userLat, userLon], 10);
        }
    }, [userLat, userLon]);

    // Swap tile layer URL when the resolved theme changes
    useEffect(() => {
        if (tileLayerRef.current) {
            tileLayerRef.current.setUrl(resolvedTheme === 'light' ? LIGHT_TILES : DARK_TILES);
        }
    }, [resolvedTheme]);

    // Update markers when flights change - optimized with delta updates
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        // Helper function to get unique flight identifier
        const getFlightId = (flight: Flight): string => {
            return flight.flight_id || flight.callsign || flight.flight_number || flight.flight || '';
        };

        // Helper function to create flight icon
        const createFlightIcon = (heading: number, isSelected: boolean) => {
            const color = isSelected ? '#facc15' : '#f97316';
            const size = isSelected ? 28 : 20;
            const iconSize = isSelected ? 32 : 24;
            
            const htmlIcon = `
                <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; transform: rotate(${heading}deg);">
                    <svg style="width: ${size}px; height: ${size}px; color: ${color}; filter: drop-shadow(0 0 ${isSelected ? '6px rgba(250, 204, 21, 0.8)' : '3px rgba(0,0,0,0.8)'});" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 00-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
                    </svg>
                </div>`;
            
            return L.divIcon({
                html: htmlIcon,
                className: 'plane-marker',
                iconSize: [iconSize, iconSize],
                iconAnchor: [iconSize / 2, iconSize / 2]
            });
        };

        // Get selected flight ID for comparison
        const selectedFlightId = selectedFlight?.flight_id;
        const selectedCallsign = selectedFlight?.callsign || selectedFlight?.flight_number || selectedFlight?.flight;

        // Create a set of current flight IDs for efficient lookup
        const currentFlightIds = new Set<string>();
        const flightMap = new Map<string, Flight>();
        
        flights.forEach(flight => {
            const flightId = getFlightId(flight);
            if (flightId) {
                currentFlightIds.add(flightId);
                flightMap.set(flightId, flight);
            }
        });

        // Remove markers for flights that are no longer present
        const markersToRemove: string[] = [];
        markersRef.current.forEach((marker, flightId) => {
            if (!currentFlightIds.has(flightId)) {
                map.removeLayer(marker);
                markersToRemove.push(flightId);
            }
        });
        markersToRemove.forEach(id => markersRef.current.delete(id));

        // Add or update markers for current flights
        flights.forEach(flight => {
            const lat = flight.lat ?? flight.latitude;
            const lon = flight.lon ?? flight.longitude;
            const flightId = getFlightId(flight);
            
            if (!flightId || lat == null || lon == null) return;

            const heading = flight.track || flight.heading || 0;
            const flightNum = flight.flight || flight.callsign || flight.flight_number || 'Flight';
            const orig = flight.orig_iata || flight.origin_airport_iata || '?';
            const dest = flight.dest_iata || flight.destination_airport_iata || '?';

            // Check if this flight is selected
            const isSelected = Boolean(
                (selectedFlightId && flight.flight_id === selectedFlightId) ||
                (selectedCallsign && (flight.callsign === selectedCallsign || flight.flight_number === selectedCallsign || flight.flight === selectedCallsign))
            );

            const existingMarker = markersRef.current.get(flightId);
            
            if (existingMarker) {
                // Update existing marker position and appearance
                existingMarker.setLatLng([lat, lon]);
                existingMarker.setIcon(createFlightIcon(heading, isSelected));
                existingMarker.setPopupContent(`<b>${flightNum}</b><br>${orig} to ${dest}`);
                
                // Update click handler to avoid stale closure over old flight data
                existingMarker.off('click');
                existingMarker.on('click', () => {
                    if (onFlightSelect) {
                        // Look up the latest flight data by ID to avoid stale closures
                        const latestFlight = flightMap.get(flightId);
                        onFlightSelect(latestFlight || flight);
                    }
                });
            } else {
                // Create new marker
                const icon = createFlightIcon(heading, isSelected);
                const marker = L.marker([lat, lon], { icon })
                    .bindPopup(`<b>${flightNum}</b><br>${orig} to ${dest}`)
                    .addTo(map);
                
                // Add click handler that looks up latest flight data
                marker.on('click', () => {
                    if (onFlightSelect) {
                        const latestFlight = flightMap.get(flightId);
                        onFlightSelect(latestFlight || flight);
                    }
                });
                
                markersRef.current.set(flightId, marker);
            }
        });
    }, [flights, selectedFlight, onFlightSelect]);

    return (
        <>
            <style jsx global>{`
                .plane-marker {
                    background: transparent !important;
                    border: none !important;
                }
            `}</style>
            <div ref={containerRef} className="w-full h-full" />
        </>
    );
}
