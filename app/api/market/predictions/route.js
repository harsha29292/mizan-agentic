import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const FINNHUB_API_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;

// Assets to generate predictions for — all free-tier compatible
const PREDICTION_ASSETS = [
    { symbol: 'BINANCE:BTCUSDT', name: 'BTC/USD', type: 'crypto' },
    { symbol: 'BINANCE:ETHUSDT', name: 'ETH/USD', type: 'crypto' },
    { symbol: 'AAPL', name: 'Apple', type: 'stock' },
    { symbol: 'NVDA', name: 'NVIDIA', type: 'stock' },
    { symbol: 'TSLA', name: 'Tesla', type: 'stock' },
    { symbol: 'GLD', name: 'Gold (GLD)', type: 'etf' },
    { symbol: 'FXE', name: 'EUR/USD', type: 'forex' },
    { symbol: 'BINANCE:SOLUSDT', name: 'SOL/USD', type: 'crypto' },
];

// Derive a simple momentum signal from price vs open
function getSignal(c, o) {
    if (!c || !o) return { signal: 'HOLD', confidence: 60 };
    const pct = ((c - o) / o) * 100;
    if (pct > 1.5) return { signal: 'BUY', confidence: Math.min(95, 70 + Math.round(pct * 3)) };
    if (pct < -1.5) return { signal: 'SELL', confidence: Math.min(95, 70 + Math.round(Math.abs(pct) * 3)) };
    if (pct > 0.3) return { signal: 'BUY', confidence: Math.min(75, 60 + Math.round(pct * 5)) };
    if (pct < -0.3) return { signal: 'SELL', confidence: Math.min(75, 60 + Math.round(Math.abs(pct) * 5)) };
    return { signal: 'HOLD', confidence: Math.round(55 + Math.random() * 15) };
}

function formatTarget(c, signal) {
    if (!c) return 'N/A';
    const multiplier = signal === 'BUY' ? 1.035 : signal === 'SELL' ? 0.965 : 1.0;
    const target = c * multiplier;
    if (c > 1000) return '$' + target.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (c > 1) return '$' + target.toFixed(2);
    return '$' + target.toFixed(4);
}

export async function GET() {
    if (!FINNHUB_API_KEY) {
        return NextResponse.json({ error: 'No API key configured' }, { status: 500 });
    }

    try {
        const results = await Promise.all(
            PREDICTION_ASSETS.map(async (asset) => {
                try {
                    const res = await fetch(
                        `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(asset.symbol)}&token=${FINNHUB_API_KEY}`,
                        { next: { revalidate: 120 } }
                    );
                    if (!res.ok) return null;
                    const data = await res.json();
                    const { signal, confidence } = getSignal(data.c, data.o);
                    return {
                        asset: asset.name,
                        type: asset.type,
                        price: data.c,
                        changePercent: data.dp ? data.dp.toFixed(2) : '0.00',
                        signal,
                        confidence,
                        target: formatTarget(data.c, signal),
                    };
                } catch {
                    return null;
                }
            })
        );

        const predictions = results.filter(Boolean);
        return NextResponse.json({ timestamp: new Date().toISOString(), predictions });
    } catch (error) {
        console.error('Predictions error:', error);
        return NextResponse.json({ error: 'Failed to generate predictions' }, { status: 500 });
    }
}
