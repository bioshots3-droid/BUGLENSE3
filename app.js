/* ============================================================
   BugLens — App Logic
   ============================================================ */

'use strict';

// ── State ──────────────────────────────────────────────────────
const state = {
  currentImage: null,   // base64
  currentResult: null,
  history: [],
  stream: null,
};

// ── DOM refs ───────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const captureIdle    = $('captureIdle');
const previewWrap    = $('previewWrap');
const previewImg     = $('previewImg');
const scanLine       = $('scanLine');
const videoStream    = $('videoStream');
const snapCanvas     = $('snapCanvas');
const actionBar      = $('actionBar');
const cameraControls = $('cameraControls');
const cameraBtn      = $('cameraBtn');
const uploadBtn      = $('uploadBtn');
const identifyBtn    = $('identifyBtn');
const fileInput      = $('fileInput');
const clearBtn       = $('clearBtn');
const snapBtn        = $('snapBtn');
const cancelCamBtn   = $('cancelCamBtn');
const historyBtn     = $('historyBtn');
const loadingOverlay = $('loadingOverlay');
const resultPanel    = $('resultPanel');
const resultImg      = $('resultImg');
const resultBody     = $('resultBody');
const backBtn        = $('backBtn');
const saveBtn        = $('saveBtn');
const historyPanel   = $('historyPanel');
const historyBackBtn = $('historyBackBtn');
const clearHistoryBtn= $('clearHistoryBtn');
const historyList    = $('historyList');

// ── Init ───────────────────────────────────────────────────────
function init() {
  loadHistory();
  setupListeners();
  setupPWAInstall();
  // Cycle loading bug emojis
  const bugs = ['🦋','🐝','🦗','🐞','🦟','🐛','🦎','🪲'];
  let bi = 0;
  setInterval(() => {
    const el = document.querySelector('.loading-bug');
    if (el) el.textContent = bugs[bi++ % bugs.length];
  }, 800);
}

// ── Event Listeners ────────────────────────────────────────────
function setupListeners() {
  cameraBtn.addEventListener('click', openCamera);
  uploadBtn.addEventListener('click', () => {
    fileInput.removeAttribute('capture');
    fileInput.click();
  });
  fileInput.addEventListener('change', handleFileSelect);
  clearBtn.addEventListener('click', clearImage);
  snapBtn.addEventListener('click', takeSnapshot);
  cancelCamBtn.addEventListener('click', stopCamera);
  identifyBtn.addEventListener('click', identify);
  backBtn.addEventListener('click', closeResult);
  saveBtn.addEventListener('click', saveToHistory);
  historyBtn.addEventListener('click', openHistory);
  historyBackBtn.addEventListener('click', closeHistory);
  clearHistoryBtn.addEventListener('click', clearHistory);
}

// ── Camera ─────────────────────────────────────────────────────
async function openCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false
    });
    state.stream = stream;
    videoStream.srcObject = stream;
    videoStream.style.display = 'block';
    captureIdle.style.display = 'none';
    previewWrap.style.display = 'none';
    actionBar.style.display = 'none';
    cameraControls.style.display = 'flex';
  } catch (err) {
    alert('Camera access denied. Please allow camera permissions or use the gallery upload.');
    console.error(err);
  }
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
  }
  videoStream.style.display = 'none';
  videoStream.srcObject = null;
  actionBar.style.display = 'flex';
  cameraControls.style.display = 'none';
  if (!state.currentImage) captureIdle.style.display = 'flex';
}

function takeSnapshot() {
  const vw = videoStream.videoWidth;
  const vh = videoStream.videoHeight;
  snapCanvas.width = vw;
  snapCanvas.height = vh;
  const ctx = snapCanvas.getContext('2d');
  ctx.drawImage(videoStream, 0, 0, vw, vh);
  const dataUrl = snapCanvas.toDataURL('image/jpeg', 0.85);
  setImage(dataUrl);
  stopCamera();
}

// ── File Upload ────────────────────────────────────────────────
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    resizeImage(ev.target.result, 1024, (resized) => {
      setImage(resized);
    });
  };
  reader.readAsDataURL(file);
  setTimeout(() => { fileInput.value = ''; }, 500);
}

// ── Image Resize ───────────────────────────────────────────────
function resizeImage(dataUrl, maxSize, callback) {
  const img = new Image();
  img.onload = () => {
    let w = img.width, h = img.height;
    if (w > maxSize || h > maxSize) {
      if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
      else        { w = Math.round(w * maxSize / h); h = maxSize; }
    }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    callback(canvas.toDataURL('image/jpeg', 0.82));
  };
  img.src = dataUrl;
}

// ── Image State ────────────────────────────────────────────────
function setImage(dataUrl) {
  state.currentImage = dataUrl;
  previewImg.src = dataUrl;
  captureIdle.style.display = 'none';
  previewWrap.style.display = 'block';
  actionBar.style.display = 'flex';
  cameraControls.style.display = 'none';
  uploadBtn.style.display = 'none';
  cameraBtn.style.display = 'none';
  identifyBtn.style.display = 'flex';
}

function clearImage() {
  state.currentImage = null;
  previewImg.src = '';
  previewWrap.style.display = 'none';
  captureIdle.style.display = 'flex';
  uploadBtn.style.display = 'flex';
  cameraBtn.style.display = 'flex';
  identifyBtn.style.display = 'none';
  scanLine.classList.remove('active');
}

// ── Identify ───────────────────────────────────────────────────
async function identify() {
  if (!state.currentImage) return;

  showLoading(true);
  scanLine.classList.add('active');

  try {
    const base64 = state.currentImage.split(',')[1];
    const mediaType = state.currentImage.split(';')[0].split(':')[1];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 }
            },
            {
              type: 'text',
              text: `You are an expert entomologist. Identify the insect or arthropod in this image.
Respond ONLY in valid JSON with no markdown, no backticks, no extra text — just raw JSON.
Use exactly this structure:
{
  "commonName": "Common name",
  "scientificName": "Genus species",
  "order": "Order name",
  "family": "Family name",
  "confidence": 85,
  "conservationStatus": "Not Evaluated",
  "habitat": "Brief habitat description",
  "size": "Approximate size range",
  "diet": "What it eats",
  "lifespan": "Typical lifespan",
  "distribution": "Geographic range",
  "description": "2-3 sentences about key features and interesting facts",
  "dangerLevel": "Harmless",
  "tags": ["tag1", "tag2", "tag3"]
}
Rules: confidence is 0-100. dangerLevel must be one of: Harmless, Mild sting, Venomous, Dangerous.
If no insect is visible, set commonName to "Not an insect", scientificName to "N/A", confidence to 0.`
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error('API error:', response.status, errData);
      throw new Error(`API error ${response.status}: ${errData?.error?.message || 'Unknown'}`);
    }

    const data = await response.json();
    if (!data.content || !data.content.length) throw new Error('Empty response from API');
    const rawText = data.content.map(b => b.type === 'text' ? b.text : '').join('');
    const clean = rawText.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);
    state.currentResult = result;
    showResult(result, state.currentImage);

  } catch (err) {
    console.error(err);
    showResultError();
  } finally {
    showLoading(false);
    scanLine.classList.remove('active');
  }
}

// ── Result Panel ───────────────────────────────────────────────
function showResult(r, imageDataUrl) {
  resultImg.src = imageDataUrl;

  const confColor = r.confidence >= 80 ? '#4dff7c' : r.confidence >= 50 ? '#ffd166' : '#ff6b6b';
  const dangerColors = {
    'Harmless': '#4dff7c',
    'Mild sting': '#ffd166',
    'Venomous': '#ff9a3c',
    'Dangerous': '#ff6b6b'
  };
  const dangerColor = dangerColors[r.dangerLevel] || '#4dff7c';

  const tagsHtml = (r.tags || []).map(t => `<span class="tag accent">${t}</span>`).join('');

  resultBody.innerHTML = `
    <div class="result-species">
      <div class="result-species-name">${r.commonName}</div>
      <div class="result-scientific">${r.scientificName}</div>
      <div class="result-confidence">
        Confidence
        <div class="conf-bar"><div class="conf-fill" style="width:0%;background:${confColor}" data-target="${r.confidence}"></div></div>
        ${r.confidence}%
      </div>
    </div>

    <div class="result-tags">
      <span class="tag">${r.order || ''}</span>
      <span class="tag">${r.family || ''}</span>
      <span class="tag" style="border-color:${dangerColor};color:${dangerColor}">${r.dangerLevel || 'Unknown'}</span>
      ${tagsHtml}
    </div>

    <div class="result-section">
      <div class="result-section-title">About</div>
      <p>${r.description || 'No description available.'}</p>
    </div>

    <div class="result-facts">
      <div class="fact-card">
        <div class="fact-label">Size</div>
        <div class="fact-value">${r.size || '—'}</div>
      </div>
      <div class="fact-card">
        <div class="fact-label">Diet</div>
        <div class="fact-value">${r.diet || '—'}</div>
      </div>
      <div class="fact-card">
        <div class="fact-label">Lifespan</div>
        <div class="fact-value">${r.lifespan || '—'}</div>
      </div>
      <div class="fact-card">
        <div class="fact-label">Status</div>
        <div class="fact-value">${r.conservationStatus || '—'}</div>
      </div>
    </div>

    <div class="result-section" style="margin-top:16px">
      <div class="result-section-title">Distribution</div>
      <p>${r.distribution || 'Unknown'}</p>
    </div>

    <div class="result-section">
      <div class="result-section-title">Habitat</div>
      <p>${r.habitat || 'Unknown'}</p>
    </div>
  `;

  resultPanel.style.display = 'flex';

  // Animate confidence bar
  setTimeout(() => {
    const fill = resultBody.querySelector('.conf-fill');
    if (fill) fill.style.width = fill.dataset.target + '%';
  }, 100);
}

function showResultError() {
  resultImg.src = state.currentImage || '';
  resultBody.innerHTML = `
    <div class="result-error">
      <div class="err-icon">🔍</div>
      <h3>Couldn't Identify</h3>
      <p>The image may be unclear, too far away, or not showing an insect. Try a closer, clearer photo with good lighting.</p>
    </div>
  `;
  resultPanel.style.display = 'flex';
}

function closeResult() {
  resultPanel.style.display = 'none';
}

// ── History ────────────────────────────────────────────────────
function saveToHistory() {
  if (!state.currentResult || !state.currentImage) return;
  const entry = {
    id: Date.now(),
    result: state.currentResult,
    image: state.currentImage,
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  };
  state.history.unshift(entry);
  // Keep only 30 entries (images are large)
  if (state.history.length > 30) state.history = state.history.slice(0, 30);
  persistHistory();
  saveBtn.textContent = '✓ Saved';
  setTimeout(() => saveBtn.textContent = 'Save', 2000);
}

function loadHistory() {
  try {
    const raw = localStorage.getItem('buglens_history');
    state.history = raw ? JSON.parse(raw) : [];
  } catch { state.history = []; }
}

function persistHistory() {
  try {
    localStorage.setItem('buglens_history', JSON.stringify(state.history));
  } catch (e) {
    console.warn('Storage full, trimming history');
    state.history = state.history.slice(0, 10);
    try { localStorage.setItem('buglens_history', JSON.stringify(state.history)); } catch {}
  }
}

function openHistory() {
  renderHistoryList();
  historyPanel.style.display = 'flex';
}

function closeHistory() {
  historyPanel.style.display = 'none';
}

function clearHistory() {
  if (!confirm('Clear all sightings?')) return;
  state.history = [];
  persistHistory();
  renderHistoryList();
}

function renderHistoryList() {
  if (!state.history.length) {
    historyList.innerHTML = `
      <div class="history-empty">
        <span class="empty-icon">🔬</span>
        No sightings yet. Go identify some insects!
      </div>`;
    return;
  }
  historyList.innerHTML = state.history.map(entry => `
    <div class="history-item" data-id="${entry.id}">
      <img class="history-thumb" src="${entry.image}" alt="" onerror="this.style.display='none'" />
      <div class="history-info">
        <div class="history-name">${entry.result.commonName}</div>
        <div class="history-sci">${entry.result.scientificName}</div>
        <div class="history-date">${entry.date}</div>
      </div>
    </div>
  `).join('');

  historyList.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = parseInt(el.dataset.id);
      const entry = state.history.find(h => h.id === id);
      if (!entry) return;
      state.currentResult = entry.result;
      state.currentImage = entry.image;
      closeHistory();
      showResult(entry.result, entry.image);
    });
  });
}

// ── Loading ────────────────────────────────────────────────────
function showLoading(show) {
  loadingOverlay.style.display = show ? 'flex' : 'none';
}

// ── PWA Install ────────────────────────────────────────────────
function setupPWAInstall() {
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner(deferredPrompt);
  });
}

function showInstallBanner(prompt) {
  // Don't show if already installed or dismissed
  if (localStorage.getItem('buglens_install_dismissed')) return;

  const banner = document.createElement('div');
  banner.className = 'install-banner';
  banner.innerHTML = `
    <div class="install-text">
      <strong>Add BugLens to Home Screen</strong>
      <span>Install for offline access &amp; camera shortcuts</span>
    </div>
    <button class="install-btn" id="installAccept">Install</button>
    <button class="install-dismiss" id="installDismiss">✕</button>
  `;
  document.body.appendChild(banner);

  banner.querySelector('#installAccept').addEventListener('click', async () => {
    banner.remove();
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') localStorage.setItem('buglens_installed', '1');
  });

  banner.querySelector('#installDismiss').addEventListener('click', () => {
    banner.remove();
    localStorage.setItem('buglens_install_dismissed', '1');
  });
}

// ── Service Worker ─────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ── Boot ───────────────────────────────────────────────────────
init();
