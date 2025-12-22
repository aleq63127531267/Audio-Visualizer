import { AudioEngine } from './audio.js';
import { drawBars, invalidateBarsCache } from './visualizers/bars.js';
import { drawCircle, invalidateCircleCache } from './visualizers/circle.js';
import { drawCircleLinear, invalidateCircleLinearCache } from './visualizers/circle-linear.js';
import { drawParticles, scaleParticles, setParticleCount, setParticleSize } from './visualizers/particles.js';
import { drawProximityDots, scaleProximityNodes, setNodeSize, setLineWeight, setIntensity } from './visualizers/proximityDots.js';
import { drawFlash } from './visualizers/flash.js';
import { drawCrystalWall } from './visualizers/crystalWall.js';

const canvas = document.getElementById('visualizer-canvas');
const ctx = canvas.getContext('2d');
const fileInput = document.getElementById('audio-upload');
const soundModal = document.getElementById('sound-modal');
const btnCustomAudio = document.getElementById('btn-custom-audio');
const btnBuiltinAudio = document.getElementById('btn-builtin-audio');
const btnCancelSound = document.getElementById('btn-cancel-sound');
const sourceChoice = document.getElementById('source-choice');
const builtinSelection = document.getElementById('built-in-selection');
const builtinList = document.getElementById('built-in-list');
const btnBackToSource = document.getElementById('btn-back-to-source');

const alertModal = document.getElementById('alert-modal');
const alertMessage = document.getElementById('alert-message');
const btnAlertOk = document.getElementById('btn-alert-ok');
const labelDetail = document.getElementById('label-detail');

const fileNameDisplay = document.getElementById('file-name');
const playBtn = document.getElementById('btn-play');
const pauseBtn = document.getElementById('btn-pause');
const stopBtn = document.getElementById('btn-stop');
const testBtn = document.getElementById('btn-test');
const btnLoop = document.getElementById('btn-loop');
const vizSelect = document.getElementById('viz-select');
const seekBar = document.getElementById('seek-bar');
const timeCurrent = document.getElementById('time-current');
const timeDuration = document.getElementById('time-total'); // Note: ID changed in HTML? Let me check previous HTML edit.
// In Step 402 HTML Edit: <span id="time-total">0:00</span>.
// Previous main.js (Step 407 Line 18) was: const timeDuration = document.getElementById('time-duration');
// But HTML had id="time-duration" before Step 402?
// Step 402 Diff:
// -          <span id="time-duration">0:00</span>
// +          <span id="time-total">0:00</span>
// So I changed HTML ID to time-total.
// So I must update the JS selector to 'time-total'.

// Resize logic
function resize() {
  const stage = document.getElementById('viz-stage');
  if (!stage) return; // Guard for test/init

  const newW = stage.clientWidth;
  const newH = stage.clientHeight;
  const oldW = canvas.width;
  const oldH = canvas.height;

  canvas.width = newW;
  canvas.height = newH;

  // Scale particles for each layer that has particle state
  layers.forEach(layer => {
    if (layer.type === 'particles' && layer.vizState?.particles) {
      scaleParticles(oldW, oldH, newW, newH, layer);
    }
    if (layer.type === 'proximityDots' && layer.vizState?.nodes) {
      scaleProximityNodes(oldW, oldH, newW, newH, layer);
    }
  });


  // Invalidate gradient caches on resize
  invalidateBarsCache();
  invalidateCircleCache();
  invalidateCircleLinearCache();
}
window.addEventListener('resize', resize);
// Call resize after DOM load ensures stage is sized?
requestAnimationFrame(resize); // Defer slightly or call immediately
// resize(); // call immediately too
setTimeout(resize, 0);

const audioEngine = new AudioEngine();
const btnTogglePanel = document.getElementById('btn-toggle-panel');
const sidePanel = document.getElementById('side-panel');
const btnAddViz = document.getElementById('btn-add-viz');
const btnSelectAll = document.getElementById('btn-select-all');
const btnSelectAllRecs = document.getElementById('btn-select-all-recs');
const layersList = document.getElementById('layers-list');

// Layer State
// Layer State
let layers = [
  {
    id: 'layer-' + Date.now(),
    type: 'bars',
    visible: true,
    opacity: 1.0,
    locked: false,
    selected: false, // Add selected state
    fftSize: 2048,
    // Per-layer color settings
    colors: {
      mode: 'gradient-freq',
      stops: [
        { offset: 0, color: '#00ffff' },
        { offset: 100, color: '#ff00ff' }
      ]
    }
  }
];

// Ensure initial layer has sortedStops if needed
if (layers[0].colors) {
  layers[0].colors.sortedStops = [...layers[0].colors.stops].sort((a, b) => a.offset - b.offset);
}



// Mic Controls
const btnMicToggle = document.getElementById('btn-mic-toggle');
const micSelect = document.getElementById('mic-select');
const btnRecordMic = document.getElementById('btn-record-mic');
const recordingsList = document.getElementById('recordings-list');

// Recording State
let isRecording = false;
let mediaRecorder = null;
let recordedChunks = [];
let recordings = []; // { id, url, name, blob }

let animationId;
let isSeeking = false;
let countdownInterval; // Global to allow clearing on exit
let wasSidePanelOpen = false; // Track side panel state
let lastSelectedLayerIndex = -1; // For range selection
let lastSelectedRecIndex = -1; // For range selection

const detailLevels = {
  1: 'Very Low',
  2: 'Low',
  3: 'Med',
  4: 'High',
  5: 'Ultra',
  6: 'Max'
};

const builtInTracks = [
  { name: 'Chill Beats', url: '/audio/chill beats.mp3' },
  { name: 'Odd Ambience', url: '/audio/odd ambience.mp3' },
  { name: 'Peaceful Soundtrack', url: '/audio/peaceful soundtrack.mp3' }
];

// Visualizer Map
const visualizers = {
  'bars': drawBars,
  'circle': drawCircle,
  'circle-linear': drawCircleLinear,
  'particles': drawParticles,
  'proximityDots': drawProximityDots,
  'flash': drawFlash,
  'crystalWall': drawCrystalWall
};

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}



// Layer Management

// Side Panel Elements
const btnLayerDeleteMode = document.getElementById('btn-layer-delete-mode');
const btnRecDeleteMode = document.getElementById('btn-rec-delete-mode');

// Mode States
let isLayerDeleteMode = false;
let isRecDeleteMode = false;

// ...

// Layer Management

function moveLayer(index, direction) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= layers.length) return;
  const temp = layers[index];
  layers[index] = layers[targetIndex];
  layers[targetIndex] = temp;
  renderLayersList();
}

btnLayerDeleteMode.addEventListener('click', () => {
  if (isLayerDeleteMode) {
    // Toggle Off - Check for deletion
    const toDelete = layers.filter(l => l.markedForDelete);
    if (toDelete.length > 0) {
      if (confirm(`Delete ${toDelete.length} selected layers?`)) {
        toDelete.forEach(l => removeLayer(l.id));
      }
      // Clear marks
      layers.forEach(l => l.markedForDelete = false);
    }
    isLayerDeleteMode = false;
    btnLayerDeleteMode.classList.remove('delete-active');
  } else {
    // Toggle On
    isLayerDeleteMode = true;
    btnLayerDeleteMode.classList.add('delete-active');
    // Clear selection to avoid confusion? Or keep it.
    // Let's keep selection but delete mode overrides click interaction
  }
  renderLayersList();
});

function renderLayersList() {
  layersList.innerHTML = '';
  const displayLayers = layers.map((l, i) => ({ layer: l, index: i })).reverse();

  displayLayers.forEach(({ layer, index }) => {
    const item = document.createElement('div');
    item.className = 'layer-item';
    item.draggable = true; // Enable dragging

    // Drag Handle
    const dragHandle = document.createElement('div');
    dragHandle.className = 'drag-handle';
    dragHandle.textContent = '⠿';
    item.appendChild(dragHandle);

    // Classes
    if (layer.selected) item.classList.add('selected');
    if (layer.markedForDelete) item.classList.add('marked');

    // Click Handler (Mode Dependent)
    item.addEventListener('click', (e) => {
      // Ignore controls and the title itself to allow double-clicks/editing
      if (
        e.target.tagName === 'BUTTON' ||
        e.target.tagName === 'SELECT' ||
        e.target.tagName === 'INPUT' ||
        e.target.classList.contains('layer-title') ||
        e.target.isContentEditable
      ) return;


      if (isLayerDeleteMode) {
        layer.markedForDelete = !layer.markedForDelete;
        renderLayersList();
      } else {
        // Clear recordings selection when selecting layers
        recordings.forEach(r => r.selected = false);
        renderRecordingsList();

        const isCtrl = e.ctrlKey || e.metaKey;
        const isShift = e.shiftKey;

        if (isShift && lastSelectedLayerIndex !== -1) {
          // Range selection
          const start = Math.min(index, lastSelectedLayerIndex);
          const end = Math.max(index, lastSelectedLayerIndex);
          layers.forEach((l, i) => {
            if (i >= start && i <= end) l.selected = true;
          });
        } else if (isCtrl) {
          // Toggle
          layer.selected = !layer.selected;
        } else {
          // Single
          layers.forEach(l => l.selected = false);
          layer.selected = true;
        }

        if (layer.selected) lastSelectedLayerIndex = index;
        else lastSelectedLayerIndex = -1;

        // Update currentViz and settings visibility if a layer is selected
        const anySelected = layers.find(l => l.selected);
        if (anySelected) {
          currentViz = anySelected.type;
          if (!settingsPanel.classList.contains('hidden')) {
            updateSettingsVisibility();
          }
        }

        updateUI();
        renderLayersList();
      }
    });

    // Drag and Drop Events
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', index);
      item.classList.add('dragging');
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      // Remove all drop-over classes just in case
      document.querySelectorAll('.layer-item').forEach(el => el.classList.remove('drop-over'));
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      item.classList.add('drop-over');
    });

    item.addEventListener('dragleave', () => {
      item.classList.remove('drop-over');
    });

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      item.classList.remove('drop-over');
      const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
      if (fromIndex !== index) {
        // Move layer in array
        const movedLayer = layers.splice(fromIndex, 1)[0];
        layers.splice(index, 0, movedLayer);
        renderLayersList();
      }
    });

    // Header
    const header = document.createElement('div');
    header.className = 'layer-header';

    const title = document.createElement('div');
    title.className = 'layer-title';
    title.id = `title-${layer.id}`; // Add ID to fix form field warning

    // Name + Assigned File
    let label = `Layer ${index + 1}: ${layer.type}`;
    if (layer.customName) label = layer.customName; // Logic for custom name
    if (layer.audioName) label += ` (${layer.audioName})`;

    title.textContent = label;

    // Helper function to enable editing
    let isCanceling = false;
    const enableEditing = () => {
      isCanceling = false;
      title.contentEditable = 'true';
      title.focus();
      // Select all text for easy replacement
      setTimeout(() => {
        if (!title.contentEditable || isCanceling) return;
        // Check if element is still in DOM
        if (!document.body.contains(title)) return;

        try {
          const sel = window.getSelection();
          sel.removeAllRanges();
          const range = document.createRange();
          range.selectNodeContents(title);
          sel.addRange(range);
        } catch (err) {
          console.warn("Selection error:", err);
          // Fallback selection method
          try {
            window.getSelection().selectAllChildren(title);
          } catch (e2) { }
        }
      }, 50); // Increased delay slightly
    };


    // Rename Logic - Double-click
    title.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      enableEditing();
    });

    title.addEventListener('blur', () => {
      if (isCanceling) {
        isCanceling = false;
        return;
      }
      title.contentEditable = 'false';
      // Extract just the name part (before any parentheses with file info)
      let newName = title.textContent.trim();
      // Remove any file info that might have been in the display
      const parenIndex = newName.lastIndexOf(' (');
      if (parenIndex > 0 && layer.audioName && newName.endsWith(')')) {
        newName = newName.substring(0, parenIndex);
      }
      layer.customName = newName || null;
      renderLayersList();
    });

    title.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        title.blur();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        isCanceling = true;
        title.contentEditable = 'false';
        renderLayersList(); // Discard changes
      }
    });

    const controls = document.createElement('div');
    controls.className = 'layer-controls';

    // Rename Button
    const btnRename = document.createElement('button');
    btnRename.className = 'icon-btn';
    btnRename.textContent = '✏️';
    btnRename.title = 'Rename layer';
    btnRename.onclick = (e) => {
      e.stopPropagation();
      enableEditing();
    };

    // Move Up
    const btnUp = document.createElement('button');
    btnUp.className = 'icon-btn';
    btnUp.textContent = '↑';
    if (index === layers.length - 1) btnUp.disabled = true;
    btnUp.onclick = () => moveLayer(index, 1);

    // Move Down
    const btnDown = document.createElement('button');
    btnDown.className = 'icon-btn';
    btnDown.textContent = '↓';
    if (index === 0) btnDown.disabled = true;
    btnDown.onclick = () => moveLayer(index, -1);

    // Toggle Visibility
    const btnVis = document.createElement('button');
    btnVis.className = 'icon-btn';
    btnVis.textContent = layer.visible ? '👁' : 'Ø';
    btnVis.onclick = () => {
      layer.visible = !layer.visible;
      renderLayersList();
    };

    // Removed individual btnDel

    controls.appendChild(btnRename);
    controls.appendChild(btnUp);
    controls.appendChild(btnDown);
    controls.appendChild(btnVis);
    header.appendChild(title);
    header.appendChild(controls);


    // Settings
    const settings = document.createElement('div');
    settings.className = 'layer-settings';

    // If in delete mode, maybe hide settings to reduce clutter/clicks?
    if (isLayerDeleteMode) {
      settings.style.opacity = '0.3';
      settings.style.pointerEvents = 'none';
    }

    const typeSel = document.createElement('select');
    Object.keys(visualizers).forEach(key => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = key;
      if (key === layer.type) opt.selected = true;
      typeSel.appendChild(opt);
    });
    typeSel.onchange = (e) => {
      layer.type = e.target.value;
      // Update currentViz if this is a selected layer
      if (layer.selected) {
        currentViz = layer.type;
        // Update settings panel if it's open
        if (!settingsPanel.classList.contains('hidden')) {
          updateSettingsVisibility();
        }
      }
      renderLayersList();
    };

    const opacityInput = document.createElement('input');
    opacityInput.type = 'range';
    opacityInput.min = 0;
    opacityInput.max = 1;
    opacityInput.step = 0.1;
    opacityInput.value = layer.opacity;
    opacityInput.oninput = (e) => {
      layer.opacity = parseFloat(e.target.value);
    };

    settings.appendChild(typeSel);
    settings.appendChild(opacityInput);

    item.appendChild(header);
    item.appendChild(settings);
    layersList.appendChild(item);
  });
}

function addLayer() {
  layers.push({
    id: 'layer-' + Date.now(),
    type: 'bars', // Default
    visible: true,
    opacity: 1.0,
    selected: false,
    fftSize: 2048,
    colors: JSON.parse(JSON.stringify(vizColors)) // Deep copy global defaults
  });
  renderLayersList();
}



function removeLayer(id) {
  if (layers.length <= 1) return;

  const layerToRemove = layers.find(l => l.id === id);
  if (layerToRemove && layerToRemove.audio) {
    layerToRemove.audio.pause();
    if (layerToRemove.source) layerToRemove.source.disconnect();
    if (layerToRemove.analyser) layerToRemove.analyser.disconnect();
  }

  layers = layers.filter(l => l.id !== id);
  renderLayersList();
}

// Side Panel Events
btnTogglePanel.addEventListener('click', () => {
  sidePanel.classList.toggle('hidden');
});

btnAddViz.addEventListener('click', addLayer);

btnSelectAll.addEventListener('click', () => {
  // Deselect all recordings first for mutual exclusivity
  recordings.forEach(r => r.selected = false);
  renderRecordingsList();

  const allSelected = layers.every(l => l.selected);
  layers.forEach(l => l.selected = !allSelected);
  updateUI();
  renderLayersList();
});


// Sound Modal Logic
function openSoundModal() {
  const selectedLayers = layers.filter(l => l.selected);
  if (selectedLayers.length === 0) {
    showAlert('Please select a layer to assign audio to.');
    return;
  }
  soundModal.classList.add('active');
  resetModalView();
}

function closeSoundModal() {
  soundModal.classList.remove('active');
}

function resetModalView() {
  sourceChoice.style.display = 'flex';
  builtinSelection.style.display = 'none';
}

btnCustomAudio.addEventListener('click', () => {
  fileInput.click();
  closeSoundModal();
});

btnBuiltinAudio.addEventListener('click', () => {
  sourceChoice.style.display = 'none';
  builtinSelection.style.display = 'block';
  renderBuiltinTracks();
});

btnCancelSound.addEventListener('click', closeSoundModal);
btnBackToSource.addEventListener('click', resetModalView);

function renderBuiltinTracks() {
  builtinList.innerHTML = '';
  builtInTracks.forEach(track => {
    const item = document.createElement('div');
    item.className = 'track-item';
    item.textContent = track.name;
    item.onclick = () => {
      assignBuiltinTrack(track);
      closeSoundModal();
    };
    builtinList.appendChild(item);
  });
}

async function assignBuiltinTrack(track) {
  const selectedLayers = layers.filter(l => l.selected);
  for (const layer of selectedLayers) {
    await loadAudioToLayer(layer, track.url, track.name);
  }
  renderLayersList();
}

// Logic extracted from fileInput listener for reuse
async function loadAudioToLayer(layer, url, name) {
  try {
    if (layer.audio) {
      layer.audio.pause();
      layer.audio.src = '';
    }
    if (layer.source) try { layer.source.disconnect(); } catch (e) { }
    if (layer.analyser) try { layer.analyser.disconnect(); } catch (e) { }

    await audioEngine.init();
    const actx = audioEngine.audioContext;
    if (actx.state === 'suspended') await actx.resume();

    const audio = new Audio(url);
    audio.loop = btnLoop.classList.contains('active');

    await new Promise((resolve, reject) => {
      audio.addEventListener('canplaythrough', resolve, { once: true });
      audio.addEventListener('error', reject, { once: true });
      audio.load();
    });

    const source = actx.createMediaElementSource(audio);
    const analyser = actx.createAnalyser();
    analyser.fftSize = layer.fftSize || 2048;

    source.connect(analyser);
    analyser.connect(actx.destination);

    layer.audio = audio;
    layer.source = source;
    layer.analyser = analyser;
    layer.dataArray = new Uint8Array(analyser.frequencyBinCount);
    layer.audioName = name;
    layer.fileUrl = url;
  } catch (err) {
    console.error(`Error loading audio for layer ${layer.id}:`, err);
  }
}

// UI Event Listeners
// Intercept direct fileInput click to show modal
// NOTE: We change the UI to a "Choose Audio" button that triggers the modal
const originalUploadBtn = document.querySelector('input[type="file"]#audio-upload');
// Create a proxy button instead
const proxyBtn = document.createElement('button');
proxyBtn.textContent = 'Choose Audio';
proxyBtn.id = 'btn-choose-audio';
proxyBtn.onclick = openSoundModal;
originalUploadBtn.parentNode.insertBefore(proxyBtn, originalUploadBtn);
originalUploadBtn.style.display = 'none';

fileInput.addEventListener('change', async (e) => {
  if (e.target.files.length > 0) {
    const file = e.target.files[0];
    const selectedLayers = layers.filter(l => l.selected);
    const fileUrl = URL.createObjectURL(file);

    for (const layer of selectedLayers) {
      await loadAudioToLayer(layer, fileUrl, file.name);
    }

    fileNameDisplay.textContent = file.name;
    currentMainFileName = file.name;
    renderLayersList();
    e.target.value = '';
  }
});


// Event listeners moved below to avoid duplication (see lines 605+)

const btnColors = document.getElementById('btn-colors');
const btnRecord = document.getElementById('btn-record');
const colorPanel = document.getElementById('color-panel');
const btnCloseColors = document.getElementById('btn-close-colors');
const countdownOverlay = document.getElementById('countdown-overlay');
const exitHint = document.getElementById('exit-hint'); // Should be there from HTML update

// New Color DOM
const colorModeSelect = document.getElementById('color-mode');
const colorStopsContainer = document.getElementById('color-stops-container');
const btnAddStop = document.getElementById('btn-add-stop');
const previewCanvas = document.getElementById('gradient-preview');
const previewCtx = previewCanvas.getContext('2d');


// Color State with pre-sorted stops for performance
let vizColors = {
  mode: 'gradient-freq',
  stops: [
    { offset: 0, color: '#ff0000' },
    { offset: 100, color: '#ffff00' }
  ],
  sortedStops: [],
  multiGradients: [
    { start: 0, end: 50, stops: [{ offset: 0, color: '#ff0000' }, { offset: 100, color: '#0000ff' }] },
    { start: 50, end: 100, stops: [{ offset: 0, color: '#00ff00' }, { offset: 100, color: '#ffff00' }] }
  ]
};


// Current visualizer type (for settings visibility)
let currentViz = 'bars';



// ... (resize, throttle, AudioEngine)

// Mic Logic
btnMicToggle.addEventListener('click', async () => {
  if (audioEngine.isMicActive) {
    audioEngine.stopMic();
    btnMicToggle.textContent = '🎤 Mic: OFF';
    btnMicToggle.classList.remove('active');
    // Stop recording if active
    if (isRecording) {
      stopRecording();
    }
  } else {
    await audioEngine.startMic();
    if (audioEngine.isMicActive) {
      btnMicToggle.textContent = '🎤 Mic: ON';
      btnMicToggle.classList.add('active');
    }
  }
});

// Recording Logic
function startRecording() {
  if (!audioEngine.micStream) {
    showAlert('No microphone stream active.');
    return;
  }

  recordedChunks = [];
  try {
    mediaRecorder = new MediaRecorder(audioEngine.micStream);
  } catch (e) {
    console.error('MediaRecorder error:', e);
    return;
  }

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: 'audio/webm' });
    const url = URL.createObjectURL(blob);
    const id = 'rec-' + Date.now();
    const name = `Recording ${recordings.length + 1}`;

    recordings.push({ id, url, name, blob });
    renderRecordingsList();

    btnRecordMic.textContent = '● Rec';
    btnRecordMic.classList.remove('recording');
    isRecording = false;
  };

  mediaRecorder.start();
  isRecording = true;
  btnRecordMic.textContent = '■ Stop';
  btnRecordMic.classList.add('recording');
}

function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    // Turn off mic by default after recording stops
    if (audioEngine.isMicActive) {
      audioEngine.stopMic();
      btnMicToggle.textContent = '🎤 Mic: OFF';
      btnMicToggle.classList.remove('active');
    }
  }
}

btnRecordMic.addEventListener('click', async () => {
  if (isRecording) {
    stopRecording();
  } else {
    // Ensure Mic is on
    if (!audioEngine.isMicActive) {
      await audioEngine.startMic();
      if (audioEngine.isMicActive) {
        btnMicToggle.textContent = '🎤 Mic: ON';
        btnMicToggle.classList.add('active');
      } else {
        return; // Failed to start mic
      }
    }
    startRecording();
  }
});

// Multi-Track Logic
function assignRecordingToLayer(recUrl, recName) {
  const selectedLayers = layers.filter(l => l.selected);
  if (selectedLayers.length === 0) {
    showAlert('Please select a layer to assign this recording to.');
    return;
  }

  selectedLayers.forEach(async (layer) => {
    try {
      // Cleanup existing audio resources properly (Fix #9)
      if (layer.audio) {
        layer.audio.pause();
        layer.audio.src = ''; // Release media element
      }
      if (layer.source) {
        try { layer.source.disconnect(); } catch (e) { /* already disconnected */ }
      }
      if (layer.analyser) {
        try { layer.analyser.disconnect(); } catch (e) { /* already disconnected */ }
      }

      // Setup new audio graph
      const audio = new Audio(recUrl);
      audio.loop = btnLoop.classList.contains('active');


      // We need the audio context
      const actx = audioEngine.audioContext;
      if (!actx) {
        throw new Error('Audio context not initialized');
      }

      // Resume if needed
      if (actx.state === 'suspended') {
        await actx.resume();
      }

      const source = actx.createMediaElementSource(audio);
      const analyser = actx.createAnalyser();
      analyser.fftSize = 2048;

      // Connect
      source.connect(analyser);
      analyser.connect(actx.destination);

      // Store in layer
      layer.audio = audio;
      layer.source = source;
      layer.analyser = analyser;
      layer.dataArray = new Uint8Array(analyser.frequencyBinCount);
      layer.audioName = recName;

      // Play with error handling (Fix #10)
      await audio.play();
      console.log(`Assigned ${recName} to Layer ${layer.id}`);
    } catch (error) {
      console.error(`Error assigning ${recName} to layer:`, error);
      showAlert(`Failed to play audio: ${error.message}`);
    }
  });

  renderLayersList();
}

// Context-Aware Helpers
function getSelectedLayerWithAudio() {
  return layers.find(l => l.selected && l.audio);
}

// State
let currentMainFileName = 'No file loaded';

function updateUI() {
  const selectedLayers = layers.filter(l => l.selected);
  const selectedRecs = recordings.filter(r => r.selected);

  // Update Select All Buttons State
  const allLayersSelected = layers.length > 0 && layers.every(l => l.selected);
  if (btnSelectAll) btnSelectAll.textContent = allLayersSelected ? '☑' : '☐';

  const allRecsSelected = recordings.length > 0 && recordings.every(r => r.selected);
  if (btnSelectAllRecs) btnSelectAllRecs.textContent = allRecsSelected ? '☑' : '☐';

  if (selectedLayers.length === 1) {
    // Single Layer Selected
    const layer = selectedLayers[0];
    if (layer.audio && !isNaN(layer.audio.duration)) {
      timeDuration.textContent = formatTime(layer.audio.duration);
      timeCurrent.textContent = formatTime(layer.audio.currentTime);
      if (!isSeeking) {
        seekBar.max = layer.audio.duration;
        seekBar.value = layer.audio.currentTime;
      }
    } else {
      timeDuration.textContent = '0:00';
      timeCurrent.textContent = '0:00';
      seekBar.value = 0;
    }
    const safeLayerName = layer.customName || layer.type;
    const safeFileName = layer.audioName || 'No Audio';
    fileNameDisplay.textContent = `${safeLayerName} (${safeFileName})`;
  } else if (selectedLayers.length > 1) {
    // Multiple Layers Selected
    timeDuration.textContent = '--:--';
    timeCurrent.textContent = '--:--';
    fileNameDisplay.textContent = 'Multiple Layers Selected';
    seekBar.value = 0;
  } else if (selectedRecs.length === 1) {
    // Single Recording Selected
    const rec = selectedRecs[0];
    if (rec.audio && !isNaN(rec.audio.duration)) {
      timeDuration.textContent = formatTime(rec.audio.duration);
      timeCurrent.textContent = formatTime(rec.audio.currentTime);
      if (!isSeeking) {
        seekBar.max = rec.audio.duration;
        seekBar.value = rec.audio.currentTime;
      }
    }
    fileNameDisplay.textContent = `${rec.name} (Recording)`;
  } else if (selectedRecs.length > 1) {
    // Multiple Recordings Selected
    timeDuration.textContent = '--:--';
    timeCurrent.textContent = '--:--';
    fileNameDisplay.textContent = 'Multiple Recordings Selected';
    seekBar.value = 0;
  } else if (audioEngine.audioBuffer) {
    // Global Audio
    const duration = audioEngine.duration;
    const current = audioEngine.currentTime;
    timeDuration.textContent = formatTime(duration);
    timeCurrent.textContent = formatTime(current);
    fileNameDisplay.textContent = currentMainFileName;
    if (!isSeeking) {
      seekBar.max = duration;
      seekBar.value = current;
    }
  } else {
    // Nothing Selected / Default
    timeDuration.textContent = '0:00';
    timeCurrent.textContent = '0:00';
    fileNameDisplay.textContent = 'No file loaded';
    seekBar.value = 0;
  }
}

// Controls
playBtn.addEventListener('click', () => {
  const layer = getSelectedLayerWithAudio();
  if (layer) {
    layer.audio.play();
  } else {
    if (audioEngine.audioBuffer) {
      audioEngine.play();
    } else {
      const hasAnyAudio = layers.some(l => l.audio) || audioEngine.audioBuffer;
      if (!hasAnyAudio) {
        showAlert("Please upload a file first.");
        return;
      }
      fileInput.click();
    }
  }
});

pauseBtn.addEventListener('click', () => {
  const layer = getSelectedLayerWithAudio();
  if (layer) {
    layer.audio.pause();
  } else {
    audioEngine.pause();
  }
});

stopBtn.addEventListener('click', () => {
  const layer = getSelectedLayerWithAudio();
  if (layer) {
    layer.audio.pause();
    layer.audio.currentTime = 0;
  } else {
    audioEngine.stop();
  }
});

testBtn.addEventListener('click', () => {
  audioEngine.playTestTone();
});

btnLoop.addEventListener('click', () => {
  const isActive = btnLoop.classList.toggle('active');
  audioEngine.setLoop(isActive);
  // Apply to all layers with audio
  layers.forEach(l => {
    if (l.audio) l.audio.loop = isActive;
  });
});


seekBar.addEventListener('mousedown', () => {
  isSeeking = true;
});

seekBar.addEventListener('touchstart', () => {
  isSeeking = true;
});

seekBar.addEventListener('change', (e) => {
  const time = parseFloat(e.target.value);
  const layer = getSelectedLayerWithAudio();
  if (layer) {
    layer.audio.currentTime = time;
  } else {
    audioEngine.seek(time);
  }
  isSeeking = false;
});

seekBar.addEventListener('input', (e) => {
  // Just update text, no live seeking
  const time = parseFloat(e.target.value);
  timeCurrent.textContent = formatTime(time);
});

btnRecDeleteMode.addEventListener('click', () => {
  if (isRecDeleteMode) {
    // Toggle Off - Delete marked
    const toDelete = recordings.filter(r => r.markedForDelete);
    if (toDelete.length > 0) {
      if (confirm(`Delete ${toDelete.length} recordings?`)) {
        recordings = recordings.filter(r => !r.markedForDelete);
        // Also stop any playing audio from deleted
        toDelete.forEach(r => {
          if (r.audio) { r.audio.pause(); r.audio = null; }
        });
      }
      recordings.forEach(r => r.markedForDelete = false);
    }
    isRecDeleteMode = false;
    btnRecDeleteMode.classList.remove('delete-active');
  } else {
    isRecDeleteMode = true;
    btnRecDeleteMode.classList.add('delete-active');
  }
  renderRecordingsList();
});

btnSelectAllRecs.addEventListener('click', () => {
  // Deselect all layers first for mutual exclusivity
  layers.forEach(l => l.selected = false);
  renderLayersList();

  const allSelected = recordings.length > 0 && recordings.every(r => r.selected);
  recordings.forEach(r => r.selected = !allSelected);
  updateUI();
  renderRecordingsList();
});

function renderRecordingsList() {
  recordingsList.innerHTML = '';

  if (recordings.length === 0) {
    recordingsList.innerHTML = '<div class="empty-state">No recordings yet</div>';
    return;
  }

  recordings.forEach(rec => {
    const item = document.createElement('div');
    item.className = 'recording-item';
    if (rec.selected) item.classList.add('selected'); // Add selected state
    if (rec.markedForDelete) item.classList.add('marked');

    // Click for Delete Mode
    item.addEventListener('click', (e) => {
      // Ignore controls and the title itself to allow double-clicks/editing
      if (
        e.target.tagName === 'BUTTON' ||
        e.target.tagName === 'INPUT' ||
        e.target.classList.contains('recording-name') ||
        e.target.isContentEditable
      ) return;

      if (isRecDeleteMode) {
        rec.markedForDelete = !rec.markedForDelete;
        renderRecordingsList();
      } else {
        // Clear layers selection when selecting recordings
        layers.forEach(l => l.selected = false);
        renderLayersList();

        const isCtrl = e.ctrlKey || e.metaKey;
        const isShift = e.shiftKey;
        const index = recordings.indexOf(rec);

        if (isShift && lastSelectedRecIndex !== -1) {
          const start = Math.min(index, lastSelectedRecIndex);
          const end = Math.max(index, lastSelectedRecIndex);
          recordings.forEach((r, i) => {
            if (i >= start && i <= end) r.selected = true;
          });
        } else if (isCtrl) {
          rec.selected = !rec.selected;
        } else {
          recordings.forEach(r => r.selected = false);
          rec.selected = true;
        }

        if (rec.selected) lastSelectedRecIndex = index;
        else lastSelectedRecIndex = -1;

        updateUI();
        renderRecordingsList();
      }
    });

    const nameSpan = document.createElement('span');
    nameSpan.className = 'recording-name';
    nameSpan.id = `rec-title-${rec.id}`; // Add ID to fix form field warning
    nameSpan.textContent = rec.name;
    nameSpan.title = rec.name;

    let isCanceling = false;
    const enableEditing = () => {
      isCanceling = false;
      nameSpan.contentEditable = 'true';
      nameSpan.focus();
      // Use setTimeout to ensure the element is focusable and attached before selection
      setTimeout(() => {
        if (!nameSpan.contentEditable || isCanceling) return;
        // Check if element is still in DOM
        if (!document.body.contains(nameSpan)) return;

        try {
          const range = document.createRange();
          range.selectNodeContents(nameSpan);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        } catch (err) {
          console.warn("Selection error:", err);
          // Fallback selection method
          try {
            window.getSelection().selectAllChildren(nameSpan);
          } catch (e2) { }
        }
      }, 50); // Increased delay to 50ms for stability
    };

    // Rename
    nameSpan.ondblclick = (e) => {
      e.stopPropagation();
      enableEditing();
    };
    nameSpan.onblur = () => {
      if (isCanceling) {
        isCanceling = false;
        return;
      }
      nameSpan.contentEditable = 'false';
      rec.name = nameSpan.textContent;
    };
    nameSpan.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        nameSpan.blur();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        isCanceling = true;
        nameSpan.contentEditable = 'false';
        renderRecordingsList(); // Re-render to restore original name
      }
    };

    const controls = document.createElement('div');
    controls.className = 'recording-controls';

    // Rename Button
    const btnRename = document.createElement('button');
    btnRename.className = 'icon-btn';
    btnRename.textContent = '✎';
    btnRename.title = 'Rename Recording';
    btnRename.onclick = (e) => {
      e.stopPropagation();
      enableEditing();
    };

    // Mini Player
    if (!rec.audio) {
      rec.audio = new Audio(rec.url);
      rec.audio.loop = false;
    }

    // Play/Pause
    const btnPlay = document.createElement('button');
    btnPlay.className = 'icon-btn';
    btnPlay.textContent = !rec.audio.paused ? '⏸' : '▶';
    btnPlay.onclick = () => {
      if (rec.audio.paused) {
        // Stop all other recordings (Minor Improvement #3)
        recordings.forEach(r => {
          if (r !== rec && r.audio && !r.audio.paused) {
            r.audio.pause();
            r.audio.currentTime = 0; // Reset progress bar (Refinement #58)
          }
        });
        rec.audio.play();
      } else {
        rec.audio.pause();
      }
      renderRecordingsList(); // Single re-render to update all icons correctly
    };

    rec.audio.onended = () => {
      btnPlay.textContent = '▶';
    };

    // Stop
    const btnStop = document.createElement('button');
    btnStop.className = 'icon-btn';
    btnStop.textContent = '■';
    btnStop.onclick = () => {
      rec.audio.pause();
      rec.audio.currentTime = 0;
      btnPlay.textContent = '▶';
    };

    // Slider
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = 0;
    slider.value = rec.audio.currentTime || 0;
    slider.max = rec.audio.duration || 100; // Duration might be NaN initially
    slider.className = 'mini-slider';

    // Update Slider
    rec.audio.ontimeupdate = () => {
      if (!isNaN(rec.audio.duration)) {
        slider.max = rec.audio.duration;
        slider.value = rec.audio.currentTime;
      }
    };

    // Seek
    slider.oninput = (e) => {
      rec.audio.currentTime = parseFloat(e.target.value);
    };

    // Assign
    const btnAssign = document.createElement('button');
    btnAssign.className = 'icon-btn';
    btnAssign.textContent = '⤵'; // Updated Icon
    btnAssign.title = 'Assign to Selected Layer';
    btnAssign.onclick = () => {
      assignRecordingToLayer(rec.url, rec.name);
    };

    if (isRecDeleteMode) {
      controls.style.display = 'none'; // Hide controls in delete mode
    } else {
      controls.appendChild(btnRename);
      controls.appendChild(btnPlay);
      controls.appendChild(btnStop);
      controls.appendChild(slider);
      controls.appendChild(btnAssign);
    }

    item.appendChild(nameSpan);
    item.appendChild(controls);

    recordingsList.appendChild(item);
  });
}

function animate() {
  const dataArray = audioEngine.getFrequencyData();
  const bufferLength = audioEngine.dataArray ? audioEngine.dataArray.length : 0;

  // Clear Canvas Once
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Base background (optional, or just black)
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  layers.forEach(layer => {
    if (!layer.visible) return;

    let drawDataArray = null;
    let drawBufferLength = 0;

    if (audioEngine.isMicActive) {
      if (layer.selected) {
        // Selective Mic: only selected layers get mic data
        drawDataArray = dataArray;
        drawBufferLength = bufferLength;
      } else if (layer.analyser && layer.dataArray) {
        // Unselected layers with their own audio keep playing it
        layer.analyser.getByteFrequencyData(layer.dataArray);
        drawDataArray = layer.dataArray;
        drawBufferLength = layer.analyser.frequencyBinCount;
      } else {
        // Unselected with no audio stay flat
        drawDataArray = new Uint8Array(bufferLength || 1024);
        drawBufferLength = drawDataArray.length;
      }
    } else {
      // Mic is OFF: use layer audio or fallback to global file
      if (layer.analyser && layer.dataArray) {
        layer.analyser.getByteFrequencyData(layer.dataArray);
        drawDataArray = layer.dataArray;
        drawBufferLength = layer.analyser.frequencyBinCount;
      } else {
        drawDataArray = dataArray;
        drawBufferLength = bufferLength;
      }
    }

    // Use layer-specific colors or fall back to global
    const layerColors = layer.colors || vizColors;

    const vizFunc = visualizers[layer.type];
    if (vizFunc) {
      ctx.save();
      ctx.globalAlpha = layer.opacity; // Use layer opacity
      vizFunc(ctx, canvas, drawDataArray, drawBufferLength, layerColors, layer);
      ctx.restore();
    }
  });


  updateUI();

  animationId = requestAnimationFrame(animate);
}

// Init Layers UI
renderLayersList();

// ... (EventListeners)

// Color Logic
function getActiveColors() {
  const selected = layers.filter(l => l.selected);
  if (selected.length > 0) return selected[0].colors;
  return vizColors;
}

function updateSortedStops(targetColors) {
  const colorsToUpdate = targetColors ? [targetColors] :
    (layers.filter(l => l.selected).length > 0 ?
      layers.filter(l => l.selected).map(l => l.colors) :
      [vizColors]);

  colorsToUpdate.forEach(c => {
    c.sortedStops = [...c.stops].sort((a, b) => a.offset - b.offset);
  });

  invalidateBarsCache();
  invalidateCircleCache();
  invalidateCircleLinearCache();
}

function renderColorEditor() {
  const targetColors = getActiveColors();
  colorStopsContainer.innerHTML = '';
  colorModeSelect.value = targetColors.mode;

  if (targetColors.mode === 'multi-gradient') {
    renderMultiGradientEditor(targetColors);
    return;
  }

  targetColors.stops.sort((a, b) => a.offset - b.offset);

  targetColors.stops.forEach((stop, index) => {
    const row = document.createElement('div');
    row.className = 'color-stop-row';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = stop.color;
    colorInput.oninput = (e) => {
      stop.color = e.target.value;
      const selected = layers.filter(l => l.selected);
      selected.forEach(l => {
        if (l.colors.stops[index]) l.colors.stops[index].color = stop.color;
      });
      updateSortedStops();
      updatePreview();
    };

    if (targetColors.mode === 'single') {
      if (index === 0) row.appendChild(colorInput);
    } else {
      const rangeInput = document.createElement('input');
      rangeInput.type = 'range';
      rangeInput.min = 0; rangeInput.max = 100;
      rangeInput.value = stop.offset;
      rangeInput.oninput = (e) => {
        stop.offset = parseInt(e.target.value);
        const selected = layers.filter(l => l.selected);
        selected.forEach(l => {
          if (l.colors.stops[index]) l.colors.stops[index].offset = stop.offset;
        });
        updateSortedStops();
        updatePreview();
      };

      row.appendChild(colorInput);
      row.appendChild(rangeInput);

      const btnRemove = document.createElement('button');
      btnRemove.className = 'btn-remove-stop';
      btnRemove.textContent = '×';
      btnRemove.onclick = () => {
      };
      if (targetColors.stops.length > 1) row.appendChild(btnRemove);
    }
    if (targetColors.mode !== 'single' || index === 0) colorStopsContainer.appendChild(row);
  });

  btnAddStop.style.display = (targetColors.mode === 'single') ? 'none' : 'block';
  updatePreview();
}

function updatePreview() {
  const targetColors = getActiveColors();
  const w = previewCanvas.width;
  const h = previewCanvas.height;
  if (targetColors.mode === 'single') {
    previewCtx.fillStyle = targetColors.stops[0]?.color || '#fff';
    previewCtx.fillRect(0, 0, w, h);
    return;
  }
  if (targetColors.mode === 'multi-gradient' && targetColors.multiGradients) {
    const gradient = previewCtx.createLinearGradient(0, 0, w, 0);
    targetColors.multiGradients.forEach(grad => {
      grad.stops.forEach(s => {
        const masterOffset = grad.start + (s.offset / 100) * (grad.end - grad.start);
        gradient.addColorStop(Math.min(1, Math.max(0, masterOffset / 100)), s.color);
      });
    });
    previewCtx.fillStyle = gradient;
    previewCtx.fillRect(0, 0, w, h);
    return;
  }
  const gradient = previewCtx.createLinearGradient(0, 0, w, 0);
  const sorted = [...targetColors.stops].sort((a, b) => a.offset - b.offset);
  sorted.forEach(s => gradient.addColorStop(Math.min(1, Math.max(0, s.offset / 100)), s.color));
  previewCtx.fillStyle = gradient;
  previewCtx.fillRect(0, 0, w, h);
}

btnColors.addEventListener('click', () => {
  colorPanel.classList.toggle('hidden');
  if (!colorPanel.classList.contains('hidden')) renderColorEditor();
});

btnCloseColors.addEventListener('click', () => colorPanel.classList.add('hidden'));

colorModeSelect.addEventListener('change', (e) => {
  const mode = e.target.value;
  const selected = layers.filter(l => l.selected);
  if (selected.length > 0) {
    selected.forEach(l => {
      // Ensure colors object exists
      if (!l.colors) l.colors = JSON.parse(JSON.stringify(vizColors));
      l.colors.mode = mode;
    });
  } else {
    vizColors.mode = mode;
  }
  updateSortedStops();
  renderColorEditor();
  updatePreview();
});

btnAddStop.addEventListener('click', () => {
  const selected = layers.filter(l => l.selected);
  if (selected.length > 0) {
    selected.forEach(l => l.colors.stops.push({ offset: 50, color: '#ffffff' }));
  } else {
    vizColors.stops.push({ offset: 50, color: '#ffffff' });
  }
  renderColorEditor();
  updatePreview();
});


// Settings DOM
const btnSettings = document.getElementById('btn-settings');
const settingsPanel = document.getElementById('settings-panel');
const btnCloseSettings = document.getElementById('btn-close-settings');
const settingDetail = document.getElementById('setting-detail');
const settingParticles = document.getElementById('setting-particles');
const settingParticlesInput = document.getElementById('setting-particles-input');
const rowDetail = document.getElementById('row-detail');
const rowParticles = document.getElementById('row-particles');
const rowParticleSize = document.getElementById('row-particle-size');
const settingParticleSize = document.getElementById('setting-particle-size');
const settingParticleSizeInput = document.getElementById('setting-particle-size-input');
const rowLineWeight = document.getElementById('row-line-weight');
const settingLineWeight = document.getElementById('setting-line-weight');
const settingLineWeightInput = document.getElementById('setting-line-weight-input');
const rowIntensity = document.getElementById('row-intensity');
const settingIntensity = document.getElementById('setting-intensity');
const settingIntensityInput = document.getElementById('setting-intensity-input');

// Settings Logic


function updateSettingsVisibility() {
  const selectedLayers = layers.filter(l => l.selected);
  if (selectedLayers.length === 0) {
    rowDetail.classList.add('disabled');
    rowParticles.classList.add('disabled');
    rowParticleSize.classList.add('disabled');
    rowLineWeight.classList.add('disabled');
    rowIntensity.classList.add('disabled');
    return;
  }

  const firstType = selectedLayers[0].type;
  const allSameType = selectedLayers.every(l => l.type === firstType);
  currentViz = allSameType ? firstType : 'mixed';

  // Always show both, but disable based on type
  if (currentViz === 'particles') {
    rowDetail.classList.add('disabled');
    rowParticles.classList.remove('disabled');
    rowParticleSize.classList.remove('disabled');
    rowLineWeight.classList.add('disabled');
    rowIntensity.classList.remove('disabled');
  } else if (currentViz === 'proximityDots') {
    rowDetail.classList.add('disabled');
    rowParticles.classList.add('disabled');
    rowParticleSize.classList.remove('disabled');
    rowLineWeight.classList.remove('disabled');
    rowIntensity.classList.remove('disabled');
  } else if (currentViz === 'crystalWall') {
    rowDetail.classList.add('disabled');
    rowParticles.classList.add('disabled');
    rowParticleSize.classList.add('disabled');
    rowLineWeight.classList.add('disabled');
    rowIntensity.classList.remove('disabled');
  } else if (currentViz === 'mixed') {
    // Both could be relevant or neither depending on mix, but let's disable for safety in "mixed"
    rowDetail.classList.add('disabled');
    rowParticles.classList.add('disabled');
    rowParticleSize.classList.add('disabled');
    rowLineWeight.classList.add('disabled');
    rowIntensity.classList.add('disabled');
  } else {
    rowDetail.classList.remove('disabled');
    rowParticles.classList.add('disabled');
    rowParticleSize.classList.add('disabled');
    rowLineWeight.classList.add('disabled');
    rowIntensity.classList.remove('disabled');
  }

  // Update Detail UI
  const firstFFT = selectedLayers[0].fftSize;
  const allSameFFT = selectedLayers.every(l => l.fftSize === firstFFT);
  if (allSameFFT) {
    const level = Math.log2(firstFFT) - 8;
    settingDetail.value = level;
    labelDetail.textContent = detailLevels[level] || 'Custom';
  } else {
    settingDetail.value = 3; // Default visual position
    labelDetail.textContent = '-';
  }

  // Update Particles UI
  const firstCount = selectedLayers[0].vizSettings?.particles?.particleCount || 150;
  const allSameCount = selectedLayers.every(l => (l.vizSettings?.particles?.particleCount || 150) === firstCount);
  settingParticles.value = allSameCount ? firstCount : 150;
  settingParticlesInput.value = allSameCount ? firstCount : '-';

  // Update Particle Size UI
  const firstSize = selectedLayers[0].type === 'particles'
    ? (selectedLayers[0].vizSettings?.particles?.baseSize || 3)
    : (selectedLayers[0].vizSettings?.proximityDots?.baseSize || 2);

  const allSameSize = selectedLayers.every(l => {
    const size = l.type === 'particles'
      ? (l.vizSettings?.particles?.baseSize || 3)
      : (l.vizSettings?.proximityDots?.baseSize || 2);
    return size === firstSize;
  });
  settingParticleSize.value = allSameSize ? firstSize : 2;
  settingParticleSizeInput.value = allSameSize ? firstSize : '-';

  // Update Line Weight UI
  const firstWeight = selectedLayers[0].vizSettings?.proximityDots?.lineWeight || 1;
  const allSameWeight = selectedLayers.every(l => (l.vizSettings?.proximityDots?.lineWeight || 1) === firstWeight);
  settingLineWeight.value = allSameWeight ? firstWeight : 1;
  settingLineWeightInput.value = allSameWeight ? firstWeight : '-';

  // Update Intensity UI
  const firstIntensity = selectedLayers[0].vizSettings?.[selectedLayers[0].type]?.intensity || 1;
  const allSameIntensity = selectedLayers.every(l => (l.vizSettings?.[l.type]?.intensity || 1) === firstIntensity);
  settingIntensity.value = allSameIntensity ? firstIntensity : 1;
  settingIntensityInput.value = allSameIntensity ? firstIntensity : '-';
}

btnSettings.addEventListener('click', () => {
  settingsPanel.classList.toggle('hidden');
  if (!settingsPanel.classList.contains('hidden')) updateSettingsVisibility();
});

btnCloseSettings.addEventListener('click', () => settingsPanel.classList.add('hidden'));

settingDetail.addEventListener('input', (e) => {
  const level = parseInt(e.target.value);
  labelDetail.textContent = detailLevels[level] || 'Custom';
  const fftSize = Math.pow(2, level + 8);

  const selected = layers.filter(l => l.selected);
  if (selected.length > 0) {
    selected.forEach(l => {
      l.fftSize = fftSize;
      if (l.analyser) {
        l.analyser.fftSize = fftSize;
        l.dataArray = new Uint8Array(l.analyser.frequencyBinCount);
      }
    });
  } else {
    audioEngine.setFFTSize(level);
  }
});


function updateParticleCountSafe(val) {
  if (isNaN(val) || val < 1) return;
  const particleLayers = layers.filter(l => l.selected && l.type === 'particles');
  if (particleLayers.length === 0) {
    layers.filter(l => l.type === 'particles').forEach(layer => setParticleCount(val, canvas, layer));
  } else {
    particleLayers.forEach(layer => setParticleCount(val, canvas, layer));
  }
}

settingParticles.addEventListener('input', (e) => {
  const val = parseInt(e.target.value);
  settingParticlesInput.value = val;
  updateParticleCountSafe(val);
});

settingParticlesInput.addEventListener('input', (e) => {
  const val = parseInt(e.target.value);
  if (!isNaN(val) && val > 0) {
    settingParticles.value = val;
    updateParticleCountSafe(val);
  }
});

function updateParticleSizeSafe(val) {
  if (isNaN(val) || val < 0.1) return;
  const targetLayers = layers.filter(l => l.selected && (l.type === 'particles' || l.type === 'proximityDots'));

  if (targetLayers.length === 0) {
    // Apply to all if none selected? Consistent with previous logic
    layers.filter(l => l.type === 'particles').forEach(layer => setParticleSize(val, layer));
    layers.filter(l => l.type === 'proximityDots').forEach(layer => setNodeSize(val, layer));
  } else {
    targetLayers.forEach(layer => {
      if (layer.type === 'particles') setParticleSize(val, layer);
      if (layer.type === 'proximityDots') setNodeSize(val, layer);
    });
  }
}

settingParticleSize.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  settingParticleSizeInput.value = val;
  updateParticleSizeSafe(val);
});

settingParticleSizeInput.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  if (!isNaN(val) && val > 0) {
    settingParticleSize.value = val;
    updateParticleSizeSafe(val);
  }
});

function updateLineWeightSafe(val) {
  if (isNaN(val) || val < 0.1) return;
  const proximityLayers = layers.filter(l => l.selected && l.type === 'proximityDots');
  if (proximityLayers.length === 0) {
    layers.filter(l => l.type === 'proximityDots').forEach(layer => setLineWeight(val, layer));
  } else {
    proximityLayers.forEach(layer => setLineWeight(val, layer));
  }
}

settingLineWeight.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  settingLineWeightInput.value = val;
  updateLineWeightSafe(val);
});

settingLineWeightInput.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  if (!isNaN(val) && val > 0) {
    settingLineWeight.value = val;
    updateLineWeightSafe(val);
  }
});

function updateIntensitySafe(val) {
  if (isNaN(val) || val < 0.1) return;
  const selectedLayers = layers.filter(l => l.selected);
  const targets = selectedLayers.length > 0 ? selectedLayers : layers;

  targets.forEach(layer => {
    if (!layer.vizSettings) layer.vizSettings = {};
    if (!layer.vizSettings[layer.type]) {
      // Fallback or use defaults? Let's just create the object
      layer.vizSettings[layer.type] = { intensity: val };
    } else {
      layer.vizSettings[layer.type].intensity = val;
    }
  });
}

settingIntensity.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  settingIntensityInput.value = val;
  updateIntensitySafe(val);
});

settingIntensityInput.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  if (!isNaN(val) && val > 0) {
    settingIntensity.value = val;
    updateIntensitySafe(val);
  }
});

// Recording Mode
btnRecord.addEventListener('click', () => {
  const hasAudio = layers.some(l => l.audio) || audioEngine.audioBuffer;
  if (!hasAudio) {
    showAlert("Please upload an audio file first.");
    return;
  }
  startRecordingMode();
});

function startRecordingMode() {
  if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
  document.body.classList.add('recording-mode');

  wasSidePanelOpen = !sidePanel.classList.contains('hidden'); // Fix Side Panel Restoration
  sidePanel.classList.add('hidden'); // Fix Record Bug 1

  // Pause all
  audioEngine.stop();
  layers.forEach(l => { if (l.audio) { l.audio.pause(); l.audio.currentTime = 0; } });

  let count = 3;
  countdownOverlay.style.display = 'block';
  countdownOverlay.textContent = count;
  exitHint.style.display = 'block';

  countdownInterval = setInterval(() => { // Fix Record Bug 2 & 3
    count--;
    if (count > 0) {
      countdownOverlay.textContent = count;
    } else {
      clearInterval(countdownInterval);
      countdownOverlay.style.display = 'none';
      exitHint.style.display = 'none';

      // Play all assigned audios
      audioEngine.play();
      layers.forEach(l => { if (l.audio) l.audio.play(); });

    }
  }, 1000);
}

function handleEsc(e) {
  if (e.key === 'Escape') {
    if (soundModal.classList.contains('active')) {
      closeSoundModal();
    } else if (alertModal.classList.contains('active')) {
      closeAlert();
    } else if (document.body.classList.contains('recording-mode')) {
      exitRecordingMode();
    }
  }
}

// Global keydown listener
document.addEventListener('keydown', handleEsc);

function exitRecordingMode() {
  clearInterval(countdownInterval); // Fix Record Bug 2 & 3

  if (wasSidePanelOpen) sidePanel.classList.remove('hidden'); // Fix Side Panel Restoration

  audioEngine.stop();
  layers.forEach(l => { if (l.audio) l.audio.pause(); });
  document.body.classList.remove('recording-mode');
  if (document.fullscreenElement) document.exitFullscreen();
  countdownOverlay.style.display = 'none';
  exitHint.style.display = 'none';
}

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && document.body.classList.contains('recording-mode')) {
    exitRecordingMode();
  }
});

// Custom Alert System
function showAlert(message) {
  alertMessage.textContent = message;
  alertModal.classList.add('active');
}

function closeAlert() {
  alertModal.classList.remove('active');
}

btnAlertOk.addEventListener('click', closeAlert);

// Start loop
animate();

// Auto-select first layer on startup
if (layers.length > 0) {
  layers[0].selected = true;
  updateUI();
  renderLayersList();
  if (!settingsPanel.classList.contains('hidden')) {
    updateSettingsVisibility();
  }
}
