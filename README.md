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
| **UI Form Factor** | ❌ Giant 1GB RAM desktop window | ❌ Heavy browser tab rendering video | ✅ **Tiny Floating Frosted-Glass HUD** |
| **Desktop Multitasking** | ❌ Covers your IDE/games | ❌ Distracting video | ✅ **Always-on-Top Translucent Overlay** |
| **Spotify Integration** | N/A | ❌ None | ✅ **Two-Way Smart Playback Handoff** |

---

## 🚀 Key Features

### 1. 🎵 100% Ad-Free YouTube Audio Engine
- Stream **any song, remix, live concert, unreleased leak, or lo-fi mix** from YouTube on-demand with zero video clutter and zero ads.
- Lightweight audio extraction that saves massive bandwidth, RAM, and battery compared to running YouTube in a browser tab.

### 2. 🔀 Two-Way Spotify Smart Handoff (`⚪ Sync`)
- **OffTrack ➔ Spotify**: Listening to a track on OffTrack and want to switch to your phone or official desktop Spotify app? One click on **`⚪ Sync`** casts that exact song and seek timestamp directly into your active Spotify app!
- **Spotify ➔ OffTrack**: Or use OffTrack as an interactive floating glass controller for whatever Spotify is playing.

### 3. 🪟 Floating Frosted-Glass HUD (Always-On-Top)
- Built for multitasking while coding, designing, or gaming — sits comfortably in the corner of your screen without window clutter.
- Cycle through 5 transparency presets with one click (or right-click to reset):
  - **`🖼️ Original`**: 100% crisp wallpaper brightness and full image opacity.
  - **`💎 Glass`**: 65% frosted glass with backdrop blur.
  - **`💧 Clear`**: 30% see-through glass.
  - **`👻 Ghost`**: 5% ultra-subtle HUD for deep work.
  - **`⬛ Solid`**: Dark minimal player.

### 4. ⌨️ Global Keyboard Shortcuts & System Tray
- Full background control with global hotkeys and built-in OS media keys (`Play/Pause`, `Next`, `Prev`).
- Customize hotkeys in Settings or minimize cleanly to the Windows System Tray.

### 5. 🎨 41 Preloaded Aesthetic Album Covers & Custom Upload
- Right-click the album cover to open the **Covers Modal**:
  - **`🎵 Auto (Song Art)`**: Dynamically pulls the official high-res artwork for the song playing.
  - **`📁 Upload Your Own`**: Set any image or wallpaper from your PC.
  - **41 Preloaded Aesthetic Covers**: Instant one-click visual presets.

### 6. 🌊 Animated Audio Sound Wave & Live Search Timer
- The progress bar isn't just a flat line — an undulating **dual-frequency sound wave** flows across the line while music is active, paired with a pulsing glowing playhead dot.
- Searching for a track triggers a live latency ticker (`⏳ Searching... 1.2s`) and a radar sweep scanner so you always know what's happening.

---

## 🛠️ Tech Stack

- **Framework**: [Electron](https://www.electronjs.org/)
- **Runtime**: [Node.js](https://nodejs.org/) (ES Modules)
- **Audio Extraction**: [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) native stream extractor
- **APIs**: Spotify Web API (`spotify-web-api-node`)
- **Styling**: Pure Modern CSS with Glassmorphism, CSS Variables, and SVG Animations

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

## 🔑 (Optional) Spotify Developer Credentials

To sync your private Spotify playlists and enable two-way casting:
1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Create an application and add `http://127.0.0.1:8888/callback` as a Redirect URI.
3. In OffTrack, open **Settings** (`Ctrl+Shift+S`) ➔ **Account** ➔ enter your `Client ID` and `Client Secret` ➔ click **Login**.

---

## 💡 Shoutout & Inspiration

Big shoutout to **[Saarthak Agarwal](https://www.linkedin.com/in/saarthak-agarwal-sa)** and his project **[Trak](https://github.com/Saarthak1234/trak.git)**! 

The idea for OffTrack came directly from seeing what he built with Trak. I loved the concept and wanted to build my own take on a floating desktop companion — adding frosted glass transparency, two-way Spotify casting, and live soundwaves. Definitely go check out his work! 🚀

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## 👤 Author

- **Mahi** - [GitHub](https://github.com/Maaahive) 

*Inspired by [Trak](https://github.com/Saarthak1234/trak.git) by [Saarthak Agarwal](https://www.linkedin.com/in/saarthak-agarwal-sa).*