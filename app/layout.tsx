import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Groove",
  description: "A local workspace manager for files inside your selected directory.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
