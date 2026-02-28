'use client';

import { useEffect, useRef } from 'react';

export default function TradingViewMarkets({ isDarkMode = true }) {
    const containerRef = useRef(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        container.innerHTML = '<div class="tradingview-widget-container__widget"></div>';

        const script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-market-quotes.js';
        script.async = true;
        script.innerHTML = JSON.stringify({
            width: '100%',
            height: '100%',
            symbolsGroups: [
                {
                    name: 'Indices',
                    originalName: 'Indices',
                    symbols: [
                        { name: 'FOREXCOM:SPXUSD', displayName: 'S&P 500' },
                        { name: 'FOREXCOM:NSXUSD', displayName: 'US 100' },
                        { name: 'FOREXCOM:DJI', displayName: 'Dow 30' },
                        { name: 'INDEX:NKY', displayName: 'Nikkei 225' },
                        { name: 'INDEX:DEU40', displayName: 'DAX Index' },
                        { name: 'FOREXCOM:UKXGBP', displayName: 'FTSE 100' }
                    ]
                }
            ],
            showSymbolLogo: true,
            isTransparent: true,
            colorTheme: isDarkMode ? 'dark' : 'light',
            locale: 'en'
        });

        container.appendChild(script);

        return () => {
            if (container) container.innerHTML = '';
        };
    }, [isDarkMode]);

    return (
        <div
            className={`tradingview-widget-container h-full w-full transition-colors ${isDarkMode ? 'bg-black/20' : 'bg-white'}`}
            ref={containerRef}
            style={{ height: '100%' }}
        >
            <div className="tradingview-widget-container__widget"></div>
        </div>
    );
}
