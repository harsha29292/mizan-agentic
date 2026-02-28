import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const FINNHUB_API_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');

    const assetType = searchParams.get('assetType'); // 'stock' or 'crypto'

    if (!FINNHUB_API_KEY) {
        return NextResponse.json({ error: 'No API key configured' }, { status: 500 });
    }

    if (!q) {
        return NextResponse.json({ result: [] });
    }

    try {
        if (assetType === 'crypto') {
            // Search specifically for crypto using Binance symbols list
            const res = await fetch(
                `https://finnhub.io/api/v1/crypto/symbol?exchange=binance&token=${FINNHUB_API_KEY}`,
                { next: { revalidate: 3600 } }
            );

            if (!res.ok) throw new Error(`Finnhub crypto symbols error: ${res.status}`);

            const data = await res.json();
            const query = q.toUpperCase();

            // Filter for matches. Try exact symbol, then partial display symbol or description.
            const results = data
                .filter(item =>
                    item.symbol.includes(query) ||
                    item.displaySymbol.includes(query) ||
                    item.description.toUpperCase().includes(query)
                )
                .sort((a, b) => {
                    const queryUpper = query.toUpperCase();

                    // Exact match for base currency with USDT or USD (e.g., BINANCE:BTCUSDT)
                    const aIsExactUSDT = a.symbol === `BINANCE:${queryUpper}USDT`;
                    const bIsExactUSDT = b.symbol === `BINANCE:${queryUpper}USDT`;
                    if (aIsExactUSDT && !bIsExactUSDT) return -1;
                    if (!aIsExactUSDT && bIsExactUSDT) return 1;

                    const aIsExactUSD = a.symbol === `BINANCE:${queryUpper}USD`;
                    const bIsExactUSD = b.symbol === `BINANCE:${queryUpper}USD`;
                    if (aIsExactUSD && !bIsExactUSD) return -1;
                    if (!aIsExactUSD && bIsExactUSD) return 1;

                    // Starts with query and ends with USDT/USD (handles things like WBTC if query is WBTC)
                    const aStartsUSDT = a.symbol.startsWith(`BINANCE:${queryUpper}`) && a.symbol.endsWith('USDT');
                    const bStartsUSDT = b.symbol.startsWith(`BINANCE:${queryUpper}`) && b.symbol.endsWith('USDT');
                    if (aStartsUSDT && !bStartsUSDT) return -1;
                    if (!aStartsUSDT && bStartsUSDT) return 1;

                    return 0;
                })
                .slice(0, 10)
                .map(item => ({
                    symbol: item.symbol,
                    displaySymbol: item.displaySymbol,
                    description: item.description,
                    type: 'Crypto',
                    exchange: 'BINANCE'
                }));

            return NextResponse.json({ result: results });
        }

        // Default stock search logic
        const res = await fetch(
            `https://finnhub.io/api/v1/search?q=${q}&token=${FINNHUB_API_KEY}`,
            { next: { revalidate: 3600 } }
        );

        if (!res.ok) {
            throw new Error(`Finnhub search error: ${res.status}`);
        }

        const data = await res.json();
        const rawResults = (data.result || []).slice(0, 5);

        // Enrich the top result with exchange info if it's a stock
        const results = await Promise.all(rawResults.map(async (item, index) => {
            const result = {
                symbol: item.symbol,
                displaySymbol: item.displaySymbol,
                description: item.description,
                type: item.type,
                exchange: null
            };

            // Only fetch profile for the top result to save on rate limits
            if (index === 0 && (item.type === 'Common Stock' || item.type === 'ADR' || item.type === 'ETP')) {
                try {
                    const profileRes = await fetch(
                        `https://finnhub.io/api/v1/stock/profile2?symbol=${item.symbol}&token=${FINNHUB_API_KEY}`,
                        { next: { revalidate: 86400 } }
                    );
                    if (profileRes.ok) {
                        const profileData = await profileRes.json();
                        result.exchange = profileData.exchange;
                    }
                } catch (e) {
                    console.error('Profile fetch error:', e);
                }
            }
            return result;
        }));

        return NextResponse.json({ result: results });
    } catch (error) {
        console.error('Search API error:', error);
        return NextResponse.json({ error: 'Failed to search' }, { status: 500 });
    }
}
