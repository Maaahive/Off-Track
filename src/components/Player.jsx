/**
 * Player — main music player UI
 */
import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, SkipBack, SkipForward,
  Volume2, VolumeX, Image, ListMusic,
  Settings2, Minus, X, Loader2, Music2
} from "lucide-react";
import { usePlayerStore } from "../store/playerStore";
import Visualizer from "./Visualizer";
import Marquee from "./Marquee";
import BackgroundPanel, { BackgroundLayer } from "./Background";
import PlaylistDrawer from "./PlaylistDrawer";
import Settings from "./Settings";
import { useAlbumColor } from "../hooks/useAlbumColor";

function formatTime(s) {
  if (!s || isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default function Player() {
  const {
    isAuthenticated, currentTrack, isPlaying, isLoading, loadError,
    position, duration, volume, accentColor, fontFamily,
    showPlaylist, showSettings, showBackgroundPanel,
    togglePlay, seek, setVolume, playNext, playPrev,
    setShowPlaylist, setShowSettings, setShowBackgroundPanel,
  } = usePlayerStore();

  const seekBarRef = useRef(null);
  const [isDraggingSeek, setIsDraggingSeek] = useState(false);
  const [seekPreview, setSeekPreview] = useState(null);
  const [showVolume, setShowVolume] = useState(false);

  const progress = duration > 0 ? (position / duration) * 100 : 0;

  const handleSeekClick = useCallback((e) => {
    if (!seekBarRef.current || !duration) return;
    const rect = seekBarRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seek(ratio * duration);
  }, [duration, seek]);

  const handleSeekHover = useCallback((e) => {
    if (!seekBarRef.current || !duration) return;
    const rect = seekBarRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setSeekPreview(ratio * duration);
  }, [duration]);

  const fontClass = {
    inter: "font-inter",
    syne: "font-syne",
    mono: "font-mono",
    dm: "font-dm",
  }[fontFamily] || "font-inter";

  const albumArt = currentTrack?.album?.images?.[0]?.url;
  const songTitle = currentTrack?.name || "Not playing";
  const artistName = currentTrack?.artists?.map((a) => a.name).join(", ") || "—";

  // Extract dominant color from album art for accent theming
  useAlbumColor(albumArt);


  const closePanel = () => {
    if (showSettings) setShowSettings(false);
    if (showPlaylist) setShowPlaylist(false);
    if (showBackgroundPanel) setShowBackgroundPanel(false);
  };

  return (
    <div className={`relative w-full h-full ${fontClass} select-none overflow-hidden rounded-xl`}>
      {/* Background */}
      <BackgroundLayer />

      {/* Drag handle — top strip */}
      <div className="absolute top-0 left-0 right-0 h-6 drag-handle z-10" />

      {/* Window controls */}
      <div className="absolute top-1.5 right-2 flex items-center gap-1 z-20 no-drag">
        <button
          onClick={() => window.electronAPI?.minimize()}
          className="w-4 h-4 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center transition-colors"
        >
          <Minus size={8} className="text-white/70" />
        </button>
        <button
          onClick={() => window.electronAPI?.close()}
          className="w-4 h-4 rounded-full bg-white/10 hover:bg-red-500/70 flex items-center justify-center transition-colors"
        >
          <X size={8} className="text-white/70" />
        </button>
      </div>

      {/* Toolbar — top left */}
      <div className="absolute top-1.5 left-2 flex items-center gap-1 z-20 no-drag">
        <button
          onClick={() => { closePanel(); setShowBackgroundPanel(!showBackgroundPanel); }}
          className={`btn-icon w-5 h-5 ${showBackgroundPanel ? "text-white" : ""}`}
          title="Change Background"
        >
          <Image size={11} />
        </button>
        <button
          onClick={() => { closePanel(); setShowSettings(!showSettings); }}
          className={`btn-icon w-5 h-5 ${showSettings ? "text-white" : ""}`}
          title="Settings"
        >
          <Settings2 size={11} />
        </button>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col h-full pt-6 pb-1 px-3">
        {/* Track info row */}
        <div className="flex items-center gap-3 flex-1 min-h-0">
          {/* Album art */}
          <motion.div
            className="shrink-0 relative"
            animate={isPlaying ? { scale: [1, 1.03, 1] } : { scale: 1 }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            {albumArt ? (
              <img
                src={albumArt}
                alt="album"
                className="w-14 h-14 rounded-lg object-cover shadow-lg"
                style={{ boxShadow: `0 4px 20px ${accentColor}55` }}
              />
            ) : (
              <div
                className="w-14 h-14 rounded-lg flex items-center justify-center bg-white/10"
                style={{ boxShadow: `0 4px 20px ${accentColor}55` }}
              >
                <Music2 size={24} className="text-white/30" />
              </div>
            )}
            {isLoading && (
              <div className="absolute inset-0 rounded-lg flex items-center justify-center bg-black/50">
                <Loader2 size={18} className="text-white animate-spin" />
              </div>
            )}
          </motion.div>

          {/* Song info + controls */}
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            {/* Title + artist */}
            <div className="min-w-0">
              <Marquee
                text={songTitle}
                className={`text-sm font-semibold text-white leading-tight ${fontClass}`}
              />
              <Marquee
                text={artistName}
                className={`text-xs leading-tight mt-0.5 text-white/55 ${fontClass}`}
              />
            </div>

            {/* Visualizer */}
            <Visualizer height={28} />

            {/* Controls */}
            <div className="flex items-center gap-3">
              <button onClick={playPrev} className="btn-icon w-7 h-7 no-drag">
                <SkipBack size={14} fill="currentColor" />
              </button>

              <button
                onClick={togglePlay}
                disabled={isLoading}
                className="no-drag flex items-center justify-center w-8 h-8 rounded-full transition-all active:scale-95"
                style={{ background: accentColor }}
              >
                <AnimatePresence mode="wait">
                  {isLoading ? (
                    <motion.div key="load" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <Loader2 size={14} className="text-black animate-spin" />
                    </motion.div>
                  ) : isPlaying ? (
                    <motion.div key="pause" initial={{ scale: 0.8 }} animate={{ scale: 1 }} exit={{ scale: 0.8 }}>
                      <Pause size={14} fill="black" className="text-black" />
                    </motion.div>
                  ) : (
                    <motion.div key="play" initial={{ scale: 0.8 }} animate={{ scale: 1 }} exit={{ scale: 0.8 }}>
                      <Play size={14} fill="black" className="text-black ml-0.5" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>

              <button onClick={playNext} className="btn-icon w-7 h-7 no-drag">
                <SkipForward size={14} fill="currentColor" />
              </button>

              {/* Volume */}
              <div className="relative flex items-center ml-auto no-drag">
                <button
                  onClick={() => setShowVolume(!showVolume)}
                  className="btn-icon w-6 h-6"
                >
                  {volume === 0 ? <VolumeX size={12} /> : <Volume2 size={12} />}
                </button>
                <AnimatePresence>
                  {showVolume && (
                    <motion.div
                      initial={{ opacity: 0, scaleX: 0 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      exit={{ opacity: 0, scaleX: 0 }}
                      className="absolute right-7 origin-right"
                    >
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={volume}
                        onChange={(e) => setVolume(parseFloat(e.target.value))}
                        className="w-20 accent-spotify h-1"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Playlist toggle */}
              <button
                onClick={() => { closePanel(); setShowPlaylist(!showPlaylist); }}
                className={`btn-icon w-6 h-6 no-drag ${showPlaylist ? "text-white" : ""}`}
              >
                <ListMusic size={12} />
              </button>
            </div>
          </div>
        </div>

        {/* Seek bar */}
        <div className="mt-1 px-0.5">
          <div
            ref={seekBarRef}
            className="seek-track no-drag"
            onClick={handleSeekClick}
            onMouseMove={handleSeekHover}
            onMouseLeave={() => setSeekPreview(null)}
          >
            <div className="seek-fill" style={{ width: `${progress}%`, background: accentColor }} />
            {/* Scrubber thumb */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full shadow transition-opacity"
              style={{ left: `${progress}%`, background: accentColor, transform: "translate(-50%, -50%)" }}
            />
          </div>
          <div className="flex justify-between mt-0.5">
            <span className="text-[9px] text-white/30">{formatTime(position)}</span>
            <span className="text-[9px] text-white/30">{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      {/* Panels (overlay) */}
      <BackgroundPanel />
      <PlaylistDrawer />
      <Settings />

      {/* Error toast */}
      <AnimatePresence>
        {loadError && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-8 left-2 right-2 bg-red-900/80 text-white text-[10px] px-2 py-1.5 rounded-lg z-50 no-drag"
          >
            ⚠ {loadError}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
