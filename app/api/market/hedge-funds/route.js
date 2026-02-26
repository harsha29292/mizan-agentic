import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const FINNHUB_API_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;

// Top hedge-fund tracked stocks (13F filings proxy)
const HEDGE_FUND_STOCKS = [
    { fund: 'Bridgewater Assoc.', strategy: 'Macro', symbol: 'GLD', holding: 'Gold ETF' },
    { fund: 'Renaissance Tech', strategy: 'Quant', symbol: 'NVDA', holding: 'NVIDIA' },
    { fund: 'Two Sigma', strategy: 'Quant', symbol: 'MSFT', holding: 'Microsoft' },
    { fund: 'Citadel LLC', strategy: 'Multi', symbol: 'AAPL', holding: 'Apple' },
    { fund: 'D.E. Shaw', strategy: 'Quant', symbol: 'IBIT', holding: 'BTC ETF' },
    { fund: 'Man Group', strategy: 'Trend', symbol: 'TLT', holding: 'US Bonds' },
];

const FUND_AUMS = {
    'Bridgewater Assoc.': '$124B',
    'Renaissance Tech': '$106B',
    'Two Sigma': '$60B',
    'Citadel LLC': '$58B',
    'D.E. Shaw': '$55B',
    'Man Group': '$42B',
};

export async function GET() {
    if (!FINNHUB_API_KEY) {
        return NextResponse.json({ error: 'No API key configured' }, { status: 500 });
    }

    try {
        const results = await Promise.all(
            HEDGE_FUND_STOCKS.map(async (item) => {
                try {
                    const res = await fetch(
                        `https://finnhub.io/api/v1/quote?symbol=${item.symbol}&token=${FINNHUB_API_KEY}`,
                        { next: { revalidate: 120 } }
                    );
                    if (!res.ok) return null;
                    const data = await res.json();
                    const changePercent = data.dp != null ? data.dp.toFixed(2) : null;
                    return {
                        name: item.fund,
                        strategy: item.strategy,
                        topHold: item.holding,
                        symbol: item.symbol,
                        price: data.c ? `$${data.c.toFixed(2)}` : null,
                        change: changePercent !== null
                            ? `${parseFloat(changePercent) >= 0 ? '+' : ''}${changePercent}%`
                            : null,
                        aum: FUND_AUMS[item.fund] || 'N/A',
                    };
                } catch {
                    return null;
                }
            })
        );

        const funds = results.filter(Boolean);
        return NextResponse.json({ timestamp: new Date().toISOString(), funds });
    } catch (error) {
        console.error('Hedge funds error:', error);
        return NextResponse.json({ error: 'Failed to fetch hedge fund data' }, { status: 500 });
    }
}
