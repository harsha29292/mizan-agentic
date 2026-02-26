import { NextResponse } from 'next/server';

// A small curated list of major financial cities for weather alerts.
const CITIES = [
  { name: 'New York', lat: 40.7128, lng: -74.006, country: 'USA' },
  { name: 'London', lat: 51.5074, lng: -0.1278, country: 'UK' },
  { name: 'Tokyo', lat: 35.6762, lng: 139.6503, country: 'Japan' },
  { name: 'Hong Kong', lat: 22.3193, lng: 114.1694, country: 'Hong Kong' },
  { name: 'Singapore', lat: 1.3521, lng: 103.8198, country: 'Singapore' },
  { name: 'Dubai', lat: 25.2048, lng: 55.2708, country: 'UAE' },
  { name: 'Frankfurt', lat: 50.1109, lng: 8.6821, country: 'Germany' },
];

const OPENWEATHER_URL = 'https://api.openweathermap.org/data/3.0/onecall';

export async function GET() {
  const apiKey = process.env.OPENWEATHER_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENWEATHER_API_KEY is not configured on the server.' },
      { status: 500 },
    );
  }

  try {
    const results = await Promise.allSettled(
      CITIES.map(async (city) => {
        const url = new URL(OPENWEATHER_URL);
        url.searchParams.set('lat', String(city.lat));
        url.searchParams.set('lon', String(city.lng));
        url.searchParams.set('appid', apiKey);
        url.searchParams.set('units', 'metric');
        url.searchParams.set('exclude', 'current,minutely,hourly,daily');

        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`Failed for ${city.name} (${res.status})`);
        }
        const data = await res.json();
        return { city, data };
      }),
    );

    const features = [];

    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const { city, data } = r.value;
      const alerts = Array.isArray(data?.alerts) ? data.alerts : [];

      for (const alert of alerts) {
        const id =
          alert.id ??
          `${city.name}-${alert.event ?? 'alert'}-${alert.start ?? Date.now()}`;

        const labelParts = [alert.event ?? 'Weather Alert', city.name];
        const label = labelParts.filter(Boolean).join(' • ');

        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [city.lng, city.lat],
          },
          properties: {
            id,
            label,
            category: 'weather_alerts',
            color: '#f97316',
            value: 0.8,
          },
        });
      }
    }

    return NextResponse.json({
      type: 'FeatureCollection',
      features,
    });
  } catch (err) {
    console.error('Error fetching OpenWeather alerts', err);
    return NextResponse.json(
      { error: 'Failed to load weather alert data' },
      { status: 500 },
    );
  }
}

