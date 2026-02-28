'use client';

import { createContext, useContext, useState } from 'react';

const AppStateContext = createContext();

export function AppStateProvider({ children }) {
    const [isDarkMode, setIsDarkMode] = useState(true);
    const [selectedRegion, setSelectedRegion] = useState('GLOBAL');

    return (
        <AppStateContext.Provider value={{ isDarkMode, setIsDarkMode, selectedRegion, setSelectedRegion }}>
            {children}
        </AppStateContext.Provider>
    );
}

export function useAppState() {
    return useContext(AppStateContext);
}
