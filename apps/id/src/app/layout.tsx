import type { Metadata } from "next";
import { DM_Serif_Display } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@kinetiks/ui/styles/kinetiks-tokens.css";
import "@kinetiks/ui/styles/primitives.css";
import "./globals.css";
import { Providers } from "./providers";

const dmSerifDisplay = DM_Serif_Display({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kinetiks",
  description: "Your GTM operating system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} ${dmSerifDisplay.variable}`}
    >
      <head>
        {/*
          Pre-paint theme apply: read stored preference (or system pref) and
          set [data-theme] before first paint to prevent FOUC. The 600ms
          theme-switch crossfade lives in kinetiks-tokens.css on html.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('kt-theme');
                  var theme = stored === 'light' || stored === 'dark'
                    ? stored
                    : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
                  document.documentElement.setAttribute('data-theme', theme);
                } catch (e) { /* no-op */ }
              })();
            `,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
