'use client';

import { useAppState } from '@/components/AppStateContext';

export default function BlankPage() {
    const { isDarkMode } = useAppState();

    return (
        <div className={`min-h-screen ${isDarkMode ? 'bg-black' : 'bg-white'}`}>
            {/* This page is intentionally left blank */}
        </div>
    );
}
