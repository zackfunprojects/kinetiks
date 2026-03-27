import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import { FloatingPillLoader } from "@/components/floating-pill-loader";
import "./globals.css";

const sansFont = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Harvest",
  description: "Outbound that grows with you",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sansFont.variable} ${monoFont.variable}`}>
      <body>
        {children}
        <FloatingPillLoader />
      </body>
    </html>
  );
}
