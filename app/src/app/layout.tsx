import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { DemoNotice } from "@/components/shell/demo-notice";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ZenC Security Intelligence Platform (Demo)",
  description: "Interactive demo with mock data — ZenC SIEM & ZenC SOAR.",
};

/**
 * Dark is the default product surface, so the server renders `dark` on <html>.
 * The client's ThemeSync (components/providers) reconciles to the viewer's
 * saved preference (light / system) right after hydration.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full dark`} suppressHydrationWarning>
      <body className="min-h-full bg-background text-foreground antialiased">
        <Providers>
          <DemoNotice />
          {children}
        </Providers>
      </body>
    </html>
  );
}
