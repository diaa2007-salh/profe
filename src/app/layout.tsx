import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "دفتر الحلقة — متابعة تحفيظ القرآن الكريم",
  description: "نظام إدارة ومتابعة حلقة تحفيظ القرآن الكريم",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/*
          eslint-disable-next-line @next/next/no-page-custom-font --
          next/font/google was tried first and is the better choice on any
          normal internet-connected build host — it self-hosts the font
          files and removes this runtime dependency entirely. It fails to
          BUILD in this specific sandbox (confirmed: "Failed to fetch ...
          from Google Fonts" at build time, same network restriction as
          Prisma's engine binary). This runtime <link> is what's actually
          been built and tested end-to-end here. Switch to next/font/google
          once building happens somewhere with normal internet access.
        */}
        <link
          href="https://fonts.googleapis.com/css2?family=Reem+Kufi:wght@400..700&family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
