import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const FINNHUB_API_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;

const COMMODITY_SYMBOLS = {
  "GOLD": { name: "Gold", symbol: "GLD" },
  "SILVER": { name: "Silver", symbol: "SLV" },
  "PLATINUM": { name: "Platinum", symbol: "PPLT" },
  "PALLADIUM": { name: "Palladium", symbol: "PALL" },
  "OIL_WTI": { name: "Oil (WTI)", symbol: "USO" },
  "OIL_BRENT": { name: "Oil (Brent)", symbol: "BNO" },
  "NATURAL_GAS": { name: "Natural Gas", symbol: "UNG" },
  "COPPER": { name: "Copper", symbol: "CPER" },
  "ALUMINUM": { name: "Aluminum", symbol: "JJUA" }, // ETN proxy
  "CORN": { name: "Corn", symbol: "CORN" },
  "WHEAT": { name: "Wheat", symbol: "WEAT" },
  "SOYBEANS": { name: "Soybeans", symbol: "SOYB" },
  "SUGAR": { name: "Sugar", symbol: "CANE" },
  "COFFEE": { name: "Coffee", symbol: "JO" },
  "COTTON": { name: "Cotton", symbol: "BAL" }
};

const getCommoditiesData = async () => {
  if (!FINNHUB_API_KEY) {
    return { timestamp: new Date().toISOString(), data: {} };
  }

  const results = {};

  try {
    // Fetch in batches to be safe
    const fetchPromises = Object.entries(COMMODITY_SYMBOLS).map(async ([key, item]) => {
      try {
        const response = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${item.symbol}&token=${FINNHUB_API_KEY}`,
          { next: { revalidate: 300 } }
        );

        if (!response.ok) return null;

        const data = await response.json();
        if (!data.c) return null;

        let scale = 1;
        if (key === "GOLD") scale = 10; // GLD to Spot approx

        const price = (data.c * scale).toFixed(2);

        return {
          key,
          name: item.name,
          price: price,
          change: data.d ? (data.d * scale).toFixed(2) : "0.00",
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
    console.error('Error fetching commodities data:', error);
    return { timestamp: new Date().toISOString(), data: {} };
  }
};

export async function GET() {
  try {
    const data = await getCommoditiesData();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in commodities API:', error);
    return NextResponse.json({ error: 'Failed to fetch commodities data' }, { status: 500 });
  }
}


