import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "../components/layout/sidebar";
import { ThemeToggle } from "../components/layout/theme-toggle";
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
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="min-w-0 flex-1">
              <div className="flex justify-end border-b border-line px-6 py-3"><ThemeToggle /></div>
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
