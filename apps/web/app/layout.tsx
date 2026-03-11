import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VTT Extractor",
  description: "S3 video subtitle extraction console"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

