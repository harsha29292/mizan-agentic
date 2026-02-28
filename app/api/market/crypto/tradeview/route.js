import { NextResponse } from 'next/server';

// CoinGecko API for OHLC data
const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';

// Map common coin names/IDs to CoinGecko IDs
const COIN_ID_MAP = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'SOL': 'solana',
  'XRP': 'ripple',
  'ADA': 'cardano',
  'DOGE': 'dogecoin',
  'DOT': 'polkadot',
  'MATIC': 'matic-network',
  'LTC': 'litecoin',
  'AVAX': 'avalanche-2',
  'LINK': 'chainlink',
  'UNI': 'uniswap',
  'ATOM': 'cosmos',
  'XLM': 'stellar',
  'VET': 'vechain',
  'FIL': 'filecoin',
  'TRX': 'tron',
  'ETC': 'ethereum-classic',
  'NEAR': 'near',
  'ALGO': 'algorand',
  'SAND': 'the-sandbox',
  'MANA': 'decentraland',
  'AXS': 'axie-infinity',
  'AAVE': 'aave',
  'GRT': 'the-graph',
  'MKR': 'maker',
  'SNX': 'havven',
  'CRV': 'curve-dao-token',
  'LDO': 'lido-dao',
  'APT': 'aptos'
};

// Get CoinGecko ID from symbol
const getCoinId = (coinIdOrSymbol) => {
  const upperSymbol = coinIdOrSymbol.toUpperCase();
  
  // Check if it's already a CoinGecko ID
  if (COINGECKO_BASE_URL.includes(coinIdOrSymbol.toLowerCase())) {
    return coinIdOrSymbol.toLowerCase();
  }
  
  // Check if it's a mapped symbol
  if (COIN_ID_MAP[upperSymbol]) {
    return COIN_ID_MAP[upperSymbol];
  }
  
  // Assume it's already a CoinGecko ID
  return coinIdOrSymbol.toLowerCase();
};

// Fetch OHLC data from CoinGecko
const getOHLCData = async (coinId, days = 7) => {
  try {
    const response = await fetch(
      `${COINGECKO_BASE_URL}/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`,
      { next: { revalidate: 60 } } // Cache for 60 seconds
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch OHLC data: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Transform data to more readable format
    // CoinGecko returns: [timestamp, open, high, low, close]
    const ohlcData = data.map(candle => ({
      timestamp: candle[0],
      date: new Date(candle[0]).toISOString(),
      open: candle[1],
      high: candle[2],
      low: candle[3],
      close: candle[4]
    }));
    
    return ohlcData;
  } catch (error) {
    console.error('Error fetching OHLC data:', error);
    return null;
  }
};

// Generate mock OHLC data for fallback
const generateMockOHLCData = (coinId, days = 7) => {
  const data = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  
  // Base prices for major coins
  const basePrices = {
    'bitcoin': 64000,
    'ethereum': 3400,
    'solana': 145,
    'ripple': 0.62,
    'cardano': 0.45,
    'dogecoin': 0.12
  };
  
  let basePrice = basePrices[coinId] || 100;
  const volatility = basePrice * 0.02; // 2% volatility
  
  for (let i = days; i >= 0; i--) {
    const timestamp = now - (i * dayMs);
    const change = (Math.random() - 0.5) * volatility;
    const open = basePrice;
    const close = basePrice + change;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;
    
    data.push({
      timestamp,
      date: new Date(timestamp).toISOString(),
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2))
    });
    
    basePrice = close;
  }
  
  return data;
};

// Get supported coins list
const getSupportedCoins = () => {
  return Object.entries(COIN_ID_MAP).map(([symbol, id]) => ({
    symbol,
    id,
    name: symbol // Could add more names here
  }));
};

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const coin = searchParams.get('coin') || 'bitcoin';
    const days = parseInt(searchParams.get('days')) || 7;
    
    // Validate days parameter (CoinGecko supports: 1, 7, 14, 30, 90, 365, max)
    const validDays = [1, 7, 14, 30, 90, 365, 'max'];
    const daysParam = validDays.includes(days) ? days : 7;
    
    const coinId = getCoinId(coin);
    
    // Try to fetch real data first
    let ohlcData = await getOHLCData(coinId, daysParam);
    
    // If API fails, use mock data
    if (!ohlcData || ohlcData.length === 0) {
      ohlcData = generateMockOHLCData(coinId, typeof daysParam === 'number' ? daysParam : 7);
    }
    
    // Get current price for reference
    let currentPrice = null;
    try {
      const priceResponse = await fetch(
        `${COINGECKO_BASE_URL}/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`,
        { next: { revalidate: 30 } }
      );
      if (priceResponse.ok) {
        const priceData = await priceResponse.json();
        if (priceData[coinId]) {
          currentPrice = {
            usd: priceData[coinId].usd,
            change_24h: priceData[coinId].usd_24h_change
          };
        }
      }
    } catch (e) {
      console.log('Could not fetch current price');
    }
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      coin: {
        id: coinId,
        symbol: coin.toUpperCase()
      },
      timeframe: {
        days: daysParam,
        label: `${daysParam === 'max' ? 'Max' : daysParam + ' days'}`
      },
      currentPrice,
      data: ohlcData,
      supportedCoins: getSupportedCoins()
    });
  } catch (error) {
    console.error('Error in tradeview API:', error);
    return NextResponse.json({ error: 'Failed to fetch tradeview data' }, { status: 500 });
  }
}
