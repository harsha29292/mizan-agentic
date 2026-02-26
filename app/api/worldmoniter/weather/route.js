import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Comprehensive list of major global cities across all continents
const CITIES = [
  // North America
  { name: 'New York', lat: 40.7128, lng: -74.006, country: 'USA' },
  { name: 'Los Angeles', lat: 34.0522, lng: -118.2437, country: 'USA' },
  { name: 'Toronto', lat: 43.6532, lng: -79.3832, country: 'Canada' },
  { name: 'Mexico City', lat: 19.4326, lng: -99.1332, country: 'Mexico' },

  // South America
  { name: 'Sao Paulo', lat: -23.5505, lng: -46.6333, country: 'Brazil' },
  { name: 'Buenos Aires', lat: -34.6037, lng: -58.3816, country: 'Argentina' },
  { name: 'Santiago', lat: -33.4489, lng: -70.6693, country: 'Chile' },

  // Europe
  { name: 'London', lat: 51.5074, lng: -0.1278, country: 'UK' },
  { name: 'Paris', lat: 48.8566, lng: 2.3522, country: 'France' },
  { name: 'Frankfurt', lat: 50.1109, lng: 8.6821, country: 'Germany' },
  { name: 'Madrid', lat: 40.4168, lng: -3.7038, country: 'Spain' },
  { name: 'Rome', lat: 41.9028, lng: 12.4964, country: 'Italy' },
  { name: 'Zurich', lat: 47.3769, lng: 8.5417, country: 'Switzerland' },

  // Asia
  { name: 'Tokyo', lat: 35.6762, lng: 139.6503, country: 'Japan' },
  { name: 'Hong Kong', lat: 22.3193, lng: 114.1694, country: 'Hong Kong' },
  { name: 'Singapore', lat: 1.3521, lng: 103.8198, country: 'Singapore' },
  { name: 'Mumbai', lat: 19.076, lng: 72.8777, country: 'India' },
  { name: 'Beijing', lat: 39.9042, lng: 116.4074, country: 'China' },
  { name: 'Seoul', lat: 37.5665, lng: 126.978, country: 'South Korea' },
  { name: 'Bangkok', lat: 13.7563, lng: 100.5018, country: 'Thailand' },

  // Middle East
  { name: 'Dubai', lat: 25.2048, lng: 55.2708, country: 'UAE' },
  { name: 'Riyadh', lat: 24.7136, lng: 46.6753, country: 'Saudi Arabia' },

  // Africa
  { name: 'Johannesburg', lat: -26.2041, lng: 28.0473, country: 'South Africa' },
  { name: 'Cairo', lat: 30.0444, lng: 31.2357, country: 'Egypt' },
  { name: 'Lagos', lat: 6.5244, lng: 3.3792, country: 'Nigeria' },
  { name: 'Nairobi', lat: -1.2921, lng: 36.8219, country: 'Kenya' },

  // Oceania
  { name: 'Sydney', lat: -33.8688, lng: 151.2093, country: 'Australia' },
  { name: 'Auckland', lat: -36.8485, lng: 174.7633, country: 'New Zealand' },
];

const OPENWEATHER_URL = 'https://api.openweathermap.org/data/2.5/weather';

export async function GET() {
  const apiKey = process.env.OPENWEATHER_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      type: 'FeatureCollection',
      features: [],
      note: 'OPENWEATHER_API_KEY is not configured.'
    });
  }

  try {
    const results = await Promise.allSettled(
      CITIES.map(async (city) => {
        const url = new URL(OPENWEATHER_URL);
        url.searchParams.set('lat', String(city.lat));
        url.searchParams.set('lon', String(city.lng));
        url.searchParams.set('appid', apiKey);
        url.searchParams.set('units', 'metric');

        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return { city, data: await res.json() };
      }),
    );

    const features = [];
    const failures = [];

    for (const r of results) {
      if (r.status !== 'fulfilled') {
        failures.push(r.reason.message);
        continue;
      }
      const { city, data } = r.value;
      const temp = data?.main?.temp;
      const desc = data?.weather?.[0]?.description ?? 'Clear';

      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [city.lng, city.lat] },
        properties: {
          id: `weather-${city.name}`,
          label: `${city.name}: ${Math.round(temp)}°C, ${desc}`,
          category: 'weather_alerts',
          color: temp > 30 ? '#f97316' : (temp < 0 ? '#93c5fd' : '#38bdf8'),
          value: 0.5,
        },
      });
    }

    return NextResponse.json({
      type: 'FeatureCollection',
      features,
      debug: {
        total: CITIES.length,
        ok: features.length,
        failed: failures.length,
        firstFail: failures[0]
      }
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
