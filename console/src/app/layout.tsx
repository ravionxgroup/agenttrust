import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "../components/layout/sidebar";

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
    <html lang="en" className={inter.className}>
      <body>
        <div className="min-h-screen bg-ink text-slate-100">
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="min-w-0 flex-1">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
