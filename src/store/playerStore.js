/**
 * MixTake global state store (Zustand)
 * Manages: queue, gapless playback, YouTube audio streaming, Spotify auth, UI preferences
 */
import { create } from "zustand";

const API = "http://127.0.0.1:8888/api";

let currentHowl = null;
let nextHowl = null;
let audioCtx = null;
let analyserNode = null;

function connectAnalyser(howl) {
  try {
    if (!audioCtx) {
      audioCtx = howl._audioCtx || (howl._sounds[0] && howl._sounds[0]._node && howl._sounds[0]._node.context);
    }
    if (!audioCtx) return;
    if (analyserNode) {
      try { analyserNode.disconnect(); } catch (_) {}
    }
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 256;
    analyserNode.smoothingTimeConstant = 0.8;

    const sound = howl._sounds[0];
    if (sound && sound._node) {
      sound._node.connect(analyserNode);
      analyserNode.connect(audioCtx.destination);
    }
  } catch (e) {
    console.warn("[Analyser] connect failed:", e.message);
  }
}

export const usePlayerStore = create((set, get) => ({
  // Auth
  isAuthenticated: false,
  user: null,
  clientId: "",

  // Tracks & queue
  queue: [],
  queueIndex: -1,
  currentTrack: null,
  isPlaying: false,
  isLoading: false,
  loadError: null,

  // Playback position (updated by tick)
  position: 0,
  duration: 0,

  // Volume
  volume: 0.85,

  // UI Panels
  showPlaylist: false,
  showSettings: false,
  showBackgroundPanel: false,
  visualizerMode: "bars", // "bars" | "wave" | "circle"

  // Background
  bgPreset: "gradient-1",
  bgImage: null,
  bgOpacity: 1.0,

  // Font
  fontFamily: "inter",

  // Accent color (from album art)
  accentColor: "#1DB954",

  // ── Actions ────────────────────────────────────────────────────────────────

  setClientId: (id) => set({ clientId: id }),

  checkAuth: async () => {
    try {
      const r = await fetch(`${API}/spotify/status`);
      const data = await r.json();
      set({ isAuthenticated: data.authenticated, user: data.user || null });
      return data.authenticated;
    } catch {
      set({ isAuthenticated: false });
      return false;
    }
  },

  startAuth: async (clientId) => {
    const id = clientId || get().clientId;
    if (!id) return { error: "No client ID" };
    try {
      const r = await fetch(`${API}/spotify/auth-url?clientId=${encodeURIComponent(id)}`);
      const { url } = await r.json();
      if (window.electronAPI?.openSpotifyAuth) {
        window.electronAPI.openSpotifyAuth(url);
      } else {
        window.open(url, "_blank");
      }
      return { url };
    } catch (e) {
      return { error: e.message };
    }
  },

  logout: async () => {
    try { await fetch(`${API}/spotify/logout`); } catch (_) {}
    set({ isAuthenticated: false, user: null });
  },

  fetchCuratedPlaylists: async () => {
    try {
      const r = await fetch(`${API}/spotify/curated`);
      return await r.json();
    } catch (_) {
      return [];
    }
  },

  fetchPublicPlaylist: async (idOrUrl) => {
    try {
      const r = await fetch(`${API}/spotify/public-playlist?url=${encodeURIComponent(idOrUrl)}`);
      return await r.json();
    } catch (_) {
      return null;
    }
  },

  resolveUrl: async (url) => {
    try {
      const r = await fetch(`${API}/spotify/resolve?url=${encodeURIComponent(url)}`);
      return await r.json();
    } catch (_) {
      return null;
    }
  },

  fetchPlaylists: async () => {
    try {
      const r = await fetch(`${API}/spotify/playlists`);
      return await r.json();
    } catch (_) {
      return { items: [] };
    }
  },

  fetchPlaylistTracks: async (id) => {
    try {
      const r = await fetch(`${API}/spotify/playlists/${id}/tracks`);
      return await r.json();
    } catch (_) {
      return { items: [] };
    }
  },

  fetchLikedSongs: async () => {
    try {
      const r = await fetch(`${API}/spotify/liked-songs`);
      return await r.json();
    } catch (_) {
      return { items: [] };
    }
  },

  // Dual search: Spotify API if logged in, YouTube search otherwise
  search: async (q) => {
    if (!q.trim()) return [];
    try {
      if (get().isAuthenticated) {
        const r = await fetch(`${API}/spotify/search?q=${encodeURIComponent(q)}`);
        const data = await r.json();
        if (data.tracks?.items?.length) return data.tracks.items;
      }
      // Fallback to YouTube search
      const yr = await fetch(`${API}/ytdlp/search?q=${encodeURIComponent(q)}`);
      return await yr.json();
    } catch (e) {
      console.warn("Search failed:", e.message);
      return [];
    }
  },

  // Set entire queue and start from index
  loadQueue: (tracks, startIndex = 0) => {
    if (!tracks || tracks.length === 0) return;
    if (currentHowl) { currentHowl.unload(); currentHowl = null; }
    if (nextHowl) { nextHowl.unload(); nextHowl = null; }
    set({ queue: tracks, queueIndex: startIndex, isPlaying: false, position: 0 });
    get().playIndex(startIndex);
  },

  // Play track at queue index
  playIndex: async (index) => {
    const { queue } = get();
    if (index < 0 || index >= queue.length) return;
    const track = queue[index];
    set({ queueIndex: index, currentTrack: track, isLoading: true, loadError: null, position: 0, duration: 0 });

    try {
      const artist = track.artists?.map(a => a.name).join(" ") || "";
      const query = `${artist} ${track.name}`.trim();
      const r = await fetch(`${API}/ytdlp/url?query=${encodeURIComponent(query)}`);
      if (!r.ok) throw new Error("Audio extraction failed for: " + track.name);
      const { url } = await r.json();

      if (currentHowl) { currentHowl.unload(); currentHowl = null; }

      const { Howl } = await import("howler");
      const howl = new Howl({
        src: [url],
        html5: true,
        format: ["webm", "mp4", "mp3"],
        volume: get().volume,
        onload: () => {
          set({ isLoading: false, duration: howl.duration() });
          connectAnalyser(howl);
          get().preloadNext();
        },
        onplay: () => {
          set({ isPlaying: true });
          get()._startPositionTick();
        },
        onpause: () => set({ isPlaying: false }),
        onstop: () => set({ isPlaying: false, position: 0 }),
        onend: () => {
          get().playNext();
        },
        onloaderror: (_, err) => {
          set({ isLoading: false, loadError: "Stream error, skipping to next..." });
          setTimeout(() => get().playNext(), 1500);
        },
      });

      currentHowl = howl;
      howl.play();
    } catch (err) {
      set({ isLoading: false, loadError: err.message });
    }
  },

  // Gapless preload: pre-fetches next track URL & buffers it before current finishes
  preloadNext: async () => {
    const { queue, queueIndex } = get();
    const nextIndex = queueIndex + 1;
    if (nextIndex >= queue.length) return;

    const track = queue[nextIndex];
    const artist = track.artists?.map(a => a.name).join(" ") || "";
    const query = `${artist} ${track.name}`.trim();

    try {
      const r = await fetch(`${API}/ytdlp/url?query=${encodeURIComponent(query)}`);
      if (!r.ok) return;
      const { url } = await r.json();

      if (nextHowl) { nextHowl.unload(); nextHowl = null; }
      const { Howl } = await import("howler");
      nextHowl = new Howl({
        src: [url],
        html5: true,
        format: ["webm", "mp4", "mp3"],
        preload: true,
        volume: get().volume,
      });
      console.log("[MixTake] Gapless preload ready:", track.name);
    } catch (err) {
      console.warn("[MixTake] Preload failed:", err.message);
    }
  },

  playNext: () => {
    const { queue, queueIndex } = get();
    const nextIndex = queueIndex + 1;
    if (nextIndex >= queue.length) {
      set({ isPlaying: false });
      return;
    }

    if (nextHowl && nextHowl.state() !== "unloaded") {
      if (currentHowl) { currentHowl.unload(); currentHowl = null; }
      const track = queue[nextIndex];
      set({
        queueIndex: nextIndex,
        currentTrack: track,
        isLoading: false,
        position: 0,
        duration: nextHowl.duration() || 0,
      });
      currentHowl = nextHowl;
      nextHowl = null;
      currentHowl.volume(get().volume);
      currentHowl.on("end", () => get().playNext());
      currentHowl.on("play", () => {
        set({ isPlaying: true });
        get()._startPositionTick();
      });
      currentHowl.on("pause", () => set({ isPlaying: false }));
      connectAnalyser(currentHowl);
      currentHowl.play();
      get().preloadNext();
    } else {
      get().playIndex(nextIndex);
    }
  },

  playPrev: () => {
    const { queueIndex, position } = get();
    if (position > 3 && currentHowl) {
      currentHowl.seek(0);
      set({ position: 0 });
      return;
    }
    const prevIndex = Math.max(0, queueIndex - 1);
    get().playIndex(prevIndex);
  },

  togglePlay: () => {
    if (!currentHowl) {
      const { queue, queueIndex } = get();
      if (queue.length > 0) {
        get().playIndex(queueIndex >= 0 ? queueIndex : 0);
      }
      return;
    }
    if (currentHowl.playing()) {
      currentHowl.pause();
    } else {
      currentHowl.play();
    }
  },

  seek: (seconds) => {
    if (!currentHowl) return;
    currentHowl.seek(seconds);
    set({ position: seconds });
  },

  setVolume: (vol) => {
    set({ volume: vol });
    if (currentHowl) currentHowl.volume(vol);
  },

  getAnalyserNode: () => analyserNode,

  _positionTimer: null,
  _startPositionTick: () => {
    const existing = get()._positionTimer;
    if (existing) clearInterval(existing);
    const timer = setInterval(() => {
      if (!currentHowl || !currentHowl.playing()) return;
      const pos = currentHowl.seek() || 0;
      set({ position: typeof pos === "number" ? pos : 0 });
    }, 400);
    set({ _positionTimer: timer });
  },

  // UI toggles
  setShowPlaylist: (v) => set({ showPlaylist: v, showSettings: false, showBackgroundPanel: false }),
  setShowSettings: (v) => set({ showSettings: v, showPlaylist: false, showBackgroundPanel: false }),
  setShowBackgroundPanel: (v) => set({ showBackgroundPanel: v, showPlaylist: false, showSettings: false }),
  setVisualizerMode: (m) => set({ visualizerMode: m }),

  // Background & appearance
  setBgPreset: (p) => set({ bgPreset: p, bgImage: null }),
  setBgImage: (img) => set({ bgImage: img, bgPreset: "custom" }),
  setBgOpacity: (o) => {
    set({ bgOpacity: o });
    if (window.electronAPI) window.electronAPI.setOpacity(o);
  },
  setFontFamily: (f) => set({ fontFamily: f }),
  setAccentColor: (c) => set({ accentColor: c }),
}));