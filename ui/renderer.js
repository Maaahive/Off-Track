// Helper to safely add event listeners
function safeOn(id, event, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
}

// Window Controls
safeOn('btn-close', 'click', () => {
  window.api.close();
});
safeOn('btn-minimize', 'click', () => {
  window.api.minimize();
});

// Controls
let isQueueMode = false;
let isSpotifySyncing = false;

let toastTimeout = null;
function showToast(msg, duration = 3000) {
  const toast = document.getElementById('player-toast');
  if (!toast) return;
  toast.innerHTML = msg;
  toast.classList.add('show');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

safeOn('btn-prev', 'click', () => {
  if (isSpotifySyncing) {
    window.api.spotifyRemotePrev();
  } else if (typeof currentPlaybackTime === 'number' && currentPlaybackTime > 4) {
    seekRelative(-currentPlaybackTime);
  } else {
    window.api.prevSong();
  }
});
safeOn('btn-next', 'click', async () => {
  if (isSpotifySyncing) {
    window.api.spotifyRemoteNext();
  } else {
    const queue = await window.api.getQueue();
    if (queue && queue.length > 0) {
      window.api.nextSong();
    } else {
      seekRelative(15);
    }
  }
});

safeOn('btn-queue', 'click', () => {
  isQueueMode = !isQueueMode;
  const btn = document.getElementById('btn-queue');
  if (btn) {
    if (isQueueMode) {
      btn.style.color = 'var(--accent)';
      btn.title = 'Queue Mode: ON';
      showToast('🔀 Queue Mode: ON (searches add to queue)');
    } else {
      btn.style.color = 'var(--text-muted)';
      btn.title = 'Queue Mode: OFF';
      showToast('▶️ Play Mode: ON (searches play immediately)');
    }
  }
});

safeOn('btn-queue-sidebar', 'click', (e) => {
  e.stopPropagation();
  const sidebar = document.getElementById('queue-sidebar');
  const tracksSidebar = document.getElementById('tracks-sidebar');
  if (sidebar) {
    if (sidebar.style.left === '0px') {
      sidebar.style.left = '-280px';
    } else {
      sidebar.style.left = '0px';
      if (tracksSidebar) tracksSidebar.style.right = '-280px'; // close songs
      renderQueue();
    }
  }
});

safeOn('btn-close-queue', 'click', (e) => {
  e.stopPropagation();
  const sidebar = document.getElementById('queue-sidebar');
  if (sidebar) sidebar.style.left = '-280px';
});

safeOn('btn-clear-queue', 'click', async () => {
  if (window.api && window.api.clearQueue) {
    await window.api.clearQueue();
    renderQueue();
  }
});



// Drag and drop logic for Queue
let dragSrcEl = null

async function renderQueue() {
  const queue = await window.api.getQueue()
  const container = document.getElementById('queue-tracks')
  container.innerHTML = ''
  
  if (queue.length === 0) {
    container.innerHTML = '<div style="padding: 12px; color: var(--text-muted); font-size: 12px; text-align: center;">Queue is empty</div>'
    return
  }
  
  queue.forEach((q, i) => {
    const d = document.createElement('div')
    d.className = 'track-item'
    d.style.display = 'flex'
    d.style.alignItems = 'center'
    d.draggable = true
    
    const handle = document.createElement('span')
    handle.className = 'drag-handle'
    handle.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 15h18v-2H3v2zm0 4h18v-2H3v2zm0-8h18V9H3v2zm0-6v2h18V5H3z"/></svg>'
    
    const textContainer = document.createElement('div')
    textContainer.style.flex = '1'
    textContainer.style.whiteSpace = 'nowrap'
    textContainer.style.overflow = 'hidden'
    textContainer.style.textOverflow = 'ellipsis'
    
    let displayName = q;
    if (displayName.includes('|DURATION:')) {
      displayName = displayName.split('|DURATION:')[0].trim();
    }
    textContainer.innerText = `${i+1}. ${displayName}`
    
    const removeIconBtn = document.createElement('button')
    removeIconBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>'
    removeIconBtn.className = 'queue-remove-btn'
    removeIconBtn.style.background = 'transparent'
    removeIconBtn.style.border = 'none'
    removeIconBtn.style.color = 'var(--text-muted)'
    removeIconBtn.style.cursor = 'pointer'
    removeIconBtn.style.marginLeft = '8px'
    removeIconBtn.style.padding = '4px'
    removeIconBtn.style.display = 'none'
    removeIconBtn.onmouseover = () => removeIconBtn.style.color = '#ff5f56'
    removeIconBtn.onmouseout = () => removeIconBtn.style.color = 'var(--text-muted)'
    
    removeIconBtn.onclick = (e) => {
      e.stopPropagation()
      window.api.spliceQueue(i, 1).then(renderQueue)
    }
    
    d.appendChild(handle)
    d.appendChild(textContainer)
    d.appendChild(removeIconBtn)
    
    d.ondblclick = async (ev) => {
      ev.preventDefault()
    }
    d.onclick = async () => {
      window.api.searchSong(q)
      await window.api.spliceQueue(0, i + 1)
      renderQueue()
    }
    
    d.addEventListener('dragstart', function(e) {
      dragSrcEl = this;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/html', this.innerHTML);
      this.style.opacity = '0.4';
    })
    
    d.addEventListener('dragover', function(e) {
      if (e.preventDefault) { e.preventDefault() }
      e.dataTransfer.dropEffect = 'move'
      return false;
    })
    
    d.addEventListener('dragenter', function(e) {
      this.style.background = 'rgba(255,255,255,0.1)'
    })
    
    d.addEventListener('dragleave', function(e) {
      this.style.background = ''
    })
    
    d.addEventListener('drop', async function(e) {
      if (e.stopPropagation) { e.stopPropagation() }
      this.style.background = ''
      if (dragSrcEl !== this) {
        const children = Array.from(container.children)
        const oldIndex = children.indexOf(dragSrcEl)
        const newIndex = children.indexOf(this)
        await window.api.reorderQueue(oldIndex, newIndex)
        renderQueue()
      }
      return false
    })
    
    d.addEventListener('dragend', function(e) {
      this.style.opacity = '1'
    })
    
    container.appendChild(d)
  })
}

safeOn('btn-loop', 'click', async () => {
  if (!window.api || !window.api.toggleLoop) return;
  const looping = await window.api.toggleLoop();
  const btn = document.getElementById('btn-loop');
  if (btn) btn.style.color = looping ? 'var(--accent)' : 'var(--text-muted)';
});

safeOn('btn-shuffle', 'click', async () => {
  if (!window.api || !window.api.toggleShuffle) return;
  const shuffling = await window.api.toggleShuffle();
  const btn = document.getElementById('btn-shuffle');
  if (btn) btn.style.color = shuffling ? 'var(--accent)' : 'var(--text-muted)';
  renderQueue();
});

// Open Settings - separate window
safeOn('btn-settings', 'click', () => {
  if (window.api && window.api.openSettings) window.api.openSettings();
});
safeOn('btn-settings-top', 'click', () => {
  if (window.api && window.api.openSettings) window.api.openSettings();
});

// Close Settings (legacy panel, keep for safety)
safeOn('btn-close-settings', 'click', () => {
  const panel = document.getElementById('settings-panel');
  if (panel) panel.classList.remove('open');
});

// Playlist Dropdown
safeOn('btn-playlist', 'click', async (e) => {
  const menu = document.getElementById('playlist-menu');
  if (!menu) return;
  
  if (menu.style.display === 'block') {
    menu.style.display = 'none';
    return;
  }
  
  menu.innerHTML = '<div style="padding: 8px; color: var(--text-muted); font-size: 12px;">Loading...</div>'
  menu.style.display = 'block'
  
  const res = await window.api.getPlaylists()
  menu.innerHTML = ''
  
  const saved = JSON.parse(localStorage.getItem('savedPlaylists') || '[]');
  
  if (res.status === 'not_connected') {
    const msg = document.createElement('div')
    msg.style = 'padding: 8px; color: var(--text-muted); font-size: 12px; margin-bottom: 8px;'
    msg.innerText = 'Not connected to Spotify'
    menu.appendChild(msg)
  } else if (res.status === 'no_playlists') {
    const msg = document.createElement('div')
    msg.style = 'padding: 8px; color: var(--text-muted); font-size: 12px; margin-bottom: 8px;'
    msg.innerText = 'No Spotify playlists found'
    menu.appendChild(msg)
  } else if (res.status === 'error') {
    const msg = document.createElement('div')
    msg.style = 'padding: 8px; color: #ff5f56; font-size: 12px; margin-bottom: 8px;'
    msg.innerText = `Error: ${res.message}`
    menu.appendChild(msg)
  }

  const hasSpotify = res.status === 'success' && res.playlists && res.playlists.length > 0;
  
  if (hasSpotify || saved.length > 0) {
    const searchInput = document.createElement('input')
    searchInput.type = 'text'
    searchInput.placeholder = 'Search playlists...'
    searchInput.style.width = '100%'
    searchInput.style.background = 'transparent'
    searchInput.style.border = '1px solid var(--border-color)'
    searchInput.style.color = 'var(--text-main)'
    searchInput.style.padding = '4px'
    searchInput.style.fontSize = '11px'
    searchInput.style.borderRadius = '4px'
    searchInput.style.marginBottom = '8px'
    searchInput.style.outline = 'none'
    
    searchInput.addEventListener('input', (ev) => {
      const query = ev.target.value.toLowerCase()
      const items = menu.querySelectorAll('.playlist-item-container')
      items.forEach(item => {
        const text = item.querySelector('.playlist-item').innerText.toLowerCase()
        item.style.display = text.includes(query) ? 'flex' : 'none'
      })
    })
    menu.appendChild(searchInput)
  }

  if (hasSpotify) {
    res.playlists.forEach(pl => {
      const itemContainer = document.createElement('div')
      itemContainer.className = 'playlist-item-container'
      itemContainer.style.display = 'flex'
      itemContainer.style.alignItems = 'center'
      
      const a = document.createElement('a')
      a.href = '#'
      a.className = 'track-item playlist-item'
      a.style.display = 'block'
      a.style.textDecoration = 'none'
      a.style.borderRadius = '4px'
      a.style.flex = '1'
      a.innerText = pl.name
      a.dataset.name = pl.name
      
      a.onclick = (ev) => {
        ev.preventDefault()
        menu.style.display = 'none'
        const apn = document.getElementById('active-playlist-name')
        apn.innerText = a.dataset.name
        apn.title = a.dataset.name
        apn.style.display = 'inline-block'
        openPlaylistSidebar(pl.id, pl.name)
      }
      itemContainer.appendChild(a)
      menu.appendChild(itemContainer)
    })
  }

  if (saved.length > 0) {
    const header = document.createElement('div');
    header.style.padding = '12px 4px 4px 4px';
    header.style.color = 'var(--text-muted)';
    header.style.fontSize = '10px';
    header.style.fontWeight = 'bold';
    header.style.textTransform = 'uppercase';
    header.style.letterSpacing = '1px';
    header.innerText = 'Saved Playlists';
    menu.appendChild(header);

    saved.forEach((pl, index) => {
      const itemContainer = document.createElement('div')
      itemContainer.className = 'playlist-item-container track-item'
      itemContainer.style.display = 'flex'
      itemContainer.style.alignItems = 'center'
      itemContainer.style.justifyContent = 'space-between'
      itemContainer.style.borderRadius = '4px'
      itemContainer.style.paddingRight = '8px'
      
      const a = document.createElement('a')
      a.href = '#'
      a.className = 'playlist-item'
      a.style.display = 'block'
      a.style.textDecoration = 'none'
      a.style.color = 'inherit'
      a.style.flex = '1'
      a.innerText = pl.name
      a.dataset.name = pl.name
      
      a.onclick = (ev) => {
        ev.preventDefault()
        menu.style.display = 'none'
        const apn = document.getElementById('active-playlist-name')
        apn.innerText = a.dataset.name
        apn.title = a.dataset.name
        apn.style.display = 'inline-block'
        openPlaylistSidebar(pl.id, pl.name, pl.tracks)
      }
      
      const delBtn = document.createElement('button')
      delBtn.innerHTML = '✕'
      delBtn.style.background = 'transparent'
      delBtn.style.border = 'none'
      delBtn.style.color = 'rgba(255,95,86,0.6)'
      delBtn.style.cursor = 'pointer'
      delBtn.style.fontSize = '12px'
      delBtn.style.padding = '4px'
      delBtn.style.lineHeight = '1'
      delBtn.title = 'Delete saved playlist'
      
      delBtn.onmouseover = () => delBtn.style.color = 'rgba(255,95,86,1)'
      delBtn.onmouseout = () => delBtn.style.color = 'rgba(255,95,86,0.6)'
      
      delBtn.onclick = (ev) => {
        ev.stopPropagation()
        saved.splice(index, 1)
        localStorage.setItem('savedPlaylists', JSON.stringify(saved))
        menu.style.display = 'none'
        document.getElementById('btn-playlist').click()
      }
      
      itemContainer.appendChild(a)
      itemContainer.appendChild(delBtn)
      menu.appendChild(itemContainer)
    })
  }

  // Always append the Add Playlist URL button at the bottom of the menu
  const urlBtn = document.createElement('a')
  urlBtn.href = '#'
  urlBtn.className = 'track-item'
  urlBtn.style.display = 'block'
  urlBtn.style.color = 'var(--accent)'
  urlBtn.style.textDecoration = 'none'
  urlBtn.style.borderRadius = '4px'
  urlBtn.style.marginBottom = '4px'
  urlBtn.innerText = '+ Add Playlist URL'
  
  urlBtn.onclick = async (ev) => {
    ev.preventDefault()
    const existingInput = document.getElementById('playlist-url-input')
    if (existingInput) return
    
    const inputDiv = document.createElement('div')
    inputDiv.id = 'playlist-url-input'
    inputDiv.style.display = 'flex'
    inputDiv.style.gap = '4px'
    inputDiv.style.marginBottom = '8px'
    
    const input = document.createElement('input')
    input.type = 'text'
    input.placeholder = 'https://open.spotify.com/playlist/...'
    input.style.flex = '1'
    input.style.background = 'transparent'
    input.style.border = '1px solid var(--border-color)'
    input.style.color = 'var(--text-main)'
    input.style.padding = '4px'
    input.style.fontSize = '11px'
    input.style.borderRadius = '4px'
    
    const btn = document.createElement('button')
    btn.innerText = 'Go'
    btn.style.background = 'var(--accent)'
    btn.style.color = 'black'
    btn.style.border = 'none'
    btn.style.borderRadius = '4px'
    btn.style.cursor = 'pointer'
    btn.style.padding = '0 8px'
    
    btn.onclick = async () => {
      if (!input.value) return
      btn.innerText = '...'
      const data = await window.api.fetchPlaylistUrl(input.value)
      if (data.status === 'success') {
        const plName = data.playlistName || 'Saved Playlist';
        let saved = JSON.parse(localStorage.getItem('savedPlaylists') || '[]');
        if (!saved.find(s => s.id === input.value)) {
          saved.push({ id: input.value, name: plName, tracks: data.tracks });
          localStorage.setItem('savedPlaylists', JSON.stringify(saved));
        }
        openPlaylistSidebar('custom-url', plName, data.tracks)
        inputDiv.remove()
        menu.style.display = 'none'
      } else {
        btn.innerText = 'Err'
        alert('Failed to fetch playlist: ' + data.message)
      }
    }
    
    inputDiv.appendChild(input)
    inputDiv.appendChild(btn)
    menu.insertBefore(inputDiv, urlBtn.nextSibling)
  }
  menu.appendChild(urlBtn)
})

// Sidebar Logic
let currentPlaylistTracks = []

async function openPlaylistSidebar(id, name, preloadedTracks = null) {
  const sidebar = document.getElementById('tracks-sidebar')
  const tracksContainer = document.getElementById('sidebar-tracks')
  
  const titleEl = document.getElementById('sidebar-title')
  if (titleEl) titleEl.innerText = name || 'Songs'
  
  if (sidebar) sidebar.style.right = '0px'
  const queueSidebar = document.getElementById('queue-sidebar')
  if (queueSidebar) queueSidebar.style.left = '-280px' // close queue
  
  if (!isQueueMode) {
    isQueueMode = true
    const btn = document.getElementById('btn-queue')
    if (btn) {
      btn.style.color = 'var(--accent)'
      btn.title = 'Queue Mode: ON'
    }
  }
  
  if (preloadedTracks) {
    renderSidebarTracks(preloadedTracks)
    return
  }
  
  tracksContainer.innerHTML = '<div style="padding: 12px; color: var(--text-muted); font-size: 12px; text-align: center;">Loading tracks...</div>'
  
  const res = await window.api.getPlaylistTracks(id)
  
  if (res.status === 'success') {
    renderSidebarTracks(res.tracks)
  } else {
    tracksContainer.innerHTML = `<div style="padding: 12px; color: #ff5f56; font-size: 12px;">Error: ${res.message}</div>`
  }
}

function renderSidebarTracks(tracks) {
  const tracksContainer = document.getElementById('sidebar-tracks')
  tracksContainer.innerHTML = ''
  currentPlaylistTracks = tracks
  
  if (tracks.length === 0) {
    tracksContainer.innerHTML = '<div style="padding: 12px; color: var(--text-muted); font-size: 12px; text-align: center;">Playlist is empty</div>'
    return
  }
  
  tracks.forEach((t, i) => {
    const d = document.createElement('div')
    d.className = 'track-item'
    d.style.display = 'flex'
    d.style.alignItems = 'center'
    d.style.justifyContent = 'space-between'
    
    const infoContainer = document.createElement('div')
    infoContainer.style.flex = '1'
    infoContainer.style.overflow = 'hidden'
    
    const title = document.createElement('div')
    title.innerText = `${i+1}. ${t.name}`
    title.style.color = 'var(--text-main)'
    title.style.marginBottom = '4px'
    title.style.whiteSpace = 'nowrap'
    title.style.overflow = 'hidden'
    title.style.textOverflow = 'ellipsis'
    
    const artist = document.createElement('div')
    artist.innerText = t.artist
    artist.style.color = 'var(--text-muted)'
    artist.style.fontSize = '10px'
    artist.style.whiteSpace = 'nowrap'
    artist.style.overflow = 'hidden'
    artist.style.textOverflow = 'ellipsis'
    
    infoContainer.appendChild(title)
    infoContainer.appendChild(artist)
    
    const addBtn = document.createElement('button')
    addBtn.innerText = '+'
    addBtn.style.padding = '4px 8px'
    addBtn.style.marginLeft = '8px'
    addBtn.style.background = 'transparent'
    addBtn.style.color = 'var(--text-muted)'
    addBtn.style.border = '1px solid rgba(255,255,255,0.2)'
    addBtn.style.borderRadius = '4px'
    addBtn.style.cursor = 'pointer'
    addBtn.style.fontSize = '14px'
    addBtn.style.transition = 'all 0.2s'
    
    addBtn.onmouseover = () => {
      addBtn.style.background = 'rgba(255,255,255,0.1)'
      addBtn.style.color = 'var(--text-main)'
    }
    addBtn.onmouseout = () => {
      addBtn.style.background = 'transparent'
      addBtn.style.color = 'var(--text-muted)'
    }
    
    addBtn.onclick = (ev) => {
      ev.stopPropagation()
      const query = `${t.name} by ${t.artist}`
      window.api.addQueue(query)
      showToast(`✅ Added to Queue: "${t.name}"`)
      renderQueue()
    }
    
    d.appendChild(infoContainer)
    d.appendChild(addBtn)
    
    d.onclick = () => {
      const allTracks = document.querySelectorAll('#sidebar-tracks .track-item');
      allTracks.forEach(el => {
        el.style.background = 'transparent';
      });
      d.style.background = 'rgba(255,255,255,0.15)';

      let query = `${t.name} by ${t.artist}`;
      if (t.duration_ms) query += `|DURATION:${t.duration_ms}`;
      startSearchTimer(t.name);
      showToast(`🔍 Searching: "${t.name}"...`);
      window.api.searchSong(query);
      
      if (!isQueueMode) {
        window.api.clearQueue().then(renderQueue);
      } else {
        const newQueueItems = [];
        for (let j = i + 1; j < tracks.length; j++) {
          const nextTrack = tracks[j];
          let nq = `${nextTrack.name} by ${nextTrack.artist}`;
          if (nextTrack.duration_ms) nq += `|DURATION:${nextTrack.duration_ms}`;
          newQueueItems.push(nq);
        }
        window.api.setQueue(newQueueItems).then(renderQueue);
      }
    }
      
    tracksContainer.appendChild(d)
  })
}

safeOn('btn-toggle-sidebar', 'click', () => {
  const sidebar = document.getElementById('tracks-sidebar')
  if (sidebar.style.right === '0px') {
    sidebar.style.right = '-280px'
  } else {
    sidebar.style.right = '0px'
    document.getElementById('queue-sidebar').style.left = '-280px' // close queue
  }
})

safeOn('btn-close-sidebar', 'click', (e) => {
  e.stopPropagation()
  document.getElementById('tracks-sidebar').style.right = '-280px'
})

safeOn('search-queue', 'input', (ev) => {
  const query = ev.target.value.toLowerCase()
  const items = document.getElementById('queue-tracks').children
  for (let i = 0; i < items.length; i++) {
    const text = items[i].innerText.toLowerCase()
    items[i].style.display = text.includes(query) ? 'flex' : 'none'
  }
})

safeOn('search-tracks', 'input', (ev) => {
  const query = ev.target.value.toLowerCase()
  const items = document.getElementById('sidebar-tracks').children
  for (let i = 0; i < items.length; i++) {
    const text = items[i].innerText.toLowerCase()
    items[i].style.display = text.includes(query) ? 'flex' : 'none'
  }
})

if (document) document.addEventListener('click', (ev) => {
  const playlistMenu = document.getElementById('playlist-menu')
  const btnPlaylist = document.getElementById('btn-playlist')
  if (playlistMenu && playlistMenu.style.display === 'block') {
    if (!playlistMenu.contains(ev.target) && !btnPlaylist.contains(ev.target)) {
      playlistMenu.style.display = 'none'
    }
  }
  
  const queueSidebar = document.getElementById('queue-sidebar')
  const btnQueue = document.getElementById('btn-queue')
  const btnQueueSidebar = document.getElementById('btn-queue-sidebar')
  if (queueSidebar && queueSidebar.style.left === '0px') {
    if (!queueSidebar.contains(ev.target) && !btnQueue.contains(ev.target) && (!btnQueueSidebar || !btnQueueSidebar.contains(ev.target))) {
      queueSidebar.style.left = '-280px'
    }
  }
  
  const tracksSidebar = document.getElementById('tracks-sidebar')
  if (tracksSidebar && tracksSidebar.style.right === '0px') {
    if (!tracksSidebar.contains(ev.target) && !btnPlaylist.contains(ev.target) && (!playlistMenu || !playlistMenu.contains(ev.target))) {
      tracksSidebar.style.right = '-280px'
    }
  }
})

safeOn('btn-queue-all', 'click', async () => {
  if (currentPlaylistTracks.length > 0) {
    if (!isQueueMode) {
      isQueueMode = true
      document.getElementById('btn-queue').style.color = 'var(--accent)'
      document.getElementById('btn-queue').title = 'Queue Mode: ON'
    }
    
    // Auto-play first track if we are adding many
    const firstTrack = currentPlaylistTracks[0]
    let firstQuery = `${firstTrack.name} by ${firstTrack.artist}`
    if (firstTrack.duration_ms) firstQuery += `|DURATION:${firstTrack.duration_ms}`
    window.api.searchSong(firstQuery)
    
    // Queue the rest atomically by prepending to current queue
    const currentQueue = await window.api.getQueue()
    const newQueueItems = []
    for (let i = 1; i < currentPlaylistTracks.length; i++) {
      const t = currentPlaylistTracks[i]
      let nq = `${t.name} by ${t.artist}`
      if (t.duration_ms) nq += `|DURATION:${t.duration_ms}`
      newQueueItems.push(nq)
    }
    await window.api.setQueue([...newQueueItems, ...currentQueue])
    
    document.getElementById('track-artist').innerText = `Queued ${currentPlaylistTracks.length - 1} tracks!`
    renderQueue()
  }
})

// Close menu when clicking outside
if (document) document.addEventListener('click', (e) => {
  const menu = document.getElementById('playlist-menu')
  const btn = document.getElementById('btn-playlist')
  if (menu && menu.style.display === 'block' && !menu.contains(e.target) && !btn.contains(e.target)) {
    menu.style.display = 'none'
  }
})

// Search Toggle
const searchBtn = document.getElementById('btn-search')
const searchInput = document.getElementById('search-input')
const searchContainer = document.getElementById('search-container')

function toggleSearch() {
  if (searchContainer.classList.contains('expanded')) {
    searchContainer.classList.remove('expanded')
    searchInput.blur()
  } else {
    searchContainer.classList.add('expanded')
    searchInput.focus()
  }
}

// Shortcuts Manager
let appShortcuts = JSON.parse(localStorage.getItem('appShortcuts')) || {
  globalToggle: 'CommandOrControl+Shift+M',
  search: 'CommandOrControl+F',
  settings: 'CommandOrControl+Shift+S',
  transparency: 'CommandOrControl+G',
  sync: 'CommandOrControl+Y',
  playPause: 'CommandOrControl+Shift+Space',
  nextSong: 'CommandOrControl+Shift+ArrowRight',
  prevSong: 'CommandOrControl+Shift+ArrowLeft',
  loop: 'CommandOrControl+Shift+L',
  shuffle: 'CommandOrControl+Shift+R'
};

// Clean up legacy keys
delete appShortcuts.gifPicker;
if (!appShortcuts.transparency) appShortcuts.transparency = 'CommandOrControl+G';
if (!appShortcuts.sync) appShortcuts.sync = 'CommandOrControl+Y';
if (!appShortcuts.settings) appShortcuts.settings = 'CommandOrControl+Shift+S';
if (!appShortcuts.playPause) appShortcuts.playPause = 'CommandOrControl+Shift+Space';
if (!appShortcuts.nextSong) appShortcuts.nextSong = 'CommandOrControl+Shift+ArrowRight';
if (!appShortcuts.prevSong) appShortcuts.prevSong = 'CommandOrControl+Shift+ArrowLeft';
if (!appShortcuts.loop) appShortcuts.loop = 'CommandOrControl+Shift+L';
if (!appShortcuts.shuffle) appShortcuts.shuffle = 'CommandOrControl+Shift+R';
localStorage.setItem('appShortcuts', JSON.stringify(appShortcuts));

let globalShortcutsEnabled = localStorage.getItem('globalShortcutsEnabled') !== 'false';

function getGlobalShortcutPayload() {
  if (globalShortcutsEnabled) return appShortcuts;
  return { globalToggle: appShortcuts.globalToggle };
}

if (window.api && window.api.registerGlobalShortcuts) {
  window.api.registerGlobalShortcuts(getGlobalShortcutPayload());
}

const inputs = {
  globalToggle: document.getElementById('shortcut-global'),
  search: document.getElementById('shortcut-search'),
  transparency: document.getElementById('shortcut-transparency'),
  sync: document.getElementById('shortcut-sync'),
  settings: document.getElementById('shortcut-settings'),
  playPause: document.getElementById('shortcut-play'),
  nextSong: document.getElementById('shortcut-next'),
  prevSong: document.getElementById('shortcut-prev'),
  loop: document.getElementById('shortcut-loop'),
  shuffle: document.getElementById('shortcut-shuffle')
};

const toggleGlobalShortcuts = document.getElementById('toggle-global-shortcuts');
if (toggleGlobalShortcuts) {
  toggleGlobalShortcuts.checked = globalShortcutsEnabled;
  toggleGlobalShortcuts.addEventListener('change', (e) => {
    globalShortcutsEnabled = e.target.checked;
    localStorage.setItem('globalShortcutsEnabled', globalShortcutsEnabled);
    updateInputs();
    if (window.api && window.api.registerGlobalShortcuts) {
      window.api.registerGlobalShortcuts(getGlobalShortcutPayload());
    }
  });
}

function formatDisplay(electronShortcut) {
  if (!electronShortcut) return '';
  const isMac = navigator.platform.toUpperCase().includes('MAC');
  if (isMac) {
    return electronShortcut
      .replace(/CommandOrControl/g, '⌘')
      .replace(/Command/g, '⌘')
      .replace(/Control/g, '⌃')
      .replace(/Shift/g, '⇧')
      .replace(/Alt/g, '⌥')
      .replace(/\+/g, '')
      .toUpperCase();
  } else {
    return electronShortcut
      .replace(/CommandOrControl/g, 'Ctrl')
      .replace(/Command/g, 'Ctrl')
      .replace(/Control/g, 'Ctrl')
      .replace(/Shift/g, 'Shift')
      .replace(/Alt/g, 'Alt')
      .replace(/\+/g, '+')
      .toUpperCase();
  }
}

function updateInputs() {
  if (inputs.globalToggle) inputs.globalToggle.value = formatDisplay(appShortcuts.globalToggle);
  if (inputs.search) inputs.search.value = formatDisplay(appShortcuts.search);
  if (inputs.transparency) inputs.transparency.value = formatDisplay(appShortcuts.transparency);
  if (inputs.sync) inputs.sync.value = formatDisplay(appShortcuts.sync);
  if (inputs.settings) inputs.settings.value = formatDisplay(appShortcuts.settings);
  if (inputs.playPause) inputs.playPause.value = formatDisplay(appShortcuts.playPause);
  if (inputs.nextSong) inputs.nextSong.value = formatDisplay(appShortcuts.nextSong);
  if (inputs.prevSong) inputs.prevSong.value = formatDisplay(appShortcuts.prevSong);
  if (inputs.loop) inputs.loop.value = formatDisplay(appShortcuts.loop);
  if (inputs.shuffle) inputs.shuffle.value = formatDisplay(appShortcuts.shuffle);

  const spans = document.querySelectorAll('#tab-shortcuts span[style*="font-size: 11px"]');
  spans.forEach(span => {
    if (span.innerText.includes('Shortcut') && !span.closest('div').innerHTML.includes('Global Window Toggle')) {
      span.innerText = globalShortcutsEnabled ? 'Global Shortcut' : 'In-App Shortcut';
    }
  });
}
updateInputs();

window.addEventListener('storage', (e) => {
  if (e.key === 'appShortcuts' && e.newValue) {
    appShortcuts = JSON.parse(e.newValue);
    updateInputs();
    if (window.api && window.api.registerGlobalShortcuts) {
      window.api.registerGlobalShortcuts(getGlobalShortcutPayload());
    }
  }
  if (e.key === 'globalShortcutsEnabled' && e.newValue) {
    globalShortcutsEnabled = e.newValue !== 'false';
    if (toggleGlobalShortcuts) toggleGlobalShortcuts.checked = globalShortcutsEnabled;
    updateInputs();
    if (window.api && window.api.registerGlobalShortcuts) {
      window.api.registerGlobalShortcuts(getGlobalShortcutPayload());
    }
  }
});

function handleShortcutRecord(e, keyName) {
  e.preventDefault();
  if (e.key === 'Escape') {
    e.target.blur();
    return;
  }
  
  const keys = [];
  if (e.metaKey || e.ctrlKey) keys.push('CommandOrControl');
  if (e.shiftKey) keys.push('Shift');
  if (e.altKey) keys.push('Alt');
  
  const isModifier = ['Meta', 'Control', 'Shift', 'Alt'].includes(e.key);
  
  if (!isModifier) {
    let keyChar = e.key;
    if (keyChar === ' ') keyChar = 'Space';
    keys.push(keyChar.length === 1 ? keyChar.toUpperCase() : keyChar);
    const newShortcut = keys.join('+');
    appShortcuts[keyName] = newShortcut;
    localStorage.setItem('appShortcuts', JSON.stringify(appShortcuts));
    
    if (window.api && window.api.registerGlobalShortcuts) {
      window.api.registerGlobalShortcuts(getGlobalShortcutPayload());
    }
    
    updateInputs();
    e.target.blur();
    
    e.target.style.borderColor = 'var(--accent)';
    e.target.style.background = 'rgba(74, 222, 128, 0.15)';
    setTimeout(() => {
      e.target.style.borderColor = 'rgba(255,255,255,0.1)';
      e.target.style.background = 'rgba(0,0,0,0.3)';
    }, 400);
  } else {
    e.target.value = formatDisplay(keys.join('+')) + '...';
  }
}

function handleShortcutFocus(e) {
  e.target.style.borderColor = 'var(--accent)';
  e.target.style.background = 'rgba(255,255,255,0.05)';
  e.target.value = 'Listening...';
}

function handleShortcutBlur(e) {
  e.target.style.borderColor = 'rgba(255,255,255,0.1)';
  e.target.style.background = 'rgba(0,0,0,0.3)';
  updateInputs();
}

function attachShortcutRecorders(inputsObj, keyName) {
  if (inputsObj) {
    inputsObj.addEventListener('keydown', (e) => handleShortcutRecord(e, keyName));
    inputsObj.addEventListener('focus', handleShortcutFocus);
    inputsObj.addEventListener('blur', handleShortcutBlur);
  }
}

if (window.api && window.api.onGlobalAction) {
  window.api.onGlobalAction((event, action) => {
    if (action === 'playPause') window.api.togglePlay();
    else if (action === 'nextSong') window.api.nextSong();
    else if (action === 'prevSong') window.api.prevSong();
    else if (action === 'loop') {
      window.api.toggleLoop().then(looping => {
        const loopBtn = document.getElementById('btn-loop');
        if (loopBtn) loopBtn.style.color = looping ? 'var(--accent)' : 'inherit';
      });
    }
    else if (action === 'shuffle') {
      window.api.toggleShuffle().then(shuffling => {
        const shufBtn = document.getElementById('btn-shuffle');
        if (shufBtn) shufBtn.style.color = shuffling ? 'var(--accent)' : 'inherit';
      });
    }
    else if (action === 'search') {
      if (typeof toggleSearch === 'function') toggleSearch();
    }
    else if (action === 'transparency') {
      const nextIndex = (currentTransIndex + 1) % transparencyModes.length;
      applyTransMode(nextIndex);
    }
    else if (action === 'sync') {
      const btn = document.getElementById('btn-spotify-sync');
      if (btn) btn.click();
    }
    else if (action === 'settings') {
      if (window.api.openSettings) window.api.openSettings();
    }
  });
}

attachShortcutRecorders(inputs.globalToggle, 'globalToggle');
attachShortcutRecorders(inputs.search, 'search');
attachShortcutRecorders(inputs.transparency, 'transparency');
attachShortcutRecorders(inputs.sync, 'sync');
attachShortcutRecorders(inputs.settings, 'settings');
attachShortcutRecorders(inputs.playPause, 'playPause');
attachShortcutRecorders(inputs.nextSong, 'nextSong');
attachShortcutRecorders(inputs.prevSong, 'prevSong');
attachShortcutRecorders(inputs.loop, 'loop');
attachShortcutRecorders(inputs.shuffle, 'shuffle');

if (searchBtn) searchBtn.addEventListener('click', toggleSearch)

if (window) window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const coverModal = document.getElementById('cover-picker-modal');
    if (coverModal && coverModal.style.display === 'flex') {
      coverModal.style.display = 'none';
    } else if (document.getElementById('settings-modal').style.display === 'flex') {
      document.getElementById('settings-modal').style.display = 'none';
    } else if (searchContainer.classList.contains('expanded')) {
      toggleSearch();
    } else {
      window.api.close();
    }
  }

  // Don't fire playback shortcuts when user is typing in an input/textarea
  const isTyping = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;

  if (!isTyping) {
    const isCmdOrCtrl = e.metaKey || e.ctrlKey;
    const hasModifiers = isCmdOrCtrl || e.shiftKey || e.altKey;

    // ── Playback controls (Unmodified keys only) ───────────────────────
    if (!hasModifiers && (e.key === ' ' || e.key === 'Spacebar' || e.key === 'MediaPlayPause')) {
      e.preventDefault(); // prevent page scroll on space
      window.api.togglePlay();
    } else if (!hasModifiers && e.key === 'ArrowRight') {
      e.preventDefault();
      seekRelative(5);
    } else if (!hasModifiers && e.key === 'ArrowLeft') {
      e.preventDefault();
      seekRelative(-5);
    } else if (e.key === 'MediaTrackNext' || (hasModifiers && e.shiftKey && e.key === 'ArrowRight')) {
      e.preventDefault();
      window.api.nextSong();
    } else if (e.key === 'MediaTrackPrevious' || (hasModifiers && e.shiftKey && e.key === 'ArrowLeft')) {
      e.preventDefault();
      window.api.prevSong();
    }
    // ──────────────────────────────────────────────────────────────────

    // Custom configurable shortcuts (search, gif picker, etc.)
    if (!e.target.classList.contains('shortcut-recorder')) {
      let pressedKey = e.key.toUpperCase();
      if (pressedKey === ' ') pressedKey = 'SPACE';

      const checkMatch = (shortcutConfig) => {
        if (!shortcutConfig) return false;
        const parts = shortcutConfig.split('+');
        const requiresCmd = parts.includes('CommandOrControl') || parts.includes('Command') || parts.includes('Control');
        const requiresShift = parts.includes('Shift');
        const requiresAlt = parts.includes('Alt');
        let letter = parts[parts.length - 1].toUpperCase();
        if (letter === ' ') letter = 'SPACE';
        
        return (
          isCmdOrCtrl === requiresCmd &&
          e.shiftKey === requiresShift &&
          e.altKey === requiresAlt &&
          pressedKey === letter
        );
      };

      if (checkMatch(appShortcuts.search)) {
        e.preventDefault();
        toggleSearch();
      }
      if (checkMatch(appShortcuts.transparency)) {
        e.preventDefault();
        const nextIndex = (currentTransIndex + 1) % transparencyModes.length;
        applyTransMode(nextIndex);
      }
      if (checkMatch(appShortcuts.sync)) {
        e.preventDefault();
        if (btnSpotifySync) btnSpotifySync.click();
      }
      if (checkMatch(appShortcuts.settings)) {
        e.preventDefault();
        if (window.api && window.api.openSettings) window.api.openSettings();
      }
      if (checkMatch(appShortcuts.playPause)) {
        e.preventDefault();
        window.api.togglePlay();
      }
      if (checkMatch(appShortcuts.nextSong)) {
        e.preventDefault();
        window.api.nextSong();
      }
      if (checkMatch(appShortcuts.prevSong)) {
        e.preventDefault();
        window.api.prevSong();
      }
      if (checkMatch(appShortcuts.loop)) {
        e.preventDefault();
        window.api.toggleLoop().then(looping => {
          const btn = document.getElementById('btn-loop');
          if (btn) btn.style.color = looping ? 'var(--accent)' : 'var(--text-muted)';
        });
      }
      if (checkMatch(appShortcuts.shuffle)) {
        e.preventDefault();
        window.api.toggleShuffle().then(shuffling => {
          const btn = document.getElementById('btn-shuffle');
          if (btn) btn.style.color = shuffling ? 'var(--accent)' : 'var(--text-muted)';
        });
      }
    }
  }
})

let pendingSearchQuery = null;

function executePlayNow(query) {
  if (isSpotifySyncing) {
    updateSpotifySyncUI(false);
  }
  startSearchTimer(query);
  showToast(`🔍 Searching: "${query}"...`);
  window.api.searchSong(query);
}

if (searchInput) searchInput.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') {
    const query = e.target.value.trim();
    if (query) {
      e.target.value = '';
      searchContainer.classList.remove('expanded');
      searchInput.blur();
      
      // Smart playlist detection: if user pastes any Spotify playlist/album link directly in search bar
      if (query.includes('spotify.com/playlist') || query.includes('spotify.com/album') || query.includes('spotify.link') || query.includes('spoti.fi')) {
        showToast('🎵 Fetching Spotify Playlist (No Login Needed)...');
        const data = await window.api.fetchPlaylistUrl(query);
        if (data && data.status === 'success' && data.tracks && data.tracks.length > 0) {
          const plName = data.playlistName || 'Imported Playlist';
          let saved = JSON.parse(localStorage.getItem('savedPlaylists') || '[]');
          if (!saved.find(s => s.id === query)) {
            saved.push({ id: query, name: plName, tracks: data.tracks });
            localStorage.setItem('savedPlaylists', JSON.stringify(saved));
          }
          openPlaylistSidebar('custom-url', plName, data.tracks);
          showToast(`✅ Loaded "${plName}" (${data.tracks.length} songs)`);
          return;
        } else {
          showToast(`⚠️ Could not load playlist: ${data?.message || 'Check link'}`);
          return;
        }
      }

      if (isPlaying) {
        pendingSearchQuery = query;
        const choiceCard = document.getElementById('search-choice-card');
        const choiceQueryText = document.getElementById('choice-query-text');
        if (choiceQueryText) choiceQueryText.textContent = `"${query}"`;
        if (choiceCard) choiceCard.classList.add('show');
      } else {
        executePlayNow(query);
      }
    }
  }
});

const btnChoicePlay = document.getElementById('btn-choice-play');
if (btnChoicePlay) {
  btnChoicePlay.addEventListener('click', () => {
    const choiceCard = document.getElementById('search-choice-card');
    if (choiceCard) choiceCard.classList.remove('show');
    if (pendingSearchQuery) {
      const q = pendingSearchQuery;
      pendingSearchQuery = null;
      executePlayNow(q);
    }
  });
}

const btnChoiceQueue = document.getElementById('btn-choice-queue');
if (btnChoiceQueue) {
  btnChoiceQueue.addEventListener('click', async () => {
    const choiceCard = document.getElementById('search-choice-card');
    if (choiceCard) choiceCard.classList.remove('show');
    if (pendingSearchQuery) {
      const q = pendingSearchQuery;
      pendingSearchQuery = null;
      await window.api.addQueue(q);
      renderQueue();
      showToast(`✅ Added to Queue: "${q}"`);
    }
  });
}

const btnChoiceClose = document.getElementById('btn-choice-close');
if (btnChoiceClose) {
  btnChoiceClose.addEventListener('click', () => {
    const choiceCard = document.getElementById('search-choice-card');
    if (choiceCard) choiceCard.classList.remove('show');
    pendingSearchQuery = null;
  });
}

let searchTimerInterval = null;
let searchStartTime = 0;

function startSearchTimer(query) {
  if (searchTimerInterval) clearInterval(searchTimerInterval);
  searchStartTime = Date.now();
  
  const titleEl = document.getElementById('track-title');
  const artistEl = document.getElementById('artist-name') || document.getElementById('track-artist');
  if (titleEl) titleEl.innerText = query;
  
  if (!isPlaying) {
    updateProgressUI(0);
  }
  const progressLine = document.getElementById('progress-fill') || document.querySelector('.progress');
  if (progressLine) progressLine.classList.add('is-searching');
  
  const icon = document.getElementById('icon-play');
  if (icon) {
    icon.classList.add('spin-fast');
    icon.innerHTML = '<path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8z"/>';
  }
  
  const updateTimer = () => {
    const elapsed = ((Date.now() - searchStartTime) / 1000).toFixed(1);
    if (artistEl) {
      artistEl.innerHTML = `<span class="searching-badge"><span class="searching-spinner"></span> Searching... <b>${elapsed}s</b></span>`;
    }
  };
  updateTimer();
  searchTimerInterval = setInterval(updateTimer, 100);
}

function stopSearchTimer() {
  if (searchTimerInterval) {
    clearInterval(searchTimerInterval);
    searchTimerInterval = null;
  }
  const progressLine = document.getElementById('progress-fill') || document.querySelector('.progress');
  if (progressLine) progressLine.classList.remove('is-searching');
  const icon = document.getElementById('icon-play');
  if (icon) icon.classList.remove('spin-fast');
}

window.api.onTrackLoading((event, payload) => {
  let query = payload;
  if (query.includes('|DURATION:')) {
    query = query.split('|DURATION:')[0].trim();
  }
  startSearchTimer(query);
});

// Seamlessly update playlist menu when background cache refresh completes
window.api.onPlaylistsUpdated((event, res) => {
  const menu = document.getElementById('playlist-menu')
  if (menu.style.display !== 'block') return // Only update if menu is open
  // Re-render the playlist items while keeping the menu open
  const items = menu.querySelectorAll('.playlist-item')
  items.forEach(el => el.remove())
  if (res.status === 'success') {
    res.playlists.forEach(pl => {
      const a = document.createElement('a')
      a.href = '#'
      a.className = 'track-item playlist-item'
      a.style.display = 'block'
      a.style.textDecoration = 'none'
      a.style.borderRadius = '4px'
      a.innerText = pl.name
      a.dataset.name = pl.name
      a.onclick = (ev) => {
        ev.preventDefault()
        menu.style.display = 'none'
        const apn = document.getElementById('active-playlist-name')
        apn.innerText = pl.name
        apn.title = pl.name
        apn.style.display = 'inline-block'
        openPlaylistSidebar(pl.id, pl.name)
      }
      menu.appendChild(a)
    })
  }
})


window.api.onPlaybackStateUpdate((event, isPaused) => {
  isPlaying = !isPaused
  updatePlayIcon()
})

// Initialize connection button state
window.api.isLoggedIn().then(loggedIn => {
  const btnTop = document.getElementById('btn-auth-top')
  const btnSettings = document.getElementById('btn-auth-settings')
  const statusText = document.getElementById('spotify-status-text')
  
  if (loggedIn) {
    if (btnTop) {
      btnTop.innerHTML = 'Connected <span style="display:inline-block; width:6px; height:6px; background:rgb(var(--bg-color-rgb)); border-radius:50%; margin-left:4px; vertical-align:middle;"></span>'
      btnTop.style.color = 'rgb(var(--bg-color-rgb))'
      btnTop.style.background = 'var(--accent)'
      btnTop.style.border = 'none'
      btnTop.style.fontWeight = '600'
      
      // Disable top button action when connected
      btnTop.onclick = (e) => e.preventDefault()
    }
    
    if (statusText) {
      statusText.textContent = 'Connected'
      statusText.style.color = 'var(--accent)'
    }
    
    if (btnSettings) {
      btnSettings.innerHTML = 'Disconnect Spotify'
      btnSettings.style.background = 'rgba(255,50,50,0.1)'
      btnSettings.style.color = '#ff6b6b'
      
      btnSettings.addEventListener('click', async () => {
        await window.api.logoutSpotify()
        location.reload()
      })
    }
  } else {
    if (btnTop) {
      btnTop.addEventListener('click', toggleSpotifyAuth)
    }
    if (btnSettings) {
      btnSettings.addEventListener('click', toggleSpotifyAuth)
    }
  }
})

let currentPlayingArt = '';

function updateAlbumCover(artUrl) {
  if (artUrl) currentPlayingArt = artUrl;
  const customCover = localStorage.getItem('userCustomCover');
  const img = document.getElementById('custom-gif-img');
  if (!img) return;
  if (customCover) {
    img.src = customCover;
  } else if (artUrl) {
    img.src = artUrl;
  }
}

// Restore saved custom cover if set
const savedCustomCover = localStorage.getItem('userCustomCover');
if (savedCustomCover) {
  const img = document.getElementById('custom-gif-img');
  if (img) img.src = savedCustomCover;
}

// Preloaded album covers downloaded from Google Drive
const PRELOADED_COVERS = [
  { name: "ARCHANGEL", file: "covers/ARCHANGEL.jpg" },
  { name: "844493674996631", file: "covers/844493674996631.jpg" },
  { name: "2251868553900344", file: "covers/2251868553900344.jpg" },
  { name: "2885187258570426", file: "covers/2885187258570426.jpg" },
  { name: "7529524372913731", file: "covers/7529524372913731.jpg" },
  { name: "14073817581546309", file: "covers/14073817581546309.jpg" },
  { name: "34199278420195307", file: "covers/34199278420195307.jpg" },
  { name: "58406126413219740", file: "covers/58406126413219740.jpg" },
  { name: "61994932366952748", file: "covers/61994932366952748.jpg" },
  { name: "89509111342387645", file: "covers/89509111342387645.jpg" },
  { name: "99642210502550519", file: "covers/99642210502550519.jpg" },
  { name: "111604897012472404", file: "covers/111604897012472404.jpg" },
  { name: "157766793190933057", file: "covers/157766793190933057.jpg" },
  { name: "178032991516917481", file: "covers/178032991516917481.jpg" },
  { name: "221028294207207886 (1)", file: "covers/221028294207207886 (1).jpg" },
  { name: "221028294207207886", file: "covers/221028294207207886.jpg" },
  { name: "223913412720354504", file: "covers/223913412720354504.jpg" },
  { name: "586523551521056937", file: "covers/586523551521056937.jpg" },
  { name: "594193744631188830", file: "covers/594193744631188830.jpg" },
  { name: "885590714239648995", file: "covers/885590714239648995.jpg" },
  { name: "888827676492677002", file: "covers/888827676492677002.jpg" },
  { name: "936045103822947840", file: "covers/936045103822947840.jpg" },
  { name: "Aesthetic", file: "covers/Aesthetic.jpg" },
  { name: "atmosfeer", file: "covers/atmosfeer.jpg" },
  { name: "broken tech", file: "covers/broken tech.jpg" },
  { name: "C3", file: "covers/C3.jpg" },
  { name: "cd playlist cover - kisses", file: "covers/cd playlist cover - kisses.jpg" },
  { name: "cd spotify playlist cover", file: "covers/cd spotify playlist cover.jpg" },
  { name: "Flower Lillies CD Playlist Cover", file: "covers/Flower Lillies CD Playlist Cover.jpg" },
  { name: "i love this sweater aghh", file: "covers/i love this sweater aghh.jpg" },
  { name: "music playlist cover", file: "covers/music playlist cover.jpg" },
  { name: "Potential album cover", file: "covers/Potential album cover.jpg" },
  { name: "red lovers aesthetic (1)", file: "covers/red lovers aesthetic (1).jpg" },
  { name: "red lovers aesthetic", file: "covers/red lovers aesthetic.jpg" },
  { name: "Spotify CD cover for rap music playlist", file: "covers/Spotify CD cover for rap music playlist.jpg" },
  { name: "Spotify Cover Idea", file: "covers/Spotify Cover Idea.jpg" },
  { name: "Spotify cover", file: "covers/Spotify cover.jpg" },
  { name: "spotify music aesthetic", file: "covers/spotify music aesthetic.jpg" },
  { name: "spotify playlist cover", file: "covers/spotify playlist cover.jpg" },
  { name: "The Most Intimate Corner of Music", file: "covers/The Most Intimate Corner of Music.jpg" },
  { name: "2", file: "covers/2.jpg" }
];

// Modal elements
const coverPickerModal = document.getElementById('cover-picker-modal');
const btnCloseCoverModal = document.getElementById('btn-close-cover-modal');
const btnAutoSongCover = document.getElementById('btn-auto-song-cover');
const btnUploadCustomCover = document.getElementById('btn-upload-custom-cover');
const coversGrid = document.getElementById('covers-grid');
const albumArtWrapper = document.getElementById('album-art-wrapper');
const coverFileUpload = document.getElementById('cover-file-upload');

function openCoverPickerModal() {
  if (!coverPickerModal) return;
  coverPickerModal.style.display = 'flex';
  renderCoversGrid();
}

function closeCoverPickerModal() {
  if (!coverPickerModal) return;
  coverPickerModal.style.display = 'none';
}

function selectCustomCover(coverUrl) {
  localStorage.setItem('userCustomCover', coverUrl);
  const img = document.getElementById('custom-gif-img');
  if (img) img.src = coverUrl;
  closeCoverPickerModal();
}

function renderCoversGrid() {
  if (!coversGrid) return;
  coversGrid.innerHTML = '';
  const currentCover = localStorage.getItem('userCustomCover');

  PRELOADED_COVERS.forEach((c) => {
    const item = document.createElement('div');
    const isSelected = currentCover === c.file;
    item.style.cssText = `
      position: relative;
      width: 100%;
      padding-top: 100%;
      border-radius: 8px;
      overflow: hidden;
      cursor: pointer;
      border: ${isSelected ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.1)'};
      background: rgba(0,0,0,0.3);
      transition: transform 0.15s ease, border-color 0.15s ease;
    `;
    item.onmouseenter = () => item.style.transform = 'scale(1.05)';
    item.onmouseleave = () => item.style.transform = 'scale(1)';

    const img = document.createElement('img');
    img.src = c.file;
    img.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover;';
    item.appendChild(img);

    item.onclick = () => selectCustomCover(c.file);
    coversGrid.appendChild(item);
  });
}

if (albumArtWrapper) {
  // Right-click opens the covers modal directly
  albumArtWrapper.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openCoverPickerModal();
  });
  // Left-click also opens the covers modal
  albumArtWrapper.addEventListener('click', (e) => {
    e.preventDefault();
    openCoverPickerModal();
  });
}

if (btnCloseCoverModal) {
  btnCloseCoverModal.addEventListener('click', closeCoverPickerModal);
}

if (coverPickerModal) {
  coverPickerModal.addEventListener('click', (e) => {
    if (e.target === coverPickerModal) closeCoverPickerModal();
  });
}

if (btnAutoSongCover) {
  btnAutoSongCover.addEventListener('click', () => {
    localStorage.removeItem('userCustomCover');
    const img = document.getElementById('custom-gif-img');
    if (img) img.src = currentPlayingArt || PRELOADED_COVERS[0].file;
    closeCoverPickerModal();
  });
}

if (btnUploadCustomCover && coverFileUpload) {
  btnUploadCustomCover.addEventListener('click', () => {
    coverFileUpload.click();
  });
}

if (coverFileUpload) {
  coverFileUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target.result;
        selectCustomCover(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  });
}

window.api.onTrackStarted((event, track) => {
  stopSearchTimer();
  showToast(`🎵 Now Playing: ${track.title || 'Track'}`);
  document.getElementById('track-title').innerText = track.title
  const artistEl = document.getElementById('artist-name')
  if (artistEl) {
    artistEl.innerText = track.artist
  } else {
    document.getElementById('track-artist').innerText = track.artist
  }
  currentDuration = track.durationSeconds || 0
  isPlaying = true
  updatePlayIcon()
  document.querySelector('.time-total').innerText = track.durationStr || '0:00'
  const elapsedEl = document.querySelector('.time-elapsed');
  if (elapsedEl) elapsedEl.innerText = '0:00';
  updateProgressUI(0);
  if (track.albumArt) {
    updateAlbumCover(track.albumArt)
  }
})

window.api.onTrackError((event, errorMsg) => {
  stopSearchTimer();
  document.getElementById('track-title').innerText = 'Search Failed'
  document.getElementById('track-artist').innerText = errorMsg
})

if (window.api && window.api.onLoopToggled) {
  window.api.onLoopToggled((event, looping) => {
    const btn = document.getElementById('btn-loop');
    if (btn) btn.style.color = looping ? 'var(--accent)' : 'var(--text-muted)';
  });
}

if (window.api && window.api.onShuffleToggled) {
  window.api.onShuffleToggled((event, shuffling) => {
    const btn = document.getElementById('btn-shuffle');
    if (btn) btn.style.color = shuffling ? 'var(--accent)' : 'var(--text-muted)';
  });
}

// Settings Logic
const root = document.documentElement
const opacitySlider = document.getElementById('opacity-slider')
const opacityValue = document.getElementById('opacity-value')
const brightnessSlider = document.getElementById('brightness-slider')
const brightnessValue = document.getElementById('brightness-value')

// Load saved settings
const savedOpacity = Math.max(5, parseInt(localStorage.getItem('bgOpacity')) || 100)
const savedBrightness = Math.min(100, Math.max(0, parseInt(localStorage.getItem('bgBrightness')) || 100))
root.style.setProperty('--bg-layer-opacity', savedOpacity / 100)
root.style.setProperty('--bg-brightness', savedBrightness / 100)
const initialBg = document.getElementById('bg-layer')
if (initialBg) {
  initialBg.style.opacity = savedOpacity / 100
  initialBg.style.filter = `brightness(${savedBrightness / 100})`
}

// ─── Transparency Mode & Toggle ──────────────────────────────────────────────
const btnTransparency = document.getElementById('btn-transparency');
const toggleWindowTransparency = document.getElementById('toggle-window-transparency');
let isTransparencyEnabled = localStorage.getItem('transparencyEnabled') !== 'false';

const transparencyModes = [
  { label: '🖼️ Original', layerOpacity: 1.0, alpha: 0.05, blur: 0, brightness: 1.0 },
  { label: '💎 Glass', layerOpacity: 0.65, alpha: 0.22, blur: 22, brightness: 0.90 },
  { label: '💧 Clear', layerOpacity: 0.30, alpha: 0.12, blur: 12, brightness: 0.85 },
  { label: '👻 Ghost', layerOpacity: 0.05, alpha: 0.06, blur: 6, brightness: 0.75 },
  { label: '⬛ Solid', layerOpacity: 1.0, alpha: 0.90, blur: 0, brightness: 0.70 }
];
let currentTransIndex = parseInt(localStorage.getItem('transModeIndex')) || 0;
if (isNaN(currentTransIndex) || currentTransIndex >= transparencyModes.length) currentTransIndex = 0;

function applyTransMode(index) {
  currentTransIndex = index;
  localStorage.setItem('transModeIndex', currentTransIndex);
  const mode = transparencyModes[currentTransIndex];

  root.style.setProperty('--bg-layer-opacity', mode.layerOpacity);
  root.style.setProperty('--wrapper-bg-alpha', mode.alpha);
  root.style.setProperty('--bg-blur', mode.blur + 'px');
  root.style.setProperty('--bg-brightness', mode.brightness);

  const bgLayer = document.getElementById('bg-layer');
  if (bgLayer) {
    bgLayer.style.opacity = mode.layerOpacity;
    bgLayer.style.filter = `brightness(${mode.brightness})`;
  }
  const appWrapper = document.querySelector('.app-wrapper');
  if (appWrapper) {
    appWrapper.style.backdropFilter = mode.blur > 0 ? `blur(${mode.blur}px)` : 'none';
    appWrapper.style.webkitBackdropFilter = mode.blur > 0 ? `blur(${mode.blur}px)` : 'none';
    appWrapper.style.background = `rgba(10, 10, 12, ${mode.alpha})`;
  }

  if (btnTransparency) {
    btnTransparency.innerText = mode.label;
  }
}

if (btnTransparency) {
  btnTransparency.innerText = transparencyModes[currentTransIndex].label;
  btnTransparency.addEventListener('click', () => {
    const nextIndex = (currentTransIndex + 1) % transparencyModes.length;
    applyTransMode(nextIndex);
  });
  btnTransparency.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    applyTransMode(0); // Reset to 🖼️ Original
  });
}

if (toggleWindowTransparency) {
  toggleWindowTransparency.checked = currentTransIndex !== 4; // not solid
  toggleWindowTransparency.addEventListener('change', (e) => {
    applyTransMode(e.target.checked ? 0 : 4);
  });
}

applyTransMode(currentTransIndex);

// ─── Always-on-Top / Pin Toggle ──────────────────────────────────────────────
const btnPin = document.getElementById('btn-pin');
if (btnPin) {
  function updatePinUI(isPinned) {
    btnPin.innerText = isPinned ? '📌 Pinned' : '📍 Unpinned';
    btnPin.style.color = isPinned ? 'var(--accent)' : 'var(--text-muted)';
    btnPin.title = isPinned ? 'Always on top: Floating over all windows (Click to unpin)' : 'Click to pin on top of all windows';
  }

  if (window.api && window.api.getAlwaysOnTop) {
    window.api.getAlwaysOnTop().then(updatePinUI);
  }

  btnPin.addEventListener('click', async () => {
    if (window.api && window.api.toggleAlwaysOnTop) {
      const isPinned = await window.api.toggleAlwaysOnTop();
      updatePinUI(isPinned);
      showToast(isPinned ? '📌 Pinned on top of all apps' : '📍 Window unpinned');
    }
  });
}

// Connect Settings appearance sliders
if (opacitySlider) {
  opacitySlider.value = savedOpacity;
  if (opacityValue) opacityValue.innerText = savedOpacity + '%';
  opacitySlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value) || 85;
    if (opacityValue) opacityValue.innerText = val + '%';
    const op = val / 100;
    root.style.setProperty('--bg-layer-opacity', op);
    const bg = document.getElementById('bg-layer');
    if (bg) bg.style.opacity = op;
    localStorage.setItem('bgOpacity', val);
    if (window.api && window.api.syncSettings) {
      window.api.syncSettings({ key: 'bgOpacity', value: String(val) });
    }
  });
}

// ─── Dark Text / High Contrast Contrast ─────────────────────────────────────
const btnTextContrast = document.getElementById('btn-text-contrast');
const toggleDarkText = document.getElementById('toggle-dark-text');
const appWrapperEl = document.querySelector('.app-wrapper');

let isDarkText = localStorage.getItem('textContrastMode') === 'dark';

function applyTextContrast(dark) {
  isDarkText = dark;
  localStorage.setItem('textContrastMode', dark ? 'dark' : 'light');
  if (appWrapperEl) {
    if (dark) appWrapperEl.classList.add('dark-text-mode');
    else appWrapperEl.classList.remove('dark-text-mode');
  }
  if (btnTextContrast) {
    btnTextContrast.innerText = dark ? '🌙 Dark Text' : '☀️ Light Text';
  }
  if (toggleDarkText) {
    toggleDarkText.checked = dark;
  }
}

applyTextContrast(isDarkText);

if (btnTextContrast) {
  btnTextContrast.addEventListener('click', () => {
    applyTextContrast(!isDarkText);
  });
}

if (toggleDarkText) {
  toggleDarkText.checked = isDarkText;
  toggleDarkText.addEventListener('change', (e) => {
    applyTextContrast(e.target.checked);
  });
}

// ─── Spotify Live Sync ───────────────────────────────────────────────────────
const btnSpotifySync = document.getElementById('btn-spotify-sync');
const toggleSpotifySyncSetting = document.getElementById('toggle-spotify-sync-setting');

async function updateSpotifySyncUI(active) {
  isSpotifySyncing = active;
  if (btnSpotifySync) {
    btnSpotifySync.innerText = active ? '🟢 Syncing' : '⚪ Sync';
    btnSpotifySync.style.color = active ? '#1db954' : 'var(--text-main)';
  }
  if (toggleSpotifySyncSetting) {
    toggleSpotifySyncSetting.checked = active;
  }
}

if (btnSpotifySync) {
  btnSpotifySync.addEventListener('click', async () => {
    const loggedIn = await window.api.isLoggedIn();
    if (!loggedIn) {
      window.api.openCredentialsWindow();
      return;
    }
    const targetStatus = !isSpotifySyncing;
    updateSpotifySyncUI(targetStatus);
    showToast(targetStatus ? '🟢 Syncing to Spotify...' : '⚪ Back to OffTrack');
    const newStatus = await window.api.toggleSpotifySync(targetStatus);
    updateSpotifySyncUI(newStatus);
  });
}

if (toggleSpotifySyncSetting) {
  toggleSpotifySyncSetting.addEventListener('change', async (e) => {
    const loggedIn = await window.api.isLoggedIn();
    if (!loggedIn) {
      e.target.checked = false;
      window.api.openCredentialsWindow();
      return;
    }
    const newStatus = await window.api.toggleSpotifySync(e.target.checked);
    updateSpotifySyncUI(newStatus);
  });
}

// Check initial sync status
if (window.api && window.api.getSpotifySyncStatus) {
  window.api.getSpotifySyncStatus().then(updateSpotifySyncUI);
}

if (window.api && window.api.onSpotifySyncStatusChanged) {
  window.api.onSpotifySyncStatusChanged((_, active) => {
    updateSpotifySyncUI(active);
  });
}

// Receive live playback updates from official Spotify app!
if (window.api && window.api.onSpotifySyncUpdate) {
  window.api.onSpotifySyncUpdate((_, track) => {
    if (!isSpotifySyncing) return;
    const titleEl = document.getElementById('track-title');
    const artistEl = document.getElementById('artist-name');
    const elapsedEl = document.querySelector('.time-elapsed');
    const totalEl = document.querySelector('.time-total');
    const playBtn = document.getElementById('btn-play');

    if (titleEl && track.title) titleEl.innerText = track.title;
    if (artistEl && track.artist) artistEl.innerText = track.artist;
    if (totalEl && track.durationStr) totalEl.innerText = track.durationStr;
    
    currentDuration = track.durationSeconds || 0;

    if (elapsedEl && typeof track.progressSeconds === 'number') {
      const m = Math.floor(track.progressSeconds / 60);
      const s = track.progressSeconds % 60;
      elapsedEl.innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    if (track.durationSeconds > 0) {
      const pct = Math.min(100, Math.max(0, (track.progressSeconds / track.durationSeconds) * 100));
      updateProgressUI(pct);
    }

    if (track.albumArt) {
      updateAlbumCover(track.albumArt);
    }

    if (track.isPlaying) {
      isPlaying = true;
      if (appWrapperEl) {
        appWrapperEl.classList.add('is-playing');
        appWrapperEl.classList.remove('is-paused');
      }
      if (playBtn) playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
    } else {
      isPlaying = false;
      if (appWrapperEl) {
        appWrapperEl.classList.remove('is-playing');
        appWrapperEl.classList.add('is-paused');
      }
      if (playBtn) playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
    }
  });
}

if (window.api && window.api.onSpotifySeekRestricted) {
  window.api.onSpotifySeekRestricted(() => {
    showToast('⚠️ Spotify Free restricts seeking. Click ⚪ Sync to seek freely on OffTrack!');
  });
}

if (brightnessSlider) {
  brightnessSlider.value = savedBrightness
  brightnessValue.innerText = savedBrightness + '%'
  brightnessSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value) || 100
    brightnessValue.innerText = val + '%'
    const br = val / 100
    root.style.setProperty('--bg-brightness', br)
    const bg = document.getElementById('bg-layer')
    if (bg) bg.style.filter = `brightness(${br})`
    localStorage.setItem('bgBrightness', val)
    if (window.api && window.api.syncSettings) {
      window.api.syncSettings({ key: 'bgBrightness', value: String(val) })
    }
  })
}
root.style.setProperty('--bg-brightness', savedBrightness / 100)

// Storage listener to sync across windows instantly
if (window) window.addEventListener('storage', (e) => {
  if (e.key === 'bgOpacity') {
    const val = parseInt(e.newValue) || 95
    if (opacitySlider) opacitySlider.value = val
    if (opacityValue) opacityValue.innerText = val + '%'
    const op = val / 100
    root.style.setProperty('--bg-layer-opacity', op)
    const bg = document.getElementById('bg-layer')
    if (bg) bg.style.opacity = op
  }
  if (e.key === 'bgBrightness') {
    const val = parseInt(e.newValue) || 100
    if (brightnessSlider) brightnessSlider.value = val
    if (brightnessValue) brightnessValue.innerText = val + '%'
    const br = val / 100
    root.style.setProperty('--bg-brightness', br)
    const bg = document.getElementById('bg-layer')
    if (bg) bg.style.filter = `brightness(${br})`
  }
  if (e.key === 'themeVars') {
    try {
      const t = JSON.parse(e.newValue)
      if (t) {
        root.style.setProperty('--bg-color-rgb', t.bg)
        root.style.setProperty('--text-main', t.text)
        root.style.setProperty('--text-muted', t.muted)
        root.style.setProperty('--accent', t.accent)
        root.style.setProperty('--border-color', t.border)
      }
    } catch(err) {}
  }
  if (e.key === 'customGifSettings') {
    customGifSettings = JSON.parse(e.newValue)
    applyCustomGifSettings()
  }
})

// Function to load themes from local storage initially
function initThemeVars() {
  try {
    const t = JSON.parse(localStorage.getItem('themeVars'))
    if (t) {
      root.style.setProperty('--bg-color-rgb', t.bg)
      root.style.setProperty('--text-main', t.text)
      root.style.setProperty('--text-muted', t.muted)
      root.style.setProperty('--accent', t.accent)
      root.style.setProperty('--border-color', t.border)
    }
  } catch(err) {}
}
initThemeVars()

// Background Wallpaper Selection Logic (Google Drive Wallpapers + Glass)
function applyWallpaper(bgUrl, broadcast = true) {
  const bgLayer = document.getElementById('bg-layer');
  const appWrapper = document.querySelector('.app-wrapper');
  if (bgLayer) {
    if (!bgUrl) {
      bgLayer.style.backgroundImage = 'none';
      bgLayer.style.display = 'none';
      if (appWrapper) {
        appWrapper.style.background = 'rgba(15, 15, 18, 0.35)';
        appWrapper.style.backdropFilter = 'blur(25px)';
        appWrapper.style.webkitBackdropFilter = 'blur(25px)';
      }
    } else {
      bgLayer.style.backgroundImage = `url("${bgUrl}")`;
      bgLayer.style.display = 'block';
      bgLayer.style.opacity = '1';
      if (appWrapper) {
        appWrapper.style.background = 'rgba(10, 10, 12, 0.22)';
        appWrapper.style.backdropFilter = 'none';
        appWrapper.style.webkitBackdropFilter = 'none';
      }
    }
  }
  localStorage.setItem('selectedBg', bgUrl || '');

  // Highlight matching card across windows
  document.querySelectorAll('.bg-card').forEach(c => {
    const cardBg = c.getAttribute('data-bg');
    if (cardBg !== null) {
      if ((!bgUrl && cardBg === '') || (bgUrl && cardBg === bgUrl)) {
        c.style.borderColor = 'var(--accent)';
        c.style.boxShadow = '0 0 12px rgba(57, 255, 20, 0.5)';
      } else {
        c.style.borderColor = 'var(--border-color)';
        c.style.boxShadow = 'none';
      }
    }
  });

  if (broadcast && window.api && window.api.changeBackground) {
    window.api.changeBackground(bgUrl);
  }
}

// Listen for background updates from other windows
if (window.api && window.api.onBackgroundChanged) {
  window.api.onBackgroundChanged((bgUrl) => {
    applyWallpaper(bgUrl, false);
  });
}

// Attach click to all background cards
document.querySelectorAll('.bg-card').forEach(card => {
  const bg = card.getAttribute('data-bg');
  if (bg !== null) {
    card.addEventListener('click', () => {
      applyWallpaper(bg, true);
    });
  }
});

// Restore saved wallpaper or get from main process
const savedBg = localStorage.getItem('selectedBg');
if (savedBg !== null) {
  applyWallpaper(savedBg, false);
} else if (window.api && window.api.getCurrentBackground) {
  window.api.getCurrentBackground().then(bg => {
    if (bg) applyWallpaper(bg, false);
  }).catch(() => {});
}

// Upload custom background handler
['btn-upload-bg', 'btn-upload-bg-inline'].forEach(btnId => {
  const btn = document.getElementById(btnId);
  const input = btnId === 'btn-upload-bg' ? document.getElementById('settings-file-upload') : document.getElementById('inline-file-upload');
  if (btn && input) {
    btn.addEventListener('click', () => input.click());
    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const dataUrl = event.target.result;
          applyWallpaper(dataUrl);
        };
        reader.readAsDataURL(file);
      }
    });
  }
});

// Tab Switching Logic
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', (e) => {
    document.querySelectorAll('.tab-pane').forEach(p => p.style.display = 'none')
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
    
    const target = e.currentTarget
    target.classList.add('active')
    const paneId = target.getAttribute('data-target')
    if (paneId) {
      document.getElementById(paneId).style.display = 'block'
    }
  })
})

// Mock Spotify Auth Logic
let isSpotifyConnected = false
const btnAuthTop = document.getElementById('btn-auth-top')
const btnAuthSettings = document.getElementById('btn-auth-settings')
const spotifyStatusText = document.getElementById('spotify-status-text')

function toggleSpotifyAuth() {
  const form = document.getElementById('spotify-creds-form')
  if (form) {
    form.style.display = form.style.display === 'none' ? 'block' : 'none'
  } else {
    window.api.openCredentialsWindow()
  }
}

// Inline Credentials Form Logic
const btnSaveSpotifyCreds = document.getElementById('btn-save-spotify-creds')
const linkSpotifyDev = document.getElementById('link-spotify-dev')
const btnSettingsCopyUri = document.getElementById('btnSettingsCopyUri')
const spotifyRedirectUriSelect = document.getElementById('spotify-redirect-uri')
const settingsUriToCopy = document.getElementById('settingsUriToCopy')

if (btnSettingsCopyUri && settingsUriToCopy) {
  btnSettingsCopyUri.addEventListener('click', () => {
    navigator.clipboard.writeText(settingsUriToCopy.value);
    btnSettingsCopyUri.innerText = 'Copied!';
    setTimeout(() => { btnSettingsCopyUri.innerText = 'Copy'; }, 2000);
  });
}

if (spotifyRedirectUriSelect && settingsUriToCopy) {
  spotifyRedirectUriSelect.addEventListener('change', (e) => {
    settingsUriToCopy.value = e.target.value;
  });
}

// Pre-fill stored credentials in Settings
if (window.api && window.api.getSpotifyCreds) {
  window.api.getSpotifyCreds().then((creds) => {
    if (creds) {
      const idInput = document.getElementById('spotify-client-id');
      const secretInput = document.getElementById('spotify-client-secret');
      if (idInput && creds.clientId) idInput.value = creds.clientId;
      if (secretInput && creds.clientSecret) secretInput.value = creds.clientSecret;
      if (spotifyRedirectUriSelect && creds.redirectUri) spotifyRedirectUriSelect.value = creds.redirectUri;
    }
  }).catch(() => {});
}

if (btnSaveSpotifyCreds) {
  btnSaveSpotifyCreds.addEventListener('click', async () => {
    const clientId = document.getElementById('spotify-client-id')?.value.trim()
    const clientSecret = document.getElementById('spotify-client-secret')?.value.trim()
    const redirectUri = spotifyRedirectUriSelect?.value.trim() || 'http://127.0.0.1:8888/callback'
    
    if (!clientId || !clientSecret) {
      alert('Please enter both Client ID and Client Secret')
      return
    }
    
    btnSaveSpotifyCreds.innerText = 'Authorizing...'
    btnSaveSpotifyCreds.disabled = true
    try {
      await window.api.saveSpotifyCreds(clientId, clientSecret, redirectUri)
    } finally {
      setTimeout(() => {
        if (btnSaveSpotifyCreds) {
          btnSaveSpotifyCreds.innerText = 'Connect (In-App)'
          btnSaveSpotifyCreds.disabled = false
        }
      }, 3000)
    }
  })
}

const btnSaveBrowserCreds = document.getElementById('btn-save-browser-creds')
if (btnSaveBrowserCreds) {
  btnSaveBrowserCreds.addEventListener('click', async () => {
    const clientId = document.getElementById('spotify-client-id')?.value.trim()
    const clientSecret = document.getElementById('spotify-client-secret')?.value.trim()
    const redirectUri = spotifyRedirectUriSelect?.value.trim() || 'http://127.0.0.1:8888/callback'
    
    if (!clientId || !clientSecret) {
      alert('Please enter both Client ID and Client Secret')
      return
    }
    
    btnSaveBrowserCreds.innerText = 'Opening Browser...'
    btnSaveBrowserCreds.disabled = true
    try {
      await window.api.saveAndAuthBrowser(clientId, clientSecret, redirectUri)
    } finally {
      setTimeout(() => {
        if (btnSaveBrowserCreds) {
          btnSaveBrowserCreds.innerText = 'Connect in Browser'
          btnSaveBrowserCreds.disabled = false
        }
      }, 3000)
    }
  })
}

if (linkSpotifyDev) {
  linkSpotifyDev.addEventListener('click', (e) => {
    e.preventDefault()
    window.api.openExternal('https://developer.spotify.com/dashboard')
  })
}


// Playback State
let isPlaying = false
let currentDuration = 0
const playIcon = document.getElementById('icon-play')
const progressLine = document.querySelector('.progress')

function formatTime(sec) {
  if (isNaN(sec) || !isFinite(sec)) return "0:00"
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function updateProgressUI(pct) {
  const percent = Math.min(100, Math.max(0, pct));
  const fill = document.getElementById('progress-fill') || document.querySelector('.progress');
  const wave = document.getElementById('wave-canvas-wrapper');
  const dot = document.getElementById('progress-scrubber-dot');
  
  if (fill) fill.style.width = `${percent}%`;
  if (wave) wave.style.width = `${percent}%`;
  if (dot) dot.style.left = `${percent}%`;
}

window.api.onPlaybackTime((event, time) => {
  if (currentDuration > 0 && !isDraggingProgress) {
    const pct = (time / currentDuration) * 100
    updateProgressUI(pct)
    document.querySelector('.time-elapsed').innerText = formatTime(time)
  } else if (!isDraggingProgress) {
    document.querySelector('.time-elapsed').innerText = formatTime(time)
  }
})

window.api.onPlaybackStopped(() => {
  isPlaying = false
  updatePlayIcon()
  updateProgressUI(0)
  document.querySelector('.time-elapsed').innerText = '0:00'
})

function updatePlayIcon() {
  const icon = document.getElementById('icon-play')
  if (!icon) return
  icon.classList.remove('spin-fast')
  const wrapper = document.querySelector('.app-wrapper')
  if (isPlaying) {
    icon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'
    wrapper?.classList.add('is-playing')
    wrapper?.classList.remove('is-paused')
  } else {
    icon.innerHTML = '<path d="M8 5v14l11-7z"/>'
    wrapper?.classList.remove('is-playing')
    wrapper?.classList.add('is-paused')
  }
}

safeOn('btn-play', 'click', () => {
  if (isSpotifySyncing) {
    window.api.spotifyRemotePlayPause();
    return;
  }
  window.api.togglePlay()
  isPlaying = !isPlaying
  updatePlayIcon()
})

const progressBarContainer = document.querySelector('.progress-bar')
let isDraggingProgress = false
let currentPlaybackTime = 0

function ensureCurrentDuration() {
  if (currentDuration <= 0) {
    const totalStr = document.querySelector('.time-total')?.innerText || ''
    if (totalStr && totalStr.includes(':')) {
      const parts = totalStr.split(':').map(Number)
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        currentDuration = parts[0] * 60 + parts[1]
      } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        currentDuration = parts[0] * 3600 + parts[1] * 60 + parts[2]
      }
    }
  }
  return currentDuration
}

function seekToEvent(e) {
  const dur = ensureCurrentDuration()
  if (dur > 0 && progressBarContainer) {
    const rect = progressBarContainer.getBoundingClientRect()
    if (rect.width <= 0) return -1
    let clickX = e.clientX - rect.left
    if (clickX < 0) clickX = 0
    if (clickX > rect.width) clickX = rect.width
    const percent = clickX / rect.width
    const targetTime = percent * dur
    
    updateProgressUI(percent * 100)
    const elapsedEl = document.querySelector('.time-elapsed')
    if (elapsedEl) elapsedEl.innerText = formatTime(targetTime)
    currentPlaybackTime = targetTime
    return targetTime
  }
  return -1
}

function performSeek(targetTime) {
  if (targetTime < 0) return
  if (isSpotifySyncing) {
    window.api.spotifyRemoteSeek(targetTime)
  } else {
    window.api.seek(targetTime)
  }
}

function seekRelative(deltaSeconds) {
  const dur = ensureCurrentDuration()
  if (dur > 0) {
    const newTime = Math.max(0, Math.min(dur, currentPlaybackTime + deltaSeconds))
    currentPlaybackTime = newTime
    const pct = (newTime / dur) * 100
    updateProgressUI(pct)
    const elapsedEl = document.querySelector('.time-elapsed')
    if (elapsedEl) elapsedEl.innerText = formatTime(newTime)
    performSeek(newTime)
    showToast(deltaSeconds > 0 ? `⏩ +${deltaSeconds}s` : `⏪ ${deltaSeconds}s`)
  }
}

if (progressBarContainer) {
  progressBarContainer.addEventListener('mousedown', (e) => {
    isDraggingProgress = true
    seekToEvent(e)
  })

  progressBarContainer.addEventListener('click', (e) => {
    const targetTime = seekToEvent(e)
    performSeek(targetTime)
  })
}

if (window) window.addEventListener('mousemove', (e) => {
  if (isDraggingProgress) {
    seekToEvent(e)
  }
})

if (window) window.addEventListener('mouseup', (e) => {
  if (isDraggingProgress) {
    isDraggingProgress = false
    const targetTime = seekToEvent(e)
    performSeek(targetTime)
  }
})


// --- Custom Theme Builder Logic ---

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? 
    `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '25, 25, 25';
}

let currentThemeBg = '#0f0f0f'
let currentThemeText = '#ffffff'
let currentThemeAccent = '#39ff14'

let activeColorTarget = null;
const colorWheelPopover = document.getElementById('color-wheel-popover');
let colorPicker = null;

const themeName = document.getElementById('custom-theme-name')
const saveThemeBtn = document.getElementById('btn-save-theme')

function updateLivePreview() {
  const bgRgb = hexToRgb(currentThemeBg)
  const textRgb = hexToRgb(currentThemeText)
  
  document.documentElement.style.setProperty('--bg-color-rgb', bgRgb)
  document.documentElement.style.setProperty('--accent', currentThemeAccent)
  document.documentElement.style.setProperty('--text-main', `rgb(${textRgb})`)
}

document.querySelectorAll('.color-pill').forEach(pill => {
  pill.addEventListener('click', (e) => {
    e.stopPropagation();
    activeColorTarget = pill.getAttribute('data-target');
    
    let initialColor = '#ffffff';
    if (activeColorTarget === 'bg') initialColor = currentThemeBg;
    else if (activeColorTarget === 'text') initialColor = currentThemeText;
    else if (activeColorTarget === 'accent') initialColor = currentThemeAccent;
    
    colorWheelPopover.style.display = 'block';
    
    const rect = pill.getBoundingClientRect();
    const parentRect = pill.parentElement.getBoundingClientRect();
    colorWheelPopover.style.top = `${rect.bottom - parentRect.top + 8}px`;
    colorWheelPopover.style.left = `${rect.left - parentRect.left}px`;

    if (!colorPicker) {
      colorPicker = new iro.ColorPicker('#color-wheel-container', {
        width: 160,
        color: initialColor,
        borderWidth: 1,
        borderColor: "#333",
        layout: [
          { component: iro.ui.Wheel },
          { component: iro.ui.Slider, options: { sliderType: 'value' } }
        ]
      });
      
      colorPicker.on('color:change', function(color) {
        const hex = color.hexString;
        if (activeColorTarget === 'bg') {
          currentThemeBg = hex;
          document.getElementById('swatch-bg').style.background = hex;
        } else if (activeColorTarget === 'text') {
          currentThemeText = hex;
          document.getElementById('swatch-text').style.background = hex;
        } else if (activeColorTarget === 'accent') {
          currentThemeAccent = hex;
          document.getElementById('swatch-accent').style.background = hex;
        }
        updateLivePreview();
      });
    } else {
      colorPicker.color.hexString = initialColor;
    }
  });
});

if (document) document.addEventListener('click', (e) => {
  if (colorWheelPopover && colorWheelPopover.style.display === 'block') {
    if (!colorWheelPopover.contains(e.target)) {
      colorWheelPopover.style.display = 'none';
      activeColorTarget = null;
    }
  }
});

const btnShowBuilder = document.getElementById('btn-show-builder')
const btnCancelTheme = document.getElementById('btn-cancel-theme')
const themeBuilderEntry = document.getElementById('theme-builder-entry')
const themeBuilderForm = document.getElementById('theme-builder-form')

if (btnShowBuilder) btnShowBuilder.addEventListener('click', () => {
  themeBuilderEntry.style.display = 'none'
  themeBuilderForm.style.display = 'block'
})

if (btnCancelTheme) btnCancelTheme.addEventListener('click', () => {
  themeBuilderForm.style.display = 'none'
  themeBuilderEntry.style.display = 'flex'
})

function injectThemeCard(theme, isCustom = false) {
  const grid = document.querySelector('.theme-grid')
  const card = document.createElement('div')
  card.className = 'theme-card'
  card.setAttribute('data-color', theme.color)
  card.setAttribute('data-text', theme.text)
  card.setAttribute('data-accent', theme.accent)
  card.setAttribute('data-border', theme.border || 'rgba(255, 255, 255, 0.08)')
  
  let deleteBtnHtml = ''
  if (isCustom) {
    deleteBtnHtml = `<button class="delete-theme-btn" style="position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,0.5); border: none; color: #ff5f56; border-radius: 50%; width: 24px; height: 24px; font-size: 14px; cursor: pointer; display: none;">&times;</button>`
  }
  
  card.innerHTML = `
    <div class="theme-preview" style="background: rgb(${theme.color});">
      ${deleteBtnHtml}
      <div class="p-dot" style="background: ${theme.accent};"></div><div class="p-line" style="background: rgba(${theme.text}, 0.3);"></div>
      <div class="p-line-long" style="background: rgba(${theme.text}, 0.1);"></div>
      <div class="p-line-med" style="background: rgba(${theme.text}, 0.1);"></div>
    </div>
    <div class="theme-info"><span>${theme.name}</span><span class="badge">USER</span></div>
  `
  
  if (isCustom) {
    card.addEventListener('mouseenter', () => {
      card.querySelector('.delete-theme-btn').style.display = 'block'
    })
    card.addEventListener('mouseleave', () => {
      card.querySelector('.delete-theme-btn').style.display = 'none'
    })
    card.querySelector('.delete-theme-btn').addEventListener('click', async (e) => {
      e.stopPropagation()
      await window.api.deleteCustomTheme(theme.name)
      card.remove()
      // If deleted theme was active, fallback to first theme
      if (card.classList.contains('active')) {
        document.querySelector('.theme-card').click()
      }
    })
  }
  
  card.addEventListener('click', () => {
    document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('active'))
    card.classList.add('active')
    document.documentElement.style.setProperty('--bg-color-rgb', theme.color)
    document.documentElement.style.setProperty('--accent', theme.accent)
    document.documentElement.style.setProperty('--text-main', `rgb(${theme.text})`)
    document.documentElement.style.setProperty('--text-muted', `rgba(${theme.text}, 0.5)`)
    document.documentElement.style.setProperty('--border-color', theme.border || 'rgba(255, 255, 255, 0.08)')
    localStorage.setItem('activeThemeName', theme.name)
    broadcastThemeVars()
    if (theme.name.startsWith('GIF Adaptive')) updateGifAdaptiveTheme();
  })
  
  grid.appendChild(card)
}

// Inject Adaptive Themes
injectThemeCard({
  name: 'GIF Adaptive (Dark)',
  color: '20, 20, 20',
  text: '255, 255, 255',
  accent: '#4ade80',
  border: 'rgba(255, 255, 255, 0.2)'
}, false)

injectThemeCard({
  name: 'GIF Adaptive (Light)',
  color: '240, 240, 240',
  text: '20, 20, 20',
  accent: '#4ade80',
  border: 'rgba(0, 0, 0, 0.1)'
}, false)

if (saveThemeBtn) saveThemeBtn.addEventListener('click', async () => {
  const name = themeName.value.trim() || 'Custom Theme'
  const newTheme = {
    name,
    color: hexToRgb(currentThemeBg),
    text: hexToRgb(currentThemeText),
    accent: currentThemeAccent,
    border: 'rgba(255, 255, 255, 0.08)'
  }
  
  await window.api.saveCustomTheme(newTheme)
  injectThemeCard(newTheme, true)
  
  themeName.value = ''
  themeBuilderForm.style.display = 'none'
  themeBuilderEntry.style.display = 'flex'
  
  // Auto select the new theme
  const allCards = document.querySelectorAll('.theme-card')
  if (allCards.length > 0) {
    allCards[allCards.length - 1].click()
  }
})

// Load saved custom themes on startup
window.api.loadCustomThemes().then(themes => {
  themes.forEach(theme => injectThemeCard(theme, true))
  
  // Restore active theme UI state
  const activeName = localStorage.getItem('activeThemeName');
  if (activeName) {
    document.querySelectorAll('.theme-card').forEach(card => {
      const span = card.querySelector('.theme-info span:first-child');
      if (span && span.innerText === activeName) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });
  } else {
    // Default fallback to first theme
    const firstCard = document.querySelector('.theme-card');
    if (firstCard) firstCard.classList.add('active');
  }
})

// Custom GIF Settings Logic
const toggleCustomGif = document.getElementById('toggle-custom-gif');
const toggleGifBg = document.getElementById('toggle-gif-bg');
const customGifUrlInput = document.getElementById('custom-gif-url');
const customGifImg = document.getElementById('custom-gif-img');

let customGifSettings = JSON.parse(localStorage.getItem('customGifSettings')) || {
  enabled: false,
  showBackground: false,
  url: 'https://media.tenor.com/3_L-B_yvLuwAAAAi/run-mario.gif'
};

const defaultCdSvg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="%23181818" /><circle cx="50" cy="50" r="40" fill="none" stroke="%232a2a2a" stroke-width="2" /><circle cx="50" cy="50" r="32" fill="none" stroke="%232a2a2a" stroke-width="2" /><circle cx="50" cy="50" r="24" fill="none" stroke="%232a2a2a" stroke-width="2" /><circle cx="50" cy="50" r="16" fill="%23111" /><circle cx="50" cy="50" r="5" fill="%23333" /><path d="M50 2 A48 48 0 0 1 85 16 L50 50 Z" fill="rgba(255,255,255,0.05)" /><path d="M50 98 A48 48 0 0 1 15 84 L50 50 Z" fill="rgba(255,255,255,0.05)" /></svg>';

const customGifDetails = document.getElementById('custom-gif-details');
const customGifNameInput = document.getElementById('custom-gif-name');
const btnSaveGif = document.getElementById('btn-save-gif');

let savedCustomGifs = JSON.parse(localStorage.getItem('savedCustomGifs')) || [];

// Cleanup previously injected default GIFs
const defaultUrls = [
  'https://i.pinimg.com/originals/f6/75/cd/f675cd00632cd2ce6fc9526715f606a2.gif',
  'https://media.tenor.com/71G1f6Jb5S0AAAAC/cyberpunk-pixel-art.gif',
  'https://i.pinimg.com/originals/17/5c/49/175c4943dc4f3317dd4daab0e2bce430.gif',
  'https://i.pinimg.com/originals/5c/d5/43/5cd5432d665a399cebc57ed92fc63cf6.gif'
];
savedCustomGifs = savedCustomGifs.filter(gif => !defaultUrls.includes(gif.url));

const defaultDriveGifs = [
  { name: 'Evolving Universe', url: 'backgrounds/Evolving Universe.jpg' },
  { name: 'Fall Vibe', url: 'backgrounds/Fall.jpg' },
  { name: 'Discovery World', url: 'backgrounds/Discovery World.jpg' },
  { name: 'L Minimalist', url: 'backgrounds/L.jpg' },
  { name: 'Aesthetic Chill', url: 'backgrounds/wallpaper.jpg' },
  { name: 'Anime Scenery', url: 'backgrounds/Anime Scenery.jpg' }
];
defaultDriveGifs.forEach(def => {
  if (!savedCustomGifs.find(g => g.url === def.url)) {
    savedCustomGifs.unshift(def);
  }
});
localStorage.setItem('savedCustomGifs', JSON.stringify(savedCustomGifs));

function renderSavedGifsGrid() {
  const grid1 = document.getElementById('saved-gifs-grid');
  if (!grid1) return;
  grid1.innerHTML = '';
  
  savedCustomGifs.forEach((gif, index) => {
    const isActive = customGifSettings.url === gif.url;
    const card = document.createElement('div');
    card.className = `gif-card ${isActive ? 'active' : ''}`;
    card.innerHTML = `
      <div class="gif-preview">
        <img src="${gif.url}" style="width: 100%; height: auto; display: block;" />
        <div class="gif-select-box" style="position: absolute; top: 6px; left: 6px; width: 14px; height: 14px; border-radius: 3px; border: 2px solid ${isActive ? '#4ade80' : 'rgba(255,255,255,0.4)'}; background: ${isActive ? '#4ade80' : 'rgba(0,0,0,0.5)'}; display: flex; align-items: center; justify-content: center; transition: all 0.2s; z-index: 2;">
          ${isActive ? '<svg viewBox="0 0 24 24" width="10" height="10" fill="#000"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' : ''}
        </div>
      </div>
      <div class="gif-info">
        <span style="font-weight: 500; color: var(--text-main);">${gif.name}</span>
        <button class="icon-btn delete-gif-btn" style="color: #e06c75; font-size: 10px; padding: 2px;">✕</button>
      </div>
    `;
    
    card.onclick = () => {
      customGifSettings.url = gif.url;
      localStorage.setItem('customGifSettings', JSON.stringify(customGifSettings));
      applyCustomGifSettings();
      renderSavedGifsGrid();
    };
    
    card.querySelector('.delete-gif-btn').onclick = (e) => {
      e.stopPropagation();
      savedCustomGifs.splice(index, 1);
      localStorage.setItem('savedCustomGifs', JSON.stringify(savedCustomGifs));
      renderSavedGifsGrid();
    };
    
    grid1.appendChild(card);
  });
}

const customGifOverlay = document.querySelector('.custom-gif-overlay');
const customGifWrapper = document.querySelector('.custom-gif-wrapper');

const btnOpenGifPicker = document.getElementById('btn-open-gif-picker');
if (btnOpenGifPicker) {
  btnOpenGifPicker.addEventListener('click', () => {
    window.api.openGifWindow();
  });
}

window.api.onGifSelected((_, gif) => {
  if (!gif.url) {
    customGifSettings.url = '';
    customGifSettings.enabled = false;
    customGifSettings.showBackground = false;
    if (toggleCustomGif) toggleCustomGif.checked = false;
    if (toggleGifBg) toggleGifBg.checked = false;
  } else {
    customGifSettings.url = gif.url;
    customGifSettings.enabled = true;
    customGifSettings.showBackground = true;
    if (toggleCustomGif) toggleCustomGif.checked = true;
    if (toggleGifBg) toggleGifBg.checked = true;
  }
  localStorage.setItem('customGifSettings', JSON.stringify(customGifSettings));
  
  savedCustomGifs = JSON.parse(localStorage.getItem('savedCustomGifs')) || [];
  
  applyCustomGifSettings();
  renderSavedGifsGrid();
});

function applyCustomGifSettings() {
  if (customGifImg) customGifImg.style.display = 'block';
  
  if (customGifSettings.enabled) {
    if (toggleCustomGif) toggleCustomGif.checked = true;
    if (toggleGifBg) toggleGifBg.checked = !!customGifSettings.showBackground;
    if (customGifDetails) customGifDetails.style.display = 'block';
    if (customGifUrlInput) customGifUrlInput.value = customGifSettings.url;
    if (customGifImg) {
      customGifImg.src = customGifSettings.url;
      customGifImg.classList.remove('spin-cd');
    }
    if (customGifOverlay) customGifOverlay.style.borderRadius = '8px';

    const bgLayer = document.getElementById('bg-layer');
    if (customGifSettings.showBackground) {
      document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('active'))
      if (bgLayer) {
        bgLayer.style.backgroundImage = `url('${customGifSettings.url}')`;
        bgLayer.style.display = 'block';
      }
      document.body.style.backgroundImage = 'none';
      root.style.setProperty('--bg-blur', '0px');
      const brightnessContainer = document.getElementById('brightness-setting-container');
      if (brightnessContainer) brightnessContainer.style.display = 'flex';
      
      if (opacitySlider) {
        opacitySlider.min = 10;
      }
    } else {
      if (bgLayer) {
        bgLayer.style.backgroundImage = 'none';
        bgLayer.style.display = 'none';
      }
      document.body.style.backgroundImage = 'none';
      root.style.setProperty('--bg-blur', '25px');
      root.style.setProperty('--bg-brightness', '1');
      const brightnessContainer = document.getElementById('brightness-setting-container');
      if (brightnessContainer) brightnessContainer.style.display = 'none';
      if (opacitySlider) opacitySlider.min = 10;
    }
  } else {
    if (toggleCustomGif) toggleCustomGif.checked = false;
    if (customGifDetails) customGifDetails.style.display = 'none';
    if (customGifImg) {
      customGifImg.src = defaultCdSvg;
      customGifImg.classList.add('spin-cd');
    }
    if (customGifOverlay) customGifOverlay.style.borderRadius = '50%';
    const bgLayer = document.getElementById('bg-layer');
    if (bgLayer) {
      bgLayer.style.backgroundImage = 'none';
      bgLayer.style.display = 'none';
    }
    document.body.style.backgroundImage = 'none';
    root.style.setProperty('--bg-blur', '25px');
    root.style.setProperty('--bg-brightness', '1');
    const brightnessContainer = document.getElementById('brightness-setting-container');
    if (brightnessContainer) brightnessContainer.style.display = 'none';
    if (opacitySlider) opacitySlider.min = 10;
  }
  updateGifAdaptiveTheme();
}

if (toggleCustomGif) {
  toggleCustomGif.addEventListener('change', (e) => {
    customGifSettings.enabled = e.target.checked;
    if (!customGifSettings.url) customGifSettings.url = 'https://media.tenor.com/3_L-B_yvLuwAAAAi/run-mario.gif';
    localStorage.setItem('customGifSettings', JSON.stringify(customGifSettings));
    applyCustomGifSettings();
    if (customGifSettings.enabled) renderSavedGifsGrid();
  });
}

if (toggleGifBg) {
  toggleGifBg.addEventListener('change', (e) => {
    customGifSettings.showBackground = e.target.checked;
    localStorage.setItem('customGifSettings', JSON.stringify(customGifSettings));
    applyCustomGifSettings();
  });
}

if (customGifUrlInput) {
  customGifUrlInput.addEventListener('input', (e) => {
    customGifSettings.url = e.target.value.trim();
    localStorage.setItem('customGifSettings', JSON.stringify(customGifSettings));
    applyCustomGifSettings();
  });
}

function extractDominantColor(imgEl) {
  if (!imgEl) return;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = imgEl.naturalWidth || 50;
  canvas.height = imgEl.naturalHeight || 50;
  if(canvas.width === 0 || canvas.height === 0) return null;
  ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
  try {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < data.length; i += 16) {
      if (data[i+3] > 128) {
        r += data[i];
        g += data[i+1];
        b += data[i+2];
        count++;
      }
    }
    if (count === 0) return null;
    return { r: Math.floor(r/count), g: Math.floor(g/count), b: Math.floor(b/count) };
  } catch (e) {
    return null;
  }
}

function updateGifAdaptiveTheme() {
  const activeThemeName = localStorage.getItem('activeThemeName');
  if (!activeThemeName || !activeThemeName.startsWith('GIF Adaptive')) return;

  const color = extractDominantColor(customGifImg);
  if (!color) return;

  const { r, g, b } = color;
  
  if (activeThemeName === 'GIF Adaptive (Dark)') {
    const bgR = Math.floor(r * 0.15);
    const bgG = Math.floor(g * 0.15);
    const bgB = Math.floor(b * 0.15);
    
    document.documentElement.style.setProperty('--bg-color-rgb', `${bgR}, ${bgG}, ${bgB}`);
    document.documentElement.style.setProperty('--accent', `rgb(${r}, ${g}, ${b})`);
    document.documentElement.style.setProperty('--text-main', `rgb(255, 255, 255)`);
    document.documentElement.style.setProperty('--text-muted', `rgba(255, 255, 255, 0.5)`);
    document.documentElement.style.setProperty('--border-color', `rgba(${r}, ${g}, ${b}, 0.2)`);
  } else {
    // Light Mode
    const bgR = Math.floor(r + (255 - r) * 0.92);
    const bgG = Math.floor(g + (255 - g) * 0.92);
    const bgB = Math.floor(b + (255 - b) * 0.92);
    
    // Very dark text based on the dominant color
    const textR = Math.floor(r * 0.15);
    const textG = Math.floor(g * 0.15);
    const textB = Math.floor(b * 0.15);
    
    // Accent can be a slightly darkened version of the dominant color to ensure readability
    const accR = Math.floor(r * 0.8);
    const accG = Math.floor(g * 0.8);
    const accB = Math.floor(b * 0.8);

    document.documentElement.style.setProperty('--bg-color-rgb', `${bgR}, ${bgG}, ${bgB}`);
    document.documentElement.style.setProperty('--accent', `rgb(${accR}, ${accG}, ${accB})`);
    document.documentElement.style.setProperty('--text-main', `rgb(${textR}, ${textG}, ${textB})`);
    document.documentElement.style.setProperty('--text-muted', `rgba(${textR}, ${textG}, ${textB}, 0.6)`);
    document.documentElement.style.setProperty('--border-color', `rgba(${textR}, ${textG}, ${textB}, 0.15)`);
  }
  broadcastThemeVars()
}

function broadcastThemeVars() {
  const root = document.documentElement;
  localStorage.setItem('themeVars', JSON.stringify({
    bg: root.style.getPropertyValue('--bg-color-rgb') || '15, 15, 15',
    text: root.style.getPropertyValue('--text-main') || 'rgb(255, 255, 255)',
    muted: root.style.getPropertyValue('--text-muted') || 'rgba(255, 255, 255, 0.5)',
    accent: root.style.getPropertyValue('--accent') || '#39ff14',
    border: root.style.getPropertyValue('--border-color') || 'rgba(255,255,255,0.1)'
  }));
}

// Ensure customGifImg has listener only if it exists
if (customGifImg) {
  customGifImg.addEventListener('load', updateGifAdaptiveTheme);
}

if (btnSaveGif && customGifNameInput && customGifUrlInput) {
  btnSaveGif.addEventListener('click', () => {
    const name = customGifNameInput.value.trim() || 'My GIF';
    const url = customGifUrlInput.value.trim();
    if (url) {
      savedCustomGifs.push({ name, url });
      localStorage.setItem('savedCustomGifs', JSON.stringify(savedCustomGifs));
      
      customGifSettings.url = url;
      localStorage.setItem('customGifSettings', JSON.stringify(customGifSettings));
      
      customGifNameInput.value = '';
      customGifUrlInput.value = '';
      applyCustomGifSettings();
      renderSavedGifsGrid();
    }
  });
}

// Initial Render
applyCustomGifSettings();
if (customGifSettings.enabled) renderSavedGifsGrid();

// Cross-window localStorage sync using IPC
const originalSetItem = localStorage.setItem;
localStorage.setItem = function(key, value) {
  originalSetItem.apply(this, arguments);
  if (window.api && window.api.syncSettings) {
    window.api.syncSettings({ key, value });
  }
};

if (window.api && window.api.onSettingsSynced) {
  window.api.onSettingsSynced((event, { key, value }) => {
    originalSetItem.call(localStorage, key, value);
    // Manually dispatch storage event since it doesn't fire for same-window changes
    const ev = new StorageEvent('storage', {
      key: key,
      newValue: value
    });
    window.dispatchEvent(ev);
  });
}
