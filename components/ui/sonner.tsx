"use client";

import type { ComponentProps } from "react";
import { Toaster as Sonner } from "sonner";

type ToasterProps = ComponentProps<typeof Sonner>;

function Toaster(props: ToasterProps) {
  return <Sonner {...props} />;
}

export { Toaster };
