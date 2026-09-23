export interface FlightTrackPoint {
    timestamp: string;
    lat: number;
    lon: number;
    alt: number;
    gspeed: number;
    vspeed: number;
    track: number;
    squawk?: string;
    callsign?: string;
    source: string;
}

export interface FlightTrackResponse {
    fr24_id: string;
    tracks: FlightTrackPoint[];
}

export interface Flight {
    // FR24 API fields
    fr24_id?: string;
    flight?: string;
    callsign?: string;
    lat?: number;
    lon?: number;
    track?: number;
    alt?: number;
    gspeed?: number;           // Ground speed in knots
    vspeed?: number;           // Vertical speed in feet per minute
    squawk?: string;
    timestamp?: string;        // ISO timestamp of the position
    source?: string;           // ADSB, MLAT, UAT, ESTIMATED
    hex?: string;              // ICAO 24-bit address
    type?: string;             // Aircraft type code (e.g., "B738", "A321")
    reg?: string;              // Aircraft registration
    painted_as?: string;       // Airline ICAO code (livery)
    operating_as?: string;     // Airline ICAO code (operator)
    orig_iata?: string;
    orig_icao?: string;
    dest_iata?: string;
    dest_icao?: string;
    eta?: string;              // Estimated time of arrival (ISO timestamp)
    
    // Legacy/alternative field names for compatibility
    flight_number?: string;
    registration?: string;
    origin_airport_iata?: string;
    destination_airport_iata?: string;
    altitude?: number;
    latitude?: number;
    longitude?: number;
    heading?: number;
    airline_iata?: string;
    airline_icao?: string;
    airline_name?: string;
    origin_city?: string;
    origin_airport_name?: string;
    destination_city?: string;
    destination_airport_name?: string;
    flight_id?: string;
    
    // Origin and destination coordinates for progress calculation
    origin_lat?: number;
    origin_lon?: number;
    dest_lat?: number;
    dest_lon?: number;
}
