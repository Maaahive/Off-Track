/**
 * Background manager — presets, custom upload, opacity
 */
import { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Upload, Image, Sliders } from "lucide-react";
import { usePlayerStore } from "../store/playerStore";

const PRESETS = [
  { id: "gradient-1", label: "Midnight", class: "bg-gradient-1" },
  { id: "gradient-2", label: "Deep Red", class: "bg-gradient-2" },
  { id: "gradient-3", label: "Ocean", class: "bg-gradient-3" },
  { id: "gradient-4", label: "Purple Dusk", class: "bg-gradient-4" },
  { id: "gradient-5", label: "Forest", class: "bg-gradient-5" },
  { id: "gradient-6", label: "Dark Space", class: "bg-gradient-6" },
];

export default function BackgroundPanel() {
  const showBackgroundPanel = usePlayerStore((s) => s.showBackgroundPanel);
  const setShowBackgroundPanel = usePlayerStore((s) => s.setShowBackgroundPanel);
  const bgPreset = usePlayerStore((s) => s.bgPreset);
  const bgOpacity = usePlayerStore((s) => s.bgOpacity);
  const setBgPreset = usePlayerStore((s) => s.setBgPreset);
  const setBgImage = usePlayerStore((s) => s.setBgImage);
  const setBgOpacity = usePlayerStore((s) => s.setBgOpacity);
  const fileRef = useRef(null);

  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setBgImage(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setBgImage(ev.target.result);
    reader.readAsDataURL(file);
  };

  return (
    <AnimatePresence>
      {showBackgroundPanel && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 glass rounded-xl p-3 z-50 no-drag flex flex-col justify-between overflow-y-auto scrollbar-none"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-white/70 uppercase tracking-wider">Background</span>
            <button onClick={() => setShowBackgroundPanel(false)} className="btn-icon w-5 h-5">
              <X size={12} />
            </button>
          </div>

          {/* Preset swatches */}
          <div className="grid grid-cols-6 gap-1.5 mb-3">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setBgPreset(p.id)}
                title={p.label}
                className={`h-8 rounded-lg ${p.class} transition-all ${
                  bgPreset === p.id ? "ring-2 ring-white/80 scale-95" : "hover:scale-95 opacity-80 hover:opacity-100"
                }`}
              />
            ))}
          </div>

          {/* Upload area */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            className={`flex items-center gap-2 p-2 rounded-lg border border-dashed cursor-pointer transition-colors mb-3 ${
              bgPreset === "custom"
                ? "border-white/50 bg-white/10"
                : "border-white/20 hover:border-white/40 hover:bg-white/5"
            }`}
          >
            <Upload size={14} className="text-white/50" />
            <span className="text-xs text-white/50">Drop or click to upload image / GIF</span>
          </div>
          <input ref={fileRef} type="file" accept="image/*,image/gif" className="hidden" onChange={handleUpload} />

          {/* Opacity slider */}
          <div className="flex items-center gap-2">
            <Sliders size={12} className="text-white/50 shrink-0" />
            <span className="text-xs text-white/50 w-16 shrink-0">Opacity</span>
            <input
              type="range"
              min="0.2"
              max="1"
              step="0.02"
              value={bgOpacity}
              onChange={(e) => setBgOpacity(parseFloat(e.target.value))}
              className="flex-1 accent-spotify h-1"
            />
            <span className="text-xs text-white/40 w-8 text-right">{Math.round(bgOpacity * 100)}%</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Background renderer (placed behind everything)
export function BackgroundLayer() {
  const bgPreset = usePlayerStore((s) => s.bgPreset);
  const bgImage = usePlayerStore((s) => s.bgImage);

  const presetClass = PRESETS.find((p) => p.id === bgPreset)?.class || "bg-gradient-1";

  return (
    <div className="absolute inset-0 overflow-hidden rounded-xl">
      {bgImage ? (
        <img
          src={bgImage}
          alt="bg"
          className="w-full h-full object-cover"
        />
      ) : (
        <div className={`w-full h-full ${presetClass}`} />
      )}
      {/* Overlay to ensure text is readable */}
      <div className="absolute inset-0 bg-black/30" />
    </div>
  );
}
