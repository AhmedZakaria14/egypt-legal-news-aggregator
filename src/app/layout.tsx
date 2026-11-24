import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "مجمّع الأخبار القانونية — مؤسسة عمرو منصور للمحاماة",
  description:
    "لوحة متابعة أخبار مصر والتريندات بزاوية قانونية، مع توليد بوستات فيسبوك وسكربتات فيديو لمؤسسة عمرو منصور للمحاماة والاستشارات القانونية",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`h-full ${cairo.className}`}>
      <body className="min-h-full font-sans text-slate-900 antialiased">{children}</body>
    </html>
  );
}
