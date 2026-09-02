/**
 * PlaylistDrawer — browse curated playlists, search YouTube/Spotify,
 * paste any Spotify playlist URL, or connect personal Spotify account.
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Music, Heart, ChevronLeft, Search, Loader2, Play,
  Sparkles, Link2, LogIn, LogOut, Disc3
} from "lucide-react";
import { usePlayerStore } from "../store/playerStore";

export default function PlaylistDrawer() {
  const {
    showPlaylist, setShowPlaylist,
    isAuthenticated, user, startAuth, logout, clientId, setClientId,
    fetchCuratedPlaylists, fetchPublicPlaylist, resolveUrl,
    fetchPlaylists, fetchPlaylistTracks, fetchLikedSongs,
    search, loadQueue, currentTrack, queue
  } = usePlayerStore();

  const [view, setView] = useState("playlists"); // playlists | tracks | search | connect
  const [curated, setCurated] = useState([]);
  const [userPlaylists, setUserPlaylists] = useState([]);
  const [activeTitle, setActiveTitle] = useState("Library");
  const [tracks, setTracks] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inputClientId, setInputClientId] = useState(clientId || "");
  const [connectMessage, setConnectMessage] = useState("");

  // Load curated & user playlists on open
  useEffect(() => {
    if (!showPlaylist) return;
    loadAllPlaylists();
  }, [showPlaylist, isAuthenticated]);

  const loadAllPlaylists = async () => {
    setLoading(true);
    try {
      const cur = await fetchCuratedPlaylists();
      setCurated(cur || []);

      if (isAuthenticated) {
        const udata = await fetchPlaylists();
        setUserPlaylists(udata.items || []);
      }
    } catch (_) {}
    setLoading(false);
  };

  const openCurated = async (playlist) => {
    setLoading(true);
    setActiveTitle(playlist.name);
    setView("tracks");
    try {
      const data = await fetchPublicPlaylist(playlist.id);
      if (data?.tracks?.length) {
        setTracks(data.tracks);
      }
    } catch (e) {
      console.error("Failed to load playlist:", e);
    }
    setLoading(false);
  };

  const openUserPlaylist = async (playlist) => {
    setLoading(true);
    setActiveTitle(playlist.name);
    setView("tracks");
    try {
      const data = await fetchPlaylistTracks(playlist.id);
      const items = (data.items || []).map((i) => i.track).filter(Boolean);
      setTracks(items);
    } catch (_) {}
    setLoading(false);
  };

  const openLikedSongs = async () => {
    setLoading(true);
    setActiveTitle("Liked Songs");
    setView("tracks");
    try {
      const data = await fetchLikedSongs();
      const items = (data.items || []).map((i) => i.track).filter(Boolean);
      setTracks(items);
    } catch (_) {}
    setLoading(false);
  };

  const handleSearchOrUrl = async (val) => {
    setSearchQuery(val);
    if (!val.trim()) {
      setSearchResults([]);
      return;
    }

    // If it's a Spotify link
    if (val.includes("spotify.com")) {
      setLoading(true);
      const resolved = await resolveUrl(val.trim());
      setLoading(false);
      if (resolved?.tracks?.length) {
        setTracks(resolved.tracks);
        setActiveTitle(resolved.name || "Spotify Link");
        setView("tracks");
        return;
      }
    }

    // Normal search
    setLoading(true);
    const results = await search(val.trim());
    setSearchResults(results || []);
    setLoading(false);
  };

  const playSingleTrack = (track) => {
    loadQueue([track], 0);
    setShowPlaylist(false);
  };

  const playPlaylistTracks = (index) => {
    loadQueue(tracks, index);
    setShowPlaylist(false);
  };

  const handleInAppConnect = async () => {
    if (!inputClientId.trim()) {
      setConnectMessage("Please enter your Spotify Client ID");
      return;
    }
    setClientId(inputClientId.trim());
    setConnectMessage("Opening login window in MixTake...");
    const res = await startAuth(inputClientId.trim());
    if (res?.error) {
      setConnectMessage("Error: " + res.error);
    } else {
      setConnectMessage("Log in using the popup window.");
    }
  };

  const formatDuration = (ms) => {
    if (!ms) return "3:00";
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  return (
    <AnimatePresence>
      {showPlaylist && (
        <motion.div
          initial={{ opacity: 0, x: "100%" }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="absolute inset-0 glass rounded-xl z-40 no-drag flex flex-col overflow-hidden text-white select-none"
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 shrink-0">
            {view !== "playlists" && (
              <button onClick={() => setView("playlists")} className="btn-icon w-6 h-6">
                <ChevronLeft size={14} />
              </button>
            )}

            <div className="flex-1 min-w-0">
              <span className="text-xs font-semibold text-white/90 truncate block">
                {view === "tracks" ? activeTitle : view === "search" ? "Search / Paste Link" : view === "connect" ? "Connect Spotify" : "Music Library"}
              </span>
            </div>

            {view !== "search" && (
              <button
                onClick={() => setView("search")}
                className="btn-icon w-6 h-6"
                title="Search or paste link"
              >
                <Search size={13} />
              </button>
            )}

            <button onClick={() => setShowPlaylist(false)} className="btn-icon w-6 h-6">
              <X size={13} />
            </button>
          </div>

          {/* Search bar view */}
          {view === "search" && (
            <div className="p-2 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-1.5 bg-white/10 px-2 py-1 rounded-lg border border-white/15">
                <Search size={12} className="text-white/40 shrink-0" />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => handleSearchOrUrl(e.target.value)}
                  placeholder="Search song or paste Spotify URL..."
                  className="bg-transparent text-xs text-white placeholder-white/40 focus:outline-none w-full"
                />
                {searchQuery && (
                  <button onClick={() => handleSearchOrUrl("")} className="text-white/40 hover:text-white">
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Body */}
          <div className="flex-1 overflow-y-auto scrollbar-none p-2 space-y-2">
            {loading && (
              <div className="flex items-center justify-center py-6">
                <Loader2 size={20} className="text-spotify animate-spin" />
              </div>
            )}

            {/* ── TRACKS VIEW ── */}
            {!loading && view === "tracks" && (
              <div className="space-y-1">
                {tracks.map((track, i) => {
                  const isCurrent = currentTrack?.name === track.name;
                  const thumb = track.album?.images?.[0]?.url;
                  return (
                    <button
                      key={track.id + "-" + i}
                      onClick={() => playPlaylistTracks(i)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors text-left group ${
                        isCurrent ? "bg-white/15" : "hover:bg-white/10"
                      }`}
                    >
                      <div className="relative w-8 h-8 rounded shrink-0 overflow-hidden bg-white/10">
                        {thumb ? (
                          <img src={thumb} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Music size={12} className="text-white/40" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Play size={10} className="text-white fill-white" />
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className={`text-xs truncate ${isCurrent ? "text-spotify font-semibold" : "text-white/90"}`}>
                          {track.name}
                        </div>
                        <div className="text-[10px] text-white/45 truncate">
                          {track.artists?.map((a) => a.name).join(", ")}
                        </div>
                      </div>

                      <span className="text-[10px] text-white/30 shrink-0">
                        {formatDuration(track.duration_ms)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── SEARCH RESULTS VIEW ── */}
            {!loading && view === "search" && searchResults.length > 0 && (
              <div className="space-y-1">
                {searchResults.map((track, i) => {
                  const thumb = track.album?.images?.[0]?.url;
                  return (
                    <button
                      key={track.id + "-" + i}
                      onClick={() => playSingleTrack(track)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/10 transition-colors text-left group"
                    >
                      <div className="relative w-8 h-8 rounded shrink-0 overflow-hidden bg-white/10">
                        {thumb ? (
                          <img src={thumb} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Music size={12} className="text-white/40" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Play size={10} className="text-white fill-white" />
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-white/90 truncate">{track.name}</div>
                        <div className="text-[10px] text-white/45 truncate">
                          {track.artists?.map((a) => a.name).join(", ")}
                        </div>
                      </div>

                      <span className="text-[10px] text-white/30 shrink-0">
                        {formatDuration(track.duration_ms)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── PLAYLISTS MAIN MENU ── */}
            {!loading && view === "playlists" && (
              <div className="space-y-3">
                {/* Search / Paste banner */}
                <button
                  onClick={() => setView("search")}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-all"
                >
                  <Search size={13} className="text-spotify shrink-0" />
                  <span className="text-xs text-white/60">Search song or paste Spotify URL...</span>
                </button>

                {/* Curated section */}
                <div>
                  <div className="flex items-center gap-1 text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-1.5 px-1">
                    <Sparkles size={10} className="text-yellow-400" />
                    <span>Popular Playlists (Instant Play)</span>
                  </div>
                  <div className="space-y-1">
                    {curated.map((pl) => (
                      <button
                        key={pl.id}
                        onClick={() => openCurated(pl)}
                        className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/10 transition-colors text-left"
                      >
                        <img src={pl.image} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-white/90 font-medium truncate">{pl.name}</div>
                          <div className="text-[10px] text-white/40 truncate">{pl.desc}</div>
                        </div>
                        <Play size={12} className="text-white/40 group-hover:text-white shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Spotify Account section */}
                <div className="pt-2 border-t border-white/10">
                  {isAuthenticated ? (
                    <div>
                      <div className="flex items-center justify-between px-1 mb-1.5">
                        <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">
                          Your Spotify ({user?.display_name || "Connected"})
                        </span>
                        <button onClick={logout} className="text-[10px] text-red-400 hover:underline flex items-center gap-1">
                          <LogOut size={9} /> Logout
                        </button>
                      </div>

                      <button
                        onClick={openLikedSongs}
                        className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/10 transition-colors text-left mb-1"
                      >
                        <div className="w-8 h-8 rounded bg-gradient-to-br from-purple-600 to-blue-400 flex items-center justify-center shrink-0">
                          <Heart size={13} className="text-white fill-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-white/90 font-medium">Liked Songs</div>
                          <div className="text-[10px] text-white/40">Your library</div>
                        </div>
                      </button>

                      {userPlaylists.map((pl) => (
                        <button
                          key={pl.id}
                          onClick={() => openUserPlaylist(pl)}
                          className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/10 transition-colors text-left"
                        >
                          {pl.images?.[0]?.url ? (
                            <img src={pl.images[0].url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center shrink-0">
                              <Music size={12} className="text-white/40" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-white/90 truncate">{pl.name}</div>
                            <div className="text-[10px] text-white/40">{pl.tracks?.total} tracks</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button
                      onClick={() => setView("connect")}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-spotify/20 hover:bg-spotify/30 border border-spotify/40 text-spotify text-xs font-semibold transition-all"
                    >
                      <LogIn size={13} />
                      <span>Connect Personal Spotify Account</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── IN-APP CONNECT VIEW ── */}
            {view === "connect" && (
              <div className="p-2 space-y-2">
                <div className="text-center py-1">
                  <h3 className="text-xs font-bold text-white">Connect Spotify (In-App)</h3>
                  <p className="text-[10px] text-white/50 mt-0.5">
                    Opens a local window inside MixTake. No Chrome needed.
                  </p>
                </div>

                <input
                  value={inputClientId}
                  onChange={(e) => setInputClientId(e.target.value)}
                  placeholder="Spotify Client ID"
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-spotify"
                />

                <button
                  onClick={handleInAppConnect}
                  className="w-full bg-spotify hover:bg-spotify-dark text-black text-xs font-bold py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  <LogIn size={12} />
                  Authorize In-App
                </button>

                {connectMessage && (
                  <p className="text-[10px] text-center text-spotify leading-snug">{connectMessage}</p>
                )}

                <p className="text-[9px] text-white/30 text-center leading-relaxed">
                  Redirect URI to register in Spotify Dashboard: <br />
                  <code className="text-white/60">http://127.0.0.1:8888/api/spotify/callback</code>
                </p>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}