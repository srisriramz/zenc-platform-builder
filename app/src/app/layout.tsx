import type { Metadata } from "next";
import { Sora, Albert_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { DemoNotice } from "@/components/shell/demo-notice";

/** Display / headings — matches the ZenC Labs brand site. */
const sora = Sora({ variable: "--font-sora", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], display: "swap" });
/** Body copy. */
const albertSans = Albert_Sans({ variable: "--font-albert", subsets: ["latin"], display: "swap" });
/** Monospace — IDs, code, query text. */
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], display: "swap" });

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
    <html lang="en" className={`${sora.variable} ${albertSans.variable} ${jetbrainsMono.variable} h-full dark`} suppressHydrationWarning>
      <body className="min-h-full bg-background text-foreground antialiased">
        <Providers>
          <DemoNotice />
          {children}
        </Providers>
      </body>
    </html>
  );
}
