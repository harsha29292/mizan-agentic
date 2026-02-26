import { NextResponse } from 'next/server';

const USGS_URL =
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson';

export async function GET() {
  try {
    const res = await fetch(USGS_URL, { cache: 'no-store' });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch USGS data (${res.status})` },
        { status: 502 },
      );
    }

    const data = await res.json();

    const features = Array.isArray(data?.features)
      ? data.features
        .map((f) => {
          const g = f?.geometry;
          const p = f?.properties ?? {};
          if (!g || g.type !== 'Point' || !Array.isArray(g.coordinates)) {
            return null;
          }

          const [lng, lat] = g.coordinates;
          const mag = p.mag ?? p.magnitude;
          const place = p.place ?? 'Earthquake';

          return {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [lng, lat],
            },
            properties: {
              id: p.id ?? f.id ?? `${lat},${lng},${mag ?? ''}`,
              label: mag ? `M${mag} • ${place}` : place,
              category: 'danger_zones',
              color: '#ef4444',
              value:
                typeof mag === 'number'
                  ? Math.max(0.1, Math.min(mag / 10, 1))
                  : 0.6,
            },
          };
        })
        .filter(Boolean)
      : [];

    return NextResponse.json({
      type: 'FeatureCollection',
      features,
    });
  } catch (err) {
    console.error('Error fetching USGS earthquakes feed', err);
    return NextResponse.json(
      { error: 'Failed to load earthquake data' },
      { status: 500 },
    );
  }
}

