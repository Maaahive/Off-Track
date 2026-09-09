# ⚡ OffTrack

A clean, lightweight, floating frosted-glass music player for your desktop. Streams whatever you want from YouTube ad-free and syncs seamlessly with your Spotify library.

[![Electron](https://img.shields.io/badge/Electron-33.x-47848F?logo=electron&logoColor=white)](https://electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Spotify API](https://img.shields.io/badge/Spotify-Web%20API-1DB954?logo=spotify&logoColor=white)](https://developer.spotify.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 🎧 Intro & Backstory

I just wanted a minimal music companion that sits quietly in the corner of my screen while I code, design, or game — without loud ads, heavy browser tabs, or bloated apps eating up half my screen.

Standard desktop players take up way too much space and RAM, while keeping YouTube open in Chrome wastes CPU and battery rendering video tracks in the background even when you only care about the audio. And free tiers constantly interrupt your flow with audio ads.

**OffTrack brings the best of both worlds together:**
- **Zero Ads, Pure Audio**: Taps directly into YouTube's audio stream so you can search and stream literally any track, unreleased leak, live set, or lo-fi mix on-demand without video lag or ad interruptions.
- **Two-Way Spotify Handoff**: Connect your Spotify account to import private playlists, or hit **`⚪ Sync`** to instantly cast whatever is currently playing in OffTrack straight into your official desktop/mobile Spotify app at the exact same timestamp.
- **Floating Frosted Glass HUD**: An always-on-top, borderless widget with 5 transparency presets (`Original Wallpaper`, `Frosted Glass`, `Clear`, `Ghost`, `Solid`) designed to stay visible without getting in your way.

---

## ✨ Why OffTrack?

Official desktop music players are often bloated, resource-heavy (taking 500MB–1GB+ RAM), and lock essential features behind paywalls. 

| Feature | Spotify Free | YouTube Music | ⚡ OffTrack |
| :--- | :---: | :---: | :---: |
| **Audio Ads** | ❌ Interrupted every few songs | ❌ Video & banner ads | ✅ **100% Ad-Free Audio** |
| **Pick Any Song On-Demand** | ❌ Forced shuffle on free tiers | ⚠️ Requires Premium for background | ✅ **Full On-Demand Control** |
| **Music Catalog** | ⚠️ Label releases only | ✅ Large catalog | ✅ **Full YouTube + Leaks, Remakes & Live Sets** |
| **Synchronized Lyrics** | ⚠️ Limited / requires scroll | ⚠️ Static / delayed | ✅ **Live Mini HUD + Full Click-to-Seek Karaoke** |
| **UI Form Factor** | ❌ Giant 1GB RAM desktop window | ❌ Heavy browser tab rendering video | ✅ **Tiny Floating Frosted-Glass HUD** |
| **Desktop Multitasking** | ❌ Covers your IDE/games | ❌ Distracting video | ✅ **Always-on-Top Translucent Overlay** |
| **Spotify Integration** | N/A | ❌ None | ✅ **Two-Way Smart Playback Handoff & Sync** |

---

## 🚀 Key Features

### 1. 🎵 100% Ad-Free YouTube Audio Engine
- Stream **any song, remix, live concert, unreleased leak, or lo-fi mix** from YouTube on-demand with zero video clutter and zero ads.
- Lightweight audio extraction that saves massive bandwidth, RAM, and battery compared to running YouTube in a browser tab.

### 2. 🎤 Real-Time Synchronized Lyrics & Mini-Karaoke HUD
- **Full Synchronized Lyrics Overlay (`Ctrl+L` or 🎤)**:
  - Clean, distraction-free modal auto-scrolling with the active vocal line.
  - **Click-to-Seek**: Click any lyric line to instantly jump playback to that timestamp!
  - **On-the-Fly Micro-Sync (`-0.5s` / `+0.5s` or `[` / `]`)**: Nudge lyrics earlier or later in real time with an energetic visual pulse transition.
- **3-Line Mini-Lyrics on Main HUD**:
  - Displays live lyrics (previous, current, and upcoming line) directly beneath the song title on the main frosted player. Toggle it on/off with the note icon anytime.

### 3. 🔀 Two-Way Spotify Smart Handoff & Live Sync (`🟢 Sync`)
- **OffTrack ➔ Spotify**: Listening to a track on OffTrack and want to switch to your phone or official desktop Spotify app? One click on **`Sync`** casts that exact song and seek timestamp directly into your active Spotify app!
- **Spotify ➔ OffTrack**: Playing a playlist, Daily Mix, or Blend on your official Spotify app? Turn on **`🟢 Sync`** in OffTrack to turn it into an aesthetic floating frosted-glass companion with soundwaves and synchronized lyrics.
- **Full Library Pagination**: Seamlessly loads your full Spotify library (up to 200 playlists) in the dropdown menu.

> [!IMPORTANT]
> **Spotify Premium Policy for Developer API**:
> Per Spotify's updated Developer Platform policy, the owner of the Spotify Developer App must have an active **Spotify Premium** subscription to:
> - Auto-sync and list private library playlists (`/v1/me/playlists`).
> - Use remote playback handoff & controls (`play`, `pause`, `seek`, `skip`).
> 
> If connected with a Spotify Free account, Spotify's API returns `403 Forbidden` (*"Active premium subscription required for the owner of the app"*).
> 
> *Don't have Spotify Premium?* **No problem at all!** You can still play **any** Spotify playlist:
> 1. Click **`+ Add Playlist URL`** in the playlist menu, or paste any Spotify playlist link directly into the search bar.
> 2. OffTrack extracts the entire tracklist and saves it locally.
> 3. Enjoy 100% ad-free on-demand streaming with unlimited seeking using OffTrack's built-in engine!

### 4. 📑 Smart Queue & Playlist Management
- Dedicated **Queue Sidebar** with full upcoming track visibility, reordering, and smart auto-advancing.
- Supports pasting any Spotify playlist link directly into the search bar or "+ Add Playlist URL" for instant listening.

### 5. 🪟 Floating Frosted-Glass HUD (Always-On-Top)
- Built for multitasking while coding, designing, or gaming — sits comfortably in the corner of your screen without window clutter.
- Cycle through 5 transparency presets with one click (or right-click to reset):
  - **`🖼️ Original`**: 100% crisp wallpaper brightness and full image opacity.
  - **`💎 Glass`**: 65% frosted glass with backdrop blur.
  - **`💧 Clear`**: 30% see-through glass.
  - **`👻 Ghost`**: 5% ultra-subtle HUD for deep work.
  - **`⬛ Solid`**: Dark minimal player.

### 6. ⌨️ Global Keyboard Shortcuts & System Tray
- Full background control with global hotkeys and built-in OS media keys (`Play/Pause`, `Next`, `Prev`, Seek `±5s`, Lyrics offset `[`/`]`).
- Minimize cleanly to the Windows System Tray or customize hotkeys in Settings.

### 7. 🎨 41 Preloaded Aesthetic Album Covers & Custom Upload
- Right-click the album cover to open the **Covers Modal**:
  - **`🎵 Auto (Song Art)`**: Dynamically pulls the official high-res artwork for the song playing.
  - **`📁 Upload Your Own`**: Set any image or wallpaper from your PC.
  - **41 Preloaded Aesthetic Covers**: Instant one-click visual presets.

### 8. 🌊 Animated Audio Sound Wave & Live Search Scanner
- Undulating **dual-frequency sound wave** flowing across the progress bar while music is active, paired with a glowing playhead dot.
- Live latency ticker (`⏳ Searching... 1.2s`) with an animated radar sweep scanner during searches.

---

## 🛠️ Tech Stack

- **Framework**: [Electron](https://www.electronjs.org/)
- **Runtime**: [Node.js](https://nodejs.org/) (ES Modules)
- **Audio Extraction**: [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) native stream extractor
- **Lyrics Engine**: [LRCLIB](https://lrclib.net/) Synchronized Lyrics API
- **APIs**: Spotify Web API (`spotify-web-api-node` & `spotify-url-info`)
- **Styling**: Pure Modern CSS with Glassmorphism, CSS Variables, and Hardware-Accelerated Animations

---

## 📥 Installation & Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [Git](https://git-scm.com/)

### 1. Clone the Repository
```bash
git clone https://github.com/Maaahive/Off-Track.git
cd Off-Track
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Launch the App

#### 🖥️ Option A: Run via `OffTrack.bat` (Recommended — No Terminal Needed!)
Nobody wants to keep an annoying black command prompt window open while listening to music.

1. Simply double-click **`OffTrack.bat`** in the project folder.
2. It will automatically place an official **OffTrack** shortcut onto your Windows Desktop with the custom icon and launch the app silently in the background!
3. From then on, you can just double-click your **OffTrack** desktop icon anytime — **zero terminal needed.**

#### 🚀 Option B: Run via Terminal
If you prefer running from the command line:
```bash
npm start
```

---

## 🔄 Updating to the Latest Version

Whenever new features, design updates, or fixes are pushed, updating your local setup takes seconds:

### 🖱️ Option A: 1-Click Update (Recommended)
Simply double-click **`Update-OffTrack.bat`** in the project folder.  
It will:
1. Automatically pull the latest updates (`git pull origin main`).
2. Verify dependencies (`npm install`).
3. Relaunch **OffTrack** for you smoothly!

### 💻 Option B: Update via Terminal
Run the following in your project directory:
```bash
git pull origin main
npm install
npm start
```

---

## 🔑 (Optional) Spotify Developer Credentials

To sync your private Spotify library and enable two-way live casting:
1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Create an application and add `http://127.0.0.1:8888/callback` as a Redirect URI.
3. *(If app is in Development Mode)*: Under **Settings ➔ User Management**, add the Spotify email address of any user who will log in.
4. In OffTrack, open **Settings** (`Ctrl+Shift+S`) ➔ **Account** ➔ enter your `Client ID` and `Client Secret` ➔ click **Login**.

> [!NOTE]
> - **Spotify Premium Policy for Developer API**: Spotify's API requires an active Spotify Premium subscription on the Developer App owner's account for library fetching (`/v1/me/playlists`) and remote playback handoff (`/v1/me/player`). Free accounts receive `403 Forbidden` from Spotify's servers.
> - **Zero Login / Free-Tier Friendly**: You do **NOT** need a Spotify Premium or Developer account to use OffTrack! You can search and stream any song on-demand 100% ad-free, or paste any Spotify playlist URL into **`+ Add Playlist URL`** or the search bar without logging in!

---

## 💡 Shoutout & Inspiration

Big shoutout to **[Saarthak Agarwal](https://www.linkedin.com/in/saarthak-agarwal-sa)** and his project **[Trak](https://github.com/Saarthak1234/trak.git)**! 

The idea for OffTrack came directly from seeing what he built with Trak. I loved the concept and wanted to build my own take on a floating desktop companion — adding frosted glass transparency, two-way Spotify casting, real-time synchronized lyrics, and live soundwaves. Definitely go check out his work! 🚀

---

## ⚖️ Disclaimer

OffTrack is an open-source, non-commercial educational project built for personal desktop use. It is not affiliated with, endorsed by, or partnered with Spotify AB, Google LLC, or YouTube. All trademarks, logos, and album covers belong to their respective copyright holders.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## 👤 Author

- **Mahi** - [GitHub](https://github.com/Maaahive) 

*Inspired by [Trak](https://github.com/Saarthak1234/trak.git) by [Saarthak Agarwal](https://www.linkedin.com/in/saarthak-agarwal-sa).*