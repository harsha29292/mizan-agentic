import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const STOCK_SYMBOLS = [
    'AAPL.US', 'GOOGL.US', 'MSFT.US', 'AMZN.US', 'TSLA.US', 'META.US', 'NVDA.US', 'JPM.US', 'V.US', 'WMT.US',
    'JNJ.US', 'UNH.US', 'HD.US', 'PG.US', 'MA.US', 'DIS.US', 'NFLX.US', 'ADBE.US', 'CRM.US', 'INTC.US',
    'AMD.US', 'PYPL.US', 'UBER.US', 'COIN.US', 'SQ.US', 'SHOP.US', 'SPOT.US', 'ZM.US', 'SNAP.US'
];

const COMPANY_NAMES = {
    'AAPL.US': 'Apple Inc.', 'GOOGL.US': 'Alphabet Inc.', 'MSFT.US': 'Microsoft Corp.',
    'AMZN.US': 'Amazon.com Inc.', 'TSLA.US': 'Tesla Inc.', 'META.US': 'Meta Platforms',
    'NVDA.US': 'NVIDIA Corp.', 'JPM.US': 'JPMorgan Chase', 'V.US': 'Visa Inc.',
    'WMT.US': 'Walmart Inc.', 'JNJ.US': 'Johnson & Johnson', 'UNH.US': 'UnitedHealth',
    'HD.US': 'Home Depot', 'PG.US': 'Procter & Gamble', 'MA.US': 'Mastercard',
    'DIS.US': 'Walt Disney Co.', 'NFLX.US': 'Netflix Inc.', 'ADBE.US': 'Adobe Inc.',
    'CRM.US': 'Salesforce', 'INTC.US': 'Intel Corp.', 'AMD.US': 'AMD Inc.',
    'PYPL.US': 'PayPal', 'UBER.US': 'Uber Tech.', 'COIN.US': 'Coinbase',
    'SQ.US': 'Block Inc.', 'SHOP.US': 'Shopify', 'SPOT.US': 'Spotify',
    'ZM.US': 'Zoom Video', 'SNAP.US': 'Snap Inc.'
};

export async function GET() {
    try {
        const symbolsParam = STOCK_SYMBOLS.join('+');
        const res = await fetch(
            `https://stooq.com/q/l/?s=${symbolsParam}&f=sd2t2ohlcv&h&e=csv`,
            { next: { revalidate: 300 } }
        );

        if (!res.ok) throw new Error(`Stooq API error: ${res.status}`);

        const csvText = await res.text();
        const lines = csvText.trim().split('\n');

        // Skip header line
        const dataLines = lines.slice(1);

        const stocks = dataLines.map(line => {
            const [symbol, date, time, open, high, low, close, volume] = line.split(',');
            if (!close || close === 'n/a') return null;

            const price = parseFloat(close);
            const openPrice = parseFloat(open);
            const change = price - openPrice;
            const changePercent = (change / openPrice) * 100;

            return {
                symbol: symbol.split('.')[0], // Return original symbol format
                name: COMPANY_NAMES[symbol] || symbol,
                price: price.toFixed(2),
                change: change.toFixed(2),
                changePercent: changePercent.toFixed(2),
            };
        }).filter(s => s !== null);

        return NextResponse.json({ timestamp: new Date().toISOString(), stocks });
    } catch (error) {
        console.error('Stocks route error:', error);
        return NextResponse.json({ error: 'Failed to fetch stock data from Stooq' }, { status: 500 });
    }
}
