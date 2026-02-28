'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import MarketOverview from "@/components/MarketOverview";
import EarthGlobe from "@/components/EarthGlobe";
import WorldMap from "@/components/WorldMap";
import MarketDashboard from "@/components/MarketDashboard";
import { useAppState } from '@/components/AppStateContext';
import YouTubePlayer from "@/components/YouTubePlayer";

const TIME_RANGES = ['1h', '6h', '24h', '48h', '7d', 'All'];

const NEWS_SOURCES = [
  { id: 'BLOOMBERG', label: 'Bloomberg', videoId: 'iEpJwprxDdk', watchUrl: 'https://www.youtube.com/live/iEpJwprxDdk' },
  { id: 'SKYNEWS', label: 'Sky News', videoId: 'JtGYA39G1j8', watchUrl: 'https://www.youtube.com/live/JtGYA39G1j8' },
  { id: 'EURONEWS', label: 'Euronews', videoId: 'pykpO5kQJ98', watchUrl: 'https://www.youtube.com/live/pykpO5kQJ98' },
  { id: 'DW', label: 'DW News', videoId: 'LuKwFajn37U', watchUrl: 'https://www.youtube.com/live/LuKwFajn37U' },
  { id: 'CNBC', label: 'CNBC', videoId: '9NyxcX3rhQs', watchUrl: 'https://www.youtube.com/live/9NyxcX3rhQs' },
  { id: 'FRANCE24', label: 'FRANCE 24', videoId: 'Ap-UM1O9RBU', watchUrl: 'https://www.youtube.com/live/Ap-UM1O9RBU' },
  { id: 'ALJAZEERA', label: 'Al Jazeera', videoId: 'gCNeDWCI0vo', watchUrl: 'https://www.youtube.com/live/gCNeDWCI0vo' }
];

const WEBCAM_SOURCES = [
  { id: 'WASHINGTON', label: 'WASHINGTON', category: 'AMERICAS', videoId: '1wV9lLe14aU', watchUrl: 'https://www.youtube.com/live/1wV9lLe14aU?si=XryCAt7MIdxv9pWA' },
  { id: 'KYIV', label: 'KYIV', category: 'EUROPE', videoId: '-Q7FuPINDjA', watchUrl: 'https://www.youtube.com/live/-Q7FuPINDjA?si=peS67HkGgHmRgof1' },
  { id: 'JERUSALEM', label: 'JERUSALEM', category: 'MIDEAST', videoId: 'UyduhBUpO7Q', watchUrl: 'https://www.youtube.com/live/UyduhBUpO7Q?si=0HVLNCTtW55htoJ5' },
  { id: 'SEOUL', label: 'SEOUL', category: 'ASIA', videoId: '-JhoMGoAfFc', watchUrl: 'https://www.youtube.com/live/-JhoMGoAfFc?si=PDe_f6otUMPdSyjN' },
  { id: 'LOSANGELES', label: 'LOS ANGELES', category: 'AMERICAS', videoId: 'EO_1LWqsCNE', watchUrl: 'https://www.youtube.com/live/EO_1LWqsCNE?si=jVMeYAWvHMuhmLBW' },
  { id: 'NYC', label: 'NEW YORK', category: 'AMERICAS', videoId: '4qyZLflp-sI', watchUrl: 'https://www.youtube.com/live/4qyZLflp-sI?si=q5K1x1FT5_sRt1fi' },
  { id: 'MIAMI', label: 'MIAMI', category: 'AMERICAS', videoId: '5YCajRjvWCg', watchUrl: 'https://www.youtube.com/live/5YCajRjvWCg?si=L82Xb2uyY50dssJZ' },
  { id: 'ODESSA', label: 'ODESSA', category: 'EUROPE', videoId: 'e2gC37ILQmk', watchUrl: 'https://www.youtube.com/live/e2gC37ILQmk?si=luqzv39LBHnCj542' },
  { id: 'PARIS', label: 'PARIS', category: 'EUROPE', videoId: 'OzYp4NRZlwQ', watchUrl: 'https://www.youtube.com/live/OzYp4NRZlwQ?si=lXr6rQceswEGSqmT' },
  { id: 'STPETERSBURG', label: 'St.PETERSBURG', category: 'EUROPE', videoId: 'CjtIYbmVfck', watchUrl: 'https://www.youtube.com/live/CjtIYbmVfck?si=IRqPRSXM5UeyXpZr' },
  { id: 'TEHRAN', label: 'TEHRAN', category: 'MIDEAST', videoId: '-zGuR1qVKrU', watchUrl: 'https://www.youtube.com/live/-zGuR1qVKrU?si=ViPr7Vo6bWP4K1fO' },
  { id: 'TELAVIV', label: 'TEL AVIV', category: 'MIDEAST', videoId: '-VLcYT5QBrY', watchUrl: 'https://www.youtube.com/live/-VLcYT5QBrY?si=jBSZnTPBZan_Kaoq' },
  { id: 'MECCA', label: 'MECCA', category: 'MIDEAST', videoId: '4E-iFtUM2kk', watchUrl: 'https://www.youtube.com/live/4E-iFtUM2kk?si=B4A0zJZXVRkRJACc' },
  { id: 'TAIPEI', label: 'TAIPEI', category: 'ASIA', videoId: 'z_fY1pj1VBw', watchUrl: 'https://www.youtube.com/live/z_fY1pj1VBw?si=5_DfdUpoJANPYHMI' },
  { id: 'SHANGHAI', label: 'SHANGHAI', category: 'ASIA', videoId: '6dp-bvQ7RWo', watchUrl: 'https://www.youtube.com/live/6dp-bvQ7RWo?si=J2ubuaJOeVsXMnsj' },
  { id: 'TOKYO', label: 'TOKYO', category: 'ASIA', videoId: '4pu9sF5Qssw', watchUrl: 'https://www.youtube.com/live/4pu9sF5Qssw?si=aHB-3MEpaTlJvMA5' },
];

const WEBCAM_CATEGORIES = ['ALL', 'MIDEAST', 'EUROPE', 'AMERICAS', 'ASIA'];

function formatTime(date, timeZone, label) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: timeZone
    }).format(date) + ' ' + label;
  } catch {
    return '--:--:-- ' + label;
  }
}

const GLOBE_INITIAL_VIEW = { lat: 20, lng: 0, altitude: 2.3 };

export default function Home() {
  const { t } = useTranslation();
  const { isDarkMode, selectedRegion } = useAppState();
  const [mapMode, setMapMode] = useState('globe');
  const [timeRange, setTimeRange] = useState('All');
  const [times, setTimes] = useState({ utc: '', ny: '', local: '' });
  const [activeNewsSourceId, setActiveNewsSourceId] = useState(NEWS_SOURCES[0]?.id);
  const [webcamViewMode, setWebcamViewMode] = useState('grid');
  const [webcamCategory, setWebcamCategory] = useState('ALL');
  const [activeWebcamId, setActiveWebcamId] = useState(WEBCAM_SOURCES[0]?.id);

  const filteredWebcams = webcamCategory === 'ALL' ? WEBCAM_SOURCES.slice(0, 4) : WEBCAM_SOURCES.filter(w => w.category === webcamCategory).slice(0, 4);
  const activeWebcam = WEBCAM_SOURCES.find(w => w.id === activeWebcamId) || WEBCAM_SOURCES[0];

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTimes({
        utc: formatTime(now, 'UTC', 'UTC'),
        ny: formatTime(now, 'America/New_York', 'NY'),
        local: formatTime(now, undefined, 'LOC')
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h1 className={`dashboard-title text-lg lg:text-xl tracking-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('dashboard.title')}</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-4 text-[10px] font-mono text-gray-400 tabular-nums uppercase">
            <div className="flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-emerald-500/50" />
              <span>NY: {times.ny}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-blue-500/50" />
              <span>UTC: {times.utc}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-purple-500/50" />
              <span>LOC: {times.local}</span>
            </div>
          </div>
        </div>
      </header>

      <section className="w-full mb-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <span className="dashboard-panel-title text-gray-400"></span>
          <div className={`inline-flex rounded-full border overflow-hidden text-xs font-bold ${isDarkMode ? 'border-white/15' : 'border-gray-300'}`}>
            <button type="button" onClick={() => setMapMode('globe')} className={`px-3 py-1.5 transition-colors ${mapMode === 'globe' ? (isDarkMode ? 'bg-white text-black' : 'bg-gray-800 text-white') : (isDarkMode ? 'bg-transparent text-gray-400 hover:bg-white/10 hover:text-white' : 'bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-900')}`}>{t('dashboard.globe')}</button>
            <button type="button" onClick={() => setMapMode('map')} className={`px-3 py-1.5 border-l transition-colors ${mapMode === 'map' ? (isDarkMode ? 'bg-white text-black' : 'bg-gray-800 text-white') : (isDarkMode ? 'bg-transparent text-gray-400 hover:bg-white/10 hover:text-white' : 'bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-900')} ${isDarkMode ? 'border-white/15' : 'border-gray-300'}`}>{t('dashboard.world_map')}</button>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <div className={`lg:col-span-4 h-[640px] rounded-2xl border overflow-hidden flex flex-col ${isDarkMode ? 'border-white/10 bg-white/[0.03]' : 'border-gray-200 bg-white'}`}>
            <div className={`flex items-center justify-between px-4 py-2.5 border-b shrink-0 ${isDarkMode ? 'border-white/10' : 'border-gray-200'}`}>
              <span className={`dashboard-panel-title font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('dashboard.insights')}</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('dashboard.markets')}</span>
            </div>
            <div className="flex-1 min-h-0 p-2"><MarketOverview isDarkMode={isDarkMode} /></div>
          </div>
          <div className={`lg:col-span-8 rounded-2xl overflow-hidden border h-[640px] ${isDarkMode ? 'border-white/10' : 'border-gray-200'}`}>
            {mapMode === 'globe' ? (<EarthGlobe isDarkMode={isDarkMode} dataConfigUrl="/worldmoniter/layers.json" initialView={GLOBE_INITIAL_VIEW} selectedRegion={selectedRegion} />) : (<WorldMap isDarkMode={isDarkMode} dataConfigUrl="/worldmoniter/layers.json" selectedRegion={selectedRegion} />)}
          </div>

        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <div className={`lg:col-span-1 rounded-xl border overflow-hidden flex flex-col h-[340px] ${isDarkMode ? 'border-white/10 bg-white/[0.03]' : 'border-gray-200 bg-gray-50'}`}>
          <div className={`flex items-center justify-between px-4 py-2.5 border-b ${isDarkMode ? 'border-white/10' : 'border-gray-200'}`}>
            <div className="flex items-center gap-2">
              <span className={`dashboard-panel-title font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('dashboard.live_news')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="dot zoom w-2.5 h-2.5 bg-red-500 rounded-full" />
              <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider">{t('navbar.live')}</span>
            </div>
          </div>
          <div className={`p-2 border-b flex gap-1 flex-wrap ${isDarkMode ? 'border-white/10' : 'border-gray-200'}`}>
            {NEWS_SOURCES.map((src) => (<button key={src.id} type="button" onClick={() => setActiveNewsSourceId(src.id)} className={`px-2 py-1 text-[10px] font-bold rounded border transition-colors ${activeNewsSourceId === src.id ? (isDarkMode ? 'border-emerald-400 text-emerald-400' : 'border-emerald-600 text-emerald-600 bg-emerald-50') : (isDarkMode ? 'border-white/15 text-gray-400 hover:text-white hover:border-white/25' : 'border-gray-300 text-gray-500 hover:text-gray-900 hover:bg-gray-100')}`}>{src.id}</button>))}
          </div>
          <div className="flex-1 flex flex-col bg-black">
            <div className="flex-1">
              <YouTubePlayer
                key={activeNewsSourceId}
                videoId={NEWS_SOURCES.find((s) => s.id === activeNewsSourceId)?.videoId ?? NEWS_SOURCES[0].videoId}
                title="Live news stream"
              />
            </div>
            <div className={`px-3 py-1.5 border-t text-[10px] flex items-center justify-between ${isDarkMode ? 'border-white/10 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
              <span>{t('dashboard.source')}: <span className={`font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>{NEWS_SOURCES.find((s) => s.id === activeNewsSourceId)?.label ?? 'Live channel'}</span></span>
              <a href={NEWS_SOURCES.find((s) => s.id === activeNewsSourceId)?.watchUrl ?? NEWS_SOURCES[0].watchUrl} target="_blank" rel="noreferrer" className={`font-bold text-[10px] ${isDarkMode ? 'text-emerald-400 hover:text-emerald-300' : 'text-emerald-600 hover:text-emerald-700'}`}>{t('dashboard.open_youtube')}</a>
            </div>
          </div>
        </div>

        <div className={`lg:col-span-1 rounded-xl border overflow-hidden flex flex-col h-[340px] ${isDarkMode ? 'border-white/10 bg-white/[0.03]' : 'border-gray-200 bg-gray-50'}`}>
          <div className={`flex items-center justify-between px-4 py-2.5 border-b ${isDarkMode ? 'border-white/10' : 'border-gray-200'}`}>
            <span className={`dashboard-panel-title font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('dashboard.live_webcams')}</span>
          </div>
          <div className={`p-2 border-b flex gap-1 flex-wrap items-center justify-between ${isDarkMode ? 'border-white/10' : 'border-gray-200'}`}>
            <div className="flex gap-1 flex-wrap">
              {WEBCAM_CATEGORIES.map((r) => (<button key={r} type="button" onClick={() => setWebcamCategory(r)} className={`px-2 py-1 text-[10px] font-bold rounded border transition-colors ${webcamCategory === r ? (isDarkMode ? 'border-emerald-400 text-emerald-400' : 'border-emerald-600 text-emerald-600 bg-emerald-50') : (isDarkMode ? 'border-white/15 text-gray-400 hover:text-white hover:border-white/25' : 'border-gray-300 text-gray-500 hover:text-gray-900 hover:bg-gray-100')}`}>{r}</button>))}
            </div>
            <div className="flex gap-1">
              <button type="button" onClick={() => setWebcamViewMode('grid')} className={`px-2 py-1 text-[10px] font-bold rounded border transition-colors ${webcamViewMode === 'grid' ? (isDarkMode ? 'border-emerald-400 text-emerald-400' : 'border-emerald-600 text-emerald-600 bg-emerald-50') : (isDarkMode ? 'border-white/15 text-gray-400 hover:text-white hover:border-white/25' : 'border-gray-300 text-gray-500 hover:text-gray-900 hover:bg-gray-100')}`} title="4 boxes view">▣</button>
              <button type="button" onClick={() => setWebcamViewMode('single')} className={`px-2 py-1 text-[10px] font-bold rounded border transition-colors ${webcamViewMode === 'single' ? (isDarkMode ? 'border-emerald-400 text-emerald-400' : 'border-emerald-600 text-emerald-600 bg-emerald-50') : (isDarkMode ? 'border-white/15 text-gray-400 hover:text-white hover:border-white/25' : 'border-gray-300 text-gray-500 hover:text-gray-900 hover:bg-gray-100')}`} title="1 box view">□</button>
            </div>
          </div>

          <div className="flex-1 flex flex-col bg-black overflow-hidden p-1 min-h-0">
            {webcamViewMode === 'grid' ? (
              <div className="grid grid-cols-2 gap-1 h-full w-full min-h-0">
                {filteredWebcams.map((webcam) => (
                  <div
                    key={webcam.id}
                    className="relative w-full h-full bg-black flex flex-col min-h-0 cursor-pointer hover:ring-2 hover:ring-emerald-400"
                    onClick={() => { setActiveWebcamId(webcam.id); setWebcamViewMode('single'); }}
                  >
                    <YouTubePlayer
                      key={webcam.id}
                      videoId={webcam.videoId}
                      className="flex-1"
                      title={`${webcam.label} webcam`}
                    />
                    <div className="absolute top-0 left-0 px-1 py-0.5 text-[8px] font-mono text-white bg-transparent truncate flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping" />
                      <span>{webcam.label}</span>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 text-[6px] font-mono text-white bg-black/60 truncate flex items-center justify-between">
                      <span className="flex items-center gap-1">▶ YouTube</span>
                      <a href={webcam.watchUrl} target="_blank" rel="noreferrer" className="text-emerald-400 hover:text-emerald-300">{t('dashboard.open')} →</a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 flex flex-col h-full">
                <div className="flex-1">
                  <YouTubePlayer
                    key={activeWebcamId}
                    videoId={activeWebcam.videoId}
                    title={`${activeWebcam.label} webcam`}
                  />
                </div>
                <div className={`px-3 py-1.5 border-t text-[10px] flex items-center justify-between ${isDarkMode ? 'border-white/10 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
                  <span>{t('dashboard.location')}: <span className={`font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>{activeWebcam.label}</span></span>
                  <a href={activeWebcam.watchUrl} target="_blank" rel="noreferrer" className={`font-bold text-[10px] ${isDarkMode ? 'text-emerald-400 hover:text-emerald-300' : 'text-emerald-600 hover:text-emerald-700'}`}>{t('dashboard.open_youtube')}</a>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Market Dashboard */}
      <section className="mt-6">
        <MarketDashboard isDarkMode={isDarkMode} />
      </section>
    </>
  );
}
