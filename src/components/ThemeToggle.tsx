'use client';

import { useTheme, ThemePreference } from './ThemeProvider';

const ORDER: ThemePreference[] = ['light', 'dark', 'system'];

const LABELS: Record<ThemePreference, string> = {
    light: 'Light',
    dark: 'Dark',
    system: 'System',
};

function ThemeIcon({ theme }: { theme: ThemePreference }) {
    if (theme === 'light') {
        return (
            <svg className="w-4 h-4 text-orange-500" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 7a5 5 0 100 10 5 5 0 000-10zm0-5a1 1 0 011 1v2a1 1 0 11-2 0V3a1 1 0 011-1zm0 17a1 1 0 011 1v2a1 1 0 11-2 0v-2a1 1 0 011-1zM4.22 4.22a1 1 0 011.42 0l1.41 1.41a1 1 0 01-1.41 1.42L4.22 5.64a1 1 0 010-1.42zm12.73 12.73a1 1 0 011.41 0l1.42 1.41a1 1 0 01-1.42 1.42l-1.41-1.42a1 1 0 010-1.41zM2 12a1 1 0 011-1h2a1 1 0 110 2H3a1 1 0 01-1-1zm17 0a1 1 0 011-1h2a1 1 0 110 2h-2a1 1 0 01-1-1zM4.22 19.78a1 1 0 010-1.42l1.41-1.41a1 1 0 011.42 1.41l-1.42 1.42a1 1 0 01-1.41 0zm12.73-12.73a1 1 0 010-1.42l1.41-1.41a1 1 0 011.42 1.41l-1.42 1.42a1 1 0 01-1.41 0z" />
            </svg>
        );
    }
    if (theme === 'dark') {
        return (
            <svg className="w-4 h-4 text-orange-500" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M21 12.79A9 9 0 0111.21 3 7 7 0 1021 12.79z" />
            </svg>
        );
    }
    return (
        <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4" width="18" height="13" rx="2" />
            <path d="M8 21h8M12 17v4" strokeLinecap="round" />
        </svg>
    );
}

export default function ThemeToggle() {
    const { theme, setTheme } = useTheme();

    const cycle = () => {
        const idx = ORDER.indexOf(theme);
        const next = ORDER[(idx + 1) % ORDER.length];
        setTheme(next);
    };

    return (
        <button
            type="button"
            onClick={cycle}
            className="flex items-center gap-2 bg-transparent border border-gray-300 dark:border-gray-700 rounded-full px-4 py-2 text-gray-900 dark:text-white text-sm hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
            aria-label={`Theme: ${LABELS[theme]}. Click to change.`}
            title={`Theme: ${LABELS[theme]}`}
        >
            <ThemeIcon theme={theme} />
            <span className="hidden sm:inline">{LABELS[theme]}</span>
        </button>
    );
}
