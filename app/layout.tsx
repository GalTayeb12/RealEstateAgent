import type { Metadata } from "next";
import { Cormorant_Garamond, Heebo, Frank_Ruhl_Libre, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import "@/components/quiet/quiet.css";
import TopNav from "@/components/TopNav";
import SessionMigrator from "@/components/SessionMigrator";
import ThemeScope from "@/components/theme/ThemeScope";
import SiteFooter from "@/components/SiteFooter";
import CookieNotice from "@/components/CookieNotice";
import { LocaleProvider } from "@/components/LocaleProvider";
import { AudioUnlockProvider } from "@/components/AudioUnlockProvider";
import { dirFor } from "@/lib/i18n/locale";
import { getRequestLocale } from "@/lib/i18n/request";

/** Fallback serif used only for the "Haveniq" logotype when SVG is unavailable */
const cormorant = Cormorant_Garamond({
  weight: ["600"],
  subsets: ["latin"],
  variable: "--font-cormorant",
  display: "swap",
});

/** Primary font for all UI text — Hebrew + Latin */
const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
  display: "swap",
});

/** Concept C display serif + numeric mono (cinematic screens and homepage) */
const serif = Frank_Ruhl_Libre({ subsets: ["hebrew", "latin"], weight: ["300", "400", "500"], variable: "--hv-serif", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400"], variable: "--hv-mono", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const hebrew = locale === "he";
  const title = hebrew
    ? "Haveniq — נדל״ן שמותאם אליך"
    : "Haveniq — Real estate, matched to you.";
  const description = hebrew
    ? "נדל״ן שמותאם אליך. התאמה בין קונים למוכרים לפי ניקוד שקוף."
    : "Real estate, matched to you. AI-powered buyer/seller matching built on transparent scoring.";
  return {
  title,
  description,
  icons: {
    icon: [
      { url: "/images/brand/icon.svg", type: "image/svg+xml" },
      { url: "/images/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: { url: "/images/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    shortcut: "/images/brand/icon-512.png",
  },
  openGraph: {
    title,
    description,
    siteName: "Haveniq",
    images: [{ url: "/images/brand/og-image.jpg", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/images/brand/og-image.jpg"],
  },
};
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getRequestLocale();
  return (
    <html
      lang={locale}
      dir={dirFor(locale)}
      className={`${cormorant.variable} ${heebo.variable} ${serif.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper text-ink font-sans">
        <LocaleProvider initialLocale={locale}>
          <AudioUnlockProvider>
            <SessionMigrator />
            <TopNav />
            <ThemeScope>{children}</ThemeScope>
            <SiteFooter />
            <CookieNotice />
          </AudioUnlockProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
