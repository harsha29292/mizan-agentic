import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const FINNHUB_API_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;

export async function GET(request, { params }) {
    const { symbol } = await params;

    if (!FINNHUB_API_KEY) {
        return NextResponse.json({ error: 'No API key configured' }, { status: 500 });
    }

    if (!symbol) {
        return NextResponse.json({ error: 'No symbol provided' }, { status: 400 });
    }

    try {
        // Fetch quote data
        const quoteRes = await fetch(
            `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`,
            { next: { revalidate: 60 } }
        );

        if (!quoteRes.ok) throw new Error(`Finnhub Quote API error: ${quoteRes.status}`);
        const quoteData = await quoteRes.json();

        // Fetch basic financials for metrics (Market Cap, etc.)
        const basicRes = await fetch(
            `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${FINNHUB_API_KEY}`,
            { next: { revalidate: 3600 } }
        );

        let metrics = {};
        if (basicRes.ok) {
            const basicData = await basicRes.json();
            metrics = basicData.metric || {};
        }

        return NextResponse.json({
            symbol,
            price: quoteData.c,
            change: quoteData.d,
            changePercent: quoteData.dp,
            open: quoteData.o,
            high: quoteData.h,
            low: quoteData.l,
            previousClose: quoteData.pc,
            volume: metrics['10DayAverageTradingVolume'] || 0,
            marketCap: metrics.marketCapitalization || 0,
            pe: metrics.peExclExtraTTM || 0,
            div: metrics.dividendYieldIndicatedAnnual || 0,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error(`Error fetching data for ${symbol}:`, error);
        return NextResponse.json({ error: 'Failed to fetch symbol data' }, { status: 500 });
    }
}
