const defaultCuratedGifs = [
  { name: 'Evolving Universe', url: 'backgrounds/Evolving Universe.jpg' },
  { name: 'Fall Vibe', url: 'backgrounds/Fall.jpg' },
  { name: 'Discovery World', url: 'backgrounds/Discovery World.jpg' },
  { name: 'L Minimalist', url: 'backgrounds/L.jpg' },
  { name: 'Aesthetic Chill', url: 'backgrounds/wallpaper.jpg' },
  { name: 'Anime Scenery', url: 'backgrounds/Anime Scenery.jpg' },
  { name: 'Lo-Fi Study Girl', url: 'https://media.giphy.com/media/13HgwGsXF0aiGY/giphy.gif' },
  { name: 'Rainy Tokyo Alley', url: 'https://media.giphy.com/media/26FPLMDDN5fJCir0A/giphy.gif' },
  { name: 'Cyberpunk Skyline', url: 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif' },
  { name: 'Pixel Starry Night', url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif' },
  { name: 'Retro Sunset Drive', url: 'https://media.giphy.com/media/3o7TKtnuHOHHUjR38Y/giphy.gif' },
  { name: 'Anime Train Journey', url: 'https://media.giphy.com/media/xT9IgzoKnwFNmISR8I/giphy.gif' },
  { name: 'Cozy Coffee House', url: 'https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/giphy.gif' },
  { name: 'Synthwave Neon Grid', url: 'https://media.giphy.com/media/d2Z9QYzA2aidiWn6/giphy.gif' },
  { name: 'Rain on Window Glass', url: 'https://media.giphy.com/media/xUPGcxpCV81ebKh7Vu/giphy.gif' },
  { name: 'Pixel Waterfall', url: 'https://media.giphy.com/media/3o7TKMt1VVNkHV2PaE/giphy.gif' }
];

let savedGifs = JSON.parse(localStorage.getItem('savedCustomGifs')) || [];
// Merge newly added defaults
defaultCuratedGifs.forEach(def => {
  if (!savedGifs.find(g => g.url === def.url)) {
    savedGifs.push(def);
  }
});
localStorage.setItem('savedCustomGifs', JSON.stringify(savedGifs));

function renderGrid() {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';

  let activeUrl = '';
  try {
    const settings = JSON.parse(localStorage.getItem('customGifSettings'));
    if (settings && settings.url) activeUrl = settings.url;
  } catch(e) {}

  // Option 0: Pure Glass (Transparent)
  const isGlassActive = !activeUrl;
  const glassCard = document.createElement('div');
  glassCard.className = `gif-card ${isGlassActive ? 'active' : ''}`;
  glassCard.innerHTML = `
    <div class="gif-preview" style="position: relative; height: 95px; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; border-bottom: 1px solid rgba(255,255,255,0.08);">
      <div style="font-size: 30px;">🪟</div>
      <div class="gif-select-box" style="position: absolute; top: 6px; left: 6px; width: 16px; height: 16px; border-radius: 4px; border: 2px solid ${isGlassActive ? 'var(--accent)' : 'rgba(255,255,255,0.4)'}; background: ${isGlassActive ? 'var(--accent)' : 'rgba(0,0,0,0.5)'}; display: flex; align-items: center; justify-content: center; z-index: 2;">
        ${isGlassActive ? '<svg viewBox="0 0 24 24" width="12" height="12" fill="#000"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' : ''}
      </div>
    </div>
    <div class="gif-info" style="padding: 6px 8px; display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
      <span style="font-weight: 600; color: var(--text-main);">Pure Glass</span>
      <span style="font-size: 9px; color: var(--accent); font-weight: bold;">TRANSPARENT</span>
    </div>
  `;
  glassCard.onclick = () => {
    const currentSettings = JSON.parse(localStorage.getItem('customGifSettings')) || {};
    currentSettings.enabled = false;
    currentSettings.showBackground = false;
    currentSettings.url = '';
    localStorage.setItem('customGifSettings', JSON.stringify(currentSettings));
    window.api.selectGif('', 'Pure Glass');
    document.body.classList.add('closing');
    setTimeout(() => window.close(), 140);
  };
  grid.appendChild(glassCard);

  savedGifs.forEach((gif, index) => {
    const isActive = activeUrl === gif.url;
    const card = document.createElement('div');
    card.className = `gif-card ${isActive ? 'active' : ''}`;
    card.innerHTML = `
      <div class="gif-preview" style="position: relative; line-height: 0; background-color: #111;">
        <img src="${gif.url}" loading="lazy" style="width: 100%; height: 95px; object-fit: cover; display: block;" />
        <div class="gif-select-box" style="position: absolute; top: 6px; left: 6px; width: 16px; height: 16px; border-radius: 4px; border: 2px solid ${isActive ? 'var(--accent)' : 'rgba(255,255,255,0.4)'}; background: ${isActive ? 'var(--accent)' : 'rgba(0,0,0,0.5)'}; display: flex; align-items: center; justify-content: center; transition: all 0.2s; z-index: 2;">
          ${isActive ? '<svg viewBox="0 0 24 24" width="12" height="12" fill="#000"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' : ''}
        </div>
      </div>
      <div class="gif-info" style="padding: 6px 8px; display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
        <span style="font-weight: 500; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 90px;">${gif.name}</span>
        <button class="delete-btn" style="color: rgba(255,100,100,0.7); font-size: 11px; padding: 2px 4px; border: none; background: transparent; cursor: pointer;" title="Delete">✕</button>
      </div>
    `;

    card.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      savedGifs.splice(index, 1);
      localStorage.setItem('savedCustomGifs', JSON.stringify(savedGifs));
      renderGrid();
    });

    card.onclick = () => {
      // Save setting & apply
      const currentSettings = JSON.parse(localStorage.getItem('customGifSettings')) || {};
      currentSettings.enabled = true;
      currentSettings.showBackground = true;
      currentSettings.url = gif.url;
      localStorage.setItem('customGifSettings', JSON.stringify(currentSettings));

      window.api.selectGif(gif.url, gif.name);
      document.body.classList.add('closing');
      setTimeout(() => window.close(), 140);
    };

    grid.appendChild(card);
  });
}

// Local File Upload
const uploadBtn = document.getElementById('uploadBtn');
const filePicker = document.getElementById('filePicker');

if (uploadBtn && filePicker) {
  uploadBtn.addEventListener('click', () => {
    filePicker.click();
  });

  filePicker.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      const cleanName = file.name.replace(/\.[^/.]+$/, "");
      savedGifs.unshift({ name: cleanName, url: dataUrl });
      localStorage.setItem('savedCustomGifs', JSON.stringify(savedGifs));
      renderGrid();

      // Auto-select the newly uploaded wallpaper
      const currentSettings = JSON.parse(localStorage.getItem('customGifSettings')) || {};
      currentSettings.enabled = true;
      currentSettings.showBackground = true;
      currentSettings.url = dataUrl;
      localStorage.setItem('customGifSettings', JSON.stringify(currentSettings));
      window.api.selectGif(dataUrl, cleanName);
    };
    reader.readAsDataURL(file);
  });
}

// Add URL button
const addUrlBtn = document.getElementById('addUrlBtn');
const urlInput = document.getElementById('urlInput');

if (addUrlBtn && urlInput) {
  addUrlBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (!url) return;
    const name = 'Custom ' + (savedGifs.length + 1);
    savedGifs.unshift({ name, url });
    localStorage.setItem('savedCustomGifs', JSON.stringify(savedGifs));
    urlInput.value = '';
    renderGrid();
  });

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addUrlBtn.click();
  });
}

document.getElementById('closeBtn').addEventListener('click', () => {
  document.body.classList.add('closing');
  setTimeout(() => window.close(), 140);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.body.classList.add('closing');
    setTimeout(() => window.close(), 140);
  }
});

renderGrid();