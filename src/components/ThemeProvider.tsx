'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

interface ThemeContextValue {
    theme: ThemePreference;
    resolvedTheme: ResolvedTheme;
    setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getSystemTheme(): ResolvedTheme {
    if (typeof window === 'undefined') return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readStoredTheme(): ThemePreference {
    if (typeof window === 'undefined') return 'system';
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
            return stored;
        }
    } catch {
        // ignore (e.g. SSR or storage blocked)
    }
    return 'system';
}

function applyThemeClass(resolved: ResolvedTheme) {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (resolved === 'dark') {
        root.classList.add('dark');
    } else {
        root.classList.remove('dark');
    }
    root.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<ThemePreference>('system');
    const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('dark');

    // Initialize from storage on mount. This intentionally calls setState inside an
    // effect because the stored preference is only available on the client; running
    // it during render would cause a hydration mismatch.
    useEffect(() => {
        const stored = readStoredTheme();
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setThemeState(stored);
        const resolved = stored === 'system' ? getSystemTheme() : stored;
        setResolvedTheme(resolved);
        applyThemeClass(resolved);
    }, []);

    // Listen to system preference changes when in 'system' mode
    useEffect(() => {
        if (theme !== 'system' || typeof window === 'undefined') return;

        const mql = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = (e: MediaQueryListEvent) => {
            const next: ResolvedTheme = e.matches ? 'dark' : 'light';
            setResolvedTheme(next);
            applyThemeClass(next);
        };
        mql.addEventListener('change', handler);
        return () => mql.removeEventListener('change', handler);
    }, [theme]);

    const setTheme = useCallback((next: ThemePreference) => {
        setThemeState(next);
        try {
            window.localStorage.setItem(STORAGE_KEY, next);
        } catch {
            // ignore storage write failures
        }
        const resolved = next === 'system' ? getSystemTheme() : next;
        setResolvedTheme(resolved);
        applyThemeClass(resolved);
    }, []);

    return (
        <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme(): ThemeContextValue {
    const ctx = useContext(ThemeContext);
    if (!ctx) {
        // Safe fallback for components rendered outside provider (e.g. during tests)
        return {
            theme: 'system',
            resolvedTheme: 'dark',
            setTheme: () => {},
        };
    }
    return ctx;
}
