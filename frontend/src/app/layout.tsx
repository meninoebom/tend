import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Tend — A quiet app for what matters today",
    template: "%s | Tend",
  },
  description:
    "Each morning, choose what matters. Your Today list shows only what you picked. Tasks untouched for 30 days are automatically removed.",
  metadataBase: new URL("https://tendyourgarden.app"),
  openGraph: {
    title: "Tend — A quiet app for what matters today",
    description:
      "Each morning, choose what matters. Everything else falls away.",
    url: "https://tendyourgarden.app",
    siteName: "Tend",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tend — A quiet app for what matters today",
    description:
      "Each morning, choose what matters. Everything else falls away.",
    images: ["/og-image.png"],
  },
  robots: { index: true, follow: true },
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <ThemeProvider>{children}</ThemeProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
