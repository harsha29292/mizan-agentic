import { NextResponse } from 'next/server';

// Real-time market news from Finnhub
const getEconomicNewsData = async () => {
  const API_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
  const url = `https://finnhub.io/api/v1/news?category=general&token=${API_KEY}`;

  try {
    const response = await fetch(url, {
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!response.ok) {
      throw new Error(`Finnhub News API error: ${response.status}`);
    }

    const data = await response.json();

    // Transform the data to match our dashboard format
    const news = (data || []).slice(0, 15).map((item, index) => ({
      id: item.id || index + 1,
      headline: item.headline || 'Market Update',
      source: item.source || 'Finnhub',
      timestamp: new Date(item.datetime * 1000).toISOString(),
      url: item.url,
      summary: item.summary
    }));

    return {
      timestamp: new Date().toISOString(),
      news: news
    };
  } catch (error) {
    console.error('Failed to fetch from Finnhub News:', error);
    return {
      timestamp: new Date().toISOString(),
      news: [],
      error: error.message
    };
  }
};

export async function GET() {
  try {
    const data = await getEconomicNewsData();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in economic news API route:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
