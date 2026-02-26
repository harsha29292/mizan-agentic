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
  const [cryptoNews, setCryptoNews] = useState(null);
  const [indicesData, setIndicesData] = useState(null);
  const [predictionsData, setPredictionsData] = useState(null);
  const [hedgeFundsData, setHedgeFundsData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Search states
  const [stockSearch, setStockSearch] = useState('');
  const [cryptoSearch, setCryptoSearch] = useState('');
  const [customStocks, setCustomStocks] = useState([]);
  const [customCrypto, setCustomCrypto] = useState([]);
  const [isSearchingStock, setIsSearchingStock] = useState(false);
  const [isSearchingCrypto, setIsSearchingCrypto] = useState(false);

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
          safeFetch('/api/market/sectors', setSectorData, { data: { "TECH": { name: "Technology", change: "0.00" } } }),
          safeFetch('/api/market/crypto-news', setCryptoNews, { news: [] }),
          safeFetch('/api/market/indices', setIndicesData, { indices: [] }),
          safeFetch('/api/market/predictions', setPredictionsData, { predictions: [] }),
          safeFetch('/api/market/hedge-funds', setHedgeFundsData, { funds: [] }),
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

  const handleSearch = async (query, type) => {
    if (!query) return;

    if (type === 'stock') setIsSearchingStock(true);
    else setIsSearchingCrypto(true);

    try {
      const res = await fetch(`/api/market/search?q=${encodeURIComponent(query)}&assetType=${type}`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();

      if (data.result && data.result.length > 0) {
        const topResult = data.result[0];
        let tvSymbol = topResult.symbol;

        // Enhanced symbol mapping for TradingView
        if (type === 'crypto') {
          // The new crypto search returns exchange-prefixed symbols like "BINANCE:BTCUSDT"
          if (tvSymbol.includes(':')) {
            // Keep exactly as returned by our new crypto search logic
          } else {
            // Fallback: Clean common prefixes/suffixes for manual entries
            const cleanSym = tvSymbol.replace(/^BINANCE:|^COINBASE:|^KRAKEN:|^BITTREX:|^BITFINEX:|^POLONIEX:|^KUCOIN:|^OKX:|^HUOBI:|^CRYPTO:|USDT$|USD$/gi, '');
            tvSymbol = `BINANCE:${cleanSym}USDT`;
          }
        } else {
          // Stocks logic
          if (tvSymbol.includes(':')) {
            // keep it as is
          } else {
            // Use exchange info from API
            const exchange = topResult.exchange || '';
            if (exchange.includes('NEW YORK STOCK EXCHANGE') || exchange.includes('NYSE')) {
              tvSymbol = `NYSE:${tvSymbol}`;
            } else if (exchange.includes('NASDAQ')) {
              tvSymbol = `NASDAQ:${tvSymbol}`;
            } else if (exchange.includes('AMEX')) {
              tvSymbol = `AMEX:${tvSymbol}`;
            } else {
              // Fallback to NASDAQ if unknown
              tvSymbol = `NASDAQ:${tvSymbol}`;
            }
          }
        }

        const newAsset = { name: tvSymbol, displayName: topResult.description || topResult.symbol };

        if (type === 'stock') {
          setCustomStocks(prev => {
            if (prev.find(s => s.name === tvSymbol)) return prev;
            return [newAsset, ...prev];
          });
          setStockSearch('');
        } else {
          setCustomCrypto(prev => {
            if (prev.find(s => s.name === tvSymbol)) return prev;
            return [newAsset, ...prev];
          });
          setCryptoSearch('');
        }
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      if (type === 'stock') setIsSearchingStock(false);
      else setIsSearchingCrypto(false);
    }
  };

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
            <div className="flex flex-col">
              <span className={`text-sm font-bold tracking-tight uppercase ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('market.crypto')}</span>
              <div className="mt-1 relative group">
                <input
                  type="text"
                  value={cryptoSearch}
                  onChange={(e) => setCryptoSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch(cryptoSearch, 'crypto')}
                  placeholder={t('market.search_asset')}
                  className={`text-[10px] px-2 py-1 rounded-md outline-none w-full transition-all ${isDarkMode ? 'bg-white/5 border-white/10 focus:bg-white/10 text-white' : 'bg-gray-50 border-gray-200 focus:bg-white text-gray-900'
                    } border`}
                />
                {isSearchingCrypto && (
                  <div className="absolute right-2 top-1.5">
                    <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 self-start mt-1">
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-blue-500 tracking-wider">{t('market.web3')}</span>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <TradingViewCrypto isDarkMode={isDarkMode} customSymbols={customCrypto} />
          </div>
        </div>

        {/* TECH STOCKS */}
        <div className={`lg:col-span-1 border rounded-xl overflow-hidden flex flex-col h-[300px] transition-colors ${isDarkMode ? 'border-white/10 bg-white/[0.03]' : 'border-gray-200 bg-white'}`}>
          <div className={`flex items-center justify-between px-4 py-3 border-b transition-colors ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-100'}`}>
            <div className="flex flex-col">
              <span className={`text-sm font-bold tracking-tight uppercase ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('market.tech_stocks')}</span>
              <div className="mt-1 relative group">
                <input
                  type="text"
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch(stockSearch, 'stock')}
                  placeholder={t('market.search_asset')}
                  className={`text-[10px] px-2 py-1 rounded-md outline-none w-full transition-all ${isDarkMode ? 'bg-white/5 border-white/10 focus:bg-white/10 text-white' : 'bg-gray-50 border-gray-200 focus:bg-white text-gray-900'
                    } border`}
                />
                {isSearchingStock && (
                  <div className="absolute right-2 top-1.5">
                    <div className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 self-start mt-1">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-emerald-500 tracking-wider">{t('market.nasdaq')}</span>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <TradingViewStocks isDarkMode={isDarkMode} customSymbols={customStocks} />
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

      {/* ROW 3: MARKETS, CRYPTO NEWS, PREDICTIONS, HEDGE FUNDS */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">

        {/* MARKETS — Live Global Indices */}
        <div className={`lg:col-span-1 border rounded-xl overflow-hidden flex flex-col h-[300px] transition-colors ${isDarkMode ? 'border-white/10 bg-white/[0.03]' : 'border-gray-200 bg-white'}`}>
          <div className={`flex items-center justify-between px-4 py-3 border-b transition-colors ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-100'}`}>
            <span className={`text-sm font-bold tracking-tight uppercase ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('market.markets')}</span>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-indigo-500 tracking-wider">{t('market.indices')}</span>
            </div>
          </div>
          <div className="flex-1 p-3 overflow-y-auto overflow-x-hidden custom-scrollbar">
            {indicesData?.indices && indicesData.indices.length > 0 ? (
              <div className="flex flex-col gap-2">
                {indicesData.indices.map((idx, i) => (
                  <div key={idx.key || i} className={`flex items-center justify-between px-2 py-1.5 rounded-lg border transition-colors ${isDarkMode ? 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05]' : 'bg-gray-50 border-gray-100 hover:bg-gray-100'
                    }`}>
                    <div className="flex items-center gap-2">
                      <span className="text-base leading-none">{idx.flag}</span>
                      <div>
                        <div className={`text-[11px] font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{idx.name}</div>
                        <div className={`text-[12px] font-mono ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{idx.price ?? '--'}</div>
                      </div>
                    </div>
                    <div className={`text-[11px] font-mono font-bold ${idx.changePercent > 0 ? 'text-emerald-400' : idx.changePercent < 0 ? 'text-rose-400' : 'text-gray-400'
                      }`}>
                      {idx.changePercent != null ? `${parseFloat(idx.changePercent) >= 0 ? '+' : ''}${idx.changePercent}%` : '--'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-gray-500 italic">Loading indices...</div>
            )}
          </div>
        </div>

        {/* CRYPTO NEWS */}
        <div className={`lg:col-span-1 border rounded-xl overflow-hidden flex flex-col h-[300px] transition-colors ${isDarkMode ? 'border-white/10 bg-white/[0.03]' : 'border-gray-200 bg-white'}`}>
          <div className={`flex items-center justify-between px-4 py-3 border-b transition-colors ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-100'}`}>
            <span className={`text-sm font-bold tracking-tight uppercase ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('market.crypto_news')}</span>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-orange-500 tracking-wider">{t('market.web3')}</span>
            </div>
          </div>
          <div className="flex-1 p-3 overflow-y-auto overflow-x-hidden custom-scrollbar">
            {cryptoNews?.news && cryptoNews.news.length > 0 ? (
              <div className="flex flex-col gap-3">
                {cryptoNews.news.slice(0, 6).map((item) => (
                  <div key={item.id} className="group cursor-pointer border-b border-white/5 pb-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] font-black text-orange-500 uppercase tracking-tighter bg-orange-500/10 px-1.5 rounded">
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

        {/* PREDICTIONS */}
        <div className={`lg:col-span-1 border rounded-xl overflow-hidden flex flex-col h-[300px] transition-colors ${isDarkMode ? 'border-white/10 bg-white/[0.03]' : 'border-gray-200 bg-white'}`}>
          <div className={`flex items-center justify-between px-4 py-3 border-b transition-colors ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-100'}`}>
            <span className={`text-sm font-bold tracking-tight uppercase ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('market.predictions')}</span>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-violet-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-violet-500 tracking-wider">{t('market.ai_signals')}</span>
            </div>
          </div>
          <div className="flex-1 p-3 overflow-y-auto overflow-x-hidden custom-scrollbar">
            {predictionsData?.predictions && predictionsData.predictions.length > 0 ? (
              <div className="flex flex-col gap-2">
                {predictionsData.predictions.map((p, i) => (
                  <div key={i} className={`flex items-center justify-between p-2 rounded-lg border transition-colors ${isDarkMode ? 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05]' : 'bg-gray-50 border-gray-100 hover:bg-gray-100'
                    }`}>
                    <div>
                      <div className={`text-[12px] font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{p.asset}</div>
                      <div className={`text-[10px] font-mono ${parseFloat(p.changePercent) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}>{parseFloat(p.changePercent) >= 0 ? '+' : ''}{p.changePercent}% today</div>
                    </div>
                    <div className="text-right">
                      <span className={`text-[11px] font-black px-2 py-0.5 rounded tracking-wider ${p.signal === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' :
                        p.signal === 'SELL' ? 'bg-rose-500/20 text-rose-400' :
                          'bg-amber-500/20 text-amber-400'
                        }`}>{p.signal}</span>
                      <div className="text-[10px] text-gray-400 mt-0.5">{p.confidence}% · {p.target}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-gray-500 italic">Generating signals...</div>
            )}
          </div>
        </div>

        {/* HEDGE FUNDS */}
        <div className={`lg:col-span-1 border rounded-xl overflow-hidden flex flex-col h-[300px] transition-colors ${isDarkMode ? 'border-white/10 bg-white/[0.03]' : 'border-gray-200 bg-white'}`}>
          <div className={`flex items-center justify-between px-4 py-3 border-b transition-colors ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-100'}`}>
            <span className={`text-sm font-bold tracking-tight uppercase ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('market.hedge_funds')}</span>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-cyan-500 tracking-wider">{t('market.aum')}</span>
            </div>
          </div>
          <div className="flex-1 p-3 overflow-y-auto overflow-x-hidden custom-scrollbar">
            {hedgeFundsData?.funds && hedgeFundsData.funds.length > 0 ? (
              <div className="flex flex-col gap-2">
                {hedgeFundsData.funds.map((hf, i) => (
                  <div key={i} className={`flex items-center justify-between p-2 rounded-lg border transition-colors ${isDarkMode ? 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05]' : 'bg-gray-50 border-gray-100 hover:bg-gray-100'
                    }`}>
                    <div className="min-w-0 flex-1">
                      <div className={`text-[11px] font-bold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{hf.name}</div>
                      <div className="text-[10px] text-gray-500">{hf.strategy} · {hf.topHold} {hf.price ? `@ ${hf.price}` : ''}</div>
                    </div>
                    <div className="text-right ml-2 shrink-0">
                      <div className={`text-[11px] font-mono font-bold ${hf.change && hf.change.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'
                        }`}>{hf.change ?? '--'}</div>
                      <div className="text-[10px] text-gray-500">{hf.aum}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-gray-500 italic">Loading fund data...</div>
            )}
          </div>
        </div>

      </section>
    </div>
  );
}
