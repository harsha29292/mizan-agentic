import { NextResponse } from 'next/server';

// Static sample data for active or recent conflicts.
// Each feature is a simple point with minimal properties,
// matching the same GeoJSON shape used by the other layers.
const CONFLICT_POINTS = [
  {
    id: 'ukraine-conflict',
    label: 'War • Ukraine',
    lat: 48.3794,
    lng: 31.1656,
  },
  {
    id: 'gaza-conflict',
    label: 'Conflict • Gaza',
    lat: 31.5,
    lng: 34.4667,
  },
  {
    id: 'sudan-conflict',
    label: 'Conflict • Sudan',
    lat: 15.5007,
    lng: 32.5599,
  },
  {
    id: 'yemen-conflict',
    label: 'Conflict • Yemen',
    lat: 15.5527,
    lng: 48.5164,
  },
  {
    id: 'ethiopia-conflict',
    label: 'Conflict • Ethiopia (Tigray)',
    lat: 13.4967,
    lng: 39.4753,
  },
];

export async function GET() {
  try {
    const features = CONFLICT_POINTS.map((p) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [p.lng, p.lat],
      },
      properties: {
        id: p.id,
        label: p.label,
        category: 'conflicts',
        color: '#fb7185',
        value: 0.9,
      },
    }));

    return NextResponse.json({
      type: 'FeatureCollection',
      features,
    });
  } catch (err) {
    console.error('Error building conflicts data', err);
    return NextResponse.json(
      { error: 'Failed to load conflicts data' },
      { status: 500 },
    );
  }
}

