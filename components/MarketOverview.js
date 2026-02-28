'use client';

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

export default function MarketOverview({ isDarkMode = true }) {
  const { t, i18n } = useTranslation();
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Avoid injecting the script multiple times
    if (container.querySelector('script')) return;

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      colorTheme: isDarkMode ? 'dark' : 'light',
      dateRange: '12M',
      showChart: true,
      locale: i18n.language || 'en',
      width: '100%',
      height: '100%',
      showSymbolLogo: true,
      isTransparent: true,
      plotLineColorGrowing: '#21c56a',
      plotLineColorFalling: '#f6465d',
      gridLineColor: isDarkMode ? 'rgba(42, 46, 57, 0)' : 'rgba(240, 243, 250, 1)',
      scaleFontColor: isDarkMode ? 'rgba(134, 137, 147, 1)' : 'rgba(30, 34, 45, 1)',
      belowLineFillColorGrowing: 'rgba(33, 197, 106, 0.12)',
      belowLineFillColorFalling: 'rgba(246, 70, 93, 0.12)',
      symbolActiveColor: isDarkMode ? 'rgba(28, 30, 38, 1)' : 'rgba(240, 243, 250, 1)',
      tabs: [
        {
          title: t('market.financial'),
          symbols: [
            { s: 'NYSE:JPM', d: 'JPMorgan Chase' },
            { s: 'NYSE:WFC', d: 'Wells Fargo Co New' },
            { s: 'NYSE:BAC', d: 'Bank Amer Corp' },
            { s: 'NYSE:HSBC', d: 'Hsbc Hldgs Plc' },
            { s: 'NYSE:C', d: 'Citigroup Inc' },
            { s: 'NYSE:MA', d: 'Mastercard Incorporated' }
          ]
        },
        {
          title: t('market.technology'),
          symbols: [
            { s: 'NASDAQ:AAPL', d: 'Apple Inc.' },
            { s: 'NASDAQ:MSFT', d: 'Microsoft Corp.' },
            { s: 'NASDAQ:GOOGL', d: 'Alphabet Inc.' },
            { s: 'NASDAQ:META', d: 'Meta Platforms' },
            { s: 'NASDAQ:NVDA', d: 'NVIDIA Corp.' },
            { s: 'NASDAQ:ADBE', d: 'Adobe Inc.' }
          ]
        },
        {
          title: t('market.services'),
          symbols: [
            { s: 'NYSE:DIS', d: 'Walt Disney Co.' },
            { s: 'NYSE:NFLX', d: 'Netflix Inc.' },
            { s: 'NYSE:UBER', d: 'Uber Tech.' },
            { s: 'NYSE:WMT', d: 'Walmart Inc.' },
            { s: 'NYSE:HD', d: 'Home Depot' },
            { s: 'NYSE:PG', d: 'Procter & Gamble' }
          ]
        }
      ]
    });

    container.appendChild(script);

    return () => {
      // Clean up when unmounting
      container.innerHTML = '';
    };
  }, [isDarkMode]);

  return (
    <div className={`h-full rounded-2xl border overflow-hidden transition-colors ${isDarkMode ? 'border-[#20252b] bg-[#111315] text-white' : 'border-gray-200 bg-white text-gray-900'}`}>
      <div className="tradingview-widget-container h-full" ref={containerRef} key={isDarkMode ? 'dark' : 'light'}>
        <div className="tradingview-widget-container__widget" />
      </div>
    </div>
  );
}

