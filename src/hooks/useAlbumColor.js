/**
 * useColorThief — extract dominant color from album art image URL
 * Uses canvas sampling to find the most vibrant, non-white/black color
 */
import { useEffect } from "react";
import { usePlayerStore } from "../store/playerStore";

export function useAlbumColor(imageUrl) {
  const setAccentColor = usePlayerStore((s) => s.setAccentColor);

  useEffect(() => {
    if (!imageUrl) {
      setAccentColor("#1DB954");
      return;
    }

    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 20;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        // Find the most vibrant (high saturation) color
        let bestColor = null;
        let bestScore = -1;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const lum = (max + min) / 510;
          const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * lum - 1)) / 255;
          // Prefer vibrant, not too dark, not too bright
          const score = sat * (1 - Math.abs(lum - 0.45));
          if (score > bestScore && lum > 0.15 && lum < 0.85) {
            bestScore = score;
            bestColor = { r, g, b };
          }
        }

        if (bestColor) {
          const { r, g, b } = bestColor;
          // Boost saturation a bit for accent use
          const hex = "#" + [r, g, b].map(c => Math.max(60, Math.min(255, c)).toString(16).padStart(2, "0")).join("");
          setAccentColor(hex);
        }
      } catch (e) {
        // CORS issue or other error — keep default
        setAccentColor("#1DB954");
      }
    };
    img.onerror = () => setAccentColor("#1DB954");
    img.src = imageUrl;
  }, [imageUrl, setAccentColor]);
}
