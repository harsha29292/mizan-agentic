import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const FINNHUB_API_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;

// ETF proxies for global indices — all US-listed, work on Finnhub free tier
const INDICES = [
    { key: 'SP500', symbol: 'SPY', name: 'S&P 500', flag: '🇺🇸' },
    { key: 'NASDAQ', symbol: 'QQQ', name: 'NASDAQ 100', flag: '🇺🇸' },
    { key: 'DOW', symbol: 'DIA', name: 'Dow Jones', flag: '🇺🇸' },
    { key: 'FTSE', symbol: 'EWU', name: 'FTSE 100', flag: '🇬🇧' },
    { key: 'DAX', symbol: 'EWG', name: 'DAX 40', flag: '🇩🇪' },
    { key: 'NIKKEI', symbol: 'EWJ', name: 'Nikkei 225', flag: '🇯🇵' },
    { key: 'CAC40', symbol: 'EWQ', name: 'CAC 40', flag: '🇫🇷' },
    { key: 'HSI', symbol: 'EWH', name: 'Hang Seng', flag: '🇭🇰' },
];

export async function GET() {
    if (!FINNHUB_API_KEY) {
        return NextResponse.json({ error: 'No API key configured' }, { status: 500 });
    }

    try {
        const results = await Promise.all(
            INDICES.map(async (index) => {
                try {
                    const res = await fetch(
                        `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(index.symbol)}&token=${FINNHUB_API_KEY}`,
                        { next: { revalidate: 60 } }
                    );
                    if (!res.ok) return { ...index, price: null, change: null, changePercent: null };
                    const data = await res.json();
                    return {
                        key: index.key,
                        name: index.name,
                        flag: index.flag,
                        price: data.c ? data.c.toLocaleString('en-US', { maximumFractionDigits: 2 }) : null,
                        change: data.d ? data.d.toFixed(2) : null,
                        changePercent: data.dp ? data.dp.toFixed(2) : null,
                    };
                } catch {
                    return { ...index, price: null, change: null, changePercent: null };
                }
            })
        );

        return NextResponse.json({ timestamp: new Date().toISOString(), indices: results });
    } catch (error) {
        console.error('Markets indices error:', error);
        return NextResponse.json({ error: 'Failed to fetch market data' }, { status: 500 });
    }
}
