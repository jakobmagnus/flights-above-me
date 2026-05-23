import type { Metadata } from "next";
import { Roboto_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

const robotoMono = Roboto_Mono({
    variable: "--font-roboto-mono",
    subsets: ["latin"],
    weight: ["400", "500"],
});

export const metadata: Metadata = {
    title: "Flights Above Me",
    description: "Track flights flying above your current location",
};

// Inline script applies the saved theme (or system preference) before React hydrates,
// preventing a flash of incorrect theme on first paint. Kept compact (IIFE) since it
// runs synchronously in <head> on every page load.
const themeInitScript = `
(function () {
    try {
        var stored = localStorage.getItem('theme');
        var pref = (stored === 'light' || stored === 'dark' || stored === 'system') ? stored : 'system';
        var isDark = pref === 'dark' ||
            (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        var root = document.documentElement;
        if (isDark) root.classList.add('dark');
        root.style.colorScheme = isDark ? 'dark' : 'light';
    } catch (e) { /* ignore */ }
})();
`;

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
            </head>
            <body className={`${robotoMono.variable} antialiased`}>
                <ThemeProvider>{children}</ThemeProvider>
            </body>
        </html>
    );
}
