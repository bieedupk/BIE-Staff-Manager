import type { Metadata, Viewport } from "next";
import { getDirection, getLocale } from "@/lib/i18n";
import { PwaRegister } from "@/components/layout/pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "BIE Staff Manager",
  description: "Attendance, tasks, leave, reports, and staff monitoring for Board of Islamic Education.",
  manifest: "/manifest.webmanifest"
};

export const viewport: Viewport = {
  themeColor: "#0f604b",
  width: "device-width",
  initialScale: 1
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const dir = getDirection(locale);

  return (
    <html lang={locale} dir={dir}>
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
