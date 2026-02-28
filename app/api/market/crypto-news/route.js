import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const FINNHUB_API_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;

// Real-time crypto news from Finnhub
export async function GET() {
    try {
        const url = `https://finnhub.io/api/v1/news?category=crypto&token=${FINNHUB_API_KEY}`;
        const response = await fetch(url, { next: { revalidate: 120 } });

        if (!response.ok) throw new Error(`Finnhub error: ${response.status}`);

        const data = await response.json();
        const news = (data || []).slice(0, 10).map((item, index) => ({
            id: item.id || index + 1,
            headline: item.headline || 'Crypto Update',
            source: item.source || 'Finnhub',
            timestamp: new Date((item.datetime || Date.now() / 1000) * 1000).toISOString(),
            url: item.url || '#',
            summary: item.summary || ''
        }));

        return NextResponse.json({ timestamp: new Date().toISOString(), news });
    } catch (error) {
        console.error('Crypto news error:', error);
        return NextResponse.json({
            timestamp: new Date().toISOString(),
            news: [],
            error: error.message
        });
    }
}
