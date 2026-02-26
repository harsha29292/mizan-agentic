import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const FINNHUB_API_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;

// Global list of major stock exchanges/indices mapped to ETF proxies
const INDICES = [
    // North America
    { id: 'nyse', symbol: 'SPY', name: 'NYSE (S&P 500)', lat: 40.7069, lng: -74.0113 },
    { id: 'nasdaq', symbol: 'QQQ', name: 'NASDAQ 100', lat: 40.757, lng: -73.9855 },
    { id: 'tsx', symbol: 'EWC', name: 'TSX (Canada)', lat: 43.6487, lng: -79.3817 },
    { id: 'mexico', symbol: 'EWW', name: 'BMV (Mexico)', lat: 19.4326, lng: -99.1332 },

    // Europe
    { id: 'lse', symbol: 'EWU', name: 'LSE (London)', lat: 51.5142, lng: -0.0931 },
    { id: 'dax', symbol: 'EWG', name: 'DAX (Frankfurt)', lat: 50.1109, lng: 8.6821 },
    { id: 'cac', symbol: 'EWQ', name: 'CAC 40 (Paris)', lat: 48.8566, lng: 2.3522 },
    { id: 'smi', symbol: 'EWL', name: 'SMI (Zurich)', lat: 47.3769, lng: 8.5417 },
    { id: 'italy', symbol: 'EWI', name: 'FTSE MIB (Milan)', lat: 45.4642, lng: 9.19 },
    { id: 'spain', symbol: 'EWP', name: 'IBEX 35 (Madrid)', lat: 40.4168, lng: -3.7038 },
    { id: 'netherlands', symbol: 'EWN', name: 'AEX (Amsterdam)', lat: 52.3676, lng: 4.9041 },

    // Asia / Pacific
    { id: 'tse', symbol: 'EWJ', name: 'TSE (Tokyo)', lat: 35.6828, lng: 139.767 },
    { id: 'hkex', symbol: 'EWH', name: 'HKEX (Hong Kong)', lat: 22.283, lng: 114.1588 },
    { id: 'shanghai', symbol: 'FXI', name: 'SSE (Shanghai)', lat: 31.2304, lng: 121.4737 },
    { id: 'kospi', symbol: 'EWY', name: 'KOSPI (Seoul)', lat: 37.5665, lng: 126.978 },
    { id: 'nifty', symbol: 'INDA', name: 'Nifty 50 (India)', lat: 19.076, lng: 72.8777 },
    { id: 'taiwan', symbol: 'EWT', name: 'TWSE (Taiwan)', lat: 25.033, lng: 121.5654 },
    { id: 'asx', symbol: 'EWA', name: 'ASX (Sydney)', lat: -33.8688, lng: 151.2093 },

    // Middle East / Africa
    { id: 'tadawul', symbol: 'KSA', name: 'Tadawul (Saudi)', lat: 24.7136, lng: 46.6753 },
    { id: 'israel', symbol: 'EIS', name: 'TA-125 (Tel Aviv)', lat: 32.0853, lng: 34.7818 },
    { id: 'jse', symbol: 'EZA', name: 'JSE (S. Africa)', lat: -26.2041, lng: 28.0473 },

    // Latin America
    { id: 'bovespa', symbol: 'EWZ', name: 'Bovespa (Brazil)', lat: -23.5505, lng: -46.6333 },
    { id: 'argentina', symbol: 'ARGT', name: 'MERVAL (Argentina)', lat: -34.6037, lng: -58.3816 },
];

export async function GET() {
    if (!FINNHUB_API_KEY) {
        return NextResponse.json({ error: 'No API key configured' }, { status: 500 });
    }

    try {
        const features = await Promise.all(
            INDICES.map(async (index) => {
                try {
                    const res = await fetch(
                        `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(index.symbol)}&token=${FINNHUB_API_KEY}`,
                        { next: { revalidate: 300 } }
                    );
                    if (!res.ok) throw new Error('Fetch failed');
                    const data = await res.json();

                    const changePercent = data.dp || 0;
                    const color = changePercent >= 0 ? '#10b981' : '#ef4444'; // Emerald for up, Red for down

                    return {
                        type: 'Feature',
                        geometry: {
                            type: 'Point',
                            coordinates: [index.lng, index.lat],
                        },
                        properties: {
                            id: index.id,
                            label: `${index.name} • ${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`,
                            category: 'stock_exchanges',
                            color: color,
                            value: Math.max(0.3, Math.min(Math.abs(changePercent) / 5, 1.0)),
                        },
                    };
                } catch {
                    return null;
                }
            })
        );

        return NextResponse.json({
            type: 'FeatureCollection',
            features: features.filter(Boolean),
        });
    } catch (error) {
        console.error('Stock exchanges API error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
