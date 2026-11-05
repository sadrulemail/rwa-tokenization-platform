import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";

import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { Header } from "@/components/header";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-face" });

export const metadata: Metadata = {
  title: { default: "RWA Tokenization Platform", template: "%s · RWA Tokenization Platform" },
  description:
    "Tokenized real estate, private credit and fund shares with KYC-gated ownership, income distribution and a verifiable audit trail.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans">
        <Providers>
          <Header />
          <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
          <footer className="mx-auto max-w-7xl px-4 pb-10 pt-4 text-xs text-slate-400 sm:px-6">
            Settlement in a USDC-style stablecoin. Asset shares are ERC-20 tokens with ERC-3643 style transfer
            controls; each asset&apos;s deed is an ERC-721 token held by its custodian.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
