const recordBtn = document.getElementById('recordBtn');
const status = document.getElementById('status');
const timer = document.getElementById('timer');
const toggleTheme = document.getElementById('toggleTheme');
const listeningAnimation = document.getElementById('listening-animation');

// Views
const listeningView = document.getElementById('listening-view');
const resultsView = document.getElementById('results-view');
const historyView = document.getElementById('history-view');
const songResult = document.getElementById('song-result');
const historyList = document.getElementById('history-list');
const emptyHistory = document.getElementById('empty-history');

// Navigation
const historyBtn = document.getElementById('historyBtn');
const backToListening = document.getElementById('backToListening');
const backFromHistory = document.getElementById('backFromHistory');
const clearHistoryBtn = document.getElementById('clearHistoryBtn'); // Add this line

// Mini Player
const miniPlayer = document.getElementById('mini-player');
const miniPlayerImg = document.getElementById('mini-player-img');
const miniPlayerTitle = document.getElementById('mini-player-title');
const miniPlayerArtist = document.getElementById('mini-player-artist');
const miniPlayerPlay = document.getElementById('mini-player-play');

// App State
let mediaRecorder;
let audioChunks = [];
let recordingStartTime;
let timerInterval;
let searchHistory = JSON.parse(localStorage.getItem('searchHistory')) || [];
let isRecording = false;
let currentSong = null;
let audioContext = null;
let audioAnalyser = null;

// Initialize app
function initApp() {
  // Load saved theme
  if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark');
    toggleTheme.innerHTML = '<i class="fas fa-sun"></i>';
  }
  
  // Debug and repair history data
  try {
    // Try to load search history
    const storedHistory = localStorage.getItem('searchHistory');
    if (storedHistory) {
      searchHistory = JSON.parse(storedHistory);
      
      // Check if history needs repair (add missing timestamps)
      let needsRepair = false;
      searchHistory.forEach(song => {
        if (!song.timestamp) {
          song.timestamp = new Date().toISOString();
          needsRepair = true;
        }
      });
      
      // Save repaired history if needed
      if (needsRepair) {
        localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
      }
      
      console.log("History loaded, found", searchHistory.length, "items");
    } else {
      searchHistory = [];
      console.log("No history found in localStorage");
    }
  } catch (e) {
    console.error("Error loading history:", e);
    searchHistory = [];
    localStorage.setItem('searchHistory', JSON.stringify([]));
  }

  // Set up event listeners
  recordBtn.addEventListener('click', handleRecordClick);
  toggleTheme.addEventListener('click', toggleDarkMode);
  historyBtn.addEventListener('click', showHistoryView);
  backToListening.addEventListener('click', showListeningView);
  backFromHistory.addEventListener('click', showListeningView);
  miniPlayerPlay.addEventListener('click', handleMiniPlayerClick);
  clearHistoryBtn.addEventListener('click', clearSearchHistory);
  
  // Set up history tab filters
  setupHistoryTabs();
  
  // Set up history search
  setupHistorySearch();
  
  // Render history list if any
  renderSearchHistory();
}

// View Navigation
function showListeningView() {
  listeningView.classList.add('active-view');
  resultsView.classList.remove('active-view');
  historyView.classList.remove('active-view');
}

function showResultsView() {
  listeningView.classList.remove('active-view');
  resultsView.classList.add('active-view');
  historyView.classList.remove('active-view');
}

function showHistoryView() {
  listeningView.classList.remove('active-view');
  resultsView.classList.remove('active-view');
  historyView.classList.add('active-view');
  renderSearchHistory();
}

// Theme Toggle
function toggleDarkMode() {
  document.body.classList.toggle('dark');
  if (document.body.classList.contains('dark')) {
    toggleTheme.innerHTML = '<i class="fas fa-sun"></i>';
    localStorage.setItem('theme', 'dark');
  } else {
    toggleTheme.innerHTML = '<i class="fas fa-moon"></i>';
    localStorage.setItem('theme', 'light');
  }
}

// Recording Functionality
function handleRecordClick() {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

async function startRecording() {
  try {
    // Request microphone access
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Setup media recorder
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    isRecording = true;
    
    // Update UI for recording state
    recordBtn.classList.add('recording');
    listeningAnimation.classList.add('active');
    status.textContent = 'শুনছি...';
    timer.classList.add('visible');
    
    // Setup timer
    recordingStartTime = Date.now();
    timer.textContent = '00:00';
    clearInterval(timerInterval);
    timerInterval = setInterval(updateTimer, 1000);
    
    // Setup audio processing
    setupAudioAnalysis(stream);
    
    // Setup media recorder events
    mediaRecorder.ondataavailable = event => {
      audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      await recognizeSong(audioBlob);
    };

    // Start recording
    mediaRecorder.start();
    
  } catch (err) {
    console.error("Error accessing microphone:", err);
    status.textContent = 'মাইক্রোফোন অ্যাক্সেস করতে সমস্যা হচ্ছে';
  }
}

function stopRecording() {
  if (!mediaRecorder) return;
  
  mediaRecorder.stop();
  isRecording = false;
  
  // Update UI back to non-recording state
  recordBtn.classList.remove('recording');
  listeningAnimation.classList.remove('active');
  status.textContent = 'গান খোঁজা হচ্ছে...';
  clearInterval(timerInterval);
  
  // Stop all audio tracks
  if (mediaRecorder.stream) {
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
  }
  
  // Close audio context
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close();
  }
}

// Audio Analysis for Visualization
function setupAudioAnalysis(stream) {
  // Close previous AudioContext if it exists
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close();
  }
  
  // Create new AudioContext
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioContext.createMediaStreamSource(stream);
  audioAnalyser = audioContext.createAnalyser();
  audioAnalyser.fftSize = 256;
  source.connect(audioAnalyser);
  
  // Start visualization
  visualizeAudio();
}

function visualizeAudio() {
  if (!audioAnalyser || !isRecording) return;
  
  const bufferLength = audioAnalyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  audioAnalyser.getByteFrequencyData(dataArray);
  
  // Calculate average volume level to adjust animation
  let sum = 0;
  for (let i = 0; i < bufferLength; i++) {
    sum += dataArray[i];
  }
  const average = sum / bufferLength;
  
  // Update animation based on volume
  const bars = document.querySelectorAll('.equalizer-container .bar');
  bars.forEach(bar => {
    const scale = 1 + (average / 128);
    bar.style.transform = `scaleY(${Math.min(scale, 2.5)})`;
  });
  
  if (isRecording) {
    requestAnimationFrame(visualizeAudio);
  }
}

// Update timer display
function updateTimer() {
  const elapsedSeconds = Math.floor((Date.now() - recordingStartTime) / 1000);
  const minutes = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
  const seconds = (elapsedSeconds % 60).toString().padStart(2, '0');
  timer.textContent = `${minutes}:${seconds}`;
}

// Song Recognition
async function recognizeSong(audioBlob) {
  const formData = new FormData();
  formData.append('api_token', '451c9bace577382844cb195ec45b387f');
  formData.append('file', audioBlob);
  formData.append('return', 'apple_music,spotify,youtube');  // Ensure youtube is requested

  try {
    // Show loading state
    songResult.innerHTML = `
      <div class="loading-container">
        <div class="loading-spinner"></div>
        <p class="loading-text">গান খোঁজা হচ্ছে...</p>
      </div>
    `;
    showResultsView();
    
    // Make API request
    const response = await fetch('https://api.audd.io/', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();
    console.log("API Response:", data); // Log the full response for debugging
    
    if (data.status === 'success' && data.result) {
      const { artist, title, album, release_date } = data.result;
      
      // Get album artwork from Spotify or Apple Music, or use placeholder
      const albumArt = data.result.spotify?.album?.images?.[0]?.url || 
                      data.result.apple_music?.artwork?.url?.replace('{w}', '300').replace('{h}', '300') || 
                      'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22300%22%20height%3D%22300%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22300%22%20height%3D%22300%22%20fill%3D%22%23EEEEEE%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2220%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20fill%3D%22%23999999%22%3ENo%20Image%3C%2Ftext%3E%3C%2Fsvg%3E';
      
      // Get streaming links - make sure to handle all possible response formats
      let spotifyLink = null;
      let appleLink = null;
      let youtubeLink = null;
      
      // Extract Spotify link
      if (data.result.spotify && data.result.spotify.external_urls) {
        spotifyLink = data.result.spotify.external_urls.spotify;
      }
      
      // Extract Apple Music link
      if (data.result.apple_music) {
        appleLink = data.result.apple_music.url;
      }
      
      // Extract YouTube link - handle various possible response formats
      if (data.result.youtube) {
        if (typeof data.result.youtube === 'string') {
          youtubeLink = data.result.youtube;
        } else if (data.result.youtube.url) {
          youtubeLink = data.result.youtube.url;
        } else if (data.result.youtube.link) {
          youtubeLink = data.result.youtube.link;
        }
      }
      
      // Fallback to song_link if no specific platform links are available
      if (!spotifyLink && !appleLink && !youtubeLink && data.result.song_link) {
        youtubeLink = `https://www.youtube.com/results?search_query=${encodeURIComponent(title + ' ' + artist)}`;
      }
      
      console.log("YouTube Link:", youtubeLink); // Log YouTube link for debugging
      
      // Store current song
      currentSong = {
        title,
        artist,
        album,
        albumArt,
        spotifyLink,
        appleLink,
        youtubeLink,
        timestamp: new Date().toISOString()
      };
      
      // Update UI with song details - put YouTube first and make sure it's visible
      songResult.innerHTML = `
        <div class="song-artwork">
          <img src="${albumArt}" alt="${title}" />
        </div>
        
        <div class="song-info">
          <h3 class="song-title">${title}</h3>
          <p class="song-artist">${artist}</p>
          ${album ? `<p class="song-album">${album} ${release_date ? `• ${release_date.split('-')[0]}` : ''}</p>` : ''}
        </div>
        
        <div class="streaming-links">
          ${youtubeLink ? `<a href="${youtubeLink}" target="_blank" class="streaming-link youtube"><i class="fab fa-youtube"></i> YouTube</a>` : 
            `<a href="https://www.youtube.com/results?search_query=${encodeURIComponent(title + ' ' + artist)}" target="_blank" class="streaming-link youtube"><i class="fab fa-youtube"></i>YouTube</a>`}
          ${spotifyLink ? `<a href="${spotifyLink}" target="_blank" class="streaming-link spotify"><i class="fab fa-spotify"></i> Spotify</a>` : ''}
          ${appleLink ? `<a href="${appleLink}" target="_blank" class="streaming-link apple"><i class="fab fa-apple"></i> Apple Music</a>` : ''}
        </div>
        
        <button class="share-btn">
          <i class="fas fa-share-alt"></i> শেয়ার করুন
        </button>
      `;
      
      // Show mini player
      updateMiniPlayer(currentSong);
      
      // Add to history
      addToSearchHistory(currentSong);
      
      // Add event listener to share button
      document.querySelector('.share-btn').addEventListener('click', () => {
        shareSong(currentSong);
      });
      
    } else {
      // No song found, but still provide a YouTube search option
      songResult.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-music-slash"></i>
          <h3>গান শনাক্ত করা যায়নি</h3>
          <p>দুঃখিত, আমরা আপনার অডিও সম্পর্কে কোন তথ্য খুঁজে পাইনি।</p>
 
          <button class="share-btn" id="tryAgainBtn">
             আবার চেষ্টা করুন
          </button>
        </div>
      `;
      
      // Add try again button handler
      document.getElementById('tryAgainBtn').addEventListener('click', () => {
        showListeningView();
      });
    }
    
  } catch (err) {
    console.error('Error recognizing song:', err);
    
    // Show error message with YouTube link
    songResult.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-exclamation-triangle"></i>
        <h3>একটি ত্রুটি ঘটেছে</h3>
        <p>দুঃখিত, গান চেনার সময় একটি ত্রুটি দেখা দিয়েছে। আবার চেষ্টা করুন।</p>

        <button class="share-btn" id="tryAgainBtn">
          </i> আবার চেষ্টা করুন
        </button>
      </div>
    `;
    
    // Add try again button handler
    document.getElementById('tryAgainBtn').addEventListener('click', () => {
      showListeningView();
    });
    
  } finally {
    status.textContent = '';
    timer.classList.remove('visible');
  }
}

// Mini Player
function updateMiniPlayer(song) {
  if (!song) return;
  
  miniPlayerImg.src = song.albumArt;
  miniPlayerTitle.textContent = song.title;
  miniPlayerArtist.textContent = song.artist;
  
  miniPlayer.classList.remove('hidden');
}

function handleMiniPlayerClick() {
  if (currentSong) {
    // Navigate to results view and show current song
    showResultsView();
  }
}

// Search History Management
function addToSearchHistory(song) {
  // Make sure timestamp exists
  if (!song.timestamp) {
    song.timestamp = new Date().toISOString();
  }
  
  // Check if song is already in history
  const existingIndex = searchHistory.findIndex(item => 
    item.title === song.title && item.artist === song.artist
  );
  
  if (existingIndex !== -1) {
    // Remove existing entry
    searchHistory.splice(existingIndex, 1);
  }
  
  // Add song to beginning of history
  searchHistory.unshift(song);
  
  // Limit history to 20 items
  if (searchHistory.length > 20) {
    searchHistory.pop();
  }
  
  // Save to localStorage
  localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
}

function renderSearchHistory() {
  if (searchHistory.length === 0) {
    historyList.innerHTML = '';
    emptyHistory.classList.remove('hidden');
    return;
  }
  
  emptyHistory.classList.add('hidden');
  
  // Get current active filter
  const activeFilter = document.querySelector('.history-tab.active')?.dataset.filter || 'all';
  const searchTerm = document.getElementById('historySearch')?.value || '';
  
  // Apply filtering
  filterHistory(activeFilter, searchTerm);
}

// Remove the duplicate initApp function around line 700
// Keep only one version of setupHistoryTabs, setupHistorySearch, and filterHistory functions

// Update the history filtering functions to be simpler:

function setupHistoryTabs() {
  const historyTabs = document.querySelectorAll('.history-tab');
  
  historyTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Update active tab
      historyTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Apply filter
      const filter = tab.dataset.filter;
      filterHistory(filter);
    });
  });
}

function setupHistorySearch() {
  const searchInput = document.getElementById('historySearch');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const activeFilter = document.querySelector('.history-tab.active').dataset.filter;
      filterHistory(activeFilter, searchInput.value);
    });
  }
}

function filterHistory(filter, searchTerm = '') {
  // If no history, render the empty state
  if (!searchHistory || searchHistory.length === 0) {
    historyList.innerHTML = '';
    emptyHistory.classList.remove('hidden');
    return;
  }
  
  emptyHistory.classList.add('hidden');
  
  // Filter by date first
  let filteredHistory = [...searchHistory]; 
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay()); 
  
  if (filter === 'today') {
    filteredHistory = filteredHistory.filter(song => {
      if (!song.timestamp) return false;
      const songDate = new Date(song.timestamp);
      return songDate >= today;
    });
  } else if (filter === 'week') {
    filteredHistory = filteredHistory.filter(song => {
      if (!song.timestamp) return false;
      const songDate = new Date(song.timestamp);
      return songDate >= weekStart;
    });
  }
  
  // Then apply search term if provided
  if (searchTerm && searchTerm.trim() !== '') {
    const term = searchTerm.toLowerCase();
    filteredHistory = filteredHistory.filter(song => 
      (song.title && song.title.toLowerCase().includes(term)) || 
      (song.artist && song.artist.toLowerCase().includes(term))
    );
  }
  
  // Render filtered results
  renderFilteredHistory(filteredHistory);
}

function renderFilteredHistory(filteredHistory) {
  if (!filteredHistory || filteredHistory.length === 0) {
    // Show empty state with appropriate message
    historyList.innerHTML = `
      <div class="empty-filter-state">
        <i class="fas fa-search"></i>
        <p>কোন গান পাওয়া যায়নি</p>
      </div>
    `;
    return;
  }
  
  // Clear previous history items
  historyList.innerHTML = '';
  
  // Render filtered history items
  filteredHistory.forEach(song => {
    // Handle missing album art
    const albumArt = song.albumArt || 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22300%22%20height%3D%22300%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22300%22%20height%3D%22300%22%20fill%3D%22%23EEEEEE%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2220%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20fill%3D%22%23999999%22%3ENo%20Image%3C%2Ftext%3E%3C%2Fsvg%3E';
    
    // Format date
    let dateText = 'অজানা সময়';
    if (song.timestamp) {
      const songDate = new Date(song.timestamp);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      if (songDate.toDateString() === today.toDateString()) {
        dateText = 'আজ';
      } else if (songDate.toDateString() === yesterday.toDateString()) {
        dateText = 'গতকাল';
      } else {
        dateText = songDate.toLocaleDateString('bn-BD', { year: 'numeric', month: 'short', day: 'numeric' });
      }
    }
    
    const historyItem = document.createElement('div');
    historyItem.classList.add('history-item');
    historyItem.innerHTML = `
      <div class="history-item-img">
        <img src="${albumArt}" alt="${song.title}" onerror="this.src='data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22300%22%20height%3D%22300%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22300%22%20height%3D%22300%22%20fill%3D%22%23EEEEEE%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2220%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20fill%3D%22%23999999%22%3ENo%20Image%3C%2Ftext%3E%3C%2Fsvg%3E'">
      </div>
      <div class="history-item-info">
        <p class="history-item-title">${song.title}</p>
        <p class="history-item-artist">${song.artist}</p>
        <p class="history-item-date">${dateText}</p>
      </div>
    `;
    
    // Add click handler
    historyItem.addEventListener('click', () => {
      currentSong = song;
      updateMiniPlayer(song);
      showResultsView();
      
      // Show song details in the results view
      songResult.innerHTML = `
        <div class="song-artwork">
          <img src="${albumArt}" alt="${song.title}" onerror="this.src='data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22300%22%20height%3D%22300%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22300%22%20height%3D%22300%22%20fill%3D%22%23EEEEEE%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2220%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20fill%3D%22%23999999%22%3ENo%20Image%3C%2Ftext%3E%3C%2Fsvg%3E'">
        </div>
        
        <div class="song-info">
          <h3 class="song-title">${song.title}</h3>
          <p class="song-artist">${song.artist}</p>
          ${song.album ? `<p class="song-album">${song.album}</p>` : ''}
        </div>
        
        <div class="streaming-links">
          ${song.youtubeLink ? `<a href="${song.youtubeLink}" target="_blank" class="streaming-link youtube"><i class="fab fa-youtube"></i> YouTube</a>` : 
            `<a href="https://www.youtube.com/results?search_query=${encodeURIComponent(song.title + ' ' + song.artist)}" target="_blank" class="streaming-link youtube"><i class="fab fa-youtube"></i> YouTube</a>`}
          ${song.spotifyLink ? `<a href="${song.spotifyLink}" target="_blank" class="streaming-link spotify"><i class="fab fa-spotify"></i> Spotify</a>` : ''}
          ${song.appleLink ? `<a href="${song.appleLink}" target="_blank" class="streaming-link apple"><i class="fab fa-apple"></i> Apple Music</a>` : ''}
        </div>
        
        <button class="share-btn">
          <i class="fas fa-share-alt"></i> শেয়ার করুন
        </button>
      `;
      
      // Add event listener to share button
      const shareBtn = songResult.querySelector('.share-btn');
      if (shareBtn) {
        shareBtn.addEventListener('click', () => {
          shareSong(song);
        });
      }
    });
    
    historyList.appendChild(historyItem);
  });
}

// Add the missing function for clearing history and properly close all functions

// Add this function for clearing search history
function clearSearchHistory() {
  // Show confirmation dialog
  if (confirm('আপনি কি নিশ্চিত যে আপনি সমস্ত ইতিহাস মুছতে চান?')) {
    // Clear history array
    searchHistory = [];
    
    // Update local storage
    localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
    
    // Re-render empty history view
    renderSearchHistory();
    
    // Hide mini player if visible
    miniPlayer.classList.add('hidden');
  }
}

// Add this function for sharing songs
function shareSong(song) {
  if (!song) return;
  
  const text = `${song.title} by ${song.artist} - Found with SurDetect`;
  
  // Check if Web Share API is supported
  if (navigator.share) {
    navigator.share({
      title: 'SurDetect - Song Discovery',
      text: text,
      url: song.youtubeLink || song.spotifyLink || window.location.href
    })
    .catch(err => {
      console.error('Error sharing:', err);
      fallbackShare(text);
    });
  } else {
    fallbackShare(text);
  }
}

// Fallback sharing method
function fallbackShare(text) {
  // Create a temporary input to copy the text
  const input = document.createElement('input');
  input.value = text;
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  document.body.removeChild(input);
  
  // Show a confirmation message
  alert('টেক্সট কপি করা হয়েছে, আপনি এখন এটি শেয়ার করতে পারেন।');
}

// Complete the renderFilteredHistory function that was cut off
function renderFilteredHistory(filteredHistory) {
  if (!filteredHistory || filteredHistory.length === 0) {
    // Show empty state with appropriate message
    historyList.innerHTML = `
      <div class="empty-filter-state">
        <i class="fas fa-search"></i>
        <p>কোন গান পাওয়া যায়নি</p>
      </div>
    `;
    return;
  }
  
  // Clear previous history items
  historyList.innerHTML = '';
  
  // Render filtered history items
  filteredHistory.forEach(song => {
    // Handle missing album art
    const albumArt = song.albumArt || 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22300%22%20height%3D%22300%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22300%22%20height%3D%22300%22%20fill%3D%22%23EEEEEE%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2220%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20fill%3D%22%23999999%22%3ENo%20Image%3C%2Ftext%3E%3C%2Fsvg%3E';
    
    // Format date
    let dateText = 'অজানা সময়';
    if (song.timestamp) {
      const songDate = new Date(song.timestamp);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      if (songDate.toDateString() === today.toDateString()) {
        dateText = 'আজ';
      } else if (songDate.toDateString() === yesterday.toDateString()) {
        dateText = 'গতকাল';
      } else {
        dateText = songDate.toLocaleDateString('bn-BD', { year: 'numeric', month: 'short', day: 'numeric' });
      }
    }
    
    const historyItem = document.createElement('div');
    historyItem.classList.add('history-item');
    historyItem.innerHTML = `
      <div class="history-item-img">
        <img src="${albumArt}" alt="${song.title}" onerror="this.src='data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22300%22%20height%3D%22300%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22300%22%20height%3D%22300%22%20fill%3D%22%23EEEEEE%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2220%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20fill%3D%22%23999999%22%3ENo%20Image%3C%2Ftext%3E%3C%2Fsvg%3E'">
      </div>
      <div class="history-item-info">
        <p class="history-item-title">${song.title}</p>
        <p class="history-item-artist">${song.artist}</p>
        <p class="history-item-date">${dateText}</p>
      </div>
    `;
    
    // Add click handler
    historyItem.addEventListener('click', () => {
      currentSong = song;
      updateMiniPlayer(song);
      showResultsView();
      
      // Show song details in the results view
      songResult.innerHTML = `
        <div class="song-artwork">
          <img src="${albumArt}" alt="${song.title}" onerror="this.src='data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22300%22%20height%3D%22300%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22300%22%20height%3D%22300%22%20fill%3D%22%23EEEEEE%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2220%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20fill%3D%22%23999999%22%3ENo%20Image%3C%2Ftext%3E%3C%2Fsvg%3E'">
        </div>
        
        <div class="song-info">
          <h3 class="song-title">${song.title}</h3>
          <p class="song-artist">${song.artist}</p>
          ${song.album ? `<p class="song-album">${song.album}</p>` : ''}
        </div>
        
        <div class="streaming-links">
          ${song.youtubeLink ? `<a href="${song.youtubeLink}" target="_blank" class="streaming-link youtube"><i class="fab fa-youtube"></i> YouTube</a>` : 
            `<a href="https://www.youtube.com/results?search_query=${encodeURIComponent(song.title + ' ' + song.artist)}" target="_blank" class="streaming-link youtube"><i class="fab fa-youtube"></i> YouTube</a>`}
          ${song.spotifyLink ? `<a href="${song.spotifyLink}" target="_blank" class="streaming-link spotify"><i class="fab fa-spotify"></i> Spotify</a>` : ''}
          ${song.appleLink ? `<a href="${song.appleLink}" target="_blank" class="streaming-link apple"><i class="fab fa-apple"></i> Apple Music</a>` : ''}
        </div>
        
        <button class="share-btn">
          <i class="fas fa-share-alt"></i> শেয়ার করুন
        </button>
      `;
      
      // Add event listener to share button
      const shareBtn = songResult.querySelector('.share-btn');
      if (shareBtn) {
        shareBtn.addEventListener('click', () => {
          shareSong(song);
        });
      }
    });
    
    historyList.appendChild(historyItem);
  });
}

// Initialize the app when the document is loaded
document.addEventListener('DOMContentLoaded', initApp);
