import type { Metadata, Viewport } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
// ACTIVE GLOBALS IMPORT (THIS IS THE ONE USED BY THE APP)
import "./globals.css";
import DevSandboxLauncher from "./components/dev/DevSandboxLauncher";
import ServiceWorkerRegistration from "./components/ServiceWorkerRegistration";

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
  // Icons reference brand assets
  icons: {
    icon: [
      { url: "/brand/logo-mark.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    shortcut: [
      { url: "/favicon.ico" },
    ],
    apple: [
      { url: "/brand/logo-mark.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#2E8F63",
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
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
