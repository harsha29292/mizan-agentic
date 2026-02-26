import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Major global/transnational pipelines (water/resource proxies)
const PIPELINES = [
    // Nord Stream (Proxy)
    { id: 'p1', label: 'Baltic Pipeline', startLat: 54.1, startLng: 13.6, endLat: 60.1, endLng: 28.1 },

    // Middle East
    { id: 'p2', label: 'East-West Pipeline (Saudi)', startLat: 24.7, startLng: 49.3, endLat: 23.9, endLng: 38.3 },

    // Americas
    { id: 'p3', label: 'Keystone Proxy', startLat: 51.1, startLng: -114.0, endLat: 38.6, endLng: -90.2 },
    { id: 'p4', label: 'South American Link', startLat: -23.5, startLng: -46.6, endLat: -34.6, endLng: -58.3 },

    // Central Asia
    { id: 'p5', label: 'Trans-Caspian Link', startLat: 40.4, startLng: 49.8, endLat: 37.9, endLng: 58.3 },

    // Africa
    { id: 'p6', label: 'Great Man-Made River (Libya)', startLat: 25.0, startLng: 16.0, endLat: 32.0, endLng: 13.0 },
];

export async function GET() {
    try {
        const features = PIPELINES.map(p => ({
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: [[p.startLng, p.startLat], [p.endLng, p.endLat]]
            },
            properties: {
                id: p.id,
                label: p.label,
                category: 'water_pipelines',
                color: '#10b981', // Emerald green
                startLat: p.startLat,
                startLng: p.startLng,
                endLat: p.endLat,
                endLng: p.endLng,
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
