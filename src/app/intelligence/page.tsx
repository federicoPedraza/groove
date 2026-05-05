"use client";

import { IntelligencePage } from "@/src/components/pages/intelligence/intelligence-page";
import { useAppLayout } from "@/src/components/pages/use-app-layout";

export default function Page() {
  useAppLayout({});
  return <IntelligencePage />;
}
