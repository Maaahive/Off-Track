/**
 * Visualizer — real-time Web Audio API canvas animation
 * Modes: bars | wave | circle
 */
import { useRef, useEffect, useCallback } from "react";
import { usePlayerStore } from "../store/playerStore";

export default function Visualizer({ height = 40, className = "" }) {
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const visualizerMode = usePlayerStore((s) => s.visualizerMode);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const accentColor = usePlayerStore((s) => s.accentColor);
  const getAnalyserNode = usePlayerStore((s) => s.getAnalyserNode);

  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
      : "29, 185, 84";
  };

  const drawBars = useCallback((ctx, dataArray, width, h, color) => {
    const barCount = Math.min(dataArray.length / 2, 48);
    const barWidth = (width / barCount) - 1.5;
    ctx.clearRect(0, 0, width, h);

    for (let i = 0; i < barCount; i++) {
      const value = dataArray[Math.floor(i * (dataArray.length / barCount))];
      const barH = Math.max(2, (value / 255) * h);
      const x = i * (barWidth + 1.5);
      const y = h - barH;

      const gradient = ctx.createLinearGradient(0, y, 0, h);
      gradient.addColorStop(0, `rgba(${hexToRgb(color)}, 1)`);
      gradient.addColorStop(1, `rgba(${hexToRgb(color)}, 0.3)`);

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, [2, 2, 0, 0]);
      ctx.fill();
    }
  }, []);

  const drawWave = useCallback((ctx, timeDomain, width, h, color) => {
    ctx.clearRect(0, 0, width, h);
    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(${hexToRgb(color)}, 0.9)`;
    ctx.shadowBlur = 8;
    ctx.shadowColor = `rgba(${hexToRgb(color)}, 0.5)`;
    ctx.beginPath();

    const sliceWidth = width / timeDomain.length;
    let x = 0;
    for (let i = 0; i < timeDomain.length; i++) {
      const v = timeDomain[i] / 128.0;
      const y = (v * h) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.lineTo(width, h / 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, []);

  const drawCircle = useCallback((ctx, dataArray, width, h, color) => {
    ctx.clearRect(0, 0, width, h);
    const cx = width / 2;
    const cy = h / 2;
    const radius = Math.min(cx, cy) - 8;
    const bars = Math.min(dataArray.length / 2, 64);

    for (let i = 0; i < bars; i++) {
      const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
      const value = dataArray[Math.floor(i * (dataArray.length / bars))];
      const barLen = Math.max(2, (value / 255) * (radius * 0.6));

      const x1 = cx + Math.cos(angle) * (radius - barLen);
      const y1 = cy + Math.sin(angle) * (radius - barLen);
      const x2 = cx + Math.cos(angle) * radius;
      const y2 = cy + Math.sin(angle) * radius;

      const alpha = 0.4 + (value / 255) * 0.6;
      ctx.strokeStyle = `rgba(${hexToRgb(color)}, ${alpha})`;
      ctx.lineWidth = Math.max(1.5, (width / bars) * 0.6);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    // Center dot
    ctx.fillStyle = `rgba(${hexToRgb(color)}, 0.8)`;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  const drawIdleBars = useCallback((ctx, width, h, color, t) => {
    ctx.clearRect(0, 0, width, h);
    const bars = 24;
    const barWidth = (width / bars) - 1.5;
    for (let i = 0; i < bars; i++) {
      const phase = (i / bars) * Math.PI * 2;
      const barH = 3 + Math.sin(t * 1.5 + phase) * 3 + Math.sin(t * 2.3 + phase * 1.5) * 2;
      const x = i * (barWidth + 1.5);
      const y = h - barH;
      ctx.fillStyle = `rgba(${hexToRgb(color)}, 0.35)`;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, [1, 1, 0, 0]);
      ctx.fill();
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let startTime = Date.now();

    const render = () => {
      const width = canvas.width;
      const h = canvas.height;
      const analyser = getAnalyserNode();
      const t = (Date.now() - startTime) / 1000;

      if (!analyser || !isPlaying) {
        drawIdleBars(ctx, width, h, accentColor, t);
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }

      const freqData = new Uint8Array(analyser.frequencyBinCount);
      const timeData = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(freqData);
      analyser.getByteTimeDomainData(timeData);

      if (visualizerMode === "bars") drawBars(ctx, freqData, width, h, accentColor);
      else if (visualizerMode === "wave") drawWave(ctx, timeData, width, h, accentColor);
      else if (visualizerMode === "circle") drawCircle(ctx, freqData, width, h, accentColor);

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [visualizerMode, isPlaying, accentColor, drawBars, drawWave, drawCircle, drawIdleBars, getAnalyserNode]);

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={height}
      className={`w-full ${className}`}
      style={{ height: `${height}px` }}
    />
  );
}
