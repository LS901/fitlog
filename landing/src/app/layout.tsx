import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import "./globals.css";
import { site } from "@/site";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const heading = Inter_Tight({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-heading" });

export const metadata: Metadata = {
  title: `${site.name}: ${site.tagline}`,
  description: site.description,
  icons: { icon: "/icon.svg" },
  openGraph: { title: site.name, description: site.description, type: "website" },
};

export const viewport: Viewport = {
  themeColor: "#0b0d10",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${inter.variable} ${heading.variable} antialiased`}>
      <body className="min-h-dvh bg-[#0b0d10] font-sans text-zinc-100">{children}</body>
    </html>
  );
}
