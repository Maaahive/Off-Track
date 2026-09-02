/**
 * Settings panel — font, visualizer mode, opacity, pins
 */
import { motion, AnimatePresence } from "framer-motion";
import { X, Music2, Type, Sliders, Pin } from "lucide-react";
import { usePlayerStore } from "../store/playerStore";

const FONTS = [
  { id: "inter", label: "Inter", class: "font-inter" },
  { id: "syne", label: "Syne", class: "font-syne" },
  { id: "mono", label: "Mono", class: "font-mono" },
  { id: "dm", label: "DM Sans", class: "font-dm" },
];

const VIZ_MODES = [
  { id: "bars", label: "Bars" },
  { id: "wave", label: "Wave" },
  { id: "circle", label: "Circle" },
];

export default function Settings() {
  const showSettings = usePlayerStore((s) => s.showSettings);
  const setShowSettings = usePlayerStore((s) => s.setShowSettings);
  const fontFamily = usePlayerStore((s) => s.fontFamily);
  const setFontFamily = usePlayerStore((s) => s.setFontFamily);
  const visualizerMode = usePlayerStore((s) => s.visualizerMode);
  const setVisualizerMode = usePlayerStore((s) => s.setVisualizerMode);
  const bgOpacity = usePlayerStore((s) => s.bgOpacity);
  const setBgOpacity = usePlayerStore((s) => s.setBgOpacity);

  const handleAlwaysOnTop = (val) => {
    if (window.electronAPI) window.electronAPI.setAlwaysOnTop(val);
  };

  return (
    <AnimatePresence>
      {showSettings && (
        <motion.div
          initial={{ opacity: 0, x: "100%" }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="absolute inset-0 glass rounded-xl z-40 no-drag flex flex-col p-4 overflow-y-auto scrollbar-none"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-white">Settings</span>
            <button onClick={() => setShowSettings(false)} className="btn-icon w-6 h-6">
              <X size={14} />
            </button>
          </div>

          {/* Font */}
          <section className="mb-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Type size={12} className="text-white/40" />
              <span className="text-xs text-white/50 uppercase tracking-wider">Font</span>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {FONTS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFontFamily(f.id)}
                  className={`px-3 py-1 rounded-lg text-xs transition-all ${f.class} ${
                    fontFamily === f.id
                      ? "bg-spotify text-black font-semibold"
                      : "bg-white/10 text-white/60 hover:bg-white/20"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </section>

          {/* Visualizer mode */}
          <section className="mb-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Music2 size={12} className="text-white/40" />
              <span className="text-xs text-white/50 uppercase tracking-wider">Visualizer</span>
            </div>
            <div className="flex gap-1.5">
              {VIZ_MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setVisualizerMode(m.id)}
                  className={`px-3 py-1 rounded-lg text-xs transition-all ${
                    visualizerMode === m.id
                      ? "bg-spotify text-black font-semibold"
                      : "bg-white/10 text-white/60 hover:bg-white/20"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </section>

          {/* Window opacity */}
          <section className="mb-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Sliders size={12} className="text-white/40" />
              <span className="text-xs text-white/50 uppercase tracking-wider">Window Opacity</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0.2"
                max="1"
                step="0.02"
                value={bgOpacity}
                onChange={(e) => setBgOpacity(parseFloat(e.target.value))}
                className="flex-1 accent-spotify h-1"
              />
              <span className="text-xs text-white/40 w-8">{Math.round(bgOpacity * 100)}%</span>
            </div>
          </section>

          {/* Always on top */}
          <section>
            <div className="flex items-center gap-1.5 mb-2">
              <Pin size={12} className="text-white/40" />
              <span className="text-xs text-white/50 uppercase tracking-wider">Window</span>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => handleAlwaysOnTop(true)}
                className="px-3 py-1 rounded-lg text-xs bg-white/10 text-white/60 hover:bg-white/20 transition-all"
              >
                Pin on top
              </button>
              <button
                onClick={() => handleAlwaysOnTop(false)}
                className="px-3 py-1 rounded-lg text-xs bg-white/10 text-white/60 hover:bg-white/20 transition-all"
              >
                Unpin
              </button>
            </div>
          </section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
