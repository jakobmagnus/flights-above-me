/**
 * Minimal ICAO airline-prefix to airline-name lookup.
 *
 * Callsigns transmitted over ADS-B typically begin with a three-letter ICAO
 * airline designator (e.g. "SAS123" → "SAS" → Scandinavian Airlines). When a
 * free flight-data provider does not supply an airline name we derive it from
 * this table. The mapping is intentionally small and covers major carriers;
 * unknown prefixes simply yield an undefined airline name.
 *
 * IATA codes are included as a best-effort secondary mapping so the rest of
 * the UI (which sometimes keys on `airline_iata`) can still light up logos.
 */
export interface AirlineInfo {
    icao: string;
    iata?: string;
    name: string;
}

const AIRLINES: Record<string, AirlineInfo> = {
    AAL: { icao: 'AAL', iata: 'AA', name: 'American Airlines' },
    UAL: { icao: 'UAL', iata: 'UA', name: 'United Airlines' },
    DAL: { icao: 'DAL', iata: 'DL', name: 'Delta Air Lines' },
    SWA: { icao: 'SWA', iata: 'WN', name: 'Southwest Airlines' },
    JBU: { icao: 'JBU', iata: 'B6', name: 'JetBlue Airways' },
    ASA: { icao: 'ASA', iata: 'AS', name: 'Alaska Airlines' },
    FFT: { icao: 'FFT', iata: 'F9', name: 'Frontier Airlines' },
    NKS: { icao: 'NKS', iata: 'NK', name: 'Spirit Airlines' },
    ACA: { icao: 'ACA', iata: 'AC', name: 'Air Canada' },
    WJA: { icao: 'WJA', iata: 'WS', name: 'WestJet' },

    BAW: { icao: 'BAW', iata: 'BA', name: 'British Airways' },
    VIR: { icao: 'VIR', iata: 'VS', name: 'Virgin Atlantic' },
    EZY: { icao: 'EZY', iata: 'U2', name: 'easyJet' },
    RYR: { icao: 'RYR', iata: 'FR', name: 'Ryanair' },
    DLH: { icao: 'DLH', iata: 'LH', name: 'Lufthansa' },
    AFR: { icao: 'AFR', iata: 'AF', name: 'Air France' },
    KLM: { icao: 'KLM', iata: 'KL', name: 'KLM Royal Dutch Airlines' },
    IBE: { icao: 'IBE', iata: 'IB', name: 'Iberia' },
    SAS: { icao: 'SAS', iata: 'SK', name: 'Scandinavian Airlines' },
    NAX: { icao: 'NAX', iata: 'DY', name: 'Norwegian Air Shuttle' },
    FIN: { icao: 'FIN', iata: 'AY', name: 'Finnair' },
    SWR: { icao: 'SWR', iata: 'LX', name: 'Swiss International Air Lines' },
    AUA: { icao: 'AUA', iata: 'OS', name: 'Austrian Airlines' },
    TAP: { icao: 'TAP', iata: 'TP', name: 'TAP Air Portugal' },
    THY: { icao: 'THY', iata: 'TK', name: 'Turkish Airlines' },
    AEE: { icao: 'AEE', iata: 'A3', name: 'Aegean Airlines' },
    LOT: { icao: 'LOT', iata: 'LO', name: 'LOT Polish Airlines' },
    CSA: { icao: 'CSA', iata: 'OK', name: 'Czech Airlines' },
    AZA: { icao: 'AZA', iata: 'AZ', name: 'ITA Airways' },
    ITY: { icao: 'ITY', iata: 'AZ', name: 'ITA Airways' },
    WZZ: { icao: 'WZZ', iata: 'W6', name: 'Wizz Air' },
    PGT: { icao: 'PGT', iata: 'PC', name: 'Pegasus Airlines' },

    UAE: { icao: 'UAE', iata: 'EK', name: 'Emirates' },
    QTR: { icao: 'QTR', iata: 'QR', name: 'Qatar Airways' },
    ETD: { icao: 'ETD', iata: 'EY', name: 'Etihad Airways' },
    SVA: { icao: 'SVA', iata: 'SV', name: 'Saudia' },
    MEA: { icao: 'MEA', iata: 'ME', name: 'Middle East Airlines' },
    ELY: { icao: 'ELY', iata: 'LY', name: 'El Al' },
    ETH: { icao: 'ETH', iata: 'ET', name: 'Ethiopian Airlines' },
    MSR: { icao: 'MSR', iata: 'MS', name: 'EgyptAir' },
    RAM: { icao: 'RAM', iata: 'AT', name: 'Royal Air Maroc' },

    SIA: { icao: 'SIA', iata: 'SQ', name: 'Singapore Airlines' },
    CPA: { icao: 'CPA', iata: 'CX', name: 'Cathay Pacific' },
    ANA: { icao: 'ANA', iata: 'NH', name: 'All Nippon Airways' },
    JAL: { icao: 'JAL', iata: 'JL', name: 'Japan Airlines' },
    KAL: { icao: 'KAL', iata: 'KE', name: 'Korean Air' },
    AAR: { icao: 'AAR', iata: 'OZ', name: 'Asiana Airlines' },
    CCA: { icao: 'CCA', iata: 'CA', name: 'Air China' },
    CES: { icao: 'CES', iata: 'MU', name: 'China Eastern Airlines' },
    CSN: { icao: 'CSN', iata: 'CZ', name: 'China Southern Airlines' },
    THA: { icao: 'THA', iata: 'TG', name: 'Thai Airways International' },
    MAS: { icao: 'MAS', iata: 'MH', name: 'Malaysia Airlines' },
    GIA: { icao: 'GIA', iata: 'GA', name: 'Garuda Indonesia' },
    AIC: { icao: 'AIC', iata: 'AI', name: 'Air India' },

    QFA: { icao: 'QFA', iata: 'QF', name: 'Qantas' },
    ANZ: { icao: 'ANZ', iata: 'NZ', name: 'Air New Zealand' },
    VOZ: { icao: 'VOZ', iata: 'VA', name: 'Virgin Australia' },

    AMX: { icao: 'AMX', iata: 'AM', name: 'Aeroméxico' },
    LAN: { icao: 'LAN', iata: 'LA', name: 'LATAM Airlines' },
    AVA: { icao: 'AVA', iata: 'AV', name: 'Avianca' },
    GLO: { icao: 'GLO', iata: 'G3', name: 'GOL Linhas Aéreas' },
    AZU: { icao: 'AZU', iata: 'AD', name: 'Azul' },
    TAM: { icao: 'TAM', iata: 'JJ', name: 'LATAM Brasil' },

    FDX: { icao: 'FDX', iata: 'FX', name: 'FedEx' },
    UPS: { icao: 'UPS', iata: '5X', name: 'UPS Airlines' },
    DHL: { icao: 'DHL', iata: 'D0', name: 'DHL Aviation' },
    GTI: { icao: 'GTI', iata: '5Y', name: 'Atlas Air' },
};

/**
 * Look up airline info from a callsign. The callsign's first three letters are
 * treated as the ICAO airline designator (e.g. "SAS123" → "SAS").
 * Returns `undefined` for unknown prefixes or callsigns shorter than three
 * characters (e.g. general-aviation tail numbers).
 */
export function lookupAirlineFromCallsign(callsign: string | undefined | null): AirlineInfo | undefined {
    if (!callsign) return undefined;
    const trimmed = callsign.trim().toUpperCase();
    if (trimmed.length < 3) return undefined;
    // Only treat as airline callsign if the first three chars are letters; tail
    // numbers like "N12345" or "G-ABCD" should not be looked up.
    const prefix = trimmed.slice(0, 3);
    if (!/^[A-Z]{3}$/.test(prefix)) return undefined;
    return AIRLINES[prefix];
}
