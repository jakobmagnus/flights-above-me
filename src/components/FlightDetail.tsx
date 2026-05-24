'use client';

import { useMemo, useState } from 'react';
import { Flight } from '@/types/flight';
import { calculateFlightProgress } from '@/utils/flightProgress';
import { getAirportCoordinates } from '@/utils/airportCoordinates';

interface FlightDetailProps {
    flight: Flight;
    onClose: () => void;
}

// Aircraft type mapping based on common codes
const AIRCRAFT_TYPES: Record<string, string> = {
    'B738': 'Boeing 737-800',
    'B737': 'Boeing 737',
    'B739': 'Boeing 737-900',
    'B77W': 'Boeing 777-300ER',
    'B772': 'Boeing 777-200',
    'B773': 'Boeing 777-300',
    'B788': 'Boeing 787-8',
    'B789': 'Boeing 787-9',
    'B78X': 'Boeing 787-10',
    'A320': 'Airbus A320',
    'A321': 'Airbus A321',
    'A319': 'Airbus A319',
    'A332': 'Airbus A330-200',
    'A333': 'Airbus A330-300',
    'A359': 'Airbus A350-900',
    'A35K': 'Airbus A350-1000',
    'A388': 'Airbus A380-800',
    'E190': 'Embraer E190',
    'E195': 'Embraer E195',
    'CRJ9': 'CRJ-900',
    'DH8D': 'Dash 8-400',
};

// Country flags based on airline IATA codes (simplified mapping)
const AIRLINE_COUNTRIES: Record<string, { flag: string; country: string }> = {
    'SK': { flag: '🇸🇪', country: 'Sweden' },
    'AY': { flag: '🇫🇮', country: 'Finland' },
    'DY': { flag: '🇳🇴', country: 'Norway' },
    'FR': { flag: '🇮🇪', country: 'Ireland' },
    'BA': { flag: '🇬🇧', country: 'United Kingdom' },
    'LH': { flag: '🇩🇪', country: 'Germany' },
    'AF': { flag: '🇫🇷', country: 'France' },
    'KL': { flag: '🇳🇱', country: 'Netherlands' },
    'IB': { flag: '🇪🇸', country: 'Spain' },
    'AZ': { flag: '🇮🇹', country: 'Italy' },
    'LX': { flag: '🇨🇭', country: 'Switzerland' },
    'OS': { flag: '🇦🇹', country: 'Austria' },
    'SN': { flag: '🇧🇪', country: 'Belgium' },
    'EI': { flag: '🇮🇪', country: 'Ireland' },
    'TP': { flag: '🇵🇹', country: 'Portugal' },
    'TK': { flag: '🇹🇷', country: 'Turkey' },
    'EK': { flag: '🇦🇪', country: 'UAE' },
    'QR': { flag: '🇶🇦', country: 'Qatar' },
    'EY': { flag: '🇦🇪', country: 'UAE' },
    'AA': { flag: '🇺🇸', country: 'United States' },
    'UA': { flag: '🇺🇸', country: 'United States' },
    'DL': { flag: '🇺🇸', country: 'United States' },
    'AS': { flag: '🇺🇸', country: 'United States' },
    'WN': { flag: '🇺🇸', country: 'United States' },
    'AC': { flag: '🇨🇦', country: 'Canada' },
    'QF': { flag: '🇦🇺', country: 'Australia' },
    'NZ': { flag: '🇳🇿', country: 'New Zealand' },
    'SQ': { flag: '🇸🇬', country: 'Singapore' },
    'CX': { flag: '🇭🇰', country: 'Hong Kong' },
    'JL': { flag: '🇯🇵', country: 'Japan' },
    'NH': { flag: '🇯🇵', country: 'Japan' },
    'KE': { flag: '🇰🇷', country: 'South Korea' },
    'OZ': { flag: '🇰🇷', country: 'South Korea' },
    'CA': { flag: '🇨🇳', country: 'China' },
    'MU': { flag: '🇨🇳', country: 'China' },
    'W6': { flag: '🇭🇺', country: 'Hungary' },
    'U2': { flag: '🇬🇧', country: 'United Kingdom' },
    'VY': { flag: '🇪🇸', country: 'Spain' },
    'D8': { flag: '🇳🇴', country: 'Norway' },
    'DK': { flag: '🇩🇰', country: 'Denmark' },
};

// Timezone offsets for common airports (simplified)
const AIRPORT_TIMEZONES: Record<string, string> = {
    'ARN': 'UTC+1',
    'CPH': 'UTC+1',
    'OSL': 'UTC+1',
    'HEL': 'UTC+2',
    'LHR': 'UTC+0',
    'CDG': 'UTC+1',
    'AMS': 'UTC+1',
    'FRA': 'UTC+1',
    'MUC': 'UTC+1',
    'FCO': 'UTC+1',
    'MAD': 'UTC+1',
    'BCN': 'UTC+1',
    'LIS': 'UTC+0',
    'ATH': 'UTC+2',
    'IST': 'UTC+3',
    'DXB': 'UTC+4',
    'DOH': 'UTC+3',
    'SIN': 'UTC+8',
    'HKG': 'UTC+8',
    'NRT': 'UTC+9',
    'HND': 'UTC+9',
    'ICN': 'UTC+9',
    'PEK': 'UTC+8',
    'PVG': 'UTC+8',
    'BKK': 'UTC+7',
    'DEL': 'UTC+5:30',
    'JFK': 'UTC-5',
    'LAX': 'UTC-8',
    'ORD': 'UTC-6',
    'MIA': 'UTC-5',
    'SFO': 'UTC-8',
    'SEA': 'UTC-8',
    'DFW': 'UTC-6',
    'DEN': 'UTC-7',
    'ATL': 'UTC-5',
    'YYZ': 'UTC-5',
    'YVR': 'UTC-8',
    'SYD': 'UTC+11',
    'MEL': 'UTC+11',
    'AKL': 'UTC+13',
    'LCA': 'UTC+2',
    'BMA': 'UTC+1',
};

// Airline name mapping
const AIRLINE_NAMES: Record<string, string> = {
    'SK': 'SAS',
    'AY': 'Finnair',
    'DY': 'Norwegian',
    'FR': 'Ryanair',
    'BA': 'British Airways',
    'LH': 'Lufthansa',
    'AF': 'Air France',
    'KL': 'KLM',
    'IB': 'Iberia',
    'AZ': 'ITA Airways',
    'LX': 'SWISS',
    'OS': 'Austrian',
    'SN': 'Brussels Airlines',
    'EI': 'Aer Lingus',
    'TP': 'TAP Portugal',
    'TK': 'Turkish Airlines',
    'EK': 'Emirates',
    'QR': 'Qatar Airways',
    'EY': 'Etihad',
    'AA': 'American Airlines',
    'UA': 'United Airlines',
    'DL': 'Delta Air Lines',
    'WN': 'Southwest',
    'AS': 'Alaska Airlines',
    'AC': 'Air Canada',
    'QF': 'Qantas',
    'NZ': 'Air New Zealand',
    'SQ': 'Singapore Airlines',
    'CX': 'Cathay Pacific',
    'JL': 'Japan Airlines',
    'NH': 'ANA',
    'KE': 'Korean Air',
    'OZ': 'Asiana',
    'CA': 'Air China',
    'MU': 'China Eastern',
    'W6': 'Wizz Air',
    'U2': 'easyJet',
    'VY': 'Vueling',
    'D8': 'Norwegian',
};

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function formatDistance(km: number): string {
    return km.toLocaleString('en-US', { maximumFractionDigits: 0 }).replace(/,/g, ' ');
}

function estimateTime(distanceKm: number, speedKmh: number): string {
    if (speedKmh <= 0) speedKmh = 800; // Default cruise speed
    const totalMinutes = Math.round((distanceKm / speedKmh) * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}h ${m}m`;
}

export default function FlightDetail({ flight, onClose }: FlightDetailProps) {
    const [logoLoaded, setLogoLoaded] = useState(false);
    const [logoError, setLogoError] = useState(false);
    const [prevLogoUrl, setPrevLogoUrl] = useState<string | null>(null);
    // Extract flight information from FR24 API response
    const flightNumber = flight.flight || flight.callsign || flight.flight_number || 'N/A';
    const originCode = flight.orig_iata || flight.origin_airport_iata || '---';
    const destCode = flight.dest_iata || flight.destination_airport_iata || '---';
    const altitude = flight.alt || flight.altitude || 0;
    const heading = flight.track || flight.heading || 0;
    
    // Ground speed from API (in knots), convert to km/h
    const groundSpeedKnots = flight.gspeed || 0;
    const groundSpeedKmh = Math.round(groundSpeedKnots * 1.852);
    
    // Vertical speed from API (feet per minute)
    const verticalSpeed = flight.vspeed || 0;
    
    // Aircraft type from API
    const aircraftTypeCode = flight.type || '';
    const aircraftType = aircraftTypeCode ? (AIRCRAFT_TYPES[aircraftTypeCode] || aircraftTypeCode) : 'Unknown';
    
    // Registration from API
    const registration = flight.reg || flight.registration || '---';
    
    // ETA from API
    const eta = flight.eta;
    
    // Data source
    const dataSource = flight.source || 'Unknown';
    
    // Squawk code
    const squawk = flight.squawk || '---';

    // Get airport info
    const originAirportInfo = getAirportCoordinates(originCode);
    const destAirportInfo = getAirportCoordinates(destCode);

    const originCity = flight.origin_city || flight.origin_airport_name || originAirportInfo?.city || originCode;
    const destCity = flight.destination_city || flight.destination_airport_name || destAirportInfo?.city || destCode;

    const originTimezone = AIRPORT_TIMEZONES[originCode] || 'UTC';
    const destTimezone = AIRPORT_TIMEZONES[destCode] || 'UTC';

    // Extract airline code - prefer painted_as/operating_as from FR24 API
    let airlineCode = flight.painted_as || flight.operating_as || flight.airline_iata || flight.airline_icao;
    if (!airlineCode && flightNumber && flightNumber !== 'N/A') {
        const match = flightNumber.match(/^([A-Z]{2,3})\d+/);
        if (match) {
            airlineCode = match[1];
        }
    }

    const airlineName = airlineCode ? AIRLINE_NAMES[airlineCode] || airlineCode : 'Unknown Airline';
    const airlineCountry = airlineCode ? AIRLINE_COUNTRIES[airlineCode] : null;

    const logoUrl = airlineCode
        ? airlineCode.length === 2
            ? `https://pics.avs.io/200/200/${airlineCode}.png`
            : `https://www.flightaware.com/images/airline_logos/90p/${airlineCode}.png`
        : null;

    // Reset logo loading state when the logo URL changes (e.g. switching flights)
    if (prevLogoUrl !== logoUrl) {
        setPrevLogoUrl(logoUrl);
        setLogoLoaded(false);
        setLogoError(false);
    }

    // Calculate coordinates
    const currentLat = flight.lat ?? flight.latitude ?? 0;
    const currentLon = flight.lon ?? flight.longitude ?? 0;

    const originLat = flight.origin_lat ?? originAirportInfo?.lat;
    const originLon = flight.origin_lon ?? originAirportInfo?.lon;
    const destLat = flight.dest_lat ?? destAirportInfo?.lat;
    const destLon = flight.dest_lon ?? destAirportInfo?.lon;

    // Calculate distances and progress
    const flightData = useMemo(() => {
        if (originLat === undefined || originLon === undefined ||
            destLat === undefined || destLon === undefined) {
            return null;
        }

        const totalDistance = haversineDistance(originLat, originLon, destLat, destLon);
        const distanceFromOrigin = haversineDistance(originLat, originLon, currentLat, currentLon);
        const distanceToDestination = haversineDistance(currentLat, currentLon, destLat, destLon);

        // Use actual ground speed from API (already converted to km/h)
        const speedKmh = groundSpeedKmh > 0 ? groundSpeedKmh : 800;

        const progress = calculateFlightProgress(
            currentLat, currentLon,
            originLat, originLon,
            destLat, destLon
        ) ?? 50;

        return {
            totalDistance,
            distanceFromOrigin,
            distanceToDestination,
            progress,
            timeFromOrigin: estimateTime(distanceFromOrigin, speedKmh),
            timeToDestination: estimateTime(distanceToDestination, speedKmh),
        };
    }, [originLat, originLon, destLat, destLon, currentLat, currentLon, groundSpeedKmh]);

    const progress = flightData?.progress ?? 50;

    // Format altitude (API returns feet, convert to meters for display)
    const altitudeMeters = Math.round(altitude * 0.3048);
    const altitudeFormatted = altitudeMeters.toLocaleString('en-US', { maximumFractionDigits: 0 }).replace(/,/g, ' ');
    const altitudeFeet = altitude.toLocaleString('en-US', { maximumFractionDigits: 0 }).replace(/,/g, ' ');
    
    // Format ETA
    const formatEta = (etaString?: string): string => {
        if (!etaString) return '--:--';
        try {
            const date = new Date(etaString);
            return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        } catch {
            return '--:--';
        }
    };
    
    // Format vertical speed
    const formatVerticalSpeed = (vspeed: number): string => {
        if (vspeed === 0) return '0';
        const sign = vspeed > 0 ? '+' : '';
        return `${sign}${vspeed.toLocaleString('en-US')}`;
    };

    return (
        <div className="bg-white dark:bg-[#111] overflow-hidden flex flex-col min-h-full">
            {/* Header */}
            <div className="bg-gray-100 dark:bg-[#1a1a1a] px-5 py-2 flex items-center justify-between border-b border-gray-300 dark:border-gray-800">
                <button
                    onClick={onClose}
                    className="flex items-center gap-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
                    aria-label="Back"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    <span className="text-sm font-medium">Back</span>
                </button>
            </div>

            {/* Route Display */}
            <div className="px-5 py-6">
                {/* Flight number and airline logo */}
                <div className="flex items-center gap-3 mb-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center overflow-hidden border border-gray-300 dark:border-gray-700 ${logoLoaded ? 'bg-white' : 'bg-gray-200 dark:bg-gray-800'}`}>
                        {logoUrl && !logoError ? (
                            <img
                                src={logoUrl}
                                alt={`${airlineName} logo`}
                                className={`w-full h-full object-contain p-0.5 ${logoLoaded ? 'block' : 'hidden'}`}
                                onLoad={(e) => {
                                    const img = e.target as HTMLImageElement;
                                    if (img.naturalWidth > 10 && img.naturalHeight > 10) {
                                        setLogoLoaded(true);
                                    } else {
                                        setLogoError(true);
                                    }
                                }}
                                onError={() => setLogoError(true)}
                            />
                        ) : null}
                        {(!logoUrl || logoError || !logoLoaded) && (
                            <svg className="w-4 h-4 text-orange-500" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 00-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
                            </svg>
                        )}
                    </div>
                    <span className="text-base font-semibold text-yellow-600 dark:text-yellow-500">{flightNumber}</span>
                </div>

                {/* Origin and Destination */}
                <div className="flex justify-between items-start mb-6">
                    <div className="flex flex-col items-start">
                        <span className="text-4xl font-bold text-gray-900 dark:text-white mb-1">{originCode}</span>
                        <span className="text-sm text-gray-600 dark:text-gray-400">{originCity}</span>
                        <span className="text-xs text-gray-500 mt-1">{originTimezone}</span>
                    </div>

                    <div className="flex items-center justify-center px-4 pt-2">
                        <div className="bg-yellow-600 rounded-full p-2">
                            <svg className="w-5 h-5 text-white rotate-90" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 00-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
                            </svg>
                        </div>
                    </div>

                    <div className="flex flex-col items-end">
                        <span className="text-4xl font-bold text-gray-900 dark:text-white mb-1">{destCode}</span>
                        <span className="text-sm text-gray-600 dark:text-gray-400">{destCity}</span>
                        <span className="text-xs text-gray-500 mt-1">{destTimezone}</span>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-4">
                    <div className="relative h-[3px] bg-gray-300 dark:bg-gray-700 rounded-full">
                        <div
                            className="absolute left-0 h-full rounded-full transition-all duration-500"
                            style={{
                                width: `${progress}%`,
                                background: 'linear-gradient(to right, #c94a32, #d4693a, #e89842, #f5b84a)'
                            }}
                        />
                        <div
                            className="absolute transition-all duration-500 flex items-center justify-center"
                            style={{ left: `${progress}%`, transform: 'translate(-50%, -50%)', top: '50%' }}
                        >
                            <svg className="w-5 h-5 text-gray-900 dark:text-white drop-shadow-md rotate-90" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 00-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
                            </svg>
                        </div>
                    </div>

                    {/* Distance and Time Info */}
                    <div className="flex justify-between mt-3 text-sm text-gray-600 dark:text-gray-400">
                        <span>
                            {flightData ? `${formatDistance(flightData.distanceFromOrigin)} km • ${flightData.timeFromOrigin}` : '---'}
                        </span>
                        <span>
                            {flightData ? `${formatDistance(flightData.distanceToDestination)} km • ${flightData.timeToDestination}` : '---'}
                        </span>
                    </div>
                </div>

                {/* Schedule Info */}
                <div className="border-t border-gray-300 dark:border-gray-800 pt-4 space-y-3">
                    <div className="flex justify-between items-center">
                        <span className="text-gray-600 dark:text-gray-400 text-sm">Estimated Arrival</span>
                        <span className="text-gray-900 dark:text-white font-medium text-lg">{formatEta(eta)}</span>
                    </div>
                    {eta && (
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600 dark:text-gray-400 text-sm">Time to arrival</span>
                            <span className="text-green-600 dark:text-green-400 font-medium">
                                {flightData ? flightData.timeToDestination : '---'}
                            </span>
                        </div>
                    )}
                </div>

                {/* Flight Information */}
                <div className="border-t border-gray-300 dark:border-gray-800 mt-4 pt-4">
                    <h3 className="text-gray-500 text-sm mb-3 font-medium">Aircraft</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-gray-100 dark:bg-[#1a1a1a] rounded-lg px-4 py-3">
                            <span className="text-gray-600 dark:text-gray-400 text-xs block">Type</span>
                            <span className="text-gray-900 dark:text-white text-sm font-medium">{aircraftType}</span>
                        </div>
                        <div className="bg-gray-100 dark:bg-[#1a1a1a] rounded-lg px-4 py-3">
                            <span className="text-gray-600 dark:text-gray-400 text-xs block">Registration</span>
                            <span className="text-gray-900 dark:text-white text-sm font-medium">{registration}</span>
                        </div>
                        <div className="bg-gray-100 dark:bg-[#1a1a1a] rounded-lg px-4 py-3 flex items-center gap-2">
                            {airlineCountry && <span className="text-lg">{airlineCountry.flag}</span>}
                            <div>
                                <span className="text-gray-600 dark:text-gray-400 text-xs block">Operator</span>
                                <span className="text-gray-900 dark:text-white text-sm">{airlineName}</span>
                            </div>
                        </div>
                        <div className="bg-gray-100 dark:bg-[#1a1a1a] rounded-lg px-4 py-3">
                            <span className="text-gray-600 dark:text-gray-400 text-xs block">Squawk</span>
                            <span className="text-gray-900 dark:text-white text-sm font-medium">{squawk}</span>
                        </div>
                    </div>
                </div>
                
                {/* Speed and Position */}
                <div className="border-t border-gray-300 dark:border-gray-800 mt-4 pt-4">
                    <h3 className="text-gray-500 text-sm mb-3 font-medium">Position & Speed</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-gray-100 dark:bg-[#1a1a1a] rounded-lg px-4 py-3">
                            <span className="text-gray-600 dark:text-gray-400 text-xs block">Ground Speed</span>
                            <span className="text-gray-900 dark:text-white text-sm font-medium">{groundSpeedKmh} km/h</span>
                            <span className="text-gray-500 text-xs block">{groundSpeedKnots} kts</span>
                        </div>
                        <div className="bg-gray-100 dark:bg-[#1a1a1a] rounded-lg px-4 py-3">
                            <span className="text-gray-600 dark:text-gray-400 text-xs block">Altitude</span>
                            <span className="text-gray-900 dark:text-white text-sm font-medium">{altitudeFormatted} m</span>
                            <span className="text-gray-500 text-xs block">{altitudeFeet} ft</span>
                        </div>
                        <div className="bg-gray-100 dark:bg-[#1a1a1a] rounded-lg px-4 py-3">
                            <span className="text-gray-600 dark:text-gray-400 text-xs block">Vertical Speed</span>
                            <span className={`text-sm font-medium ${verticalSpeed > 0 ? 'text-green-600 dark:text-green-400' : verticalSpeed < 0 ? 'text-orange-600 dark:text-orange-400' : 'text-gray-900 dark:text-white'}`}>
                                {formatVerticalSpeed(verticalSpeed)} ft/min
                            </span>
                        </div>
                        <div className="bg-gray-100 dark:bg-[#1a1a1a] rounded-lg px-4 py-3">
                            <span className="text-gray-600 dark:text-gray-400 text-xs block">Heading</span>
                            <span className="text-gray-900 dark:text-white text-sm font-medium">{heading}°</span>
                        </div>
                    </div>
                </div>
                
                {/* Data Source */}
                <div className="border-t border-gray-300 dark:border-gray-800 mt-4 pt-4">
                    <div className="flex justify-between items-center text-xs text-gray-500">
                        <span>Source: {dataSource}</span>
                        <span>FR24 ID: {flight.fr24_id || flight.flight_id || '---'}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
