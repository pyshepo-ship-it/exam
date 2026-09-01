import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ToastProvider } from "@/components/providers/toast-provider";

export const metadata: Metadata = {
  title: "نظام إدارة الدروس الخصوصية",
  description: "نظام شخصي لإدارة الدروس الخصوصية والاختبارات والتحصيل المالي",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-arabic antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <ToastProvider />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
