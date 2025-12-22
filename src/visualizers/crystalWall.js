import { hexToRgb, getMultiGradientColor, getColorFromStops, colorToRgba } from '../utils/colorUtils.js';

const DEFAULTS = {
    nodeCount: 50,
    connectDist: 120,
    anchorSpeed: 2.0, // Doubled default
    nodeSpeed: 2.0,   // Doubled default
    pulseStrength: 0.8,
    intensity: 1.0
};

/**
 * Crystal Wall Visualizer
 * Infinite deterministic grid version.
 */
export function drawCrystalWall(ctx, canvas, dataArray, bufferLength, vizColors, layer) {
    if (!layer) return;

    const width = canvas.width;
    const height = canvas.height;

    const settings = layer.vizSettings?.crystalWall || DEFAULTS;
    const NODE_COUNT = settings.nodeCount || DEFAULTS.nodeCount;
    // Map old 'speed' to 'anchorSpeed' if migrating, otherwise use new default
    const ANCHOR_SPEED = settings.anchorSpeed || settings.speed || DEFAULTS.anchorSpeed;
    const NODE_SPEED = settings.nodeSpeed || DEFAULTS.nodeSpeed;

    const PULSE = settings.pulseStrength || DEFAULTS.pulseStrength;
    const INTENSITY = settings.intensity || DEFAULTS.intensity;

    // Use a fixed spacing based on NODE_COUNT relative to full screen
    // We want about sqrt(NODE_COUNT) per side on screen.
    const spacing = Math.sqrt((width * height) / NODE_COUNT);
    const cellW = spacing;
    const cellH = spacing;

    // Init state if needed
    if (!layer.vizState || layer.vizState.type !== 'infinite-grid') {
        layer.vizState = {
            type: 'infinite-grid',
            driftX: 0,
            driftY: 0,
            totalTime: 0,

            // Velocity state
            currentVx: (Math.random() - 0.5) * 0.5,
            currentVy: (Math.random() - 0.5) * 0.5,
            targetVx: (Math.random() - 0.5) * 0.5,
            targetVy: (Math.random() - 0.5) * 0.5,

            // Timing
            changeTimer: 0,
            changeDuration: 100 + Math.random() * 200
        };
    }

    const state = layer.vizState;

    // Audio Analysis
    let sum = 0;
    const bassBins = Math.min(20, bufferLength);
    for (let i = 0; i < bassBins; i++) sum += dataArray[i];
    const rawEnergy = bassBins > 0 ? (sum / bassBins / 255) : 0;
    const energy = Math.pow(rawEnergy, 0.7) * INTENSITY;
    const pulseFactor = 1 + energy * PULSE;

    // Update Velocity Targets
    state.changeTimer += 1 * ANCHOR_SPEED; // Timer moves faster if speed is higher
    if (state.changeTimer > state.changeDuration) {
        state.changeTimer = 0;
        // Faster speed means shorter duration between changes
        // Base duration 200-500 frames at speed 1.0
        state.changeDuration = (10000 + Math.random() * 10000) / (ANCHOR_SPEED || 0.1);

        // Pick new random target velocity
        state.targetVx = (Math.random() - 0.5) * 0.5;
        state.targetVy = (Math.random() - 0.5) * 0.5;
    }

    // Interpolate Current Velocity towards Target
    // The easing factor should also be somewhat proportional to speed to avoid lag at high speeds
    const ease = 0.0001 * (ANCHOR_SPEED || 1);
    state.currentVx += (state.targetVx - state.currentVx) * ease;
    state.currentVy += (state.targetVy - state.currentVy) * ease;

    // Update state
    state.totalTime += 0.016 * NODE_SPEED; // Use Node Speed for rotation/jitter timing
    state.driftX += state.currentVx * ANCHOR_SPEED; // Use Current Velocity & Anchor Speed for drift
    state.driftY += state.currentVy * ANCHOR_SPEED;

    const margin = spacing * 1.5;
    const startCol = Math.floor((-state.driftX - margin) / cellW);
    const endCol = Math.ceil((width - state.driftX + margin) / cellW);
    const startRow = Math.floor((-state.driftY - margin) / cellH);
    const endRow = Math.ceil((height - state.driftY + margin) / cellH);

    // Get RGBs
    const stops = vizColors.stops && vizColors.stops.length > 0 ? vizColors.stops : [{ color: '#ffffff' }];
    const stopRGBs = stops.map(s => hexToRgb(s.color));

    // Simple hash function for deterministic randomness
    const hash = (c, r) => {
        const x = Math.sin(c * 12.9898 + r * 78.233) * 43758.5453;
        return x - Math.floor(x);
    };

    const getPersistentNode = (c, r) => {
        const h1 = hash(c, r);
        const h2 = hash(r, c);
        const h3 = hash(c + r, c - r);

        // Constant anchor position
        const ax = c * cellW + state.driftX;
        const ay = r * cellH + state.driftY;

        // Deterministic jitter
        const rotSpeed = 0.01 + h1 * 0.02;
        const range = (15 + h2 * 25);
        const angle = h3 * Math.PI * 2 + state.totalTime * rotSpeed;

        return {
            x: ax + Math.cos(angle) * range,
            y: ay + Math.sin(angle) * range
        };
    };

    // Render loop
    for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
            // Predetermined triangles (grid mesh)
            const n_00 = getPersistentNode(c, r);
            const n_10 = getPersistentNode(c + 1, r);
            const n_01 = getPersistentNode(c, r + 1);
            const n_11 = getPersistentNode(c + 1, r + 1);

            // Triangle 1
            fillTriangle(ctx, n_00, n_10, n_01, energy, stopRGBs, vizColors);
            // Triangle 2
            fillTriangle(ctx, n_10, n_11, n_01, energy, stopRGBs, vizColors);
        }
    }
}



function fillTriangle(ctx, n1, n2, n3, energy, stopRGBs, vizColors) {
    const centerX = (n1.x + n2.x + n3.x) / 3;
    const centerY = (n1.y + n2.y + n3.y) / 3;

    // Pick color
    let colorString;
    const alpha = (0.05 + energy * 0.3);
    const useFreqSource = (vizColors.source !== 'volume');
    const sortedStops = vizColors.sortedStops ||
        [...vizColors.stops].sort((a, b) => a.offset - b.offset);

    if (vizColors.mode === 'multi-gradient' && vizColors.multiGradients) {
        const t = useFreqSource ? (centerX / ctx.canvas.width) : energy;
        colorString = getMultiGradientColor(vizColors.multiGradients, t);
        ctx.fillStyle = colorToRgba(colorString, alpha);
        ctx.strokeStyle = colorToRgba(colorString, alpha * 0.5);
    } else if (vizColors.mode === 'single') {
        const rgb = stopRGBs[0] || { r: 255, g: 255, b: 255 };
        colorString = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
        ctx.fillStyle = colorString;
        ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha * 0.5})`;
    } else {
        // Gradient mode
        const t = useFreqSource ? (centerX / ctx.canvas.width) : energy;
        colorString = getColorFromStops(sortedStops, t);
        ctx.fillStyle = colorToRgba(colorString, alpha);
        ctx.strokeStyle = colorToRgba(colorString, alpha * 0.5);
    }

    ctx.beginPath();
    ctx.moveTo(n1.x, n1.y);
    ctx.lineTo(n2.x, n2.y);
    ctx.lineTo(n3.x, n3.y);
    ctx.closePath();

    ctx.fill();
    ctx.stroke();
}

export function getCrystalWallDefaults() {
    return { ...DEFAULTS };
}

export function setAnchorSpeed(val, layer) {
    if (!layer) return;
    if (!layer.vizSettings) layer.vizSettings = {};
    if (!layer.vizSettings.crystalWall) layer.vizSettings.crystalWall = { ...DEFAULTS };
    layer.vizSettings.crystalWall.anchorSpeed = val;
}

export function setNodeSpeed(val, layer) {
    if (!layer) return;
    if (!layer.vizSettings) layer.vizSettings = {};
    if (!layer.vizSettings.crystalWall) layer.vizSettings.crystalWall = { ...DEFAULTS };
    layer.vizSettings.crystalWall.nodeSpeed = val;
}
