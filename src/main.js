import { AudioEngine } from './audio.js';
import { drawBars, invalidateBarsCache } from './visualizers/bars.js';
import { drawCircle, invalidateCircleCache } from './visualizers/circle.js';
import { drawCircleLinear, invalidateCircleLinearCache } from './visualizers/circle-linear.js';
import { drawParticles, scaleParticles, setParticleCount, setParticleSize, setNodeSpeed as setParticleNodeSpeed } from './visualizers/particles.js';
import { drawConstellation, scaleConstellationNodes, setConstellationNodeSize, setConstellationLineWeight, setConstellationIntensity, setConstellationNodeSpeed } from './visualizers/constellation.js';
import { drawFlash } from './visualizers/flash.js';
import { drawCrystalWall, setAnchorSpeed, setNodeSpeed as setCrystalNodeSpeed } from './visualizers/crystalWall.js';
import { translations } from './utils/i18n.js';

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
const timeDuration = document.getElementById('time-total');

// Color / Settings Panels & Buttons
const btnColors = document.getElementById('btn-colors');
const btnRecord = document.getElementById('btn-record');
const colorPanel = document.getElementById('color-panel');
const btnCloseColors = document.getElementById('btn-close-colors');
const countdownOverlay = document.getElementById('countdown-overlay');
const exitHint = document.getElementById('exit-hint');

// New Color DOM
const colorModeSelect = document.getElementById('color-mode');
const colorSourceSelect = document.getElementById('color-source');
const rowColorSource = document.getElementById('row-color-source');
const colorStopsContainer = document.getElementById('color-stops-container');
const btnAddStop = document.getElementById('btn-add-stop');
const previewCanvas = document.getElementById('gradient-preview');
const previewCtx = previewCanvas.getContext('2d');
// Note: ID changed in HTML? Let me check previous HTML edit.
// In Step 402 HTML Edit: <span id="time-total">0:00</span>.
// Previous main.js (Step 407 Line 18) was: const timeDuration = document.getElementById('time-duration');
// But HTML had id="time-duration" before Step 402?
// Step 402 Diff:
// -          <span id="time-duration">0:00</span>
// +          <span id="time-total">0:00</span>
// So I changed HTML ID to time-total.
// So I must update the JS selector to 'time-total'.

// Resize logic
function resize(forceBg) {
  const stage = document.getElementById('viz-stage');
  if (!stage) return;

  let newW = stage.clientWidth;
  let newH = stage.clientHeight;

  // Fit to background if exists and visible
  if (typeof backgroundState !== 'undefined' && backgroundState.element && backgroundState.visible) {
    const media = backgroundState.element;
    const mW = media.naturalWidth || media.videoWidth;
    const mH = media.naturalHeight || media.videoHeight;
    if (mW && mH) {
      newW = mW;
      newH = mH;
    }
  }

  const oldW = canvas.width;
  const oldH = canvas.height;

  canvas.width = newW;
  canvas.height = newH;

  // Scale particles for each layer that has particle state
  layers.forEach(layer => {
    if (layer.type === 'particles' && layer.vizState?.particles) {
      scaleParticles(oldW, oldH, newW, newH, layer);
    }
    if (layer.type === 'constellation' && layer.vizState?.nodes) {
      scaleConstellationNodes(oldW, oldH, newW, newH, layer);
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
const btnSideToggle = document.getElementById('btn-side-toggle');
const sidePanel = document.getElementById('side-panel');
const btnAddViz = document.getElementById('btn-add-viz');
const btnSelectAll = document.getElementById('btn-select-all');
const btnSelectAllRecs = document.getElementById('btn-select-all-recs');
const layersList = document.getElementById('layers-list');

if (btnSideToggle) {
  btnSideToggle.addEventListener('click', () => {
    sidePanel.classList.toggle('hidden');
    const isHidden = sidePanel.classList.contains('hidden');
    btnSideToggle.textContent = isHidden ? '❯' : '❮';
  });
}

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
      mode: 'gradient',
      source: 'frequency',
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
// Transform Edit Mode State
let isEditingLayer = null;
const editHintOverlay = document.getElementById('edit-hint-overlay');
let editDragState = null;

const backgroundState = {
  type: 'none',
  element: null,
  visible: true,
  url: null
};

let recordings = []; // { id, url, name, blob }

let animationId;
let isSeeking = false;
let currentMainFileName = 'No file loaded';
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
  'constellation': drawConstellation,
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
    // Container wraps drag handle and layer content
    const container = document.createElement('div');
    container.className = 'layer-container';
    container.dataset.id = layer.id;

    // Drag Handle (outside layer-item)
    const dragHandle = document.createElement('div');
    dragHandle.className = 'drag-handle';
    dragHandle.textContent = '⠿';

    dragHandle.onmousedown = () => {
      container.draggable = true;
    };

    // Layer Item (content area)
    const item = document.createElement('div');
    item.className = 'layer-item';

    container.appendChild(dragHandle);
    container.appendChild(item);

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
    container.addEventListener('dragstart', (e) => {
      container.classList.add('dragging');
    });

    container.addEventListener('dragend', () => {
      container.draggable = false;
      container.classList.remove('dragging');
      document.querySelectorAll('.layer-container').forEach(el => el.classList.remove('drop-over'));

      // Commit new order
      const newOrder = Array.from(layersList.children)
        .map(el => layers.find(l => l.id === el.dataset.id))
        .filter(l => l)
        .reverse();

      layers.length = 0;
      layers.push(...newOrder);

      renderLayersList();
    });

    // Live Sort Logic
    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      const draggingItem = document.querySelector('.layer-container.dragging');
      if (!draggingItem || draggingItem === container) return;

      const bounding = container.getBoundingClientRect();
      const offset = bounding.y + (bounding.height / 2);

      if (e.clientY - offset < 0) {
        layersList.insertBefore(draggingItem, container);
      } else {
        layersList.insertBefore(draggingItem, container.nextSibling);
      }
    });

    container.addEventListener('drop', (e) => {
      e.preventDefault();
    });

    // Header
    const header = document.createElement('div');
    header.className = 'layer-header';

    const title = document.createElement('div');
    title.className = 'layer-title';
    title.id = `title-${layer.id}`; // Add ID to fix form field warning

    const dict = translations[currentLang];

    // Name + Assigned File
    let label = `${dict['label_layer'] || 'Layer'} ${index + 1}: ${dict['viz_' + layer.type.replace(/-/g, '_')] || layer.type}`;
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

    // Edit Button
    if (typeof expTransformEdit !== 'undefined' && expTransformEdit) {
      const btnEdit = document.createElement('button');
      btnEdit.className = 'icon-btn btn-layer-edit';
      btnEdit.textContent = '✎';
      btnEdit.title = 'Edit Transform';
      btnEdit.style.color = '#7d5fff';
      btnEdit.onclick = (e) => {
        e.stopPropagation();
        enterEditMode(layer);
      };
      controls.appendChild(btnEdit);
    }

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

    // Download Audio
    if (layer.audio && layer.audio.src) {
      const btnDl = document.createElement('button');
      btnDl.className = 'icon-btn';
      btnDl.textContent = '⬇';
      btnDl.title = 'Download Audio';
      btnDl.onclick = (e) => {
        e.stopPropagation();
        const a = document.createElement('a');
        a.href = layer.audio.src;
        a.download = layer.audioName || 'download';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };
      controls.appendChild(btnDl);
    }

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
      opt.textContent = dict['viz_' + key.replace(/-/g, '_')] || key;
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
    layersList.appendChild(container);
  });
}

function addLayer() {
  const newColors = {
    ...JSON.parse(JSON.stringify(vizColors)),
    source: 'frequency',
    mode: 'gradient'
  };

  // Ensure sortedStops exists for immediate rendering
  if (newColors.stops) {
    newColors.sortedStops = [...newColors.stops].sort((a, b) => a.offset - b.offset);
  }

  layers.push({
    id: 'layer-' + Date.now(),
    type: 'bars', // Default
    visible: true,
    opacity: 1.0,
    selected: false,
    fftSize: 2048,
    colors: newColors
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

// Experimental Features Logic
const btnExperimentalMenu = document.getElementById('btn-experimental-menu');
const experimentalDropdown = document.getElementById('experimental-dropdown');
const chkExpGradient = document.getElementById('chk-exp-gradient');
const chkExpTransform = document.getElementById('chk-exp-transform');

const menuItemGradient = document.getElementById('menu-item-gradient');
const menuItemTransform = document.getElementById('menu-item-transform');

let expMultiGradient = false;
let expTransformEdit = false;

function updateMultiGradientUI() {
  const optionMultiGradient = document.querySelector('#color-mode option[value="multi-gradient"]');
  if (optionMultiGradient) {
    optionMultiGradient.style.display = expMultiGradient ? '' : 'none';
    optionMultiGradient.disabled = !expMultiGradient;
    if (!expMultiGradient && colorModeSelect.value === 'multi-gradient') {
      colorModeSelect.value = 'gradient';
      colorModeSelect.dispatchEvent(new Event('change'));
    }
  }
}

function updateTransformUI() {
  renderLayersList();
}

// Events
if (btnExperimentalMenu) {
  btnExperimentalMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    if (experimentalDropdown) experimentalDropdown.classList.toggle('hidden');
  });
}

document.addEventListener('click', () => {
  if (experimentalDropdown) experimentalDropdown.classList.add('hidden');
});

if (experimentalDropdown) experimentalDropdown.addEventListener('click', e => e.stopPropagation());

if (menuItemGradient) {
  menuItemGradient.addEventListener('click', (e) => {
    if (e.target !== chkExpGradient) {
      chkExpGradient.checked = !chkExpGradient.checked;
      expMultiGradient = chkExpGradient.checked;
      updateMultiGradientUI();
    }
  });
  chkExpGradient.addEventListener('change', () => {
    expMultiGradient = chkExpGradient.checked;
    updateMultiGradientUI();
  });
}

if (menuItemTransform) {
  menuItemTransform.addEventListener('click', (e) => {
    if (e.target !== chkExpTransform) {
      chkExpTransform.checked = !chkExpTransform.checked;
      expTransformEdit = chkExpTransform.checked;
      updateTransformUI();
    }
  });
  chkExpTransform.addEventListener('change', () => {
    expTransformEdit = chkExpTransform.checked;
    updateTransformUI();
  });
}

// Init
updateMultiGradientUI();


// Force initial state? 
// If it's "Experimental", it should be hidden by default.
// btnColors.style.display = 'none'; // Visible by default now


// Language Switcher Logic
// Language Switcher Logic
const langSelect = document.getElementById('lang-select');
let currentLang = 'en';

if (langSelect) {
  langSelect.addEventListener('change', (e) => {
    setLanguage(e.target.value);
    langSelect.blur(); // Remove focus
  });
}

function setLanguage(lang) {
  if (!translations[lang]) return;
  currentLang = lang;
  updateLanguage();
  if (langSelect) langSelect.value = lang;
}

// Theme System
const themeModal = document.getElementById('theme-modal');
const btnTheme = document.getElementById('btn-theme');
const btnCloseTheme = document.getElementById('btn-close-theme');
const themeCards = document.querySelectorAll('.theme-card');
let currentTheme = localStorage.getItem('theme') || 'midnight';

function setTheme(themeName) {
  // Remove all theme classes
  document.body.classList.remove(
    'theme-sunset', 'theme-ocean', 'theme-forest',
    'theme-aurora', 'theme-candy', 'theme-neon', 'theme-frost'
  );

  // Apply new theme (midnight is default, no class needed)
  if (themeName !== 'midnight') {
    document.body.classList.add(`theme-${themeName}`);
  }

  currentTheme = themeName;
  localStorage.setItem('theme', themeName);

  // Update active state on cards
  themeCards.forEach(card => {
    card.classList.toggle('active', card.dataset.theme === themeName);
  });
}

// Initialize theme on load
setTheme(currentTheme);

// Theme button opens modal
if (btnTheme) {
  btnTheme.addEventListener('click', () => {
    themeModal.classList.add('active');
    // Refresh active state
    themeCards.forEach(card => {
      card.classList.toggle('active', card.dataset.theme === currentTheme);
    });
  });
}

// Close theme modal
if (btnCloseTheme) {
  btnCloseTheme.addEventListener('click', () => {
    themeModal.classList.remove('active');
  });
}

// Theme card click
themeCards.forEach(card => {
  card.addEventListener('click', () => {
    setTheme(card.dataset.theme);
  });
});

// Close modal on overlay click
if (themeModal) {
  themeModal.addEventListener('click', (e) => {
    if (e.target === themeModal) {
      themeModal.classList.remove('active');
    }
  });
}

function updateLanguage() {
  const elements = document.querySelectorAll('[data-i18n]');
  const dict = translations[currentLang];

  elements.forEach(el => {
    const key = el.dataset.i18n;
    if (el.id === 'file-name' && currentMainFileName) return;

    if (dict[key]) {
      if (el.tagName === 'INPUT' && el.type === 'button') {
        el.value = dict[key];
      } else {
        el.textContent = dict[key];
      }
    }
  });

  // Manual Updates for Dynamic/Non-i18n elements
  const btnExp = document.getElementById('btn-experimental-menu');
  if (btnExp) btnExp.textContent = dict['btn_experimental'] || "Experimental ▼";

  // Experimental Menu Items
  const itemGrad = document.querySelector('#menu-item-gradient span');
  if (itemGrad) itemGrad.textContent = dict['menu_exp_gradient'] || "Multi-Gradient";

  const itemTrans = document.querySelector('#menu-item-transform span');
  if (itemTrans) itemTrans.textContent = dict['menu_exp_transform'] || "Transform Edit";

  // Group Select Buttons
  const btnEq = document.getElementById('btn-select-group-eq');
  if (btnEq) btnEq.textContent = dict['btn_select_eq'] || "Select Spectral";

  const btnStruct = document.getElementById('btn-select-group-struct');
  if (btnStruct) btnStruct.textContent = dict['btn_select_struct'] || "Select Structural";

  const proxyBtn = document.getElementById('btn-choose-audio');
  if (proxyBtn) proxyBtn.textContent = dict['btn_choose_audio'] || 'Choose Audio';

  // Update Tutorial if open
  const tutorialOverlay = document.getElementById('tutorial-overlay');
  if (tutorialOverlay && !tutorialOverlay.classList.contains('hidden')) {
    if (typeof updateTutorialFocus === 'function') updateTutorialFocus();
  }

  // Re-render lists to apply localized names/labels
  renderLayersList();
  renderRecordingsList();
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
proxyBtn.className = 'icon-btn proxy-audio-btn';
proxyBtn.textContent = translations[currentLang]['btn_choose_audio'] || 'Choose Audio';
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




// Color State with pre-sorted stops for performance
let vizColors = {
  mode: 'gradient',
  source: 'frequency',
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



// Input Source Logic
const btnInputOptions = document.getElementById('btn-input-options');
const inputOptionsMenu = document.getElementById('input-options-menu');
let currentInputType = 'mic'; // 'mic' or 'desktop'

if (btnInputOptions && inputOptionsMenu) {
  // Toggle Menu
  btnInputOptions.addEventListener('click', (e) => {
    e.stopPropagation();
    inputOptionsMenu.classList.toggle('hidden');
  });

  // Close menu on click outside
  document.addEventListener('click', () => {
    inputOptionsMenu.classList.add('hidden');
  });

  // Menu Item Selection
  inputOptionsMenu.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const val = e.target.getAttribute('data-value');
      if (val) {
        currentInputType = val;

        // If active, stop so user can restart with new mode
        if (audioEngine.isMicActive) {
          audioEngine.stopMic();
          btnMicToggle.classList.remove('active');
          if (typeof isRecording !== 'undefined' && isRecording) stopRecording();
        }

        updateInputLabel();
      }
    });
  });
}

function updateInputLabel() {
  const dict = translations[currentLang];
  if (currentInputType === 'mic') {
    btnMicToggle.textContent = audioEngine.isMicActive ? dict['btn_mic_on'] : dict['btn_mic_off'];
  } else {
    btnMicToggle.textContent = audioEngine.isMicActive ? dict['btn_desktop_on'] : dict['btn_desktop_off'];
  }
}

// Main Toggle Logic
btnMicToggle.addEventListener('click', async () => {
  if (audioEngine.isMicActive) {
    audioEngine.stopMic();
    updateInputLabel(); // Update label to show OFF
    btnMicToggle.classList.remove('active');

    // Stop recording if active
    if (typeof isRecording !== 'undefined' && isRecording) {
      stopRecording();
    }
  } else {
    // Start Logic
    updateInputLabel(); // Ensure label reflects language and mode before starting
    try {
      if (currentInputType === 'desktop') {
        // 🖥️ Desktop Audio
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });

        // Check if we got audio
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
          stream.getTracks().forEach(t => t.stop());
          alert('No system audio captured. Please check "Share system audio".');
          return;
        }

        // Connect stream
        await audioEngine.useStream(stream);

        // Listener to reset button if user clicks "Stop Sharing" in browser UI
        stream.getAudioTracks()[0].onended = () => {
          if (audioEngine.isMicActive) {
            audioEngine.stopMic();
            updateInputLabel();
            btnMicToggle.classList.remove('active');
          }
        };

      } else {
        // 🎤 Microphone
        await audioEngine.startMic();
      }

      if (audioEngine.isMicActive) {
        updateInputLabel();
        btnMicToggle.classList.add('active');
      }
    } catch (err) {
      console.error("Input capture error:", err);
      if (err.name !== 'NotAllowedError') {
        alert('Failed to capture input: ' + err.message);
      }
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
    const dict = translations[currentLang];
    const name = `${dict['label_recording'] || 'Recording'} ${recordings.length + 1}`;

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
    // Turn off input
    if (audioEngine.isMicActive) {
      audioEngine.stopMic();
      updateInputLabel(); // Use helper
      btnMicToggle.classList.remove('active');
    }
  }
}

btnRecordMic.addEventListener('click', async () => {
  if (isRecording) {
    stopRecording();
  } else {
    // Ensure Input is on
    if (!audioEngine.isMicActive) {
      if (typeof currentInputType !== 'undefined' && currentInputType === 'mic') {
        await audioEngine.startMic();
        if (audioEngine.isMicActive) {
          updateInputLabel();
          btnMicToggle.classList.add('active');
        } else {
          return;
        }
      } else {
        // Desktop mode or unknown
        showAlert('Please enable Live Input first.');
        return;
      }
    }

    if (audioEngine.isMicActive) startRecording();
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

// Recording Filtering Logic
const btnFilterUsed = document.getElementById('btn-filter-used');
const btnFilterUnused = document.getElementById('btn-filter-unused');
let recordingFilter = 'all'; // 'all', 'used', 'unused'

function isRecordingUsed(rec) {
  // Check if any layer uses this recording
  return layers.some(l => l.audioName === rec.name || l.fileUrl === rec.url);
}

function updateFilterButtons() {
  btnFilterUsed.classList.remove('active');
  btnFilterUnused.classList.remove('active');

  if (recordingFilter === 'used') btnFilterUsed.classList.add('active');
  if (recordingFilter === 'unused') btnFilterUnused.classList.add('active');
}

btnFilterUsed.addEventListener('click', () => {
  if (recordingFilter === 'used') {
    recordingFilter = 'all'; // Toggle off
  } else {
    recordingFilter = 'used';
  }
  updateFilterButtons();
  renderRecordingsList();
});

btnFilterUnused.addEventListener('click', () => {
  if (recordingFilter === 'unused') {
    recordingFilter = 'all'; // Toggle off
  } else {
    recordingFilter = 'unused';
  }
  updateFilterButtons();
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

  recordingsList.innerHTML = '';

  let displayRecs = recordings;
  if (recordingFilter === 'used') {
    displayRecs = recordings.filter(r => isRecordingUsed(r));
  } else if (recordingFilter === 'unused') {
    displayRecs = recordings.filter(r => !isRecordingUsed(r));
  }

  if (displayRecs.length === 0) {
    const dict = translations[currentLang];
    if (recordings.length === 0) {
      recordingsList.innerHTML = `<div class="empty-state">${dict['empty_recs'] || 'No recordings yet'}</div>`;
    } else {
      recordingsList.innerHTML = `<div class="empty-state">${dict['empty_no_match'] || 'No matching recordings'}</div>`;
    }
    return;
  }

  displayRecs.forEach(rec => {
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
      const newName = nameSpan.textContent.trim();
      if (newName) {
        rec.name = newName;
      } else {
        nameSpan.textContent = rec.name || 'Untitled';
      }
      nameSpan.contentEditable = 'false';
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

    // Download Button
    const btnDownload = document.createElement('button');
    btnDownload.className = 'icon-btn';
    btnDownload.textContent = '⬇';
    btnDownload.title = 'Download Recording';
    btnDownload.onclick = (e) => {
      e.stopPropagation();
      const a = document.createElement('a');
      a.href = rec.url;
      a.download = (rec.name || 'recording') + '.webm';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
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
      rec.audio.currentTime = 0; // Reset to start
      slider.value = 0;          // Update UI
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
      controls.appendChild(btnDownload);
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
  // 1. Edit Mode Rendering
  if (isEditingLayer) {
    const layer = isEditingLayer;

    // BG
    ctx.fillStyle = '#1e1e24';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Simulated Data (Linear Gradient)
    const simLen = layer.fftSize ? layer.fftSize / 2 : 1024;
    const simData = new Uint8Array(simLen);
    for (let i = 0; i < simLen; i++) {
      simData[i] = 255 * (1 - i / simLen);
    }

    // Draw Layer with Transform
    ctx.save();
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    // Apply Transform
    ctx.translate(cx + layer.x, cy + layer.y);
    ctx.rotate(layer.rotation);
    ctx.scale(layer.scaleX, layer.scaleY);
    ctx.translate(-cx, -cy);

    const vizFunc = visualizers[layer.type];
    if (vizFunc) {
      // Clip to layer bounds
      ctx.beginPath();
      ctx.rect(0, 0, canvas.width, canvas.height);
      ctx.clip();

      const layerColors = layer.colors || vizColors;
      ctx.globalAlpha = layer.opacity;
      vizFunc(ctx, canvas, simData, simLen, layerColors, layer);
    }
    ctx.restore();

    // Draw Gizmo
    drawGizmo(ctx, layer);

  } else {
    // 2. Normal Rendering
    const dataArray = audioEngine.getFrequencyData();
    const bufferLength = audioEngine.dataArray ? audioEngine.dataArray.length : 0;

    // Clear and BG
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (typeof drawBackground === 'function') drawBackground();

    layers.forEach(layer => {
      if (!layer.visible) return;

      let drawDataArray = null;
      let drawBufferLength = 0;

      if (audioEngine.isMicActive) {
        if (layer.selected) {
          drawDataArray = dataArray;
          drawBufferLength = bufferLength;
        } else if (layer.analyser && layer.dataArray) {
          layer.analyser.getByteFrequencyData(layer.dataArray);
          drawDataArray = layer.dataArray;
          drawBufferLength = layer.analyser.frequencyBinCount;
        } else {
          drawDataArray = new Uint8Array(bufferLength || 1024);
          drawBufferLength = drawDataArray.length;
        }
      } else {
        if (layer.analyser && layer.dataArray) {
          layer.analyser.getByteFrequencyData(layer.dataArray);
          drawDataArray = layer.dataArray;
          drawBufferLength = layer.analyser.frequencyBinCount;
        } else {
          drawDataArray = dataArray;
          drawBufferLength = bufferLength;
        }
      }

      const layerColors = layer.colors || vizColors;
      const vizFunc = visualizers[layer.type];

      if (vizFunc) {
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = layer.opacity;

        // Apply Transform (Normal Mode)
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        ctx.translate(cx + (layer.x || 0), cy + (layer.y || 0));
        ctx.rotate(layer.rotation || 0);
        ctx.scale(layer.scaleX || 1, layer.scaleY || 1);
        ctx.translate(-cx, -cy);

        vizFunc(ctx, canvas, drawDataArray, drawBufferLength, layerColors, layer);
        ctx.restore();
      }
    });
  }

  // Tutorial
  if (typeof tutorialActive !== 'undefined' && tutorialActive && typeof drawTutorialOverlay === 'function') {
    drawTutorialOverlay();
  }

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
  colorSourceSelect.value = targetColors.source || 'frequency';

  // Toggle source visibility: only for non-single modes
  rowColorSource.style.display = (targetColors.mode === 'single') ? 'none' : 'flex';

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

function renderMultiGradientEditor(targetColors) {
  if (!targetColors.multiGradients) {
    targetColors.multiGradients = [
      { start: 0, end: 50, stops: [{ offset: 0, color: '#ff0000' }, { offset: 100, color: '#0000ff' }] },
      { start: 50, end: 100, stops: [{ offset: 0, color: '#00ff00' }, { offset: 100, color: '#ffff00' }] }
    ];
  }

  targetColors.multiGradients.forEach((grad, index) => {
    const group = document.createElement('div');
    group.className = 'gradient-group';
    group.style.border = '1px solid rgba(255,255,255,0.1)';
    group.style.padding = '10px';
    group.style.marginBottom = '10px';
    group.style.borderRadius = '5px';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.marginBottom = '5px';
    header.innerHTML = `<strong>Gradient ${index + 1}</strong>`;

    const btnRemove = document.createElement('button');
    btnRemove.className = 'btn-remove-stop';
    btnRemove.textContent = '×';
    btnRemove.onclick = () => {
      targetColors.multiGradients.splice(index, 1);
      renderColorEditor();
      updatePreview();
    };
    header.appendChild(btnRemove);
    group.appendChild(header);

    // Range controls
    const rangeRow = document.createElement('div');
    rangeRow.className = 'color-row';
    rangeRow.innerHTML = `<label>Range</label>`;

    const startInp = document.createElement('input');
    startInp.type = 'range'; startInp.min = 0; startInp.max = 100;
    startInp.value = grad.start;
    startInp.oninput = (e) => { grad.start = parseInt(e.target.value); updatePreview(); };

    const endInp = document.createElement('input');
    endInp.type = 'range'; endInp.min = 0; endInp.max = 100;
    endInp.value = grad.end;
    endInp.oninput = (e) => { grad.end = parseInt(e.target.value); updatePreview(); };

    rangeRow.appendChild(startInp);
    rangeRow.appendChild(endInp);
    group.appendChild(rangeRow);

    // Stops sub-list
    const stopsList = document.createElement('div');
    grad.stops.forEach((stop, sIndex) => {
      const sRow = document.createElement('div');
      sRow.className = 'color-stop-row';

      const cInp = document.createElement('input');
      cInp.type = 'color'; cInp.value = stop.color;
      cInp.oninput = (e) => { stop.color = e.target.value; updatePreview(); };

      const oInp = document.createElement('input');
      oInp.type = 'range'; oInp.min = 0; oInp.max = 100;
      oInp.value = stop.offset;
      oInp.oninput = (e) => { stop.offset = parseInt(e.target.value); updatePreview(); };

      sRow.appendChild(cInp);
      sRow.appendChild(oInp);
      stopsList.appendChild(sRow);
    });

    const btnAddS = document.createElement('button');
    btnAddS.className = 'small-btn';
    btnAddS.textContent = '+ Color';
    btnAddS.onclick = () => {
      grad.stops.push({ offset: 50, color: '#ffffff' });
      renderColorEditor();
    };

    group.appendChild(stopsList);
    group.appendChild(btnAddS);
    colorStopsContainer.appendChild(group);
  });

  const btnAddG = document.createElement('button');
  btnAddG.className = 'small-btn';
  btnAddG.textContent = '+ Add Gradient Block';
  btnAddG.style.width = '100%';
  btnAddG.onclick = () => {
    targetColors.multiGradients.push({ start: 80, end: 100, stops: [{ offset: 0, color: '#ffffff' }, { offset: 100, color: '#ffffff' }] });
    renderColorEditor();
  };
  colorStopsContainer.appendChild(btnAddG);
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
      if (!l.colors) l.colors = JSON.parse(JSON.stringify(vizColors));
      l.colors.mode = mode;
    });
  } else {
    vizColors.mode = mode;
  }
  renderColorEditor();
  updatePreview();
});

colorSourceSelect.addEventListener('change', (e) => {
  const source = e.target.value;
  const selected = layers.filter(l => l.selected);
  if (selected.length > 0) {
    selected.forEach(l => {
      if (!l.colors) l.colors = JSON.parse(JSON.stringify(vizColors));
      l.colors.source = source;
    });
  } else {
    vizColors.source = source;
  }
  updateSortedStops();
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

const rowNodeSpeed = document.getElementById('row-node-speed');
const settingNodeSpeed = document.getElementById('setting-node-speed');
const settingNodeSpeedInput = document.getElementById('setting-node-speed-input');

const rowAnchorSpeed = document.getElementById('row-anchor-speed');
const settingAnchorSpeed = document.getElementById('setting-anchor-speed');
const settingAnchorSpeedInput = document.getElementById('setting-anchor-speed-input');


// Settings Logic


function updateSettingsVisibility() {
  const selectedLayers = layers.filter(l => l.selected);
  if (selectedLayers.length === 0) {
    rowDetail.classList.add('disabled');
    rowParticles.classList.add('disabled');
    rowParticleSize.classList.add('disabled');
    rowLineWeight.classList.add('disabled');
    rowIntensity.classList.add('disabled');
    rowNodeSpeed.classList.add('disabled');
    rowAnchorSpeed.classList.add('disabled');
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
    rowNodeSpeed.classList.remove('disabled');
    rowAnchorSpeed.classList.add('disabled');
  } else if (currentViz === 'constellation') {
    rowDetail.classList.add('disabled');
    rowParticles.classList.add('disabled');
    rowParticleSize.classList.remove('disabled');
    rowLineWeight.classList.remove('disabled');
    rowIntensity.classList.remove('disabled');
    rowNodeSpeed.classList.remove('disabled');
    rowAnchorSpeed.classList.add('disabled');
  } else if (currentViz === 'crystalWall') {
    rowDetail.classList.add('disabled');
    rowParticles.classList.add('disabled');
    rowParticleSize.classList.add('disabled');
    rowLineWeight.classList.add('disabled');
    rowIntensity.classList.remove('disabled');
    rowNodeSpeed.classList.remove('disabled');
    rowAnchorSpeed.classList.remove('disabled');
  } else if (currentViz === 'bars' || currentViz === 'circle' || currentViz === 'circle-linear') {
    rowDetail.classList.remove('disabled');
    rowParticles.classList.add('disabled');
    rowParticleSize.classList.add('disabled');
    rowLineWeight.classList.add('disabled');
    rowIntensity.classList.remove('disabled');
    rowNodeSpeed.classList.add('disabled');
    rowAnchorSpeed.classList.add('disabled');
  } else if (currentViz === 'flash') {
    rowDetail.classList.add('disabled');
    rowParticles.classList.add('disabled');
    rowParticleSize.classList.add('disabled');
    rowLineWeight.classList.add('disabled');
    rowIntensity.classList.remove('disabled');
    rowNodeSpeed.classList.add('disabled');
    rowAnchorSpeed.classList.add('disabled');
  } else {
    // Mixed or unknown
    rowDetail.classList.add('disabled');
    rowParticles.classList.add('disabled');
    rowParticleSize.classList.add('disabled');
    rowLineWeight.classList.add('disabled');
    rowIntensity.classList.add('disabled');
    rowNodeSpeed.classList.add('disabled');
    rowAnchorSpeed.classList.add('disabled');
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
    : (selectedLayers[0].vizSettings?.constellation?.baseSize || 2);

  const allSameSize = selectedLayers.every(l => {
    const size = l.type === 'particles'
      ? (l.vizSettings?.particles?.baseSize || 3)
      : (l.vizSettings?.constellation?.baseSize || 2);
    return size === firstSize;
  });
  settingParticleSize.value = allSameSize ? firstSize : 2;
  settingParticleSizeInput.value = allSameSize ? firstSize : '-';

  // Update Line Weight UI
  const firstWeight = selectedLayers[0].vizSettings?.constellation?.lineWeight || 1;
  const allSameWeight = selectedLayers.every(l => (l.vizSettings?.constellation?.lineWeight || 1) === firstWeight);
  settingLineWeight.value = allSameWeight ? firstWeight : 1;
  settingLineWeightInput.value = allSameWeight ? firstWeight : '-';

  // Update Intensity UI
  const firstIntensity = selectedLayers[0].vizSettings?.[selectedLayers[0].type]?.intensity || 1;
  const allSameIntensity = selectedLayers.every(l => (l.vizSettings?.[l.type]?.intensity || 1) === firstIntensity);
  settingIntensity.value = allSameIntensity ? firstIntensity : 1;
  settingIntensityInput.value = allSameIntensity ? firstIntensity : '-';

  // Update Node Speed UI
  let firstNodeSpeed = 1;
  if (selectedLayers[0].type === 'particles') firstNodeSpeed = selectedLayers[0].vizSettings?.particles?.nodeSpeed || 1;
  else if (selectedLayers[0].type === 'constellation') firstNodeSpeed = selectedLayers[0].vizSettings?.constellation?.nodeSpeed || 1;
  else if (selectedLayers[0].type === 'crystalWall') firstNodeSpeed = selectedLayers[0].vizSettings?.crystalWall?.nodeSpeed || 2;

  settingNodeSpeed.value = firstNodeSpeed;
  settingNodeSpeedInput.value = firstNodeSpeed;

  // Update Anchor Speed UI
  const firstAnchorSpeed = selectedLayers[0].vizSettings?.crystalWall?.anchorSpeed || 2;
  settingAnchorSpeed.value = firstAnchorSpeed;
  settingAnchorSpeedInput.value = firstAnchorSpeed;
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
  const targetLayers = layers.filter(l => l.selected && (l.type === 'particles' || l.type === 'constellation'));

  if (targetLayers.length === 0) {
    // Apply to all if none selected? Consistent with previous logic
    layers.filter(l => l.type === 'particles').forEach(layer => setParticleSize(val, layer));
    layers.filter(l => l.type === 'constellation').forEach(layer => setConstellationNodeSize(val, layer));
  } else {
    targetLayers.forEach(layer => {
      if (layer.type === 'particles') setParticleSize(val, layer);
      if (layer.type === 'constellation') setConstellationNodeSize(val, layer);
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
  const constellationLayers = layers.filter(l => l.selected && l.type === 'constellation');
  if (constellationLayers.length === 0) {
    layers.filter(l => l.type === 'constellation').forEach(layer => setConstellationLineWeight(val, layer));
  } else {
    constellationLayers.forEach(layer => setConstellationLineWeight(val, layer));
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

  // Apply to all if none selected (consistent with other settings)
  const targetLayers = selectedLayers.length > 0 ? selectedLayers : layers;

  targetLayers.forEach(layer => {
    if (!layer.vizSettings) layer.vizSettings = {};
    if (!layer.vizSettings[layer.type]) {
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

function updateNodeSpeedSafe(val) {
  if (isNaN(val) || val < 0.1) return;
  const targetLayers = layers.filter(l => l.selected && (l.type === 'particles' || l.type === 'constellation' || l.type === 'crystalWall'));

  if (targetLayers.length === 0) {
    // Apply to all of relevant type if none selected (legacy behavior support?)
    // Actually better to only apply to selected as per plan
    layers.filter(l => l.type === 'particles').forEach(l => setParticleNodeSpeed(val, l));
    layers.filter(l => l.type === 'constellation').forEach(l => setConstellationNodeSpeed(val, l));
    layers.filter(l => l.type === 'crystalWall').forEach(l => setCrystalNodeSpeed(val, l));
  } else {
    targetLayers.forEach(layer => {
      if (layer.type === 'particles') setParticleNodeSpeed(val, layer);
      if (layer.type === 'constellation') setConstellationNodeSpeed(val, layer);
      if (layer.type === 'crystalWall') setCrystalNodeSpeed(val, layer);
    });
  }
}

settingNodeSpeed.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  settingNodeSpeedInput.value = val;
  updateNodeSpeedSafe(val);
});

settingNodeSpeedInput.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  if (!isNaN(val) && val > 0) {
    settingNodeSpeed.value = val;
    updateNodeSpeedSafe(val);
  }
});

function updateAnchorSpeedSafe(val) {
  if (isNaN(val) || val < 0.1) return;
  const targetLayers = layers.filter(l => l.selected && l.type === 'crystalWall');

  if (targetLayers.length === 0) {
    layers.filter(l => l.type === 'crystalWall').forEach(l => setAnchorSpeed(val, l));
  } else {
    targetLayers.forEach(l => setAnchorSpeed(val, l));
  }
}

settingAnchorSpeed.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  settingAnchorSpeedInput.value = val;
  updateAnchorSpeedSafe(val);
});

settingAnchorSpeedInput.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  if (!isNaN(val) && val > 0) {
    settingAnchorSpeed.value = val;
    updateAnchorSpeedSafe(val);
  }
});

// Group Selection Logic
const btnSelectGroupEQ = document.getElementById('btn-select-group-eq');
const btnSelectGroupStruct = document.getElementById('btn-select-group-struct');

if (btnSelectGroupEQ) {
  btnSelectGroupEQ.addEventListener('click', () => {
    const types = ['bars', 'circle', 'circle-linear'];
    layers.forEach(l => {
      l.selected = types.includes(l.type);
    });
    renderLayersList();
    updateUI();
    renderColorEditor();
  });
}

if (btnSelectGroupStruct) {
  btnSelectGroupStruct.addEventListener('click', () => {
    const types = ['particles', 'constellation', 'crystalWall'];
    layers.forEach(l => {
      l.selected = types.includes(l.type);
    });
    renderLayersList();
    updateUI();
    renderColorEditor();
  });
}

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
  if (typeof backgroundState !== 'undefined' && backgroundState.type === 'video' && backgroundState.element) {
    backgroundState.element.pause();
    backgroundState.element.currentTime = 0;
  }

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
      if (typeof backgroundState !== 'undefined' && backgroundState.type === 'video' && backgroundState.element) {
        backgroundState.element.play();
      }

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
  if (typeof backgroundState !== 'undefined' && backgroundState.type === 'video' && backgroundState.element) {
    backgroundState.element.pause();
    backgroundState.element.currentTime = 0;
  }
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

// Global Playback Controls
const btnGlobalPlay = document.getElementById('btn-global-play');
const btnGlobalPause = document.getElementById('btn-global-pause');
const btnGlobalStop = document.getElementById('btn-global-stop');

if (btnGlobalPlay) {
  btnGlobalPlay.addEventListener('click', () => {
    layers.forEach(layer => {
      if (layer.audio) layer.audio.play().catch(e => console.warn(e));
    });
    // Sync Background Video
    if (backgroundState.type === 'video' && backgroundState.element) {
      backgroundState.element.play().catch(e => console.warn(e));
    }
  });
}

if (btnGlobalPause) {
  btnGlobalPause.addEventListener('click', () => {
    layers.forEach(layer => {
      if (layer.audio) layer.audio.pause();
    });
    if (backgroundState.type === 'video' && backgroundState.element) {
      backgroundState.element.pause();
    }
  });
}

if (btnGlobalStop) {
  btnGlobalStop.addEventListener('click', () => {
    layers.forEach(layer => {
      if (layer.audio) {
        layer.audio.pause();
        layer.audio.currentTime = 0;
      }
    });
    if (backgroundState.type === 'video' && backgroundState.element) {
      backgroundState.element.pause();
      backgroundState.element.currentTime = 0;
    }
  });
}
// Master Volume
const masterVolumeSlider = document.getElementById('master-volume');
if (masterVolumeSlider) {
  masterVolumeSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    // console.log('Vol:', val);
    audioEngine.setVolume(val);

    // Update all file players
    layers.forEach(layer => {
      if (layer.audio) {
        layer.audio.volume = val;
      }
    });

    // Update background video
    if (typeof backgroundState !== 'undefined' && backgroundState.element && backgroundState.type === 'video') {
      backgroundState.element.volume = val;
    }
  });
}

// Background Logic (Handlers)
const btnUploadBg = document.getElementById('btn-upload-bg');
const bgUploadInput = document.getElementById('bg-upload');
const btnToggleBg = document.getElementById('btn-toggle-bg');

if (btnUploadBg && bgUploadInput) {
  btnUploadBg.addEventListener('click', () => bgUploadInput.click());
  bgUploadInput.addEventListener('change', handleBgUpload);
}

if (btnToggleBg) {
  btnToggleBg.addEventListener('click', () => {
    backgroundState.visible = !backgroundState.visible;
    btnToggleBg.style.opacity = backgroundState.visible ? '1' : '0.5';
  });
}

function handleBgUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  backgroundState.url = url;

  if (file.type.startsWith('video/')) {
    backgroundState.type = 'video';
    backgroundState.element = document.createElement('video');
    backgroundState.element.src = url;
    backgroundState.element.loop = true;
    backgroundState.element.muted = true;
    backgroundState.element.playsInline = true;
    backgroundState.element.onloadedmetadata = () => {
      fitCanvasToBackground();
    };
  } else {
    backgroundState.type = 'image';
    backgroundState.element = new Image();
    backgroundState.element.src = url;
    backgroundState.element.onload = () => {
      fitCanvasToBackground();
    };
  }
}

function fitCanvasToBackground() {
  if (!backgroundState.element) return;

  const media = backgroundState.element;
  const w = media.naturalWidth || media.videoWidth;
  const h = media.naturalHeight || media.videoHeight;

  if (w && h) {
    canvas.width = w;
    canvas.height = h;
    resize(true); // pass flag to indicate we set size
  }
}

function drawBackground() {
  if (typeof backgroundState !== 'undefined' && backgroundState.visible && backgroundState.element) {
    // Check validity
    if (backgroundState.type === 'video' && backgroundState.element.readyState < 2) return;

    try {
      ctx.drawImage(backgroundState.element, 0, 0, canvas.width, canvas.height);

      // Optional dimming overlay
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } catch (e) {
      // Ignore draw errors (e.g. empty source)
    }
  }
}

// Refresh Button
const btnRefreshViz = document.getElementById('btn-refresh-viz');
if (btnRefreshViz) {
  btnRefreshViz.addEventListener('click', () => {
    const selected = layers.filter(l => l.selected);
    const targetLayers = selected.length > 0 ? selected : layers;

    let count = 0;
    targetLayers.forEach(l => {
      // Clear state to force re-initialization (scramble)
      l.vizState = null;
      count++;
    });

    if (count > 0) {
      // Simple rotation animation
      btnRefreshViz.style.transition = 'transform 0.5s ease';
      btnRefreshViz.style.transform = 'rotate(360deg)';
      setTimeout(() => {
        btnRefreshViz.style.transition = 'none';
        btnRefreshViz.style.transform = 'rotate(0deg)';
      }, 500);
    }
  });
}

// Tutorial Logic
const tutorialOverlay = document.getElementById('tutorial-overlay');
const tutorialSpotlight = document.getElementById('tutorial-spotlight');
const tutorialTooltip = document.getElementById('tutorial-tooltip');
const elTutTitle = document.getElementById('tut-title');
const elTutText = document.getElementById('tut-text');
const elTutStep = document.getElementById('tut-step');
const btnTutPrev = document.getElementById('btn-tut-prev');
const btnTutNext = document.getElementById('btn-tut-next');
const btnTutClose = document.getElementById('btn-tut-close');
const btnHelp = document.getElementById('btn-help');

let currentStepIndex = 0;
let tutRafId = null;

const tutorialSteps = [
  { target: null, titleKey: 'tut_step_intro_title', textKey: 'tut_step_intro_text', action: () => sidePanel.classList.add('hidden') },
  { target: '.global-controls', titleKey: 'tut_step_global_title', textKey: 'tut_step_global_text' },
  { target: '#visualizer-canvas', titleKey: 'tut_step_stage_title', textKey: 'tut_step_stage_text' },
  {
    target: '#btn-side-toggle',
    titleKey: 'tut_step_side_title',
    textKey: 'tut_step_side_text',
    advanceOnTargetClick: true,
    action: () => { sidePanel.classList.add('hidden'); if (btnSideToggle) btnSideToggle.textContent = '❯'; }
  },
  { target: '#side-panel', titleKey: 'tut_step_panel_title', textKey: 'tut_step_panel_text', action: () => { sidePanel.classList.remove('hidden'); if (btnSideToggle) btnSideToggle.textContent = '❮'; } },
  { target: '#viz-section-group', titleKey: 'tut_step_viz_group_title', textKey: 'tut_step_viz_group_text' },
  { target: '#recs-section-group', titleKey: 'tut_step_recs_group_title', textKey: 'tut_step_recs_group_text' },
  { target: '.main-controls-group', titleKey: 'tut_step_bottom_main_title', textKey: 'tut_step_bottom_main_text', action: () => { sidePanel.classList.add('hidden'); if (btnSideToggle) btnSideToggle.textContent = '❯'; } },
  { target: '.input-controls', titleKey: 'tut_step_input_title', textKey: 'tut_step_input_text' },
  { target: '.header-right', titleKey: 'tut_step_top_title', textKey: 'tut_step_top_text' }
];

function updateTutorialFocus() {
  const step = tutorialSteps[currentStepIndex];
  if (!step) return;

  if (step.action) step.action();

  const dict = translations[currentLang];

  elTutTitle.textContent = dict[step.titleKey] || step.titleKey;
  elTutText.textContent = dict[step.textKey] || step.textKey;
  elTutStep.textContent = `${currentStepIndex + 1}/${tutorialSteps.length}`;

  const elTutLangOpts = document.getElementById('tut-lang-options');
  if (elTutLangOpts) {
    if (currentStepIndex === 0) elTutLangOpts.classList.remove('hidden');
    else elTutLangOpts.classList.add('hidden');
  }

  btnTutPrev.disabled = currentStepIndex === 0;
  btnTutNext.textContent = currentStepIndex === tutorialSteps.length - 1 ? (dict['tut_finish'] || 'Finish') : (dict['tut_next'] || 'Next');

  // Handle Auto-Advance Listener
  if (step.advanceOnTargetClick && step.target) {
    const el = document.querySelector(step.target);
    if (el) {
      const nextHandler = () => {
        // Only advance if still on this step
        if (currentStepIndex < tutorialSteps.length && tutorialSteps[currentStepIndex] === step) {
          btnTutNext.click();
        }
      };
      el.addEventListener('click', nextHandler, { once: true });
    }
  }

  // Start RAF loop if needed
  if (!tutRafId) {
    tutRafLoop();
  }
}

function tutRafLoop() {
  const tutorialOverlay = document.getElementById('tutorial-overlay');
  if (!tutorialOverlay || tutorialOverlay.classList.contains('hidden')) {
    tutRafId = null;
    return;
  }

  updateTutorialPosition();
  tutRafId = requestAnimationFrame(tutRafLoop);
}

function updateTutorialPosition() {
  const step = tutorialSteps[currentStepIndex];
  if (!step) return;

  const targetEl = step.target ? document.querySelector(step.target) : null;

  if (targetEl) {
    const rect = targetEl.getBoundingClientRect();

    // If target is effectively hidden (width/height 0), treat as null
    if (rect.width === 0 && rect.height === 0) {
      tutorialSpotlight.style.opacity = '0';
      tutorialTooltip.style.top = '50%';
      tutorialTooltip.style.left = '50%';
      tutorialTooltip.style.transform = 'translate(-50%, -50%)';
      return;
    }

    const pad = 10;

    tutorialSpotlight.style.opacity = '1';
    tutorialSpotlight.style.top = `${rect.top - pad}px`;
    tutorialSpotlight.style.left = `${rect.left - pad}px`;
    tutorialSpotlight.style.width = `${rect.width + (pad * 2)}px`;
    tutorialSpotlight.style.height = `${rect.height + (pad * 2)}px`;

    // Tooltip Positioning
    const tipRect = tutorialTooltip.getBoundingClientRect();
    const tipW = tipRect.width || 300;
    const tipH = tipRect.height || 150;

    let tipTop = rect.bottom + 20;
    let tipLeft = rect.left + (rect.width / 2) - (tipW / 2);

    // Boundaries (Horizontal)
    if (tipLeft < 10) tipLeft = 10;
    if (tipLeft + tipW > window.innerWidth - 10) tipLeft = window.innerWidth - tipW - 10;

    // Vertical flip if too low
    if (tipTop + tipH > window.innerHeight - 10) {
      tipTop = rect.top - tipH - 20;
    }
    // Safety clamp top
    if (tipTop < 10) tipTop = 10;

    tutorialTooltip.style.top = `${tipTop}px`;
    tutorialTooltip.style.left = `${tipLeft}px`;
    tutorialTooltip.style.transform = 'none';

  } else {
    // No target - Center Tooltip and Highlight It (Welcome Screen)
    tutorialTooltip.style.top = '50%';
    tutorialTooltip.style.left = '50%';
    tutorialTooltip.style.transform = 'translate(-50%, -50%)';

    const ttRect = tutorialTooltip.getBoundingClientRect();
    const pad = 10;

    tutorialSpotlight.style.opacity = '1';
    tutorialSpotlight.style.top = `${ttRect.top - pad}px`;
    tutorialSpotlight.style.left = `${ttRect.left - pad}px`;
    tutorialSpotlight.style.width = `${ttRect.width + (pad * 2)}px`;
    tutorialSpotlight.style.height = `${ttRect.height + (pad * 2)}px`;
  }
}

function startTutorial() {
  currentStepIndex = 0;
  tutorialOverlay.classList.remove('hidden');

  document.querySelectorAll('.tut-lang-btn').forEach(btn => {
    btn.onclick = () => {
      const lang = btn.getAttribute('data-lang');
      if (lang) {
        setLanguage(lang);
        updateTutorialFocus();
      }
    };
  });

  updateTutorialFocus();
}

function endTutorial() {
  tutorialOverlay.classList.add('hidden');
}

if (btnHelp) {
  btnHelp.addEventListener('click', startTutorial);
  btnTutClose.addEventListener('click', endTutorial);
  btnTutNext.addEventListener('click', () => {
    if (currentStepIndex < tutorialSteps.length - 1) {
      currentStepIndex++;
      updateTutorialFocus();
    } else {
      endTutorial();
    }
  });
  btnTutPrev.addEventListener('click', () => {
    if (currentStepIndex > 0) {
      currentStepIndex--;
      updateTutorialFocus();
    }
  });
  window.addEventListener('resize', () => {
    if (!tutorialOverlay.classList.contains('hidden')) updateTutorialFocus();
  });
}
// Transform Edit Mode Logic
// (State moved to top)

function enterEditMode(layer) {
  // Ensure Transform Props
  if (typeof layer.x !== 'number') layer.x = 0;
  if (typeof layer.y !== 'number') layer.y = 0;
  if (typeof layer.scaleX !== 'number') layer.scaleX = 1;
  if (typeof layer.scaleY !== 'number') layer.scaleY = 1;
  if (typeof layer.rotation !== 'number') layer.rotation = 0;

  isEditingLayer = layer;
  if (editHintOverlay) editHintOverlay.classList.remove('hidden');

  // Hide UI
  if (typeof sidePanel !== 'undefined' && sidePanel) sidePanel.classList.add('hidden');
  const globalControls = document.querySelector('.global-controls');
  if (globalControls) globalControls.classList.add('hidden');
  const headerRight = document.querySelector('.header-right');
  if (headerRight) headerRight.classList.add('hidden');
  if (btnTogglePanel) btnTogglePanel.style.opacity = '0';
}

function exitEditMode() {
  isEditingLayer = null;
  if (editHintOverlay) editHintOverlay.classList.add('hidden');

  // Restore UI
  if (btnTogglePanel) btnTogglePanel.style.opacity = '1';
  const globalControls = document.querySelector('.global-controls');
  if (globalControls) globalControls.classList.remove('hidden');
  const headerRight = document.querySelector('.header-right');
  if (headerRight) headerRight.classList.remove('hidden');

  renderLayersList();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isEditingLayer) {
    exitEditMode();
  }
});

canvas.addEventListener('mousedown', handleEditMouseDown);
canvas.addEventListener('mousemove', handleEditMouseMove);
document.addEventListener('mouseup', handleEditMouseUp);

function getCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
}

// Gizmo Helper & Interaction Logic

function getGizmoLayout(layer) {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const tx = cx + layer.x;
  const ty = cy + layer.y;
  const sx = layer.scaleX || 1;
  const sy = layer.scaleY || 1;
  const r = layer.rotation || 0;
  const w = canvas.width;
  const h = canvas.height;

  const l_tl = { x: -cx, y: -cy };
  const l_tr = { x: w - cx, y: -cy };
  const l_br = { x: w - cx, y: h - cy };
  const l_bl = { x: -cx, y: h - cy };

  function toScreen(lp) {
    const sx_p = lp.x * sx;
    const sy_p = lp.y * sy;
    const rx = sx_p * Math.cos(r) - sy_p * Math.sin(r);
    const ry = sx_p * Math.sin(r) + sy_p * Math.cos(r);
    return { x: rx + tx, y: ry + ty };
  }

  const tl = toScreen(l_tl);
  const tr = toScreen(l_tr);
  const br = toScreen(l_br);
  const bl = toScreen(l_bl);

  const tm = { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 };
  const bm = { x: (bl.x + br.x) / 2, y: (bl.y + br.y) / 2 };
  const lm = { x: (tl.x + bl.x) / 2, y: (tl.y + bl.y) / 2 };
  const rm = { x: (tr.x + br.x) / 2, y: (tr.y + br.y) / 2 };

  const rotDist = 50;
  const ux = Math.sin(r);
  const uy = -Math.cos(r);
  const rotPos = { x: tm.x + ux * rotDist, y: tm.y + uy * rotDist };

  return { tl, tr, br, bl, tm, bm, lm, rm, rotPos, center: { x: tx, y: ty } };
}

function drawGizmo(ctx, layer) {
  const layout = getGizmoLayout(layer);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1.0;
  ctx.globalCompositeOperation = 'source-over';

  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(layout.tl.x, layout.tl.y);
  ctx.lineTo(layout.tr.x, layout.tr.y);
  ctx.lineTo(layout.br.x, layout.br.y);
  ctx.lineTo(layout.bl.x, layout.bl.y);
  ctx.closePath();
  ctx.stroke();

  ctx.fillStyle = '#00ff88';
  const s = 10;
  const drawHandle = (p) => ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);

  drawHandle(layout.tl); drawHandle(layout.tr); drawHandle(layout.br); drawHandle(layout.bl);
  drawHandle(layout.tm); drawHandle(layout.bm); drawHandle(layout.lm); drawHandle(layout.rm);

  ctx.beginPath();
  ctx.moveTo(layout.tm.x, layout.tm.y);
  ctx.lineTo(layout.rotPos.x, layout.rotPos.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(layout.rotPos.x, layout.rotPos.y, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function inverseTransform(mx, my, layer) {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const tx = cx + layer.x;
  const ty = cy + layer.y;
  let dx = mx - tx;
  let dy = my - ty;
  const r = -layer.rotation;
  const rx = dx * Math.cos(r) - dy * Math.sin(r);
  const ry = dx * Math.sin(r) + dy * Math.cos(r);
  const sx = layer.scaleX || 0.001;
  const sy = layer.scaleY || 0.001;
  return { x: (rx / sx) + cx, y: (ry / sy) + cy };
}

function getStartProps(l, x, y) {
  return { startX: x, startY: y, startScaleX: l.scaleX, startScaleY: l.scaleY, startRot: l.rotation };
}

function handleEditMouseDown(e) {
  if (!isEditingLayer) return;
  const { x, y } = getCanvasCoords(e);
  const layout = getGizmoLayout(isEditingLayer);
  const hitDist = 15;
  const check = (p) => Math.hypot(p.x - x, p.y - y) < hitDist;

  if (check(layout.rotPos)) {
    editDragState = { mode: 'rotate', startX: x, startY: y, startRot: isEditingLayer.rotation, centerX: layout.center.x, centerY: layout.center.y };
    return;
  }

  const corners = ['tl', 'tr', 'br', 'bl'];
  for (let c of corners) {
    if (check(layout[c])) { editDragState = { mode: 'resize', corner: c, ...getStartProps(isEditingLayer, x, y) }; return; }
  }
  const edges = ['tm', 'bm', 'lm', 'rm'];
  for (let c of edges) {
    if (check(layout[c])) { editDragState = { mode: 'resize', corner: c, ...getStartProps(isEditingLayer, x, y) }; return; }
  }

  const local = inverseTransform(x, y, isEditingLayer);
  if (local.x >= 0 && local.x <= canvas.width && local.y >= 0 && local.y <= canvas.height) {
    editDragState = { mode: 'move', startX: x, startY: y, initialX: isEditingLayer.x, initialY: isEditingLayer.y };
  }
}

function handleEditMouseMove(e) {
  if (!isEditingLayer || !editDragState) return;
  const { x, y } = getCanvasCoords(e);
  const layer = isEditingLayer;

  if (editDragState.mode === 'move') {
    layer.x = editDragState.initialX + (x - editDragState.startX);
    layer.y = editDragState.initialY + (y - editDragState.startY);
  } else if (editDragState.mode === 'rotate') {
    const angle = Math.atan2(y - editDragState.centerY, x - editDragState.centerX);
    layer.rotation = angle + Math.PI / 2;
  } else if (editDragState.mode === 'resize') {
    const cx = canvas.width / 2 + layer.x;
    const cy = canvas.height / 2 + layer.y;
    const dx = x - cx;
    const dy = y - cy;
    const r = -editDragState.startRot;
    const rx = dx * Math.cos(r) - dy * Math.sin(r);
    const ry = dx * Math.sin(r) + dy * Math.cos(r);
    const ohw = canvas.width / 2;
    const ohh = canvas.height / 2;
    let sx = layer.scaleX; let sy = layer.scaleY;
    const c = editDragState.corner;

    if (c === 'rm') { sx = rx / ohw; }
    else if (c === 'lm') { sx = -rx / ohw; }
    else if (c === 'bm') { sy = ry / ohh; }
    else if (c === 'tm') { sy = -ry / ohh; }
    else if (c === 'br') { sx = rx / ohw; sy = ry / ohh; }
    else if (c === 'tr') { sx = rx / ohw; sy = -ry / ohh; }
    else if (c === 'bl') { sx = -rx / ohw; sy = ry / ohh; }
    else if (c === 'tl') { sx = -rx / ohw; sy = -ry / ohh; }

    if (Math.abs(sx) < 0.05) sx = (sx < 0 ? -0.05 : 0.05);
    if (Math.abs(sy) < 0.05) sy = (sy < 0 ? -0.05 : 0.05);

    if (c.includes('m')) {
      if (c === 'lm' || c === 'rm') layer.scaleX = sx;
      else layer.scaleY = sy;
    } else {
      layer.scaleX = sx;
      layer.scaleY = sy;
    }
  }
}

function handleEditMouseUp(e) {
  editDragState = null;
}
