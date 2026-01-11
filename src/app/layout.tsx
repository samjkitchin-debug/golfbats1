import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import localFont from "next/font/local";
import "./globals.css";

const aptos = localFont({
  src: [
    {
      path: "./fonts/Aptos-Light.ttf",
      weight: "300",
      style: "normal",
    },
    {
      path: "./fonts/Aptos-Light-Italic.ttf",
      weight: "300",
      style: "italic",
    },
    {
      path: "./fonts/Aptos.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/Aptos-Italic.ttf",
      weight: "400",
      style: "italic",
    },
    {
      path: "./fonts/Aptos-SemiBold.ttf",
      weight: "600",
      style: "normal",
    },
    {
      path: "./fonts/Aptos-SemiBold-Italic.ttf",
      weight: "600",
      style: "italic",
    },
    {
      path: "./fonts/Aptos-Bold.ttf",
      weight: "700",
      style: "normal",
    },
    {
      path: "./fonts/Aptos-Bold-Italic.ttf",
      weight: "700",
      style: "italic",
    },
    {
      path: "./fonts/Aptos-ExtraBold.ttf",
      weight: "800",
      style: "normal",
    },
    {
      path: "./fonts/Aptos-ExtraBold-Italic.ttf",
      weight: "800",
      style: "italic",
    },
    {
      path: "./fonts/Aptos-Black.ttf",
      weight: "900",
      style: "normal",
    },
    {
      path: "./fonts/Aptos-Black-Italic.ttf",
      weight: "900",
      style: "italic",
    },
  ],
  variable: "--font-aptos",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "DayForeIt",
    template: "DayForeIt",
  },
  description: "Your group's home for golf days",
  manifest: "/manifest.json",
  themeColor: "#1F7A4A",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "DayForeIt",
  },
  icons: {
    icon: [
      { url: "/browserIcon.png", sizes: "192x192", type: "image/png" },
      { url: "/browserIcon.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/browserIcon.png", sizes: "192x192", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={aptos.variable}>
      <body className={`${aptos.className} antialiased`}>
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
