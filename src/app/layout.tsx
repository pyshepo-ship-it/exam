import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ToastProvider } from "@/components/providers/toast-provider";
import { DeviceGuard } from "@/components/device-guard";
import { APP_FONTS_URL } from "@/lib/exam-templates";

export const metadata: Metadata = {
  title: "أ/ ضحى العربي",
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
        {/* الخطوط المستخدمة فعلياً فقط: Cairo للواجهة + Noto Kufi Arabic/Tajawal
            لورقة الاختبار (الخط الموحّد لكل القوالب بقرار المالك) */}
        <link href={APP_FONTS_URL} rel="stylesheet" />
      </head>
      <body className="font-arabic antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <ToastProvider />
          {/* حارس الجهاز: نبضة تعريف + شاشة إيقاف للجهاز المحظور (خارج لوحة المعلم) */}
          <DeviceGuard>{children}</DeviceGuard>
        </ThemeProvider>
      </body>
    </html>
  );
}
