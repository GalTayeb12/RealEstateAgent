import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import TopNav from "@/components/TopNav";
import SiteFooter from "@/components/SiteFooter";

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

export const metadata: Metadata = {
  title: "Haveniq — Real estate, matched to you.",
  description: "Real estate, matched to you. AI-powered buyer/seller matching built on transparent scoring.",
  icons: {
    icon: [
      { url: "/haveniq_app_icon.png", sizes: "any" },
      { url: "/haveniq_app_icon.png", sizes: "32x32", type: "image/png" },
    ],
    apple: { url: "/haveniq_app_icon.png", sizes: "180x180", type: "image/png" },
    shortcut: "/haveniq_app_icon.png",
  },
  openGraph: {
    title: "Haveniq — Real estate, matched to you.",
    description: "Real estate, matched to you.",
    siteName: "Haveniq",
  },
  twitter: {
    card: "summary",
    title: "Haveniq — Real estate, matched to you.",
    description: "Real estate, matched to you.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper text-ink font-sans">
        <TopNav />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
