"use client";
import { useEffect, useRef, useState } from "react";

interface CountUpProps {
  to: number;
  duration?: number;
  separator?: string;
  decimals?: number;
  suffix?: string;
  className?: string;
  start?: boolean;
}

export default function CountUp({
  to,
  duration = 1.5,
  separator = ",",
  decimals = 0,
  suffix = "",
  className = "",
  start = true,
}: CountUpProps) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!start) return;
    startTimeRef.current = null;
    cancelAnimationFrame(rafRef.current);

    const animate = (ts: number) => {
      if (!startTimeRef.current) startTimeRef.current = ts;
      const elapsed = (ts - startTimeRef.current) / 1000;
      const progress = Math.min(elapsed / duration, 1);
      // ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(eased * to);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setValue(to);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [to, duration, start]);

  const formatted = value
    .toFixed(decimals)
    .replace(/\B(?=(\d{3})+(?!\d))/g, separator);

  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {formatted}
      {suffix}
    </span>
  );
}
