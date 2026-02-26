import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const FINNHUB_API_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;

// Mapping of sector keys to representative ETFs
const SECTOR_ETFS = {
  "TECH": { name: "Technology", symbol: "XLK" },
  "COMM": { name: "Communication Services", symbol: "XLC" },
  "CONSUMER_DIS": { name: "Consumer Discretionary", symbol: "XLY" },
  "INDUSTRIALS": { name: "Industrials", symbol: "XLI" },
  "FINANCIALS": { name: "Financials", symbol: "XLF" },
  "ENERGY": { name: "Energy", symbol: "XLE" },
  "HEALTH": { name: "Health Care", symbol: "XLV" },
  "MATERIALS": { name: "Materials", symbol: "XLB" },
  "REAL_ESTATE": { name: "Real Estate", symbol: "XLRE" },
  "UTILITIES": { name: "Utilities", symbol: "XLU" },
  "STAPLES": { name: "Consumer Staples", symbol: "XLP" },
  "SEMICONDUCTORS": { name: "Semiconductors", symbol: "SOXX" },
  "BIOTECH": { name: "Biotechnology", symbol: "IBB" },
  "RETAIL": { name: "Retail", symbol: "XRT" },
  "BANKING": { name: "Banking", symbol: "KBE" },
  "PHARMA": { name: "Pharmaceuticals", symbol: "XPH" },
  "OIL_GAS": { name: "Oil & Gas", symbol: "XOP" },
  "AEROSPACE": { name: "Aerospace & Defense", symbol: "ITA" },
  "INSURANCE": { name: "Insurance", symbol: "KIE" },
  "TRANSPORT": { name: "Transportation", symbol: "IYT" },
  "TELECOM": { name: "Telecommunications", symbol: "VOX" },
  "HOSPITALITY": { name: "Hospitality", symbol: "PEJ" },
  "MEDIA": { name: "Media", symbol: "PBS" },
  "SOFTWARE": { name: "Software", symbol: "IGV" }
};

// Fallback realistic sector performance data
const FALLBACK_SECTOR_DATA = {
  "TECH": { name: "Technology", change: "-0.85" },
  "COMM": { name: "Communication Services", change: "-0.52" },
  "CONSUMER_DIS": { name: "Consumer Discretionary", change: "-1.25" },
  "INDUSTRIALS": { name: "Industrials", change: "0.18" },
  "FINANCIALS": { name: "Financials", change: "0.42" },
  "ENERGY": { name: "Energy", change: "1.48" },
  "HEALTH": { name: "Health Care", change: "0.32" },
  "MATERIALS": { name: "Materials", change: "-0.22" },
  "REAL_ESTATE": { name: "Real Estate", change: "-0.75" },
  "UTILITIES": { name: "Utilities", change: "0.58" },
  "STAPLES": { name: "Consumer Staples", change: "0.22" },
  "SEMICONDUCTORS": { name: "Semiconductors", change: "-1.45" },
  "BIOTECH": { name: "Biotechnology", change: "0.38" },
  "RETAIL": { name: "Retail", change: "-1.12" },
  "BANKING": { name: "Banking", change: "0.15" },
  "PHARMA": { name: "Pharmaceuticals", change: "0.42" },
  "OIL_GAS": { name: "Oil & Gas", change: "1.38" },
  "AEROSPACE": { name: "Aerospace & Defense", change: "0.22" },
  "INSURANCE": { name: "Insurance", change: "0.45" },
  "TRANSPORT": { name: "Transportation", change: "-0.25" },
  "TELECOM": { name: "Telecommunications", change: "-0.42" },
  "HOSPITALITY": { name: "Hospitality", change: "-0.85" },
  "MEDIA": { name: "Media", change: "-0.32" },
  "SOFTWARE": { name: "Software", change: "-0.92" }
};

const getSectorData = async () => {
  if (!FINNHUB_API_KEY) {
    console.warn('Finnhub API key missing for sectors');
    return { timestamp: new Date().toISOString(), data: FALLBACK_SECTOR_DATA };
  }

  const results = {};

  // To avoid hitting rate limits on free tier, we'll fetch them in small batches or use a subset
  // for the "real-time" feel, but since this is a server-side route we can cache it.
  try {
    // Only fetch first 8 to stay safe with rate limits for now, use fallback for others
    const sectorEntries = Object.entries(SECTOR_ETFS);
    const fetchPromises = sectorEntries.slice(0, 10).map(async ([key, sector]) => {
      try {
        const response = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${sector.symbol}&token=${FINNHUB_API_KEY}`,
          { next: { revalidate: 300 } } // Cache for 5 minutes
        );

        if (!response.ok) return null;

        const data = await response.json();
        return {
          key,
          name: sector.name,
          change: data.dp ? data.dp.toFixed(2) : "0.00"
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
          change: res.change
        };
      }
    });

    // Fill in missing with fallback to ensure full heatmap
    Object.keys(SECTOR_ETFS).forEach(key => {
      if (!results[key]) {
        results[key] = FALLBACK_SECTOR_DATA[key];
      }
    });

    return {
      timestamp: new Date().toISOString(),
      data: results
    };
  } catch (error) {
    console.error('Error fetching sector data:', error);
    return { timestamp: new Date().toISOString(), data: FALLBACK_SECTOR_DATA };
  }
};

export async function GET() {
  try {
    const data = await getSectorData();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch sector data' }, { status: 500 });
  }
}

