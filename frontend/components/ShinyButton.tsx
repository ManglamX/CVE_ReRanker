"use client";
import { motion, useMotionValue, useTransform, MotionValue } from "framer-motion";
import { ReactNode } from "react";

interface ShinyButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  variant?: "primary" | "secondary" | "danger";
  className?: string;
  style?: React.CSSProperties;
}

function useShine(x: MotionValue<number>, y: MotionValue<number>) {
  const background = useTransform(
    [x, y],
    ([lx, ly]) =>
      `radial-gradient(circle at ${(lx as number) * 100}% ${(ly as number) * 100}%, rgba(255,255,255,0.18) 0%, transparent 60%)`
  );
  return background;
}

export default function ShinyButton({
  children,
  onClick,
  disabled,
  type = "button",
  variant = "primary",
  className = "",
  style,
}: ShinyButtonProps) {
  const x = useMotionValue(0.5);
  const y = useMotionValue(0.5);
  const shine = useShine(x, y);

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - rect.left) / rect.width);
    y.set((e.clientY - rect.top) / rect.height);
  };
  const handleMouseLeave = () => { x.set(0.5); y.set(0.5); };

  const base: React.CSSProperties =
    variant === "primary"
      ? { background: "linear-gradient(135deg, #58a6ff, #39d0d8)", color: "#0d1117" }
      : variant === "danger"
      ? { background: "linear-gradient(135deg, #f85149, #ff6b6b)", color: "#fff" }
      : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#e6edf3" };

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`shiny-btn ${className}`}
      style={{ ...base, position: "relative", overflow: "hidden", ...style }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      whileHover={disabled ? {} : { scale: 1.03, y: -1 }}
      whileTap={disabled ? {} : { scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      <motion.span
        style={{
          position: "absolute",
          inset: 0,
          background: shine,
          pointerEvents: "none",
          borderRadius: "inherit",
        }}
      />
      <span style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 8 }}>
        {children}
      </span>
    </motion.button>
  );
}
