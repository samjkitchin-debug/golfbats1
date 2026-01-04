import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GolfBats",
  description: "Private golf club coordination noticeboard",
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
      </body>
    </html>
  );
}
