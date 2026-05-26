import type { Metadata, Viewport } from "next";
import { Geist_Mono, Amiri, Noto_Naskh_Arabic } from "next/font/google";
import "./globals.css";
import { LimitsBanner } from "@/components/LimitsBanner";
import { SiteFooter } from "@/components/SiteFooter";

// Body / UI font — Noto Naskh Arabic is the workhorse for Arabic UI text.
const notoNaskh = Noto_Naskh_Arabic({
  variable: "--font-naskh",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Display + matn — Amiri is the classical naskh choice for hadith literature.
const amiri = Amiri({
  variable: "--font-amiri",
  subsets: ["arabic"],
  weight: ["400", "700"],
  display: "swap",
});

// Mono — for numerals (matches the prototype's JetBrains Mono role).
const mono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://isnad.app",
  ),
  title: {
    default: "مدقّق الإسناد — تدقيق سلاسل رواة الحديث",
    template: "%s | مدقّق الإسناد",
  },
  description:
    "أداة آلية لتدقيق إسناد الحديث: تتعرَّف على كل راوٍ في السلسلة، تعرض حكم العلماء عليه من 22 كتاباً، وتتحقَّق من اتصال السلسلة زمنيًّا وبتوثيقات كتب الرجال، وفق منهج ابن الصلاح.",
  keywords: [
    "حديث",
    "إسناد",
    "رجال",
    "جرح وتعديل",
    "مدقّق الإسناد",
    "hadith",
    "isnad",
    "ilm al-rijal",
  ],
  openGraph: {
    title: "مدقّق الإسناد",
    description:
      "تدقيقٌ آلي لسلاسل رواة الحديث، يدمج 22 كتاباً من كتب الرجال و18 كتاباً من كتب الحديث.",
    locale: "ar_SA",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "مدقّق الإسناد",
    description:
      "تدقيقٌ آلي لسلاسل رواة الحديث، يدمج 22 كتاباً من كتب الرجال و18 كتاباً من كتب الحديث.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#047857",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      translate="no"
      className={`${notoNaskh.variable} ${amiri.variable} ${mono.variable} h-full antialiased`}
    >
      <body
        className="isnad-body flex min-h-full flex-col"
        suppressHydrationWarning
      >
        <LimitsBanner />
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
