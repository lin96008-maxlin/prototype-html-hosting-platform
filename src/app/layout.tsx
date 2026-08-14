import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "原型托管平台demo",
  description: "各行业产品经理高保真 HTML 原型托管平台",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
