import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Minimal fixed-height row virtualiser.
 *
 * The track table used to render one <tr> per track. At 20k tracks that's
 * ~500k DOM nodes, which is what made scrolling (and startup) crawl. We render
 * only the rows inside the viewport plus a small overscan, and pad the list
 * with two spacer rows so the scrollbar still reflects the true length.
 */
export interface VirtualRange {
  start: number;
  end: number;
  padTop: number;
  padBottom: number;
  scrollRef: (el: HTMLElement | null) => void;
  scrollToIndex: (i: number, block?: "start" | "center") => void;
}

export function useVirtual(count: number, rowHeight: number, overscan = 12): VirtualRange {
  const [range, setRange] = useState({ start: 0, end: Math.min(count, 60) });
  const elRef = useRef<HTMLElement | null>(null);
  const frame = useRef(0);

  const measure = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    const h = el.clientHeight || 600;
    const visible = Math.ceil(h / rowHeight);
    const first = Math.floor(el.scrollTop / rowHeight);
    const start = Math.max(0, first - overscan);
    const end = Math.min(count, first + visible + overscan);
    setRange((r) => (r.start === start && r.end === end ? r : { start, end }));
  }, [count, rowHeight, overscan]);

  const scrollRef = useCallback((el: HTMLElement | null) => {
    elRef.current = el;
    if (el) measure();
  }, [measure]);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    // coalesce scroll events into one measurement per animation frame
    const onScroll = () => {
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => { frame.current = 0; measure(); });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [measure]);

  // re-measure when the list length changes (filtering, searching, grouping)
  useEffect(() => { measure(); }, [count, measure]);

  const scrollToIndex = useCallback((i: number, block: "start" | "center" = "center") => {
    const el = elRef.current;
    if (!el) return;
    const top = block === "center" ? i * rowHeight - el.clientHeight / 2 + rowHeight / 2 : i * rowHeight;
    el.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [rowHeight]);

  const start = Math.min(range.start, Math.max(0, count - 1));
  const end = Math.min(range.end, count);
  return {
    start,
    end,
    padTop: start * rowHeight,
    padBottom: Math.max(0, (count - end) * rowHeight),
    scrollRef,
    scrollToIndex,
  };
}
