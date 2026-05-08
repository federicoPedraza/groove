"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/src/lib/utils";

type DoubleScrollProps = {
  children: ReactNode;
  className?: string;
  viewportClassName?: string;
};

/**
 * Renders a horizontally-scrollable area with **two** synchronized scrollbars:
 * one above the content and one below. The top bar is a thin proxy whose width
 * tracks the inner content via ResizeObserver; scroll events on either bar are
 * mirrored to the other.
 */
export function DoubleScroll({
  children,
  className,
  viewportClassName,
}: DoubleScrollProps) {
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef<"top" | "bottom" | null>(null);
  const [scrollWidth, setScrollWidth] = useState(0);

  useEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    const update = () => {
      setScrollWidth(node.scrollWidth);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const onTopScroll = () => {
    if (syncingRef.current === "bottom") {
      syncingRef.current = null;
      return;
    }
    if (topRef.current && bottomRef.current) {
      syncingRef.current = "top";
      bottomRef.current.scrollLeft = topRef.current.scrollLeft;
    }
  };

  const onBottomScroll = () => {
    if (syncingRef.current === "top") {
      syncingRef.current = null;
      return;
    }
    if (topRef.current && bottomRef.current) {
      syncingRef.current = "bottom";
      topRef.current.scrollLeft = bottomRef.current.scrollLeft;
    }
  };

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div
        ref={topRef}
        onScroll={onTopScroll}
        className="shrink-0 overflow-x-auto overflow-y-hidden border-b"
      >
        <div
          aria-hidden="true"
          style={{ width: scrollWidth || 1, height: 1 }}
        />
      </div>
      <div
        ref={bottomRef}
        onScroll={onBottomScroll}
        className={cn("min-h-0 flex-1 overflow-auto", viewportClassName)}
      >
        <div
          ref={contentRef}
          className="inline-block min-w-full align-top"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
