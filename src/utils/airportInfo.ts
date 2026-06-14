/**
 * Shared airport information shape returned by `/api/airport/[iataCode]`.
 * Kept in its own module so that both route handlers and flight-data
 * providers can depend on it without circular imports.
 */
export interface AirportInfo {
    iata: string;
    name: string;
    city: string;
    country: string;
    lat: number;
    lon: number;
}
