import type { Metadata } from "next";
import { Fraunces, Heebo, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import TopNav from "@/components/TopNav";
import SiteFooter from "@/components/SiteFooter";
import { LocaleProvider } from "@/components/LocaleProvider";
import { dirFor } from "@/lib/i18n/locale";
import { getRequestLocale } from "@/lib/i18n/request";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
  display: "swap",
});

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
      { url: "/haveniq_app_icon.png", sizes: "any" },
      { url: "/haveniq_app_icon.png", sizes: "32x32", type: "image/png" },
    ],
    apple: { url: "/haveniq_app_icon.png", sizes: "180x180", type: "image/png" },
    shortcut: "/haveniq_app_icon.png",
  },
  openGraph: {
    title,
    description,
    siteName: "Haveniq",
  },
  twitter: {
    card: "summary",
    title,
    description,
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
      className={`${fraunces.variable} ${inter.variable} ${jetbrainsMono.variable} ${heebo.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper text-ink font-sans">
        <LocaleProvider initialLocale={locale}>
          <TopNav />
          <div className="flex-1 flex flex-col min-h-0">{children}</div>
          <SiteFooter />
        </LocaleProvider>
      </body>
    </html>
  );
}
