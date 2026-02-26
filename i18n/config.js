'use client';

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enTranslation from './locales/en/translation.json';
import esTranslation from './locales/es/translation.json';
import frTranslation from './locales/fr/translation.json';
import deTranslation from './locales/de/translation.json';
import itTranslation from './locales/it/translation.json';
import zhTranslation from './locales/zh/translation.json';
import jaTranslation from './locales/ja/translation.json';
import arTranslation from './locales/ar/translation.json';

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            en: { translation: enTranslation },
            es: { translation: esTranslation },
            fr: { translation: frTranslation },
            de: { translation: deTranslation },
            it: { translation: itTranslation },
            zh: { translation: zhTranslation },
            ja: { translation: jaTranslation },
            ar: { translation: arTranslation }
        },
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false
        },
        detection: {
            order: ['localStorage', 'cookie', 'htmlTag', 'path', 'subdomain'],
            caches: ['localStorage']
        }
    });

export default i18n;
