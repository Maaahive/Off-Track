/**
 * App.jsx — Root mini player view with settings persistence & auto-queue loading
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { usePlayerStore } from "./store/playerStore";
import Player from "./components/Player";

export default function App() {
  const {
    checkAuth,
    fontFamily,
    bgPreset,
    visualizerMode,
    setBgOpacity,
    setBgPreset,
    setFontFamily,
    setVisualizerMode,
    fetchPublicPlaylist,
    queue,
    loadQueue,
  } = usePlayerStore();

  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const init = async () => {
      // 1. Restore stored settings
      if (window.electronAPI) {
        try {
          const [savedFont, savedPreset, savedVizMode, savedOpacity] = await Promise.all([
            window.electronAPI.storeGet("fontFamily"),
            window.electronAPI.storeGet("bgPreset"),
            window.electronAPI.storeGet("visualizerMode"),
            window.electronAPI.storeGet("windowOpacity"),
          ]);
          if (savedFont) setFontFamily(savedFont);
          if (savedPreset) setBgPreset(savedPreset);
          if (savedVizMode) setVisualizerMode(savedVizMode);
          if (typeof savedOpacity === "number") setBgOpacity(savedOpacity);
        } catch (_) {}
      }

      // 2. Check Spotify auth in background
      await checkAuth();

      // 3. Preload a default playlist into the queue so the player is ready to go
      if (queue.length === 0) {
        try {
          const defaultPlaylist = await fetchPublicPlaylist("37i9dQZF1DXcBWIGoYBM5M"); // Today's Top Hits
          if (defaultPlaylist?.tracks?.length) {
            usePlayerStore.setState({
              queue: defaultPlaylist.tracks,
              queueIndex: 0,
              currentTrack: defaultPlaylist.tracks[0],
            });
          }
        } catch (_) {}
      }

      setInitializing(false);
    };

    init();
  }, []);

  // Persist settings
  useEffect(() => {
    if (!window.electronAPI || initializing) return;
    try {
      window.electronAPI.storeSet("fontFamily", fontFamily);
      window.electronAPI.storeSet("bgPreset", bgPreset);
      window.electronAPI.storeSet("visualizerMode", visualizerMode);
    } catch (_) {}
  }, [fontFamily, bgPreset, visualizerMode, initializing]);

  if (initializing) {
    return (
      <div className="w-full h-full bg-slate-950/80 rounded-xl flex flex-col items-center justify-center text-white/50 gap-2 select-none">
        <Loader2 size={24} className="text-spotify animate-spin" />
        <span className="text-xs">Loading MixTake...</span>
      </div>
    );
  }

  // Always show the Player widget directly
  return <Player />;
}