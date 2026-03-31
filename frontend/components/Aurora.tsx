"use client";
import { useEffect, useRef } from "react";

export default function Aurora({
  colorStops = ["#0a2472", "#0d2137", "#1a1a2e"],
  speed = 0.8,
  amplitude = 1.0,
}: {
  colorStops?: string[];
  speed?: number;
  amplitude?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = (ts: number) => {
      timeRef.current = ts * 0.001 * speed;
      const t = timeRef.current;
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // dark base
      ctx.fillStyle = "#0d1117";
      ctx.fillRect(0, 0, W, H);

      // aurora layers
      const layers = [
        { color: colorStops[0] ?? "#0a2472", y: 0.4, freq: 0.8, amp: 60 * amplitude },
        { color: colorStops[1] ?? "#0d2137", y: 0.6, freq: 0.5, amp: 80 * amplitude },
        { color: colorStops[2] ?? "#1a1a2e", y: 0.75, freq: 1.1, amp: 40 * amplitude },
      ];

      layers.forEach(({ color, y, freq, amp }) => {
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, "transparent");
        grad.addColorStop(0.3, color + "44");
        grad.addColorStop(0.7, color + "22");
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += 4) {
          const wave =
            Math.sin((x / W) * Math.PI * freq * 2 + t) * amp +
            Math.sin((x / W) * Math.PI * freq * 3 + t * 1.3) * (amp * 0.4);
          ctx.lineTo(x, H * y + wave);
        }
        ctx.lineTo(W, H);
        ctx.closePath();
        ctx.fill();
      });

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
    };
  }, [colorStops, speed, amplitude]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        opacity: 0.7,
      }}
    />
  );
}
