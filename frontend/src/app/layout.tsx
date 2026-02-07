import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tend",
  description: "A conscious todo app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
