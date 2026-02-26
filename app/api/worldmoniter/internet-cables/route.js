import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Major global internet cable backbones (proxies)
const CABLES = [
    // Atlantic
    { id: 'c1', label: 'TAT-14 (Atlantic)', startLat: 40.7128, startLng: -74.006, endLat: 51.5074, endLng: -0.1278 },
    { id: 'c2', label: 'MAREA (USA-Spain)', startLat: 36.8529, startLng: -75.978, endLat: 43.3623, endLng: -8.4115 },

    // Pacific
    { id: 'c3', label: 'Pacific Crossing (PC-1)', startLat: 34.0522, startLng: -118.2437, endLat: 35.6762, endLng: 139.6503 },
    { id: 'c4', label: 'FASTER (USA-Japan)', startLat: 45.5231, startLng: -122.6765, endLat: 34.7024, endLng: 137.7286 },

    // Europe - Asia / Middle East
    { id: 'c5', label: 'SEA-ME-WE 5', startLat: 43.2965, startLng: 5.3698, endLat: 1.3521, endLng: 103.8198 },
    { id: 'c6', label: 'India-Europe (I-ME-WE)', startLat: 19.076, startLng: 72.8777, endLat: 41.9028, endLng: 12.4964 },

    // South America / Africa
    { id: 'c7', label: 'SACS (Brazil-Angola)', startLat: -3.7319, startLng: -38.5267, endLat: -8.839, endLng: 13.2894 },
    { id: 'c8', label: 'Sail-1 (Africa-Brazil)', startLat: 4.0511, startLng: 9.7679, endLat: -3.7172, endLng: -38.5431 },
];

export async function GET() {
    try {
        const features = CABLES.map(c => ({
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: [[c.startLng, c.startLat], [c.endLng, c.endLat]]
            },
            properties: {
                id: c.id,
                label: c.label,
                category: 'internet_cables',
                color: '#38bdf8', // Sky blue
                startLat: c.startLat,
                startLng: c.startLng,
                endLat: c.endLat,
                endLng: c.endLng,
            }
        }));

        return NextResponse.json({
            type: 'FeatureCollection',
            features
        });
    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
