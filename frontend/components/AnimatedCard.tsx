"use client";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { ReactNode, useRef } from "react";

interface AnimatedCardProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  glowColor?: string;
  tilt?: boolean;
  delay?: number;
}

export default function AnimatedCard({
  children,
  className = "",
  style,
  glowColor = "rgba(88,166,255,0.12)",
  tilt = true,
  delay = 0,
}: AnimatedCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const rotateX = useTransform(mouseY, [-0.5, 0.5], [tilt ? 4 : 0, tilt ? -4 : 0]);
  const rotateY = useTransform(mouseX, [-0.5, 0.5], [tilt ? -4 : 0, tilt ? 4 : 0]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!tilt || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width - 0.5);
    mouseY.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <motion.div
      ref={cardRef}
      className={`acard ${className}`}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d", ...style }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ boxShadow: `0 0 32px ${glowColor}, 0 8px 32px rgba(0,0,0,0.5)` }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </motion.div>
  );
}
