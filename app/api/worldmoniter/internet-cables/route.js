import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Cache for 6 hours
let cache = { data: null, fetchedAt: 0 };
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

// TeleGeography v3 GeoJSON endpoints
const CABLES_URL = 'https://www.submarinecablemap.com/api/v3/cable/cable-geo.json';
const LANDING_URL = 'https://www.submarinecablemap.com/api/v3/landing-point/landing-point-geo.json';

const COLORS = [
    'rgba(56,189,248,0.85)',
    'rgba(34,211,238,0.78)',
    'rgba(99,102,241,0.72)',
    'rgba(139,92,246,0.68)',
    'rgba(6,182,212,0.80)',
    'rgba(14,165,233,0.75)',
];

// Curated fallback - Major global submarine cables
const FALLBACK = [
    { id: 'c01', label: 'TAT-14 (USA–UK) 3.2 Tbps', sLat: 40.71, sLng: -74.01, eLat: 51.51, eLng: -1.78 },
    { id: 'c02', label: 'MAREA (USA–Spain) 200 Tbps', sLat: 36.85, sLng: -75.98, eLat: 43.36, eLng: -8.41 },
    { id: 'c03', label: 'SEA-ME-WE 5 (Europe–Asia)', sLat: 43.30, sLng: 5.37, eLat: 1.35, eLng: 103.82 },
    { id: 'c04', label: 'EIG (Europe-India Gateway)', sLat: 50.80, sLng: -1.09, eLat: 18.92, eLng: 72.83 },
    { id: 'c05', label: 'WACS (Africa-Europe)', sLat: 50.82, sLng: -1.18, eLat: -33.92, eLng: 18.42 },
    { id: 'c06', label: 'PC-1 (USA-Japan)', sLat: 34.05, sLng: -118.24, eLat: 35.68, eLng: 139.65 },
    { id: 'c07', label: 'SJC (South-East Asia)', sLat: 35.68, sLng: 139.76, eLat: 1.35, eLng: 103.82 },
    { id: 'c08', label: 'BRICS Cable', sLat: -33.92, sLng: 18.42, eLat: 19.07, eLng: 72.87 },
    { id: 'c09', label: 'Monet (USA-Brazil)', sLat: 25.76, sLng: -80.19, eLat: -23.55, eLng: -46.63 },
    { id: 'c10', label: 'ACS (Alaska-Oregon)', sLat: 61.21, sLng: -149.90, eLat: 45.51, eLng: -122.67 }
];

async function fetchJson(url) {
    try {
        const res = await fetch(url, { cache: 'no-store', headers: { 'User-Agent': 'worldmoniter/1.0' } });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

function buildFeaturesFromGeo(cableGeo, landingGeo) {
    if (!cableGeo?.features?.length || !landingGeo?.features?.length) return null;
    const lpMap = {};
    for (const feat of landingGeo.features) {
        const id = feat.id ?? feat.properties?.id;
        if (!id) continue;
        const [lng, lat] = feat.geometry?.coordinates ?? [];
        if (typeof lng === 'number' && typeof lat === 'number') {
            lpMap[id] = { lat, lng, name: feat.properties?.name ?? '' };
        }
    }
    const features = [];
    let colorIdx = 0;
    for (const feat of cableGeo.features) {
        const props = feat.properties || {};
        const landingIds = Array.isArray(props.landing_points) ? props.landing_points : [];
        if (landingIds.length < 2) continue;
        const coords = [];
        for (const lpId of landingIds) {
            const lp = lpMap[lpId];
            if (lp) coords.push([lp.lng, lp.lat]);
        }
        if (coords.length < 2) continue;
        const color = COLORS[colorIdx % COLORS.length];
        colorIdx++;
        features.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: coords },
            properties: {
                id: props.cable_id || props.id || `cable_${features.length}`,
                label: props.name || 'Unnamed Cable',
                category: 'internet_cables',
                color,
                value: 0.80,
                source: 'telegeography-live',
            },
        });
    }
    return features.length ? { type: 'FeatureCollection', features } : null;
}

function buildFallback() {
    const features = FALLBACK.map((c, i) => ({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[c.sLng, c.sLat], [c.eLng, c.eLat]] },
        properties: {
            id: c.id,
            label: c.label,
            category: 'internet_cables',
            color: COLORS[i % COLORS.length],
            value: 0.80,
            source: 'fallback',
        },
    }));
    return { type: 'FeatureCollection', features };
}

export async function GET() {
    const now = Date.now();
    if (cache.data && now - cache.fetchedAt < CACHE_TTL_MS) {
        return NextResponse.json(cache.data, { headers: { 'Cache-Control': 'public, max-age=3600', 'X-Data-Source': 'cache' } });
    }
    const [cableGeo, landingGeo] = await Promise.all([fetchJson(CABLES_URL), fetchJson(LANDING_URL)]);
    const live = buildFeaturesFromGeo(cableGeo, landingGeo);
    const result = live ?? buildFallback();
    const source = live ? 'telegeography-live' : 'fallback';
    cache = { data: result, fetchedAt: now };
    return NextResponse.json(result, { headers: { 'Cache-Control': 'public, max-age=3600', 'X-Data-Source': source } });
}
