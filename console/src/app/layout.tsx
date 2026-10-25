import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppHeader } from "../components/layout/app-header";
import { DEFAULT_THEME, THEME_INIT_SCRIPT } from "../lib/theme";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AgentTrust Console",
  description: "Agent identity, authorization, and audit visibility.",
};

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className={inter.className} data-theme={DEFAULT_THEME} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} /></head>
      <body>
        <div className="min-h-screen bg-ink text-foreground">
          <a href="#main-content" className="focus-ring sr-only rounded-md border border-control-border bg-control px-4 py-2 text-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50">Skip to content</a>
          <AppHeader />
          <main id="main-content" tabIndex={-1} className="mx-auto w-full min-w-0 max-w-[1600px]">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
