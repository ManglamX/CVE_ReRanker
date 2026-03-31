"use client";
import { CSSProperties, ReactNode } from "react";

interface GradientTextProps {
  children: ReactNode;
  className?: string;
  gradient?: string;
  style?: CSSProperties;
  animate?: boolean;
}

export default function GradientText({
  children,
  className = "",
  gradient = "linear-gradient(135deg, #58a6ff 0%, #39d0d8 40%, #a855f7 100%)",
  style,
  animate = true,
}: GradientTextProps) {
  return (
    <span
      className={className}
      style={{
        background: gradient,
        backgroundSize: animate ? "200% 200%" : "100%",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        animation: animate ? "gradShift 4s ease infinite" : undefined,
        display: "inline-block",
        ...style,
      }}
    >
      {children}
    </span>
  );
}
