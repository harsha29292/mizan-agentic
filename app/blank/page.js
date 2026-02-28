'use client';

import { useState, useEffect, useRef } from 'react';
import { useAppState } from '@/components/AppStateContext';
import { useTranslation } from 'react-i18next';

// Suffix → TradingView exchange prefix mapping for international stocks
const SUFFIX_TO_EXCHANGE = {
    '.NS': 'NSE',       // India - National Stock Exchange
    '.BO': 'BSE',       // India - Bombay Stock Exchange
    '.L': 'LSE',        // UK - London Stock Exchange
    '.IL': 'LSE',       // UK (pence)
    '.DE': 'XETRA',     // Germany - Deutsche Börse
    '.F': 'FWB',        // Germany - Frankfurt
    '.PA': 'EURONEXT',  // France - Paris
    '.AS': 'EURONEXT',  // Netherlands - Amsterdam
    '.BR': 'EURONEXT',  // Belgium - Brussels
    '.TO': 'TSX',       // Canada - Toronto
    '.V': 'TSXV',       // Canada - TSX Venture
    '.AX': 'ASX',       // Australia
    '.HK': 'HKEX',      // Hong Kong
    '.T': 'TSE',        // Japan - Tokyo
    '.KS': 'KRX',       // South Korea
    '.SS': 'SSE',       // China - Shanghai
    '.SZ': 'SZSE',      // China - Shenzhen
    '.SA': 'BMFBOVESPA',// Brazil
    '.MX': 'BMV',       // Mexico
    '.MC': 'BME',       // Spain - Madrid
    '.MI': 'MIL',       // Italy - Milan
    '.ST': 'OMX',       // Sweden - Stockholm
    '.OL': 'OSL',       // Norway - Oslo
    '.CO': 'CPH',       // Denmark - Copenhagen
    '.HE': 'OMXHEX',    // Finland - Helsinki
    '.JO': 'JSE',       // South Africa - Johannesburg
    '.NZ': 'NZX',       // New Zealand
    '.SG': 'SGX',       // Singapore
    '.TA': 'TASE',      // Israel - Tel Aviv
};

function resolveTvSymbol(symbol, exchange) {
    if (symbol.includes(':')) return symbol;

    // Check for international suffix (e.g. WIPRO.NS → NSE:WIPRO.NS)
    const suffixMatch = symbol.match(/(\.[A-Z]{1,3})$/);
    if (suffixMatch && SUFFIX_TO_EXCHANGE[suffixMatch[1]]) {
        return `${SUFFIX_TO_EXCHANGE[suffixMatch[1]]}:${symbol}`;
    }

    // Use exchange name from the search result
    const ex = exchange || '';
    if (ex.includes('NEW YORK STOCK EXCHANGE') || ex.includes('NYSE')) return `NYSE:${symbol}`;
    if (ex.includes('NASDAQ')) return `NASDAQ:${symbol}`;
    if (ex.includes('AMEX')) return `AMEX:${symbol}`;
    if (ex.includes('LONDON')) return `LSE:${symbol}`;
    if (ex.includes('FRANKFURT') || ex.includes('XETRA')) return `XETRA:${symbol}`;
    if (ex.includes('TORONTO')) return `TSX:${symbol}`;
    if (ex.includes('NATIONAL STOCK EXCHANGE') || ex.includes('NSE')) return `NSE:${symbol}`;
    if (ex.includes('BOMBAY') || ex.includes('BSE')) return `BSE:${symbol}`;

    // Default fallback
    return `NASDAQ:${symbol}`;
}

export default function BlankPage() {
    const { isDarkMode } = useAppState();
    const { t } = useTranslation();
    const [searchInput, setSearchInput] = useState('AAPL');
    const [activeSymbol, setActiveSymbol] = useState('AAPL');
    const [symbolData, setSymbolData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [tvSymbol, setTvSymbol] = useState('NASDAQ:AAPL');
    const chartContainerRef = useRef(null);

    const handleAnalyze = async () => {
        const query = searchInput.trim().toUpperCase();
        if (!query) return;

        setLoading(true);
        try {
            const searchRes = await fetch(`/api/market/search?q=${encodeURIComponent(query)}`);
            if (searchRes.ok) {
                const searchData = await searchRes.json();
                if (searchData.result && searchData.result.length > 0) {
                    const top = searchData.result[0];
                    setTvSymbol(resolveTvSymbol(top.symbol, top.exchange));
                    setActiveSymbol(top.symbol);
                } else {
                    setTvSymbol(resolveTvSymbol(query, ''));
                    setActiveSymbol(query);
                }
            } else {
                setTvSymbol(resolveTvSymbol(query, ''));
                setActiveSymbol(query);
            }
        } catch (err) {
            console.error('Error resolving symbol:', err);
            setTvSymbol(resolveTvSymbol(query, ''));
            setActiveSymbol(query);
        } finally {
            setLoading(false);
        }
    };

    const getSignal = (price, open) => {
        if (!price || !open) return { signal: 'HOLD', confidence: 0 };
        const pct = ((price - open) / open) * 100;
        if (pct > 1.5) return { signal: 'BUY', confidence: Math.min(95, 70 + Math.round(pct * 3)) };
        if (pct < -1.5) return { signal: 'SELL', confidence: Math.min(95, 70 + Math.round(Math.abs(pct) * 3)) };
        if (pct > 0.3) return { signal: 'BUY', confidence: Math.min(75, 60 + Math.round(pct * 5)) };
        if (pct < -0.3) return { signal: 'SELL', confidence: Math.min(75, 60 + Math.round(Math.abs(pct) * 5)) };
        return { signal: 'HOLD', confidence: Math.round(55 + (Math.random() * 10)) };
    };

    useEffect(() => {
        const fetchData = async () => {
            if (!activeSymbol) return;
            setLoading(true);
            try {
                const res = await fetch(`/api/market/symbol/${activeSymbol}`);
                if (res.ok) {
                    setSymbolData(await res.json());
                } else {
                    setSymbolData(null);
                }
            } catch {
                setSymbolData(null);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [activeSymbol]);

    useEffect(() => {
        const container = chartContainerRef.current;
        if (!container) return;
        container.innerHTML = '';

        const script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/tv.js';
        script.async = true;
        script.onload = () => {
            if (typeof TradingView !== 'undefined') {
                new TradingView.widget({
                    autosize: true,
                    symbol: tvSymbol,
                    interval: 'D',
                    timezone: 'Etc/UTC',
                    theme: isDarkMode ? 'dark' : 'light',
                    style: '1',
                    locale: 'en',
                    enable_publishing: false,
                    hide_top_toolbar: false,
                    hide_legend: false,
                    save_image: false,
                    allow_symbol_change: true,
                    container_id: 'tradingview_chart',
                    backgroundColor: isDarkMode ? 'rgba(0,0,0,1)' : 'rgba(255,255,255,1)',
                });
            }
        };
        container.appendChild(script);
        return () => { container.innerHTML = ''; };
    }, [isDarkMode, tvSymbol]);

    const signalInfo = symbolData ? getSignal(symbolData.price, symbolData.open) : { signal: 'HOLD', confidence: 0 };
    const verdictColor = signalInfo.signal === 'BUY' ? 'emerald' : signalInfo.signal === 'SELL' ? 'rose' : 'amber';

    return (
        <div className={`min-h-screen p-4 lg:p-6 transition-colors duration-300 ${isDarkMode ? 'bg-black text-white' : 'bg-white text-gray-900'}`} style={{ fontFamily: "'Courier New', 'Courier', monospace" }}>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* Left Section */}
                <div className="lg:col-span-8 flex flex-col space-y-4">

                    {/* Search Row */}
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <input
                                type="text"
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
                                onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                                className={`w-full bg-transparent border px-4 py-2 text-sm outline-none transition-all ${isDarkMode ? 'border-white/10 focus:border-white/30 text-white' : 'border-gray-200 focus:border-gray-400 text-gray-900'}`}
                                placeholder="Symbol (e.g. TSLA, WIPRO.NS, BTC)"
                            />
                        </div>
                        <button
                            onClick={handleAnalyze}
                            disabled={loading}
                            className={`px-6 py-2 text-xs font-bold tracking-widest border transition-all ${isDarkMode ? 'border-white/20 bg-white/5 hover:bg-white/10 text-white' : 'border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-800'} ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {loading ? t('common.loading') : 'ANALYZE'}
                        </button>
                    </div>

                    {/* Symbol Info */}
                    <div className="flex flex-col">
                        <div className="flex items-baseline gap-2">
                            <h1 className="text-2xl font-black tracking-tight">{activeSymbol}</h1>
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{tvSymbol.split(':')[0]}</span>
                            <span className="ml-auto text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('dashboard.insights')}</span>
                        </div>
                        <div className="flex items-baseline gap-3 mt-1">
                            <span className="text-3xl font-bold tabular-nums">
                                {symbolData ? symbolData.price.toFixed(2) : '---.--'}
                            </span>
                            <span className={`text-sm font-bold tabular-nums ${(symbolData?.change ?? 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {symbolData && symbolData.change != null && symbolData.changePercent != null
                                    ? `${symbolData.change >= 0 ? '+' : ''}${symbolData.change.toFixed(2)} (${symbolData.changePercent.toFixed(2)}%)`
                                    : ''}
                            </span>
                        </div>
                    </div>

                    {/* Chart */}
                    <div className={`relative h-[500px] border overflow-hidden ${isDarkMode ? 'border-white/10' : 'border-gray-200'}`}>
                        <div id="tradingview_chart" ref={chartContainerRef} className="w-full h-full" />
                    </div>

                    {/* Stats Footer */}
                    <div className="grid grid-cols-5 gap-4 pt-2 border-t border-white/5">
                        <div className="flex flex-col">
                            <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">{t('market.vol')}</span>
                            <span className="text-xs font-bold tabular-nums">
                                {symbolData ? (symbolData.volume > 1000000 ? (symbolData.volume / 1000000).toFixed(2) + 'M' : symbolData.volume) : '---'}
                            </span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">{t('market.mkt_cap')}</span>
                            <span className="text-xs font-bold tabular-nums">
                                {symbolData ? (symbolData.marketCap > 1000 ? (symbolData.marketCap / 1000).toFixed(2) + 'T' : symbolData.marketCap + 'B') : '---'}
                            </span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">{t('market.pe')}</span>
                            <span className="text-xs font-bold tabular-nums">{symbolData?.pe ? symbolData.pe.toFixed(2) : '---'}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">{t('market.div')}</span>
                            <span className="text-xs font-bold tabular-nums">{symbolData?.div ? symbolData.div.toFixed(2) + '%' : '---'}</span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">{t('market.update')}</span>
                            <span className="text-xs font-bold tabular-nums">
                                {symbolData ? new Date(symbolData.timestamp).toLocaleTimeString() : '--:--:--'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Right Section: Decision Gates */}
                <div className={`lg:col-span-4 flex flex-col space-y-6 p-4 border-l ${isDarkMode ? 'border-white/10' : 'border-gray-200'}`}>
                    <div>
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold tracking-tight">{t('market.decision_gates')}</h2>
                            <div className="flex gap-1.5">
                                <span className={`w-2 h-2 rounded-full ${signalInfo.signal === 'BUY' ? 'bg-emerald-500' : 'bg-gray-600'}`} />
                                <span className={`w-2 h-2 rounded-full ${signalInfo.signal === 'HOLD' ? 'bg-yellow-500' : 'bg-gray-600'}`} />
                                <span className={`w-2 h-2 rounded-full ${signalInfo.signal === 'SELL' ? 'bg-rose-500' : 'bg-gray-600'}`} />
                                <span className="w-2 h-2 rounded-full bg-gray-600" />
                                <span className="w-2 h-2 rounded-full bg-gray-600" />
                            </div>
                        </div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">{t('market.sequential_pipeline')}</p>
                    </div>

                    <div className="flex-1 min-h-[100px]" />

                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
                                <span className="text-gray-500">{t('market.system_confidence')}</span>
                                <span className={isDarkMode ? 'text-white' : 'text-gray-900'}>{signalInfo.confidence}%</span>
                            </div>
                            <div className="h-1 w-full bg-white/5 overflow-hidden">
                                <div
                                    className="h-full transition-all duration-1000"
                                    style={{
                                        width: `${signalInfo.confidence}%`,
                                        backgroundColor: signalInfo.signal === 'BUY' ? 'rgba(16,185,129,0.4)' : signalInfo.signal === 'SELL' ? 'rgba(244,63,94,0.4)' : 'rgba(255,255,255,0.2)'
                                    }}
                                />
                            </div>
                        </div>

                        <div className={`p-4 border border-${verdictColor}-500/50 bg-${verdictColor}-500/5 flex flex-col space-y-4`}>
                            <div className="flex items-center gap-2">
                                <span className={`text-${verdictColor}-500`}>⚠</span>
                                <span className={`text-[10px] font-bold text-${verdictColor}-500 uppercase tracking-widest`}>{t('market.final_verdict')}</span>
                            </div>

                            <div className="flex items-baseline justify-between">
                                <h3 className={`text-3xl font-black text-${verdictColor}-500 tracking-tighter italic uppercase`}>
                                    {t(`market.${signalInfo.signal.toLowerCase()}`)}
                                </h3>
                                <div className={`flex items-center gap-1 text-${verdictColor}-500/80`}>
                                    <span className="text-[10px]">⬡</span>
                                    <span className="text-[10px] font-bold uppercase tracking-tighter">{signalInfo.confidence}% {t('common.confidence')}</span>
                                </div>
                            </div>

                            <p className={`text-sm font-medium text-${verdictColor}-500/90 leading-snug`}>
                                {signalInfo.signal === 'HOLD' ? t('market.mixed_signals') :
                                    signalInfo.signal === 'BUY' ? 'Bullish movement detected. Potential upside.' :
                                        'Bearish indicators identified. Caution advised.'}
                            </p>

                            <div className={`pt-4 border-t border-${verdictColor}-500/20 text-[9px] font-bold text-${verdictColor}-500/60 flex items-center gap-2`}>
                                <span>🕒</span>
                                <span>{t('market.update')}: {symbolData ? new Date(symbolData.timestamp).toLocaleTimeString() : '--:--:--'}</span>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
