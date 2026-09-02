# ⚡ OffTrack

> **All of YouTube's music catalog + your Spotify library, wrapped in a lightweight floating frosted-glass desktop HUD.**  
> *Zero audio ads. Zero video clutter. Pure audio flow.*

---

[![Electron](https://img.shields.io/badge/Electron-33.x-47848F?logo=electron&logoColor=white)](https://electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Spotify API](https://img.shields.io/badge/Spotify-Web%20API-1DB954?logo=spotify&logoColor=white)](https://developer.spotify.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 💡 Acknowledgments & Inspiration

**OffTrack** was born from a desire to make desktop listening frictionless, lightweight, and visual. 

A massive and heartfelt shoutout to **[Saarthak Agarwal](https://www.linkedin.com/in/saarthak-agarwal-sa)**, creator of **[Trak](https://github.com/Saarthak1234/trak.git)**. His initial project and open-source concept served as the key inspiration for this journey. OffTrack builds upon that spark with a frosted-glass HUD interface, two-way Spotify playback casting, live soundwave visualizers, and deep customization. Thank you, Saarthak! 🚀

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

### 1. 🌊 Animated Audio Sound Wave Playing Line
- The progress bar isn't just a flat line — when music is active, an undulating **dual-frequency sound wave** flows smoothly across the played track.
- A pulsing glowing playhead dot pulses with the beat.

### 2. 🔀 Two-Way Spotify Smart Handoff (`⚪ Sync`)
- **OffTrack ➔ Spotify**: Listening to a song in OffTrack and want to continue on your phone or official Spotify app? Click **`⚪ Sync`** — OffTrack searches for the track on Spotify and casts playback directly to your active Spotify app **at the exact same second**!
- **Spotify ➔ OffTrack**: Or use OffTrack as a sleek floating glass controller HUD for whatever Spotify is playing.

### 3. ⏳ Live Searching Timer & Scanner
- Searching for a track triggers a live timer (`⏳ Searching... 1.2s`) and a pulsating radar scan beam across the player so you always know what's happening.

### 4. 🪟 Frosted Glass Transparency Presets
- Cycle through transparency modes or right-click to reset anytime:
  - **`🖼️ Original`**: 100% crisp wallpaper brightness and full image opacity.
  - **`💎 Glass`**: 65% frosted glass with backdrop blur.
  - **`💧 Clear`**: 30% see-through glass.
  - **`👻 Ghost`**: 5% ultra-subtle HUD for coding and gaming.
  - **`⬛ Solid`**: Dark minimal player.

### 5. 🎨 41 Preloaded Aesthetic Album Covers & Custom Upload
- Right-click the album cover to open the **Covers Modal**:
  - **`🎵 Auto (Song Art)`**: Dynamically loads the official artwork for the song playing.
  - **`📁 Upload Your Own`**: Pick any image from your PC.
  - **41 Curated Preloaded Covers**: Instant one-click presets.

### 6. ⌨️ Global Keyboard Shortcuts & System Tray
- Control music from anywhere across Windows with global shortcuts even while full-screen in games or code editors.
- Minimizes cleanly to the Windows System Tray.

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
```bash
npm start
```

> **Tip for Windows Users**: You can also double-click `Launch OffTrack.vbs` to run the app silently without keeping a command prompt open!

---

## 🔑 (Optional) Spotify Developer Credentials

To sync your private Spotify playlists and enable two-way casting:
1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Create an application and add `http://127.0.0.1:8888/callback` as a Redirect URI.
3. In OffTrack, open **Settings** (`Ctrl+Shift+S`) ➔ **Account** ➔ enter your `Client ID` and `Client Secret` ➔ click **Login**.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## 👤 Author

- **Mahi** - [GitHub](https://github.com/Maaahive) 

*Inspired by [Trak](https://github.com/Saarthak1234/trak.git) by [Saarthak Agarwal](https://www.linkedin.com/in/saarthak-agarwal-sa).*