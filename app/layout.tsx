import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zugvogel — kennt deine Strecke",
  description:
    "Echtzeit-Abfahrten und alle Wege von A nach B, auch die, die eine normale Fahrplanauskunft nicht zeigt.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Zugvogel", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7fafb" },
    { media: "(prefers-color-scheme: dark)", color: "#101519" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
