import { AudioEngine } from './audio.js';
import { drawBars, invalidateBarsCache } from './visualizers/bars.js';
import { drawCircle, invalidateCircleCache } from './visualizers/circle.js';
import { drawCircleLinear, invalidateCircleLinearCache } from './visualizers/circle-linear.js';
import { drawParticles, scaleParticles, setParticleCount } from './visualizers/particles.js';
import { drawProximityDots, scaleProximityNodes } from './visualizers/proximityDots.js';

const canvas = document.getElementById('visualizer-canvas');
const ctx = canvas.getContext('2d');
const fileInput = document.getElementById('audio-upload');
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

// Visualizer Map
const visualizers = {
  'bars': drawBars,
  'circle': drawCircle,
  'circle-linear': drawCircleLinear,
  'particles': drawParticles,
  'proximityDots': drawProximityDots
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
        // Standard Select
        layer.selected = !layer.selected;

        // Update currentViz and settings visibility when layer is selected
        if (layer.selected) {
          currentViz = layer.type;
          // Update settings panel if it's open
          if (!settingsPanel.classList.contains('hidden')) {
            updateSettingsVisibility();
          }
        }

        updateUI();
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
  const allSelected = layers.every(l => l.selected);
  layers.forEach(l => l.selected = !allSelected);
  renderLayersList();
});


// UI Event Listeners
fileInput.addEventListener('change', async (e) => {
  if (e.target.files.length > 0) {
    const file = e.target.files[0];
    const selectedLayers = layers.filter(l => l.selected);

    // If no layers selected, prompt user
    if (selectedLayers.length === 0) {
      alert('Please select a layer to assign this audio file to.');
      e.target.value = ''; // Reset file input
      return;
    }

    fileNameDisplay.textContent = file.name;
    currentMainFileName = file.name;

    // Load file to each selected layer
    for (const layer of selectedLayers) {
      try {
        // Cleanup existing audio resources
        if (layer.audio) {
          layer.audio.pause();
          layer.audio.src = '';
        }
        if (layer.source) {
          try { layer.source.disconnect(); } catch (e) { /* already disconnected */ }
        }
        if (layer.analyser) {
          try { layer.analyser.disconnect(); } catch (e) { /* already disconnected */ }
        }

        // We need the audio context from the engine
        await audioEngine.init();
        const actx = audioEngine.audioContext;

        if (actx.state === 'suspended') {
          await actx.resume();
        }

        // Create blob URL for the file
        const fileUrl = URL.createObjectURL(file);

        // Create Audio element for this layer
        const audio = new Audio(fileUrl);
        audio.loop = false;

        // Wait for audio to be loadable
        await new Promise((resolve, reject) => {
          audio.addEventListener('canplaythrough', resolve, { once: true });
          audio.addEventListener('error', reject, { once: true });
          audio.load();
        });

        // Create audio graph
        const source = actx.createMediaElementSource(audio);
        const analyser = actx.createAnalyser();
        analyser.fftSize = 2048;

        // Connect: source -> analyser -> destination
        source.connect(analyser);
        analyser.connect(actx.destination);

        // Store in layer
        layer.audio = audio;
        layer.source = source;
        layer.analyser = analyser;
        layer.dataArray = new Uint8Array(analyser.frequencyBinCount);
        layer.audioName = file.name;
        layer.fileUrl = fileUrl;

        console.log(`Assigned ${file.name} to layer ${layer.id}`);
      } catch (err) {
        console.error(`Error loading file for layer ${layer.id}:`, err);
        alert(`Error loading audio file: ${err.message}`);
      }
    }

    renderLayersList();
    e.target.value = ''; // Reset file input for future selections
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
  mode: 'gradient-freq', // 'gradient-freq', 'gradient-vol', 'single'
  stops: [
    { offset: 0, color: '#00ffff' },
    { offset: 100, color: '#ff00ff' }
  ],
  sortedStops: null // Will be populated on change
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
    alert('No microphone stream active.');
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
    alert('Please select a layer to assign this recording to.');
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
      alert(`Failed to play audio: ${error.message}`);
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
  const selectedLayer = getSelectedLayerWithAudio();

  if (selectedLayer) {
    // Show Layer Time
    const audio = selectedLayer.audio;
    if (!isNaN(audio.duration)) {
      timeDuration.textContent = formatTime(audio.duration);
      timeCurrent.textContent = formatTime(audio.currentTime);
      if (!isSeeking) {
        seekBar.max = audio.duration;
        seekBar.value = audio.currentTime;
      }
    }
    // Indicate context in UI (optional, user asked for it)
    fileNameDisplay.textContent = `Selected: ${selectedLayer.audioName}`;
  } else if (audioEngine.audioBuffer) {
    // Show Main Audio Time
    const duration = audioEngine.duration;
    const current = audioEngine.currentTime;

    timeDuration.textContent = formatTime(duration);
    timeCurrent.textContent = formatTime(current);

    // Restore main file name
    fileNameDisplay.textContent = currentMainFileName;

    if (!isSeeking) {
      seekBar.max = duration;
      seekBar.value = current;
    }
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
      alert("Please upload a file first.");
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

function renderRecordingsList() {
  recordingsList.innerHTML = '';

  if (recordings.length === 0) {
    recordingsList.innerHTML = '<div class="empty-state">No recordings yet</div>';
    return;
  }

  recordings.forEach(rec => {
    const item = document.createElement('div');
    item.className = 'recording-item';
    if (rec.markedForDelete) item.classList.add('marked');

    // Click for Delete Mode
    item.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.isContentEditable) return;

      if (isRecDeleteMode) {
        rec.markedForDelete = !rec.markedForDelete;
        renderRecordingsList();
      }
    });

    const nameSpan = document.createElement('span');
    nameSpan.className = 'recording-name';
    nameSpan.textContent = rec.name;
    nameSpan.title = rec.name;

    // Rename
    nameSpan.ondblclick = () => {
      nameSpan.contentEditable = true;
      nameSpan.focus();
    };
    nameSpan.onblur = () => {
      nameSpan.contentEditable = false;
      rec.name = nameSpan.textContent;
    };
    nameSpan.onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); nameSpan.blur(); }
    };

    const controls = document.createElement('div');
    controls.className = 'recording-controls';

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
        rec.audio.play();
        btnPlay.textContent = '⏸';
      } else {
        rec.audio.pause();
        btnPlay.textContent = '▶';
      }
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

    let drawDataArray = dataArray; // Default to global
    let drawBufferLength = bufferLength;

    // Layer-specific Audio
    if (layer.analyser && layer.dataArray) {
      layer.analyser.getByteFrequencyData(layer.dataArray);
      drawDataArray = layer.dataArray;
      drawBufferLength = layer.analyser.frequencyBinCount;
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
        const selected = layers.filter(l => l.selected);
        if (selected.length > 0) {
          selected.forEach(l => l.colors.stops.splice(index, 1));
        } else {
          vizColors.stops.splice(index, 1);
        }
        updateSortedStops();
        renderColorEditor();
        updatePreview();
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

// Settings Logic


function updateSettingsVisibility() {
  const selectedLayer = layers.find(l => l.selected);
  if (selectedLayer) currentViz = selectedLayer.type;

  if (currentViz === 'particles') {
    rowDetail.style.display = 'none';
    rowParticles.style.display = 'flex';
  } else {
    rowDetail.style.display = 'flex';
    rowParticles.style.display = 'none';
  }
}

btnSettings.addEventListener('click', () => {
  settingsPanel.classList.toggle('hidden');
  if (!settingsPanel.classList.contains('hidden')) updateSettingsVisibility();
});

btnCloseSettings.addEventListener('click', () => settingsPanel.classList.add('hidden'));

settingDetail.addEventListener('input', (e) => {
  const level = parseInt(e.target.value);
  // Map level 1-6 to power of 2 (512 - 16384)
  const fftSize = Math.pow(2, level + 8);

  const selected = layers.filter(l => l.selected);
  if (selected.length > 0) {
    selected.forEach(l => {
      l.fftSize = fftSize;
      if (l.analyser) {
        l.analyser.fftSize = fftSize;
        // Re-init dataArray if size changed
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

// Recording Mode
btnRecord.addEventListener('click', () => {
  const hasAudio = layers.some(l => l.audio) || audioEngine.audioBuffer;
  if (!hasAudio) {
    alert("Please upload an audio file first.");
    return;
  }
  startRecordingMode();
});

function startRecordingMode() {
  if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
  document.body.classList.add('recording-mode');

  // Pause all
  audioEngine.stop();
  layers.forEach(l => { if (l.audio) { l.audio.pause(); l.audio.currentTime = 0; } });

  let count = 3;
  countdownOverlay.style.display = 'block';
  countdownOverlay.textContent = count;
  exitHint.style.display = 'block';

  const interval = setInterval(() => {
    count--;
    if (count > 0) {
      countdownOverlay.textContent = count;
    } else {
      clearInterval(interval);
      countdownOverlay.style.display = 'none';
      exitHint.style.display = 'none';

      // Play all assigned audios
      audioEngine.play();
      layers.forEach(l => { if (l.audio) l.audio.play(); });

      document.addEventListener('keydown', handleEsc);
    }
  }, 1000);
}

function handleEsc(e) {
  if (e.key === 'Escape') exitRecordingMode();
}

function exitRecordingMode() {
  document.removeEventListener('keydown', handleEsc);
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

// Start loop
animate();
