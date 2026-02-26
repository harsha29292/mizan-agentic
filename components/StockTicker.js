'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Stock symbols for the ticker - 30 stocks
const STOCK_SYMBOLS = [
  'AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA', 'JPM', 'V', 'WMT',
  'JNJ', 'UNH', 'HD', 'PG', 'MA', 'DIS', 'NFLX', 'ADBE', 'CRM', 'INTC',
  'AMD', 'PYPL', 'UBER', 'COIN', 'SQ', 'SHOP', 'SPOT', 'ZM', 'SNAP', 'TWTR'
];

// Default stock data as fallback
const DEFAULT_STOCKS = [
  { symbol: 'AAPL', name: 'Apple Inc.', price: '178.52', change: '1.25', changePercent: '0.70' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', price: '141.80', change: '-0.85', changePercent: '-0.60' },
  { symbol: 'MSFT', name: 'Microsoft Corp.', price: '378.91', change: '2.15', changePercent: '0.57' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', price: '178.25', change: '1.50', changePercent: '0.85' },
  { symbol: 'TSLA', name: 'Tesla Inc.', price: '248.50', change: '-3.20', changePercent: '-1.27' },
  { symbol: 'META', name: 'Meta Platforms', price: '505.75', change: '4.30', changePercent: '0.86' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', price: '875.28', change: '12.50', changePercent: '1.45' },
  { symbol: 'JPM', name: 'JPMorgan Chase', price: '195.40', change: '0.80', changePercent: '0.41' },
  { symbol: 'V', name: 'Visa Inc.', price: '279.85', change: '1.10', changePercent: '0.39' },
  { symbol: 'WMT', name: 'Walmart Inc.', price: '165.20', change: '0.45', changePercent: '0.27' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', price: '156.75', change: '-0.30', changePercent: '-0.19' },
  { symbol: 'UNH', name: 'UnitedHealth', price: '527.30', change: '3.25', changePercent: '0.62' },
  { symbol: 'HD', name: 'Home Depot', price: '345.60', change: '1.80', changePercent: '0.52' },
  { symbol: 'PG', name: 'Procter & Gamble', price: '158.90', change: '0.25', changePercent: '0.16' },
  { symbol: 'MA', name: 'Mastercard', price: '458.75', change: '2.40', changePercent: '0.53' },
  { symbol: 'DIS', name: 'Walt Disney Co.', price: '112.45', change: '-0.65', changePercent: '-0.58' },
  { symbol: 'NFLX', name: 'Netflix Inc.', price: '485.20', change: '5.70', changePercent: '1.19' },
  { symbol: 'ADBE', name: 'Adobe Inc.', price: '575.80', change: '3.90', changePercent: '0.68' },
  { symbol: 'CRM', name: 'Salesforce', price: '272.15', change: '1.45', changePercent: '0.54' },
  { symbol: 'INTC', name: 'Intel Corp.', price: '43.25', change: '-0.40', changePercent: '-0.92' },
  { symbol: 'AMD', name: 'AMD Inc.', price: '165.80', change: '2.25', changePercent: '1.38' },
  { symbol: 'PYPL', name: 'PayPal', price: '62.35', change: '-0.85', changePercent: '-1.34' },
  { symbol: 'UBER', name: 'Uber Tech.', price: '78.50', change: '1.20', changePercent: '1.55' },
  { symbol: 'COIN', name: 'Coinbase', price: '225.40', change: '-4.50', changePercent: '-1.96' },
  { symbol: 'SQ', name: 'Block Inc.', price: '75.25', change: '0.95', changePercent: '1.28' },
  { symbol: 'SHOP', name: 'Shopify', price: '78.90', change: '1.65', changePercent: '2.14' },
  { symbol: 'SPOT', name: 'Spotify', price: '245.60', change: '2.80', changePercent: '1.15' },
  { symbol: 'ZM', name: 'Zoom Video', price: '68.75', change: '-0.50', changePercent: '-0.72' },
  { symbol: 'SNAP', name: 'Snap Inc.', price: '11.25', change: '-0.15', changePercent: '-1.32' },
  { symbol: 'TWTR', name: 'Twitter/X', price: '54.20', change: '0.80', changePercent: '1.50' },
];

const COMPANY_NAMES = {
  AAPL: 'Apple Inc.',
  GOOGL: 'Alphabet Inc.',
  MSFT: 'Microsoft Corp.',
  AMZN: 'Amazon.com Inc.',
  TSLA: 'Tesla Inc.',
  META: 'Meta Platforms',
  NVDA: 'NVIDIA Corp.',
  JPM: 'JPMorgan Chase',
  V: 'Visa Inc.',
  WMT: 'Walmart Inc.',
  JNJ: 'Johnson & Johnson',
  UNH: 'UnitedHealth',
  HD: 'Home Depot',
  PG: 'Procter & Gamble',
  MA: 'Mastercard',
  DIS: 'Walt Disney Co.',
  NFLX: 'Netflix Inc.',
  ADBE: 'Adobe Inc.',
  CRM: 'Salesforce',
  INTC: 'Intel Corp.',
  AMD: 'AMD Inc.',
  PYPL: 'PayPal',
  UBER: 'Uber Tech.',
  COIN: 'Coinbase',
  SQ: 'Block Inc.',
  SHOP: 'Shopify',
  SPOT: 'Spotify',
  ZM: 'Zoom Video',
  SNAP: 'Snap Inc.',
  TWTR: 'Twitter/X'
};

const getCompanyName = (symbol) => COMPANY_NAMES[symbol] || symbol;

export default function StockTicker({ isDarkMode }) {
  const { t } = useTranslation();
  const [stockData, setStockData] = useState(DEFAULT_STOCKS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [repeatCount, setRepeatCount] = useState(2);

  const containerRef = useRef(null);
  const trackRef = useRef(null);
  const setRef = useRef(null);

  const pausedRef = useRef(false);
  const rafRef = useRef(null);
  const lastTsRef = useRef(null);
  const offsetRef = useRef(0);
  const setWidthRef = useRef(0);

  const fetchStockData = useCallback(async () => {
    const apiKey = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;

    if (!apiKey) {
      console.warn('Finnhub API key not configured. Using default data.');
      setLoading(false);
      return;
    }

    try {
      // Fetch stocks one by one to handle individual failures gracefully
      const results = [];

      for (const symbol of STOCK_SYMBOLS) {
        try {
          const response = await fetch(
            `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`
          );

          if (!response.ok) {
            // Skip this stock but continue with others
            console.warn(`Failed to fetch ${symbol}, skipping...`);
            continue;
          }

          const data = await response.json();

          // Check if we got valid data (c = current price)
          if (!data.c || data.c === 0) {
            console.warn(`No data available for ${symbol}, skipping...`);
            continue;
          }

          // Finnhub returns: c=current, d=change, dp=percent change, h=high, l=low, o=open, pc=previous close
          results.push({
            symbol,
            name: getCompanyName(symbol),
            price: data.c ? data.c.toFixed(2) : '0.00',
            change: data.d ? data.d.toFixed(2) : '0.00',
            changePercent: data.dp ? data.dp.toFixed(2) : '0.00',
          });
        } catch (stockError) {
          console.warn(`Error fetching ${symbol}:`, stockError);
          // Continue with other stocks
        }
      }

      // Only update if we got at least some data
      if (results.length > 0) {
        setStockData(results);
      }
      setLoading(false);
      setError(null);
    } catch (err) {
      console.error('Error fetching stock data:', err);
      setError(err.message);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => {
      fetchStockData();
    }, 0);

    // Poll every 10 seconds for real-time updates (respects free tier rate limits)
    const interval = setInterval(fetchStockData, 10000);

    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [fetchStockData]);

  const baseStocks = useMemo(() => {
    if (loading) return DEFAULT_STOCKS.slice(0, 10);
    return stockData && stockData.length > 0 ? stockData : DEFAULT_STOCKS.slice(0, 10);
  }, [loading, stockData]);

  const repeatedStocks = useMemo(() => {
    const out = [];
    const count = Math.max(2, Math.min(20, repeatCount));
    for (let i = 0; i < count; i++) out.push(...baseStocks);
    return out;
  }, [baseStocks, repeatCount]);

  // Ensure one "set" is at least as wide as the viewport so it never appears to "end".
  useEffect(() => {
    const container = containerRef.current;
    const setEl = setRef.current;
    if (!container || !setEl) return;

    const update = () => {
      const containerWidth = container.getBoundingClientRect().width;
      const setWidth = setEl.getBoundingClientRect().width;
      if (!containerWidth || !setWidth || !Number.isFinite(containerWidth) || !Number.isFinite(setWidth)) return;

      // Approximate width of one base sequence and compute repeats needed to cover the container.
      const unitWidth = setWidth / Math.max(1, repeatCount);
      if (!unitWidth || !Number.isFinite(unitWidth)) return;

      const needed = Math.max(2, Math.min(20, Math.ceil(containerWidth / unitWidth) + 1));
      if (needed !== repeatCount) setRepeatCount(needed);
    };

    const ro = new ResizeObserver(update);
    ro.observe(container);
    ro.observe(setEl);
    update();

    return () => ro.disconnect();
  }, [repeatCount, baseStocks.length]);

  // JS-driven ticker for constant speed + seamless looping, unaffected by data refreshes.
  useEffect(() => {
    const track = trackRef.current;
    const setEl = setRef.current;
    if (!track || !setEl) return;

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const measure = () => {
      const w = setEl.getBoundingClientRect().width;
      setWidthRef.current = Number.isFinite(w) ? w : 0;
      // Keep offset in range after width changes.
      if (setWidthRef.current > 0) {
        offsetRef.current = ((offsetRef.current % setWidthRef.current) + setWidthRef.current) % setWidthRef.current;
        offsetRef.current = -offsetRef.current;
        track.style.transform = `translateX(${offsetRef.current}px)`;
      }
    };

    const ro = new ResizeObserver(measure);
    ro.observe(setEl);
    measure();

    if (reduceMotion) {
      return () => ro.disconnect();
    }

    const SPEED_PX_PER_SEC = 90;

    lastTsRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const tick = (ts) => {
      rafRef.current = requestAnimationFrame(tick);
      if (pausedRef.current) {
        lastTsRef.current = ts;
        return;
      }

      if (lastTsRef.current == null) {
        lastTsRef.current = ts;
        return;
      }

      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;

      const w = setWidthRef.current;
      if (!w) return;

      offsetRef.current -= SPEED_PX_PER_SEC * dt;
      if (offsetRef.current <= -w) offsetRef.current += w;

      track.style.transform = `translateX(${offsetRef.current}px)`;
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      ro.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [repeatCount, loading, stockData]);

  return (
    <div
      ref={containerRef}
      className={`stock-ticker-container w-full overflow-hidden border-b ${isDarkMode ? 'border-gray-600 bg-black dark-mode' : 'border-gray-400 bg-white light-mode'} py-1.5`}
    >
      <div
        ref={trackRef}
        className="stock-ticker flex"
        style={{ willChange: 'transform' }}
        onMouseEnter={() => {
          pausedRef.current = true;
        }}
        onMouseLeave={() => {
          pausedRef.current = false;
        }}
      >
        <div ref={setRef} className="flex">
          {repeatedStocks.map((stock, index) => (
            <div
              key={`a-${index}`}
              className={`flex items-center gap-1.5 px-2.5 border-r whitespace-nowrap ${isDarkMode ? 'border-gray-600' : 'border-gray-200'}`}
            >
              <span className={`text-[10px] font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                {stock.symbol}
              </span>
              {loading ? (
                <span className={`text-[10px] ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{t('common.loading')}</span>
              ) : (
                <>
                  <span className={`text-[10px] ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>${stock.price}</span>
                  <span
                    className={`text-[9px] font-medium ${parseFloat(stock.change) >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                  >
                    {parseFloat(stock.change) >= 0 ? '▲' : '▼'} {Math.abs(parseFloat(stock.changePercent)).toFixed(2)}%
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="flex" aria-hidden="true">
          {repeatedStocks.map((stock, index) => (
            <div
              key={`b-${index}`}
              className="flex items-center gap-1.5 px-2.5 border-r border-gray-200 whitespace-nowrap"
            >
              <span className={`text-[10px] font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                {stock.symbol}
              </span>
              {loading ? (
                <span className={`text-[10px] ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{t('common.loading')}</span>
              ) : (
                <>
                  <span className={`text-[10px] ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>${stock.price}</span>
                  <span
                    className={`text-[9px] font-medium ${parseFloat(stock.change) >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                  >
                    {parseFloat(stock.change) >= 0 ? '▲' : '▼'} {Math.abs(parseFloat(stock.changePercent)).toFixed(2)}%
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
