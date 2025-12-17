import { AudioEngine } from './audio.js';
import { drawBars, invalidateBarsCache } from './visualizers/bars.js';
import { drawCircle, invalidateCircleCache } from './visualizers/circle.js';
import { drawCircleLinear, invalidateCircleLinearCache } from './visualizers/circle-linear.js';
import { drawParticles, scaleParticles, setParticleCount } from './visualizers/particles.js';
import { drawCrystalWall } from './visualizers/crystal.js';

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
    selected: false // Add selected state
  }
];

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
  'crystal': drawCrystalWall
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
      // Ignore controls
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT' || e.target.isContentEditable) return;

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
    // Name + Assigned File
    let label = `Layer ${index + 1}: ${layer.type}`;
    if (layer.customName) label = layer.customName; // Logic for custom name
    if (layer.audioName) label += ` (${layer.audioName})`;

    title.textContent = label;

    // Rename Logic
    title.ondblclick = () => {
      title.contentEditable = true;
      title.focus();
    };
    title.onblur = () => {
      title.contentEditable = false;
      layer.customName = title.textContent; // Store custom name
      // We might lose " (File: ...)" formatting if user edits raw text. 
      // Better: Store customName separately. If user edits "Layer 1 (Rec 1)", they save "New Name". 
      // Next render shows "New Name (Rec 1)".
      // So we strictly extract the name? Or just let user overwrite everything.
      // Simple: Let user overwrite.
    };
    title.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        title.blur();
      }
    };

    const controls = document.createElement('div');
    controls.className = 'layer-controls';

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
    opacity: 1.0
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
    fileNameDisplay.textContent = file.name;
    currentMainFileName = file.name; // Store for restore
    try {
      await audioEngine.loadFile(file);
    } catch (err) {
      console.error("Error loading file:", err);
      alert("Error loading audio file.");
    }
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

// Helper to update sortedStops
function updateSortedStops() {
  vizColors.sortedStops = [...vizColors.stops].sort((a, b) => a.offset - b.offset);
  // Also invalidate gradient caches
  invalidateBarsCache();
  invalidateCircleCache();
  invalidateCircleLinearCache();
}

// Initialize sorted stops
updateSortedStops();

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
      audio.loop = false;

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

    const vizFunc = visualizers[layer.type];
    if (vizFunc) {
      ctx.save();
      ctx.globalAlpha = layer.opacity; // Use layer opacity
      vizFunc(ctx, canvas, drawDataArray, drawBufferLength, vizColors, layer);
      ctx.restore();
    }
  });

  updateUI();

  animationId = requestAnimationFrame(animate);
}

// Init Layers UI
renderLayersList();

// ... (EventListeners)

// Color Panel Logic
function renderColorEditor() {
  colorStopsContainer.innerHTML = '';

  // Sort stops by offset
  vizColors.stops.sort((a, b) => a.offset - b.offset);

  vizColors.stops.forEach((stop, index) => {
    const row = document.createElement('div');
    row.className = 'color-stop-row';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = stop.color;
    colorInput.oninput = (e) => {
      stop.color = e.target.value;
      updateSortedStops();
      updatePreview();
    };

    // If single mode, no sliders
    if (vizColors.mode === 'single') {
      // Only show one color picker for single mode (first one)
      if (index === 0) {
        row.appendChild(colorInput);
      }
    } else {
      const rangeInput = document.createElement('input');
      rangeInput.type = 'range';
      rangeInput.min = 0;
      rangeInput.max = 100;
      rangeInput.value = stop.offset;
      rangeInput.oninput = (e) => {
        stop.offset = parseInt(e.target.value);
        updateSortedStops();
        updatePreview();
      };

      row.appendChild(colorInput);
      row.appendChild(rangeInput);

      const btnRemove = document.createElement('button');
      btnRemove.className = 'btn-remove-stop';
      btnRemove.textContent = '×';
      btnRemove.onclick = () => {
        vizColors.stops.splice(index, 1);
        updateSortedStops();
        renderColorEditor();
        updatePreview();
      };
      // Prevent removing last stop?
      if (vizColors.stops.length > 1) {
        row.appendChild(btnRemove);
      }
    }

    if (vizColors.mode !== 'single' || index === 0) {
      colorStopsContainer.appendChild(row);
    }
  });

  if (vizColors.mode === 'single') {
    btnAddStop.style.display = 'none';
  } else {
    btnAddStop.style.display = 'block';
  }

  updatePreview();
}

function updatePreview() {
  const w = previewCanvas.width;
  const h = previewCanvas.height;

  if (vizColors.mode === 'single') {
    previewCtx.fillStyle = vizColors.stops[0]?.color || '#fff';
    previewCtx.fillRect(0, 0, w, h);
    return;
  }

  const gradient = previewCtx.createLinearGradient(0, 0, w, 0);
  // Sort logic needed for Gradient? Canvas needs stops 0..1 sorted?
  // User interface has 0..100.
  // We should copy and sort for drawing.
  const sorted = [...vizColors.stops].sort((a, b) => a.offset - b.offset);

  sorted.forEach(s => {
    gradient.addColorStop(Math.min(1, Math.max(0, s.offset / 100)), s.color);
  });

  previewCtx.fillStyle = gradient;
  previewCtx.fillRect(0, 0, w, h);
}

btnColors.addEventListener('click', () => {
  colorPanel.classList.toggle('hidden');
  if (!colorPanel.classList.contains('hidden')) {
    renderColorEditor();
  }
});

btnCloseColors.addEventListener('click', () => {
  colorPanel.classList.add('hidden');
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

function updateSettingsVisibility() {
  // Get currentViz from first selected layer or fallback
  const selectedLayer = layers.find(l => l.selected);
  if (selectedLayer) {
    currentViz = selectedLayer.type;
  }

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
  if (!settingsPanel.classList.contains('hidden')) {
    updateSettingsVisibility();
  }
});

btnCloseSettings.addEventListener('click', () => {
  settingsPanel.classList.add('hidden');
});

settingDetail.addEventListener('input', (e) => {
  audioEngine.setFFTSize(e.target.value);
});

// Particles Sync Logic - now layer-aware
function updateParticleCountSafe(val) {
  if (isNaN(val) || val < 1) return;
  // Apply to selected particle layers
  const particleLayers = layers.filter(l => l.selected && l.type === 'particles');
  if (particleLayers.length === 0) {
    // No selected particle layer, apply to all particle layers
    layers.filter(l => l.type === 'particles').forEach(layer => {
      setParticleCount(val, canvas, layer);
    });
  } else {
    particleLayers.forEach(layer => {
      setParticleCount(val, canvas, layer);
    });
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
    // Update slider if within range (visual feedback only)
    // If outside range, slider stays at max/min but value works
    settingParticles.value = val;
    updateParticleCountSafe(val);
  }
});

colorModeSelect.addEventListener('change', (e) => {
  vizColors.mode = e.target.value;
  updateSortedStops();
  renderColorEditor();
  updatePreview();
});

btnAddStop.addEventListener('click', () => {
  // Add new stop at 50%
  vizColors.stops.push({ offset: 50, color: '#ffffff' });
  renderColorEditor();
  updatePreview();
});

btnRecord.addEventListener('click', () => {
  if (!audioEngine.audioBuffer) {
    alert("Please upload an audio file first.");
    return;
  }
  startRecordingMode();
});

function startRecordingMode() {
  // 1. Enter Fullscreen
  if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen();
  }

  // 2. Hide UI
  document.body.classList.add('recording-mode');

  // Stop current playback immediately and reset
  audioEngine.stop();
  audioEngine.seek(0);

  // 3. Countdown
  let count = 3;
  countdownOverlay.style.display = 'block';
  countdownOverlay.textContent = count;

  // Show exit hint during countdown as requested
  exitHint.style.display = 'block';

  const interval = setInterval(() => {
    count--;
    if (count > 0) {
      countdownOverlay.textContent = count;
    } else {
      clearInterval(interval);
      countdownOverlay.style.display = 'none';
      // Hide exit hint when music starts
      exitHint.style.display = 'none';

      // 4. Start Audio
      audioEngine.play(); // Explicitly play

      // Add ESC listener
      document.addEventListener('keydown', handleEsc);
    }
  }, 1000);
}

function handleEsc(e) {
  if (e.key === 'Escape') {
    exitRecordingMode();
  }
}

function exitRecordingMode() {
  document.removeEventListener('keydown', handleEsc);

  // Stop Audio
  if (audioEngine.isPlaying) {
    audioEngine.stop();
  }

  document.body.classList.remove('recording-mode');

  if (document.fullscreenElement) {
    document.exitFullscreen();
  }

  // Ensure overlays hidden
  countdownOverlay.style.display = 'none';
  exitHint.style.display = 'none';
}

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && document.body.classList.contains('recording-mode')) {
    // User exited fullscreen via browser key, sync state
    audioEngine.stop();
    document.body.classList.remove('recording-mode');
    document.removeEventListener('keydown', handleEsc);
  }
});

// Start loop
animate();
