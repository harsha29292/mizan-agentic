import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const CRYPTO_SYMBOLS = {
  "BTC": { name: "Bitcoin", symbol: "BTCUSD" },
  "ETH": { name: "Ethereum", symbol: "ETHUSD" },
  "SOL": { name: "Solana", symbol: "SOLUSD" },
  "BNB": { name: "BNB", symbol: "BNBUSD" },
  "XRP": { name: "XRP", symbol: "XRPUSD" },
  "ADA": { name: "Cardano", symbol: "ADAUSD" },
  "DOGE": { name: "Dogecoin", symbol: "DOGEUSD" },
  "DOT": { name: "Polkadot", symbol: "DOTUSD" },
  "MATIC": { name: "Polygon", symbol: "MATICUSD" },
  "AVAX": { name: "Avalanche", symbol: "AVAXUSD" }
};

const getCryptoData = async () => {
  try {
    const symbolsList = Object.values(CRYPTO_SYMBOLS).map(item => item.symbol).join('+');
    const res = await fetch(
      `https://stooq.com/q/l/?s=${symbolsList}&f=sd2t2ohlcv&h&e=csv`,
      { next: { revalidate: 300 } }
    );

    if (!res.ok) throw new Error(`Stooq API error: ${res.status}`);

    const csvText = await res.text();
    const lines = csvText.trim().split('\n');
    const dataLines = lines.slice(1);

    const results = {};

    dataLines.forEach(line => {
      const [symbol, date, time, open, high, low, close, volume] = line.split(',');
      if (!close || close === 'n/a') return;

      // Find our key for this Stooq symbol
      const cryptoKey = Object.keys(CRYPTO_SYMBOLS).find(key => CRYPTO_SYMBOLS[key].symbol === symbol);
      if (!cryptoKey) return;

      const price = parseFloat(close);
      const openPrice = parseFloat(open);
      const change = price - openPrice;
      const changePercent = (change / openPrice) * 100;

      results[cryptoKey] = {
        name: CRYPTO_SYMBOLS[cryptoKey].name,
        price: price.toFixed(2),
        change: change.toFixed(2),
        changePercent: changePercent.toFixed(2)
      };
    });

    return {
      timestamp: new Date().toISOString(),
      data: results
    };
  } catch (error) {
    console.error('Error fetching crypto data from Stooq:', error);
    return { timestamp: new Date().toISOString(), data: {} };
  }
};

export async function GET() {
  try {
    const data = await getCryptoData();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch crypto data' }, { status: 500 });
  }
}

