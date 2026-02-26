/* eslint-disable react/jsx-no-useless-fragment */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { geoGraticule10, geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import {
  DEFAULT_LAYERS,
  SAMPLE_POINTS,
  normalizePoints,
  clamp
} from './EarthGlobe';

const WORLD_ATLAS_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

function useElementSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const cr = entry.contentRect;
      setSize({
        width: Math.max(0, Math.round(cr.width)),
        height: Math.max(0, Math.round(cr.height))
      });
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return size;
}

export default function WorldMap({
  isDarkMode = true,
  points = null,
  layers = DEFAULT_LAYERS,
  dataConfigUrl = null,
  selectedRegion = 'GLOBAL'
}) {
  const { t } = useTranslation();
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [remoteData, setRemoteData] = useState({
    status: 'idle',
    layers: null,
    points: null
  });
  const [enabled, setEnabled] = useState(() => {
    const out = {};
    for (const l of layers) out[l.id] = Boolean(l.defaultOn);
    return out;
  });
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [atlas, setAtlas] = useState({ status: 'idle', topo: null });
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [layersPanelCollapsed, setLayersPanelCollapsed] = useState(false);
  const dragRef = useRef({ dragging: false, x: 0, y: 0, startX: 0, startY: 0, pointerId: null });
  const size = useElementSize(containerRef);

  const effectiveLayers = useMemo(() => {
    return (remoteData.layers && remoteData.layers.length ? remoteData.layers : layers) || DEFAULT_LAYERS;
  }, [remoteData.layers, layers]);

  useEffect(() => {
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

        for (const l of cfgLayers) {
          const type = String(l?.type || '');
          const src = String(l?.src || '');
          if (!l?.id || !l?.label || !src || type !== 'points') continue;

          let url = src;
          if (src.startsWith('/')) {
            url = src;
          } else if (!/^https?:\/\//i.test(src)) {
            url = `${baseDir}${src}`;
          }

          const res = await fetch(url, { cache: 'no-store' });
          if (!res.ok) continue;
          const data = await res.json();

          const normalized = normalizePoints(data).map((p) => ({
            ...p,
            category: p.category ?? l.id,
            color: p.color ?? l.color
          }));
          pointsOut.push(...normalized);
        }

        if (cancelled) return;
        setRemoteData({
          status: 'loaded',
          layers: cfgLayers,
          points: pointsOut
        });
      } catch {
        if (cancelled) return;
        setRemoteData({ status: 'error', layers: null, points: null });
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

  const filteredPoints = useMemo(
    () => allPoints.filter((p) => enabled[p.category] !== false),
    [allPoints, enabled]
  );

  const theme = useMemo(
    () =>
      isDarkMode
        ? {
          panelBg: 'rgba(10, 10, 12, 0.85)',
          panelBorder: 'rgba(255,255,255,0.12)',
          text: '#e5e7eb',
          subtext: 'rgba(229,231,235,0.65)',
          land: '#071023',
          land2: '#020617',
          border: 'rgba(148,163,184,0.35)',
          graticule: 'rgba(148,163,184,0.16)',
          oceanTop: '#040712',
          oceanBottom: '#050b1f',
          glow: 'rgba(56,189,248,0.18)',
          buttonBg: 'rgba(17, 24, 39, 0.65)',
          buttonBorder: 'rgba(255,255,255,0.12)'
        }
        : {
          panelBg: 'rgba(255, 255, 255, 0.9)',
          panelBorder: 'rgba(17,24,39,0.16)',
          text: '#111827',
          subtext: 'rgba(17,24,39,0.55)',
          land: '#f3f4f6',
          land2: '#e5e7eb',
          border: 'rgba(15,23,42,0.22)',
          graticule: 'rgba(15,23,42,0.10)',
          oceanTop: '#f8fafc',
          oceanBottom: '#eef2ff',
          glow: 'rgba(37,99,235,0.12)',
          buttonBg: 'rgba(255,255,255,0.75)',
          buttonBorder: 'rgba(17,24,39,0.16)'
        },
    [isDarkMode]
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setAtlas({ status: 'loading', topo: null });
      try {
        const res = await fetch(WORLD_ATLAS_URL, { cache: 'force-cache' });
        if (!res.ok) throw new Error('Failed to load world atlas');
        const topo = await res.json();
        if (cancelled) return;
        setAtlas({ status: 'loaded', topo });
      } catch {
        if (cancelled) return;
        setAtlas({ status: 'error', topo: null });
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const { projection, countries, borders, graticule, pathGen } = useMemo(() => {
    const width = size.width || 960;
    const height = size.height || 640;

    const projection = geoNaturalEarth1();

    let countries = null;
    let borders = null;
    if (atlas.status === 'loaded' && atlas.topo) {
      try {
        const cs = feature(atlas.topo, atlas.topo.objects.countries);
        countries = cs;
        borders = mesh(atlas.topo, atlas.topo.objects.countries, (a, b) => a !== b);
        projection.fitExtent(
          [
            [18, 18],
            [width - 18, height - 18]
          ],
          cs
        );
      } catch {
        // ignore parse errors, show empty map state
      }
    }

    const graticule = geoGraticule10();
    const pathGen = geoPath(projection);

    return { projection, countries, borders, graticule, pathGen };
  }, [atlas.status, atlas.topo, size.width, size.height]);

  const projectedPoints = useMemo(() => {
    const out = [];
    if (!projection) return out;

    for (const p of filteredPoints) {
      const lat = Number(p.lat);
      const lng = Number(p.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const xy = projection([lng, lat]);
      if (!xy) continue;
      out.push({
        ...p,
        __x: xy[0],
        __y: xy[1]
      });
    }

    return out;
  }, [filteredPoints, projection]);

  const resetView = () => setView({ k: 1, x: 0, y: 0 });

  useEffect(() => {
    if (selectedRegion === 'GLOBAL' || !selectedRegion) {
      resetView();
    } else {
      const width = size.width || 960;
      const height = size.height || 640;

      // Define regional view settings for 2D map
      // x, y are offsets, k is scale
      const regionViews = {
        'AMERICAS': { k: 2, x: width * 0.4, y: height * 0.1 },
        'EUROPE': { k: 3.5, x: -width * 1.1, y: -height * 0.1 },
        'ASIA': { k: 2.5, x: -width * 1.5, y: -height * 0.2 },
        'AFRICA': { k: 2.5, x: -width * 1.0, y: -height * 0.6 },
        'OCEANIA': { k: 3, x: -width * 2.1, y: -height * 1.2 },
        'MENA': { k: 3.5, x: -width * 1.4, y: -height * 0.5 },
        'LATIN AMERICA': { k: 2.5, x: width * 0.5, y: -height * 0.8 }
      };

      const v = regionViews[selectedRegion];
      if (v) {
        // We need to calculate x, y to center the region
        // The clampView will ensure it stays in bounds
        setView(clampView({ k: v.k, x: v.x, y: v.y }));
      }
    }
  }, [selectedRegion, size.width, size.height]);

  const clampView = (next) => {
    const width = size.width || 960;
    const height = size.height || 640;
    const k = clamp(next.k, 1, 8);

    // Keep the map roughly in bounds (simple clamp; works well visually)
    const pad = 40;
    const maxX = pad * k;
    const minX = -width * (k - 1) - pad * k;
    const maxY = pad * k;
    const minY = -height * (k - 1) - pad * k;

    return {
      k,
      x: clamp(next.x, minX, maxX),
      y: clamp(next.y, minY, maxY)
    };
  };

  const onWheel = (e) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    setView((prev) => {
      const direction = e.deltaY > 0 ? -1 : 1;
      const factor = direction > 0 ? 1.10 : 1 / 1.10;
      const k2 = clamp(prev.k * factor, 1, 8);

      // zoom around cursor
      const x2 = cx - ((cx - prev.x) * k2) / prev.k;
      const y2 = cy - ((cy - prev.y) * k2) / prev.k;
      return clampView({ k: k2, x: x2, y: y2 });
    });
  };

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    const svg = svgRef.current;
    if (!svg) return;

    dragRef.current.dragging = true;
    setIsDragging(true);
    dragRef.current.pointerId = e.pointerId;
    dragRef.current.startX = e.clientX;
    dragRef.current.startY = e.clientY;
    dragRef.current.x = view.x;
    dragRef.current.y = view.y;
    svg.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!dragRef.current.dragging) return;
    if (dragRef.current.pointerId !== e.pointerId) return;

    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;

    setView((prev) => clampView({ ...prev, x: dragRef.current.x + dx, y: dragRef.current.y + dy }));
  };

  const onPointerUp = (e) => {
    if (dragRef.current.pointerId !== e.pointerId) return;
    dragRef.current.dragging = false;
    dragRef.current.pointerId = null;
    setIsDragging(false);

    const svg = svgRef.current;
    if (svg) {
      try {
        svg.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

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

  return (
    <div className="relative w-full h-[640px] rounded-2xl overflow-hidden border border-white/10 select-none">
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(1200px 720px at 30% 20%, ${theme.glow} 0%, transparent 52%), linear-gradient(180deg, ${theme.oceanTop} 0%, ${theme.oceanBottom} 100%)`
        }}
      />

      <div ref={containerRef} className="absolute inset-0">
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          className="block"
          onWheel={onWheel}
          onClick={() => setSelected(null)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{
            cursor: isDragging ? 'grabbing' : 'grab',
            touchAction: 'none'
          }}
        >
          <defs>
            <linearGradient id="wm-land" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.land} />
              <stop offset="100%" stopColor={theme.land2} />
            </linearGradient>
            <filter id="wm-softGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feColorMatrix
                in="blur"
                type="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.6 0"
                result="glow"
              />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {atlas.status === 'loaded' && countries ? (
              <>
                <path d={pathGen(graticule)} fill="none" stroke={theme.graticule} strokeWidth={0.6 / view.k} />

                {countries.features.map((f, i) => (
                  <path key={f.id || f.properties?.name || i} d={pathGen(f)} fill="url(#wm-land)" stroke="none" />
                ))}

                {borders ? (
                  <path d={pathGen(borders)} fill="none" stroke={theme.border} strokeWidth={0.9 / view.k} />
                ) : null}

                {projectedPoints.map((p) => {
                  const r = 3.2 + clamp(Number(p.value ?? 0.6), 0.05, 1.0) * 3.5;
                  const color = p.color || (isDarkMode ? '#93c5fd' : '#2563eb');
                  const label = String(p.label ?? 'Location');
                  const cat = String(p.category ?? '').replaceAll('_', ' ');

                  return (
                    <g
                      key={p.id ?? `${p.lat},${p.lng},${label}`}
                      transform={`translate(${p.__x} ${p.__y})`}
                      onPointerEnter={(e) => {
                        const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                        setHovered({
                          id: p.id ?? label,
                          label,
                          category: cat,
                          color,
                          clientX: e.clientX,
                          clientY: e.clientY,
                          rectLeft: rect?.left ?? 0,
                          rectTop: rect?.top ?? 0
                        });
                      }}
                      onPointerLeave={() => setHovered(null)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(p);
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <circle r={r + 4} fill={color} opacity={isDarkMode ? 0.08 : 0.10} filter="url(#wm-softGlow)" />
                      <circle r={r} fill={color} opacity={0.92} />
                      <circle r={Math.max(1.4, r * 0.34)} fill="white" opacity={isDarkMode ? 0.55 : 0.40} />
                    </g>
                  );
                })}
              </>
            ) : null}

            {atlas.status === 'loading' ? (
              <text x="24" y="36" fill={theme.subtext} style={{ fontFamily: "'Courier New', 'Courier', monospace" }}>
                {t('common.loading_map')}
              </text>
            ) : null}

            {atlas.status === 'error' ? (
              <text x="24" y="36" fill={theme.subtext} style={{ fontFamily: "'Courier New', 'Courier', monospace" }}>
                {t('common.map_error')}
              </text>
            ) : null}
          </g>
        </svg>
      </div>

      {/* Left layers panel — collapse with Up button so map is fully visible */}
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
                {filteredPoints.length} {t('common.active')}
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
                title="Hide panel — map visible completely"
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
                  title={`${l.label} (color on map)`}
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
                resetView();
                setSelected(null);
              }}
            >
              {t('common.reset')}
            </button>
          </div>
        </div>
      )}

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
        <div className="font-extrabold tracking-wide uppercase">{t('dashboard.world_map')}</div>
        <div style={{ color: theme.subtext }}>
          {t('common.map_controls')} · {selected ? `${t('common.selected')}: ${selected.label ?? selected.id}` : `${filteredPoints.length} ${t('common.active_locations')}`}
        </div>
      </div>

      {/* Hover tooltip */}
      {hovered ? (
        <div
          className="absolute z-20 px-3 py-2 rounded-xl border pointer-events-none"
          style={{
            left: Math.round(hovered.clientX - hovered.rectLeft + 12),
            top: Math.round(hovered.clientY - hovered.rectTop + 12),
            background: theme.panelBg,
            borderColor: theme.panelBorder,
            color: theme.text,
            backdropFilter: 'blur(10px)',
            fontFamily: "'Courier New', 'Courier', monospace",
            maxWidth: 260
          }}
        >
          <div className="text-[12px] font-extrabold tracking-tight" style={{ color: hovered.color }}>
            {hovered.label}
          </div>
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: theme.subtext }}>
            {hovered.category}
          </div>
        </div>
      ) : null}
    </div>
  );
}

