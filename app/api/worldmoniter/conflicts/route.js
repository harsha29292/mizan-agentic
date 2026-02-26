import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const FINNHUB_API_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;

// Comprehensive global conflict hotspots mapping
const CONFLICT_HOTSPOTS = [
  { id: 'ukraine', label: 'Ukraine', lat: 48.3794, lng: 31.1656 },
  { id: 'gaza', label: 'Gaza Strip', lat: 31.5, lng: 34.4667 },
  { id: 'sudan', label: 'Sudan', lat: 15.5007, lng: 32.5599 },
  { id: 'yemen', label: 'Yemen', lat: 15.5527, lng: 48.5164 },
  { id: 'myanmar', label: 'Myanmar', lat: 21.9162, lng: 95.956 },
  { id: 'dr_congo', label: 'DR Congo', lat: -4.0383, lng: 21.7587 },
  { id: 'syria', label: 'Syria', lat: 34.8021, lng: 38.9968 },
  { id: 'sahel', label: 'Sahel Reg. (Mali/Niger)', lat: 17.5707, lng: -3.9962 },
  { id: 'haiti', label: 'Haiti', lat: 18.9712, lng: -72.2852 },
  { id: 'somalia', label: 'Somalia', lat: 5.1521, lng: 46.1996 },
  { id: 'ethiopia', label: 'Ethiopia', lat: 9.145, lng: 40.4897 },
  { id: 'south_sudan', label: 'South Sudan', lat: 6.877, lng: 31.307 },
  { id: 'libya', label: 'Libya', lat: 26.3351, lng: 17.2283 },
  { id: 'colombia', label: 'Colombia (Tensions)', lat: 4.5709, lng: -74.2973 },
  { id: 'afghanistan', label: 'Afghanistan', lat: 33.9391, lng: 67.71 },
];

export async function GET() {
  if (!FINNHUB_API_KEY) {
    return NextResponse.json({ error: 'No API key configured' }, { status: 500 });
  }

  try {
    const newsRes = await fetch(
      `https://finnhub.io/api/v1/news?category=general&token=${FINNHUB_API_KEY}`,
      { next: { revalidate: 600 } }
    );
    const news = newsRes.ok ? await newsRes.json() : [];
    const headlineStream = news.map(n => n.headline.toLowerCase()).join(' ');

    const features = CONFLICT_HOTSPOTS.map((p) => {
      const mentionCount = (headlineStream.match(new RegExp(p.label.toLowerCase(), 'g')) || []).length;
      const heat = Math.min(0.95, 0.4 + (mentionCount * 0.1));

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [p.lng, p.lat],
        },
        properties: {
          id: p.id,
          label: `Conflict • ${p.label}${mentionCount > 0 ? ` (Active News: ${mentionCount})` : ''}`,
          category: 'conflicts',
          color: '#fb7185',
          value: heat,
        },
      };
    });

    return NextResponse.json({
      type: 'FeatureCollection',
      features,
    });
  } catch (error) {
    console.error('Conflicts API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
