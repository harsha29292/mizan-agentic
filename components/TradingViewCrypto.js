'use client';

import { useEffect, useRef } from 'react';

const CRYPTO_SYMBOLS = [
    { name: 'BINANCE:BTCUSDT', displayName: 'Bitcoin' },
    { name: 'BINANCE:ETHUSDT', displayName: 'Ethereum' },
    { name: 'BINANCE:SOLUSDT', displayName: 'Solana' },
    { name: 'BINANCE:BNBUSDT', displayName: 'BNB' },
    { name: 'BINANCE:XRPUSDT', displayName: 'XRP' },
    { name: 'BINANCE:ADAUSDT', displayName: 'Cardano' }
];

function TradingViewWidget({ symbol, isDarkMode, index }) {
    const containerRef = useRef(null);
    const widgetId = `tradingview-quote-${symbol.replace(/[^a-zA-Z0-9]/g, '-')}-${index}`;

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Clear previous content
        container.innerHTML = `<div id="${widgetId}"></div>`;

        const script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-single-quote.js';
        script.async = true;
        script.innerHTML = JSON.stringify({
            symbol: symbol,
            width: '100%',
            colorTheme: isDarkMode ? 'dark' : 'light',
            isTransparent: true,
            locale: 'en'
        });

        container.appendChild(script);

        return () => {
            if (container) container.innerHTML = '';
        };
    }, [symbol, isDarkMode, widgetId]);

    return (
        <div className="tradingview-widget-container mb-1" ref={containerRef} style={{ height: '46px', minHeight: '46px' }}>
            <div className="tradingview-widget-container__widget"></div>
        </div>
    );
}

export default function TradingViewCrypto({ isDarkMode = true }) {
    return (
        <div className={`h-full w-full overflow-y-auto overflow-x-hidden p-3 custom-scrollbar transition-colors ${isDarkMode ? 'bg-black/20' : 'bg-white'}`}>
            {CRYPTO_SYMBOLS.map((sym, index) => (
                <TradingViewWidget key={`${sym.name}-${index}`} symbol={sym.name} isDarkMode={isDarkMode} index={index} />
            ))}
        </div>
    );
}
