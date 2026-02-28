'use client';

import Navbar from './navbar';
import StockTicker from './StockTicker';
import I18nProvider from './I18nProvider';
import { AppStateProvider, useAppState } from './AppStateContext';

function LayoutShell({ children }) {
    const { isDarkMode, setIsDarkMode, selectedRegion, setSelectedRegion } = useAppState();

    return (
        <div className={`min-h-screen transition-colors duration-300 ${isDarkMode ? 'bg-black text-white' : 'bg-white text-gray-900'}`}>
            <StockTicker isDarkMode={isDarkMode} />
            <Navbar
                isDarkMode={isDarkMode}
                setIsDarkMode={setIsDarkMode}
                selectedRegion={selectedRegion}
                setSelectedRegion={setSelectedRegion}
            />
            <main className="px-4 py-6 lg:px-8">
                {children}
            </main>
        </div>
    );
}

export default function ClientLayout({ children }) {
    return (
        <I18nProvider>
            <AppStateProvider>
                <LayoutShell>
                    {children}
                </LayoutShell>
            </AppStateProvider>
        </I18nProvider>
    );
}
