import type { Metadata, Viewport } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
// ACTIVE GLOBALS IMPORT (THIS IS THE ONE USED BY THE APP)
import "./globals.css";
import DevSandboxLauncher from "./components/dev/DevSandboxLauncher";
import ServiceWorkerCleanup from "./components/ServiceWorkerCleanup";

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
  icons: {
    icon: "/favicon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "rgb(46, 143, 99)",
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
        <DevSandboxLauncher />
        <ServiceWorkerCleanup />
      </body>
    </html>
  );
}
