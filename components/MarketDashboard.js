'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import TradingViewCrypto from './TradingViewCrypto';
import TradingViewCommodities from './TradingViewCommodities';
import TradingViewStableCoins from './TradingViewStableCoins';
import TradingViewStocks from './TradingViewStocks';

export default function MarketDashboard({ isDarkMode = true }) {
  const { t } = useTranslation();
  const [economicNews, setEconomicNews] = useState(null);
  const [sectorData, setSectorData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const safeFetch = async (url, setter, fallbackData) => {
        try {
          const res = await fetch(url + '?_t=' + Date.now());
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          const data = await res.json();
          setter(data);
        } catch (error) {
          console.error(`Error fetching ${url}:`, error);
          if (fallbackData) setter(fallbackData);
        }
      };

      try {
        await Promise.allSettled([
          safeFetch('/api/market/economic-news', setEconomicNews, { news: [{ id: 1, headline: "Market data loading...", source: "System" }] }),
          safeFetch('/api/market/sectors', setSectorData, { data: { "TECH": { name: "Technology", change: "0.00" } } })
        ]);
        setLoading(false);
      } catch (error) {
        console.error('Error in market dashboard Promise.allSettled:', error);
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const getChangeColor = (change) => {
    if (!change) return 'text-gray-400';
    const num = parseFloat(change);
    if (num > 0) return 'text-emerald-400';
    if (num < 0) return 'text-rose-400';
    return 'text-gray-400';
  };

  const formatChange = (change) => {
    if (!change) return '--';
    const num = parseFloat(change);
    const sign = num >= 0 ? '+' : '';
    return `${sign}${num.toFixed(2)}%`;
  };

  return (
    <div className="space-y-4 p-3">
      {/* ROW 1: STABLE COINS, COMMODITIES, CRYPTO, STOCKS */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
        {/* STABLE COINS */}
        <div className={`lg:col-span-1 border rounded-xl overflow-hidden flex flex-col h-[300px] transition-colors ${isDarkMode ? 'border-white/10 bg-white/[0.03]' : 'border-gray-200 bg-white'}`}>
          <div className={`flex items-center justify-between px-4 py-3 border-b transition-colors ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-100'}`}>
            <span className={`text-sm font-bold tracking-tight uppercase ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('market.stable_coins')}</span>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-purple-500 tracking-wider">{t('market.fiat')}</span>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <TradingViewStableCoins isDarkMode={isDarkMode} />
          </div>
        </div>

        {/* COMMODITIES */}
        <div className={`lg:col-span-1 border rounded-xl overflow-hidden flex flex-col h-[300px] transition-colors ${isDarkMode ? 'border-white/10 bg-white/[0.03]' : 'border-gray-200 bg-white'}`}>
          <div className={`flex items-center justify-between px-4 py-3 border-b transition-colors ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-100'}`}>
            <span className={`text-sm font-bold tracking-tight uppercase ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('market.commodities')}</span>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-amber-500 tracking-wider">{t('market.market')}</span>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <TradingViewCommodities isDarkMode={isDarkMode} />
          </div>
        </div>

        {/* CRYPTO */}
        <div className={`lg:col-span-1 border rounded-xl overflow-hidden flex flex-col h-[300px] transition-colors ${isDarkMode ? 'border-white/10 bg-white/[0.03]' : 'border-gray-200 bg-white'}`}>
          <div className={`flex items-center justify-between px-4 py-3 border-b transition-colors ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-100'}`}>
            <span className={`text-sm font-bold tracking-tight uppercase ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('market.crypto')}</span>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-blue-500 tracking-wider">{t('market.web3')}</span>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <TradingViewCrypto isDarkMode={isDarkMode} />
          </div>
        </div>

        {/* TECH STOCKS */}
        <div className={`lg:col-span-1 border rounded-xl overflow-hidden flex flex-col h-[300px] transition-colors ${isDarkMode ? 'border-white/10 bg-white/[0.03]' : 'border-gray-200 bg-white'}`}>
          <div className={`flex items-center justify-between px-4 py-3 border-b transition-colors ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-100'}`}>
            <span className={`text-sm font-bold tracking-tight uppercase ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('market.tech_stocks')}</span>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-emerald-500 tracking-wider">{t('market.nasdaq')}</span>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <TradingViewStocks isDarkMode={isDarkMode} />
          </div>
        </div>
      </section>

      {/* ROW 2: ECONOMIC NEWS, MARKET SECTORS, GLOBAL INDICES? */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
        {/* ECONOMIC NEWS */}
        <div className={`lg:col-span-2 border rounded-xl overflow-hidden flex flex-col h-[300px] transition-colors ${isDarkMode ? 'border-white/10 bg-white/[0.03]' : 'border-gray-200 bg-white'}`}>
          <div className={`flex items-center justify-between px-4 py-3 border-b transition-colors ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-100'}`}>
            <span className={`text-sm font-bold tracking-tight uppercase ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('market.economic_news')}</span>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-gray-400 tracking-wider">{t('market.update')}</span>
            </div>
          </div>
          <div className="flex-1 p-4 overflow-y-auto overflow-x-hidden custom-scrollbar">
            {economicNews?.news && economicNews.news.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                {economicNews.news.slice(0, 8).map((item) => (
                  <div key={item.id} className="group cursor-pointer border-b border-white/5 pb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] font-black text-emerald-500 uppercase tracking-tighter bg-emerald-500/10 px-1.5 rounded">
                        {item.source}
                      </span>
                      <span className="text-[9px] text-gray-500 font-mono">
                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <h3 className={`text-[12px] leading-snug font-medium transition-colors line-clamp-2 ${isDarkMode ? 'text-gray-200 group-hover:text-white' : 'text-gray-700 group-hover:text-black'}`}>
                      {item.headline}
                    </h3>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-gray-500 italic">{t('market.scanning')}</div>
            )}
          </div>
        </div>

        {/* MARKET SECTORS */}
        <div className={`lg:col-span-2 border rounded-xl overflow-hidden flex flex-col h-[300px] transition-colors ${isDarkMode ? 'border-white/10 bg-white/[0.03]' : 'border-gray-200 bg-white'}`}>
          <div className={`flex items-center justify-between px-4 py-3 border-b transition-colors ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-100'}`}>
            <span className={`text-sm font-bold tracking-tight uppercase ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('market.market_sectors')}</span>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-cyan-500 tracking-wider">{t('market.performance')}</span>
            </div>
          </div>
          <div className="flex-1 p-4 overflow-y-auto overflow-x-hidden custom-scrollbar">
            {sectorData?.data ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {Object.entries(sectorData.data).map(([key, item]) => (
                  <div key={key} className={`p-3 rounded-lg border transition-colors ${isDarkMode ? 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05]' : 'bg-white border-gray-100 hover:bg-gray-50 transition-shadow hover:shadow-sm'}`}>
                    <div className="text-[11px] text-gray-400 font-medium truncate mb-1">{item.name}</div>
                    <div className={`text-sm font-mono font-bold ${getChangeColor(item.change)}`}>
                      {formatChange(item.change)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-gray-500 italic">{t('market.loading_sectors')}</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
