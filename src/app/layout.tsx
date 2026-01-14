import type { Metadata, Viewport } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
// ACTIVE GLOBALS IMPORT (THIS IS THE ONE USED BY THE APP)
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "DayForeIt",
    template: "DayForeIt",
  },
  description: "Your group's home for golf days",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "DayForeIt",
  },
  // Icons are handled by icon.tsx file in app directory for proper aspect ratio
  icons: {
    icon: [
      { url: "/browserIcon.png?v=20260115a" },
      { url: "/icon.png?v=20260115a", sizes: "192x192", type: "image/png" },
    ],
    shortcut: [
      { url: "/icon.png?v=20260115a" },
    ],
    apple: [
      { url: "/icon.png?v=20260115a" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#FAF7F0",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
