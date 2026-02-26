import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const FINNHUB_API_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;

const CRYPTO_SYMBOLS = {
  "BTC": { name: "Bitcoin", symbol: "BINANCE:BTCUSDT" },
  "ETH": { name: "Ethereum", symbol: "BINANCE:ETHUSDT" },
  "SOL": { name: "Solana", symbol: "BINANCE:SOLUSDT" },
  "BNB": { name: "BNB", symbol: "BINANCE:BNBUSDT" },
  "XRP": { name: "XRP", symbol: "BINANCE:XRPUSDT" },
  "ADA": { name: "Cardano", symbol: "BINANCE:ADAUSDT" },
  "DOGE": { name: "Dogecoin", symbol: "BINANCE:DOGEUSDT" },
  "DOT": { name: "Polkadot", symbol: "BINANCE:DOTUSDT" },
  "MATIC": { name: "Polygon", symbol: "BINANCE:MATICUSDT" },
  "AVAX": { name: "Avalanche", symbol: "BINANCE:AVAXUSDT" }
};

const getCryptoData = async () => {
  if (!FINNHUB_API_KEY) {
    return { timestamp: new Date().toISOString(), data: {} };
  }

  const results = {};

  try {
    const fetchPromises = Object.entries(CRYPTO_SYMBOLS).map(async ([key, item]) => {
      try {
        const response = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${item.symbol}&token=${FINNHUB_API_KEY}`,
          { next: { revalidate: 300 } }
        );

        if (!response.ok) return null;

        const data = await response.json();
        if (!data.c) return null;

        return {
          key,
          name: item.name,
          price: data.c.toFixed(2),
          change: data.d ? data.d.toFixed(2) : "0.00",
          changePercent: data.dp ? data.dp.toFixed(2) : "0.00"
        };
      } catch (e) {
        return null;
      }
    });

    const settledResults = await Promise.all(fetchPromises);
    settledResults.forEach(res => {
      if (res) {
        results[res.key] = {
          name: res.name,
          price: res.price,
          change: res.change,
          changePercent: res.changePercent
        };
      }
    });

    return {
      timestamp: new Date().toISOString(),
      data: results
    };
  } catch (error) {
    console.error('Error fetching crypto data:', error);
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

