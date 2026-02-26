'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export default function Navbar({ isDarkMode, setIsDarkMode, selectedRegion, setSelectedRegion }) {
  const { t, i18n } = useTranslation();
  const [activePanel, setActivePanel] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [elapsedTime, setElapsedTime] = useState('00:00:00');
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [selectedLanguageCode, setSelectedLanguageCode] = useState('gb');

  const regions = ['GLOBAL', 'AMERICAS', 'MENA', 'EUROPE', 'ASIA', 'LATIN AMERICA', 'AFRICA', 'OCEANIA'];
  const languages = [
    { code: 'en', name: 'English', flag: 'gb' },
    { code: 'es', name: 'Spanish', flag: 'es' },
    { code: 'fr', name: 'French', flag: 'fr' },
    { code: 'de', name: 'German', flag: 'de' },
    { code: 'it', name: 'Italian', flag: 'it' },
    { code: 'zh', name: 'Chinese', flag: 'cn' },
    { code: 'ja', name: 'Japanese', flag: 'jp' },
    { code: 'ar', name: 'Arabic', flag: 'sa' }
  ];

  const regionFlags = {
    'GLOBAL': '🌐',
    'AMERICAS': 'us',
    'MENA': 'sa',
    'EUROPE': 'eu',
    'ASIA': 'cn',
    'LATIN AMERICA': 'br',
    'AFRICA': 'za',
    'OCEANIA': 'au'
  };

  useEffect(() => {
    // Sync language code with current language on mount
    const currentLang = languages.find(l => l.code === i18n.language.split('-')[0]);
    if (currentLang) {
      setSelectedLanguageCode(currentLang.flag);
    }
  }, [i18n.language]);

  useEffect(() => {
    const startTime = Date.now();

    const updateElapsedTime = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const hours = Math.floor(elapsed / 3600);
      const minutes = Math.floor((elapsed % 3600) / 60);
      const seconds = elapsed % 60;

      const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      setElapsedTime(timeString);
    };

    updateElapsedTime();
    const timer = setInterval(updateElapsedTime, 1000);

    return () => clearInterval(timer);
  }, []);

  const handlePanelClick = (panelName) => {
    setActivePanel(activePanel === panelName ? null : panelName);
  };

  const handleCopyLink = () => {
    const currentUrl = window.location.href;
    navigator.clipboard.writeText(currentUrl).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  const toggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  return (
    <nav className={`border-b px-3 py-2 transition-colors duration-200 ${isDarkMode ? 'bg-black border-gray-600' : 'bg-white border-gray-400'}`} style={{ fontFamily: "'Courier New', 'Courier', monospace" }}>
      <div className="flex items-center justify-between gap-5">
        {/* Left Section */}
        <div className="flex items-center gap-3">
          {/* Company Logo */}
          <button
            onClick={() => window.location.href = '/'}
            className="flex items-center px-1 py-0.5 hover:opacity-80 transition-opacity"
          >
            <img
              src="/company-logo.png"
              alt="Company Logo"
              className={`h-7 w-auto ${isDarkMode ? '' : 'invert'}`}
            />
          </button>

          {/* Live Status */}
          <div className={`live flex items-center gap-1.5 px-2 py-0.5 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            <div className="dot w-3 h-3 bg-green-500 rounded-full zoom"></div>
            <span className="text-[13px] font-bold">{t('navbar.live')}</span>
          </div>

          {/* Region Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className={`flex items-center gap-2 px-2.5 py-0.5 rounded text-[13px] font-bold min-w-[170px] justify-between border ${isDarkMode ? 'bg-black border-gray-600 text-gray-300' : 'bg-white border-gray-300 text-gray-700'}`}
            >
              <div className="flex items-center gap-2">
                {regionFlags[selectedRegion] === '🌐' ? (
                  <span>🌐</span>
                ) : (
                  <img
                    src={`https://flagcdn.com/w20/${regionFlags[selectedRegion]}.png`}
                    alt=""
                    className="w-4 h-auto opacity-80"
                  />
                )}
                <span>{selectedRegion}</span>
              </div>
              <span className="text-[10px]">▼</span>
            </button>
            <div className={`absolute left-0 mt-1 rounded shadow-lg z-50 min-w-full ${isDropdownOpen ? 'block' : 'hidden'} ${isDarkMode ? 'bg-black border-gray-700' : 'bg-white border-gray-300'} border`}>
              {regions.map((region) => (
                <button
                  key={region}
                  onClick={() => {
                    setSelectedRegion(region);
                    setIsDropdownOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 text-left px-2.5 py-1.5 text-[11px] ${selectedRegion === region ? (isDarkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-900') : (isDarkMode ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-700 hover:bg-gray-100')}`}
                >
                  {regionFlags[region] === '🌐' ? (
                    <span>🌐</span>
                  ) : (
                    <img
                      src={`https://flagcdn.com/w20/${regionFlags[region]}.png`}
                      alt=""
                      className="w-3.5 h-auto opacity-80"
                    />
                  )}
                  {t(`regions.${region.replace(' ', '_')}`)}
                </button>
              ))}
            </div>
          </div>
          {/* Mizan Logo */}
          <button
            onClick={() => window.location.href = '/'}
            className="flex items-center px-1 py-0.5 hover:opacity-80 transition-opacity ml-1"
          >
            <img
              src="/mizan-logo.png"
              alt="Mizan Logo"
              className={`h-10 w-auto ${isDarkMode ? '' : 'invert'}`}
            />
          </button>

        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2">


          {/* Language Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsLanguageOpen(!isLanguageOpen)}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[12px] font-bold border ${isDarkMode ? 'bg-black border-gray-600 text-gray-300' : 'bg-white border-gray-300 text-gray-700'}`}
            >
              <img
                src={`https://flagcdn.com/w20/${selectedLanguageCode}.png`}
                alt=""
                className="w-4 h-auto"
              />
              <span className="text-[10px]">▼</span>
            </button>
            <div className={`absolute left-0 mt-1 rounded shadow-lg z-50 min-w-[130px] ${isLanguageOpen ? 'block' : 'hidden'} ${isDarkMode ? 'bg-black border-gray-700' : 'bg-white border-gray-300'} border`}>
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => {
                    setSelectedLanguageCode(lang.flag);
                    i18n.changeLanguage(lang.code);
                    setIsLanguageOpen(false);
                  }}
                  className={`flex items-center gap-2 w-full text-left px-2.5 py-1.5 text-[11px] ${selectedLanguageCode === lang.flag ? (isDarkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-900') : (isDarkMode ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-700 hover:bg-gray-100')}`}
                >
                  <img
                    src={`https://flagcdn.com/w20/${lang.flag}.png`}
                    alt=""
                    className="w-4 h-auto"
                  />
                  {lang.name}
                </button>
              ))}
            </div>
          </div>

          {/* Copy Link */}
          <button
            onClick={handleCopyLink}
            className={`copy-link text-[12px] px-2 py-0.5 border rounded ${isCopied ? (isDarkMode ? 'border-green-500 text-green-400' : 'border-green-600 text-green-700') : (isDarkMode ? 'border-gray-600 hover:border-gray-400 text-gray-400 hover:text-gray-200' : 'border-gray-300 hover:border-gray-400 text-gray-600 hover:text-gray-900')}`}
          >
            {isCopied ? t('navbar.copied') : t('navbar.copy')}
          </button>

          {/* Session Time */}
          <div className={`flex items-center gap-1.5 px-2 py-0.5 border rounded ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}>
            <span className={`text-[12px] font-bold ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{t('navbar.session')}:</span>
            <span className={`text-[12px] font-mono ${isDarkMode ? 'text-yellow-400' : 'text-yellow-600'}`}>{elapsedTime}</span>
          </div>

          {/* Dark/Light Theme Toggle */}
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`theme-toggle px-2 py-0.5 rounded flex items-center gap-1.5 ${isDarkMode ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDarkMode ? (
              <>
                <span className="text-[12px]">☀️</span>
                <span className="text-[11px]">{t('navbar.light_mode')}</span>
              </>
            ) : (
              <>
                <span className="text-[12px]">🌙</span>
                <span className="text-[11px]">{t('navbar.dark_mode')}</span>
              </>
            )}
          </button>

        </div>
      </div>
    </nav>
  );
}
