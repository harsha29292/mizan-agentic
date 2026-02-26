'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const Globe = dynamic(() => import('react-globe.gl'), { ssr: false });

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function normalizePoints(input) {
  if (!input) return [];

  // GeoJSON FeatureCollection/Feature (Point)
  if (input.type === 'FeatureCollection' && Array.isArray(input.features)) {
    return input.features
      .map((f) => {
        const g = f && f.geometry;
        if (!g || g.type !== 'Point' || !Array.isArray(g.coordinates)) return null;
        const [lng, lat] = g.coordinates;
        return {
          id: f.id ?? f.properties?.id ?? `${lat},${lng}`,
          lat,
          lng,
          label: f.properties?.label ?? f.properties?.name ?? 'Location',
          category: f.properties?.category ?? 'Other',
          color: f.properties?.color,
          value: f.properties?.value
        };
      })
      .filter(Boolean);
  }

  // Already normalized array
  if (Array.isArray(input)) return input;

  return [];
}

export function normalizeArcs(input) {
  if (!input) return [];

  // GeoJSON FeatureCollection/Feature (LineString)
  if (input.type === 'FeatureCollection' && Array.isArray(input.features)) {
    return input.features
      .map((f) => {
        const g = f && f.geometry;
        if (!g || g.type !== 'LineString' || !Array.isArray(g.coordinates)) return null;
        const start = g.coordinates[0];
        const end = g.coordinates[g.coordinates.length - 1];
        if (!start || !end) return null;
        const [startLng, startLat] = start;
        const [endLng, endLat] = end;
        return {
          id: f.id ?? f.properties?.id ?? `${startLat},${startLng}->${endLat},${endLng}`,
          startLat,
          startLng,
          endLat,
          endLng,
          label: f.properties?.label ?? f.properties?.name ?? 'Connection',
          category: f.properties?.category ?? 'Connections',
          color: f.properties?.color,
          value: f.properties?.value
        };
      })
      .filter(Boolean);
  }

  if (Array.isArray(input)) return input;
  return [];
}

export const DEFAULT_LAYERS = [

];

// Small placeholder dataset. Replace with your own GeoJSON / arrays.
export const SAMPLE_POINTS = [
  { id: 'nyse', lat: 40.7069, lng: -74.0113, label: 'NYSE', category: 'stock_exchanges', color: '#f59e0b', value: 1 },
  { id: 'nasdaq', lat: 40.757, lng: -73.9855, label: 'NASDAQ', category: 'stock_exchanges', color: '#f59e0b', value: 1 },
  { id: 'lse', lat: 51.5142, lng: -0.0931, label: 'LSE', category: 'stock_exchanges', color: '#f59e0b', value: 1 },
  { id: 'tse', lat: 35.6828, lng: 139.767, label: 'Tokyo Stock Exchange', category: 'stock_exchanges', color: '#f59e0b', value: 1 },
  { id: 'hkex', lat: 22.283, lng: 114.1588, label: 'HKEX', category: 'stock_exchanges', color: '#f59e0b', value: 1 },

  { id: 'london', lat: 51.5072, lng: -0.1276, label: 'London', category: 'financial_centers', color: '#10b981', value: 0.9 },
  { id: 'singapore', lat: 1.2903, lng: 103.8519, label: 'Singapore', category: 'financial_centers', color: '#10b981', value: 0.9 },
  { id: 'dubai', lat: 25.2048, lng: 55.2708, label: 'Dubai', category: 'financial_centers', color: '#10b981', value: 0.8 },

  { id: 'fed', lat: 38.8921, lng: -77.0444, label: 'Federal Reserve', category: 'central_banks', color: '#60a5fa', value: 1 },
  { id: 'ecb', lat: 50.1109, lng: 8.6821, label: 'ECB', category: 'central_banks', color: '#60a5fa', value: 1 },
  { id: 'boj', lat: 35.6828, lng: 139.767, label: 'Bank of Japan', category: 'central_banks', color: '#60a5fa', value: 1 },

  { id: 'houston', lat: 29.7604, lng: -95.3698, label: 'Houston', category: 'commodity_hubs', color: '#f97316', value: 0.7 },
  { id: 'rotterdam', lat: 51.9244, lng: 4.4777, label: 'Rotterdam', category: 'commodity_hubs', color: '#f97316', value: 0.7 },

  { id: 'portfolio_a', lat: 37.7749, lng: -122.4194, label: 'Investments (SF)', category: 'investments', color: '#a78bfa', value: 0.6 },
  { id: 'portfolio_b', lat: 52.52, lng: 13.405, label: 'Investments (Berlin)', category: 'investments', color: '#a78bfa', value: 0.6 }
];

export const SAMPLE_ARCS = [
  { id: 'cable_1', startLat: 40.7069, startLng: -74.0113, endLat: 51.5142, endLng: -0.0931, category: 'undersea_cables', color: 'rgba(56,189,248,0.75)', value: 1 },
  { id: 'cable_2', startLat: 51.5142, startLng: -0.0931, endLat: 1.2903, endLng: 103.8519, category: 'undersea_cables', color: 'rgba(56,189,248,0.65)', value: 0.9 },
  { id: 'cable_3', startLat: 1.2903, startLng: 103.8519, endLat: 35.6828, endLng: 139.767, category: 'undersea_cables', color: 'rgba(56,189,248,0.6)', value: 0.85 },

  { id: 'pipe_1', startLat: 29.7604, startLng: -95.3698, endLat: 38.8921, endLng: -77.0444, category: 'pipelines', color: 'rgba(34,197,94,0.55)', value: 0.7 }
];

export default function EarthGlobe({
  isDarkMode = true,
  points = null,
  arcs = null,
  layers = DEFAULT_LAYERS,
  dataConfigUrl = null,
  initialView = { lat: 20, lng: 0, altitude: 2.1 },
  selectedRegion = 'GLOBAL'
}) {
  const { t } = useTranslation();
  const globeRef = useRef(null);
  const [remoteData, setRemoteData] = useState({ status: 'idle', layers: null, points: null, arcs: null });
  const [enabled, setEnabled] = useState(() => {
    const out = {};
    for (const l of layers) out[l.id] = Boolean(l.defaultOn);
    return out;
  });
  const [selected, setSelected] = useState(null);
  const [layersPanelCollapsed, setLayersPanelCollapsed] = useState(false);

  const effectiveLayers = useMemo(() => {
    return (remoteData.layers && remoteData.layers.length ? remoteData.layers : layers) || DEFAULT_LAYERS;
  }, [remoteData.layers, layers]);

  useEffect(() => {
    // Ensure toggle state contains all current layers (preserve existing toggles)
    setEnabled((prev) => {
      const next = { ...prev };
      for (const l of effectiveLayers) {
        if (!(l.id in next)) next[l.id] = Boolean(l.defaultOn);
      }
      return next;
    });
  }, [effectiveLayers]);

  useEffect(() => {
    if (!dataConfigUrl) return;

    let cancelled = false;
    const baseDir = dataConfigUrl.replace(/[^/]+$/, '');

    const load = async () => {
      setRemoteData((p) => ({ ...p, status: 'loading' }));

      try {
        const cfgRes = await fetch(dataConfigUrl, { cache: 'no-store' });
        if (!cfgRes.ok) throw new Error(`Failed to load ${dataConfigUrl} (${cfgRes.status})`);
        const cfg = await cfgRes.json();
        const cfgLayers = Array.isArray(cfg?.layers) ? cfg.layers : [];

        const pointsOut = [];
        const arcsOut = [];

        for (const l of cfgLayers) {
          const type = String(l?.type || '');
          const src = String(l?.src || '');
          if (!l?.id || !l?.label || !src || (type !== 'points' && type !== 'arcs')) continue;

          let url = src;
          if (src.startsWith('/')) {
            // Absolute path on same origin (e.g. "/api/…", "/worldmoniter/…")
            url = src;
          } else if (!/^https?:\/\//i.test(src)) {
            // Relative path under the same directory as the config file
            url = `${baseDir}${src}`;
          }

          const res = await fetch(url, { cache: 'no-store' });
          if (!res.ok) continue;
          const data = await res.json();

          if (type === 'points') {
            const normalized = normalizePoints(data).map((p) => ({
              ...p,
              category: p.category ?? l.id,
              color: p.color ?? l.color
            }));
            pointsOut.push(...normalized);
          } else {
            const normalized = normalizeArcs(data).map((a) => ({
              ...a,
              category: a.category ?? l.id,
              color: a.color ?? l.color
            }));
            arcsOut.push(...normalized);
          }
        }

        if (cancelled) return;
        setRemoteData({
          status: 'loaded',
          layers: cfgLayers,
          points: pointsOut,
          arcs: arcsOut
        });
      } catch {
        if (cancelled) return;
        setRemoteData({ status: 'error', layers: null, points: null, arcs: null });
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [dataConfigUrl]);

  const allPoints = useMemo(() => {
    const remotePoints = normalizePoints(remoteData.points);
    if (remotePoints.length) return remotePoints;
    const userPoints = normalizePoints(points);
    return userPoints.length ? userPoints : SAMPLE_POINTS;
  }, [remoteData.points, points]);

  const allArcs = useMemo(() => {
    const remoteArcs = normalizeArcs(remoteData.arcs);
    if (remoteArcs.length) return remoteArcs;
    const userArcs = normalizeArcs(arcs);
    return userArcs.length ? userArcs : SAMPLE_ARCS;
  }, [remoteData.arcs, arcs]);

  const filteredPoints = useMemo(() => {
    return allPoints.filter((p) => enabled[p.category] !== false);
  }, [allPoints, enabled]);

  const filteredArcs = useMemo(() => {
    return allArcs.filter((a) => enabled[a.category] !== false);
  }, [allArcs, enabled]);

  const layerCounts = useMemo(() => {
    const counts = {};
    for (const l of effectiveLayers) counts[l.id] = 0;
    for (const p of allPoints) {
      const cat = String(p.category ?? '');
      if (!cat) continue;
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [allPoints, effectiveLayers]);

  const theme = useMemo(() => {
    return isDarkMode
      ? {
        panelBg: 'rgba(10, 10, 12, 0.85)',
        panelBorder: 'rgba(255,255,255,0.12)',
        text: '#e5e7eb',
        subtext: 'rgba(229,231,235,0.65)',
        buttonBg: 'rgba(17, 24, 39, 0.65)',
        buttonBorder: 'rgba(255,255,255,0.12)'
      }
      : {
        panelBg: 'rgba(255, 255, 255, 0.86)',
        panelBorder: 'rgba(17,24,39,0.16)',
        text: '#111827',
        subtext: 'rgba(17,24,39,0.55)',
        buttonBg: 'rgba(255,255,255,0.75)',
        buttonBorder: 'rgba(17,24,39,0.16)'
      };
  }, [isDarkMode]);

  // Consolidate POV logic into one effect that handles both selectedRegion and initialView changes
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;

    try {
      const regionViews = {
        'AMERICAS': { lat: 20, lng: -100, altitude: 1.8 },
        'EUROPE': { lat: 48, lng: 15, altitude: 1.5 },
        'ASIA': { lat: 30, lng: 110, altitude: 1.8 },
        'AFRICA': { lat: 0, lng: 20, altitude: 1.8 },
        'OCEANIA': { lat: -25, lng: 140, altitude: 1.5 },
        'MENA': { lat: 25, lng: 45, altitude: 1.5 },
        'LATIN AMERICA': { lat: -15, lng: -60, altitude: 1.8 }
      };

      const targetView = (selectedRegion === 'GLOBAL' || !selectedRegion)
        ? { lat: initialView.lat, lng: initialView.lng, altitude: initialView.altitude }
        : (regionViews[selectedRegion] || { lat: initialView.lat, lng: initialView.lng, altitude: initialView.altitude });

      // Compare current POV with target to avoid tiny jumpy resets if values are very close
      const currentPov = g.pointOfView();
      const dist = Math.abs(currentPov.lat - targetView.lat) + Math.abs(currentPov.lng - targetView.lng) + Math.abs(currentPov.altitude - targetView.altitude);

      // If we are far enough or it's a region change, animate
      if (dist > 0.01) {
        g.pointOfView(targetView, 1200);
      }
    } catch {
      // Ignore
    }
  }, [selectedRegion, initialView.lat, initialView.lng, initialView.altitude]);

  return (
    <div className={`relative w-full h-[640px] rounded-2xl overflow-hidden border transition-colors ${isDarkMode ? 'border-white/10' : 'border-gray-200'}`}>
      <Globe
        key={isDarkMode ? 'dark' : 'light'}
        ref={globeRef}
        backgroundColor={isDarkMode ? '#050608' : '#ffffff'}
        globeImageUrl={isDarkMode ? "//unpkg.com/three-globe/example/img/earth-night.jpg" : "//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"}
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        showAtmosphere
        atmosphereColor={isDarkMode ? 'rgba(120,190,255,0.55)' : 'rgba(100,180,255,0.30)'}
        atmosphereAltitude={0.22}
        width={undefined}
        height={undefined}
        pointsData={filteredPoints}
        pointLat="lat"
        pointLng="lng"
        pointColor={(d) => d.color || (isDarkMode ? '#93c5fd' : '#2563eb')}
        pointAltitude={(d) => 0.02 + clamp(Number(d.value ?? 0.6), 0.05, 1.0) * 0.10}
        pointRadius={(d) => 0.18 + clamp(Number(d.value ?? 0.6), 0.05, 1.0) * 0.35}
        pointResolution={24}
        onPointClick={(d) => setSelected(d)}
        pointLabel={(d) => {
          const label = String(d.label ?? 'Location');
          const cat = String(d.category ?? '');
          return `<div style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">
            <div style="font-weight: 700; margin-bottom: 4px;">${label}</div>
            <div style="opacity: 0.75; font-size: 12px;">${cat.replaceAll('_', ' ')}</div>
          </div>`;
        }}
        arcsData={filteredArcs}
        arcStartLat="startLat"
        arcStartLng="startLng"
        arcEndLat="endLat"
        arcEndLng="endLng"
        arcColor={(d) => d.color || (isDarkMode ? 'rgba(56,189,248,0.75)' : 'rgba(37,99,235,0.55)')}
        arcAltitude={(d) => 0.08 + clamp(Number(d.value ?? 0.8), 0.05, 1.0) * 0.26}
        arcStroke={0.7}
        arcDashLength={0.55}
        arcDashGap={1.8}
        arcDashAnimateTime={3200}
      />



      {/* Left layers panel — match WorldMap UI with collapse + colors + counts */}
      {layersPanelCollapsed ? (
        <button
          type="button"
          className="absolute top-12 left-3 z-10 px-3 py-2 rounded-xl border flex items-center gap-2 transition-opacity hover:opacity-90"
          style={{
            background: theme.panelBg,
            borderColor: theme.panelBorder,
            color: theme.text,
            backdropFilter: 'blur(10px)',
            fontFamily: "'Courier New', 'Courier', monospace",
            fontSize: '11px',
            fontWeight: 700
          }}
          onClick={() => setLayersPanelCollapsed(false)}
          title="Show layers panel"
        >
          {t('common.layers')}
          <span style={{ color: theme.subtext }}>▼</span>
        </button>
      ) : (
        <div
          className="absolute top-12 left-3 w-[270px] rounded-xl border p-3 z-10"
          style={{
            background: theme.panelBg,
            borderColor: theme.panelBorder,
            color: theme.text,
            backdropFilter: 'blur(10px)',
            fontFamily: "'Courier New', 'Courier', monospace"
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="text-[12px] font-extrabold tracking-wider">{t('common.layers')}</div>
            <div className="flex items-center gap-2">
              <span className="text-[11px]" style={{ color: theme.subtext }}>
                {filteredPoints.length} {t('common.pts')} · {filteredArcs.length} {t('common.links')}
              </span>
              <button
                type="button"
                className="w-7 h-7 rounded border flex items-center justify-center text-[12px] font-bold"
                style={{
                  background: theme.buttonBg,
                  borderColor: theme.buttonBorder,
                  color: theme.text
                }}
                onClick={() => setLayersPanelCollapsed(true)}
                title="Hide panel — globe visible completely"
              >
                ▲
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {effectiveLayers.map((l) => (
              <label key={l.id} className="flex items-center gap-2 text-[11px] font-bold cursor-pointer select-none">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: l.color ?? '#94a3b8' }}
                  title={`${l.label} (color on globe)`}
                />
                <input
                  type="checkbox"
                  checked={enabled[l.id] !== false}
                  onChange={(e) => setEnabled((prev) => ({ ...prev, [l.id]: e.target.checked }))}
                  className="accent-emerald-400"
                />
                <span className="uppercase tracking-wide">{l.label}</span>
                <span className="ml-auto text-[10px]" style={{ color: theme.subtext }}>
                  {layerCounts[l.id] ?? 0}
                </span>
              </label>
            ))}
          </div>

          {dataConfigUrl ? (
            <div className="mt-2 text-[10px]" style={{ color: theme.subtext }}>
              Data: {remoteData.status === 'loaded' ? 'worldmoniter' : remoteData.status}
            </div>
          ) : null}

          <div className="mt-3 flex items-center gap-2">
            <button
              className="px-2 py-1 text-[10px] font-bold rounded border"
              style={{ background: theme.buttonBg, borderColor: theme.buttonBorder, color: theme.text }}
              onClick={() => {
                const next = {};
                for (const l of effectiveLayers) next[l.id] = true;
                setEnabled(next);
              }}
            >
              {t('common.all_on')}
            </button>
            <button
              className="px-2 py-1 text-[10px] font-bold rounded border"
              style={{ background: theme.buttonBg, borderColor: theme.buttonBorder, color: theme.text }}
              onClick={() => {
                const next = {};
                for (const l of effectiveLayers) next[l.id] = false;
                setEnabled(next);
              }}
            >
              {t('common.all_off')}
            </button>
            <button
              className="ml-auto px-2 py-1 text-[10px] font-bold rounded border"
              style={{ background: theme.buttonBg, borderColor: theme.buttonBorder, color: theme.text }}
              onClick={() => {
                const g = globeRef.current;
                if (!g) return;
                try {
                  g.pointOfView({ lat: initialView.lat, lng: initialView.lng, altitude: initialView.altitude }, 700);
                } catch {
                  // ignore
                }
              }}
            >
              {t('common.reset')}
            </button>
          </div>
        </div>
      )}

      {/* Right controls */}
      <div className="absolute top-12 right-3 flex flex-col gap-2">
        <button
          className="w-9 h-9 rounded border text-[14px] font-extrabold"
          style={{
            background: theme.buttonBg,
            borderColor: theme.buttonBorder,
            color: theme.text,
            backdropFilter: 'blur(8px)'
          }}
          onClick={() => {
            const g = globeRef.current;
            if (!g) return;
            try {
              const pov = g.pointOfView();
              g.pointOfView({ ...pov, altitude: clamp(pov.altitude - 0.25, 0.8, 4.0) }, 350);
            } catch {
              // ignore
            }
          }}
          title="Zoom in"
        >
          +
        </button>
        <button
          className="w-9 h-9 rounded border text-[14px] font-extrabold"
          style={{
            background: theme.buttonBg,
            borderColor: theme.buttonBorder,
            color: theme.text,
            backdropFilter: 'blur(8px)'
          }}
          onClick={() => {
            const g = globeRef.current;
            if (!g) return;
            try {
              const pov = g.pointOfView();
              g.pointOfView({ ...pov, altitude: clamp(pov.altitude + 0.25, 0.8, 4.0) }, 350);
            } catch {
              // ignore
            }
          }}
          title="Zoom out"
        >
          −
        </button>
      </div>

      {/* Bottom info bar */}
      <div
        className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-2 rounded-xl border text-[11px] flex items-center gap-3"
        style={{
          background: theme.panelBg,
          borderColor: theme.panelBorder,
          color: theme.text,
          backdropFilter: 'blur(10px)',
          fontFamily: "'Courier New', 'Courier', monospace"
        }}
      >
        <div className="font-extrabold tracking-wide">{t('regions.GLOBAL')}</div>
        <div style={{ color: theme.subtext }}>
          {selected ? `${t('common.selected')}: ${selected.label ?? selected.id}` : t('common.inspect')}
        </div>
      </div>
    </div>
  );
}

