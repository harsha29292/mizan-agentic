import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const FINNHUB_API_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;

// Global financial institutions / investment hubs mapping
const INVESTMENTS = [
    // US / Americas
    { id: 'bridgewater', name: 'Bridgewater Assoc.', symbol: 'GLD', lat: 41.1444, lng: -73.2635 },
    { id: 'citadel', name: 'Citadel LLC', symbol: 'AAPL', lat: 25.7617, lng: -80.1918 },
    { id: 'jpmorgan', name: 'JPMorgan Chase', symbol: 'JPM', lat: 40.7554, lng: -73.9754 },
    { id: 'goldman', name: 'Goldman Sachs', symbol: 'GS', lat: 40.7145, lng: -74.0142 },
    { id: 'blackrock', name: 'BlackRock', symbol: 'BLK', lat: 40.759, lng: -73.9744 },
    { id: 'berkshire', name: 'Berkshire Hathaway', symbol: 'BRK.B', lat: 41.2586, lng: -95.9377 },

    // Europe
    { id: 'ubs', name: 'UBS Group', symbol: 'UBS', lat: 47.37, lng: 8.5391 },
    { id: 'db', name: 'Deutsche Bank', symbol: 'DB', lat: 50.1133, lng: 8.6703 },
    { id: 'bnp', name: 'BNP Paribas', symbol: 'BNP.PA', lat: 48.8719, lng: 2.3323 },
    { id: 'hsbc', name: 'HSBC Holdings', symbol: 'HSBC', lat: 51.503, lng: -0.0177 },
    { id: 'man_group', name: 'Man Group', symbol: 'TLT', lat: 51.5101, lng: -0.0935 },

    // Asia / Pacific
    { id: 'nomura', name: 'Nomura Holdings', symbol: 'NMR', lat: 35.6811, lng: 139.7758 },
    { id: 'temasek', name: 'Temasek / GIC', symbol: 'EWS', lat: 1.2903, lng: 103.8519 },
    { id: 'macquarie', name: 'Macquarie Group', symbol: 'MQG.AX', lat: -33.864, lng: 151.211 },
    { id: 'hdfc', name: 'HDFC Bank', symbol: 'HDB', lat: 18.9287, lng: 72.833 },
    { id: 'icbc', name: 'ICBC (China)', symbol: '1398.HK', lat: 39.9042, lng: 116.4074 },

    // Middle East / Africa
    { id: 'adia', name: 'ADIA (Abu Dhabi)', symbol: 'KWT', lat: 24.4539, lng: 54.3773 },
    { id: 'pif', name: 'PIF (Saudi Arabia)', symbol: 'KSA', lat: 24.7136, lng: 46.6753 },
    { id: 'standard_bank', name: 'Standard Bank', symbol: 'SBK.JO', lat: -26.2041, lng: 28.0473 },
];

export async function GET() {
    if (!FINNHUB_API_KEY) {
        return NextResponse.json({ error: 'No API key configured' }, { status: 500 });
    }

    try {
        const features = await Promise.all(
            INVESTMENTS.map(async (item) => {
                try {
                    const res = await fetch(
                        `https://finnhub.io/api/v1/quote?symbol=${item.symbol}&token=${FINNHUB_API_KEY}`,
                        { next: { revalidate: 300 } }
                    );
                    if (!res.ok) throw new Error('Fetch failed');
                    const data = await res.json();

                    const changePercent = data.dp || 0;
                    const color = '#a78bfa'; // Purple theme for investments

                    return {
                        type: 'Feature',
                        geometry: {
                            type: 'Point',
                            coordinates: [item.lng, item.lat],
                        },
                        properties: {
                            id: item.id,
                            label: `${item.name} • ${item.symbol} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)`,
                            category: 'investments',
                            color: color,
                            value: 0.8,
                        },
                    };
                } catch {
                    // Fallback for symbols that might fail on Finnhub free tier (non-US)
                    return {
                        type: 'Feature',
                        geometry: {
                            type: 'Point',
                            coordinates: [item.lng, item.lat],
                        },
                        properties: {
                            id: item.id,
                            label: `${item.name}`,
                            category: 'investments',
                            color: '#a78bfa',
                            value: 0.7,
                        },
                    };
                }
            })
        );

        return NextResponse.json({
            type: 'FeatureCollection',
            features: features.filter(Boolean),
        });
    } catch (error) {
        console.error('Investments API error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
