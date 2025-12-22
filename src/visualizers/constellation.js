import { hexToRgb, colorToRgba, getMultiGradientColor, getColorFromStops } from '../utils/colorUtils.js';

// Default settings
const DEFAULTS = {
    nodeCount: 80,
    connectDist: 150,
    speed: 1.0,
    pulseStrength: 0.8,
    baseSize: 2,
    lineWeight: 1,
    intensity: 1.0,
    nodeSpeed: 1.0
};

/**
 * Constellation Visualizer
 * Dots move around and connect with lines when close.
 * Reactive to audio energy (frequency data).
 */
export function drawConstellation(ctx, canvas, dataArray, bufferLength, vizColors, layer) {
    if (!layer) return;

    const width = canvas.width || 800;
    const height = canvas.height || 600;

    // Get settings from layer or use defaults
    const settings = layer.vizSettings?.constellation || DEFAULTS;
    const NODE_COUNT = settings.nodeCount || DEFAULTS.nodeCount;
    const CONNECT_DIST = settings.connectDist || DEFAULTS.connectDist;
    const SPEED = settings.speed || DEFAULTS.speed;
    const PULSE = settings.pulseStrength || DEFAULTS.pulseStrength;
    const BASE_SIZE = settings.baseSize || DEFAULTS.baseSize;
    const LINE_WEIGHT = settings.lineWeight || DEFAULTS.lineWeight;
    const INTENSITY = settings.intensity || DEFAULTS.intensity;
    const NODE_SPEED = settings.nodeSpeed || DEFAULTS.nodeSpeed;

    // Init State
    if (!layer.vizState || !layer.vizState.nodes ||
        layer.vizState.lastNodeCount !== NODE_COUNT ||
        Math.abs(layer.vizState.lastWidth - width) > 100 ||
        Math.abs(layer.vizState.lastHeight - height) > 100) {

        layer.vizState = {
            nodes: [],
            lastNodeCount: NODE_COUNT,
            lastWidth: width,
            lastHeight: height
        };

        const stopCount = vizColors.stops?.length || 1;

        for (let i = 0; i < NODE_COUNT; i++) {
            layer.vizState.nodes.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 1.5 * SPEED,
                vy: (Math.random() - 0.5) * 1.5 * SPEED,
                size: Math.random() * 2 + 1, // This will be multiplied by BASE_SIZE later? 
                // Let's make it more consistent with BASE_SIZE.
                relativeSize: Math.random() * 0.5 + 0.5, // 0.5 to 1.0
                colorIndex: Math.floor(Math.random() * stopCount)
            });
        }
    }


    const nodes = layer.vizState.nodes;

    // Audio Analysis (Average Bass for energy)
    let sum = 0;
    const bassBins = Math.min(20, bufferLength);
    if (bassBins > 0) {
        for (let i = 0; i < bassBins; i++) {
            sum += dataArray[i];
        }
    }
    const rawEnergy = bassBins > 0 ? (sum / bassBins / 255) : 0;
    const energy = Math.pow(rawEnergy, 0.7) * INTENSITY;
    const pulseFactor = 1 + energy * PULSE;

    // Detect and repair NaN corruption
    let needsReset = false;

    // Update Nodes
    nodes.forEach(node => {
        node.x += node.vx * pulseFactor * NODE_SPEED;
        node.y += node.vy * pulseFactor * NODE_SPEED;

        if (isNaN(node.x) || isNaN(node.y)) needsReset = true;

        // Bounce with slightly jittery movement when energized
        if (node.x < 0 || node.x > width) {
            node.vx *= -1;
            node.x = Math.max(0, Math.min(width, node.x));
        }
        if (node.y < 0 || node.y > height) {
            node.vy *= -1;
            node.y = Math.max(0, Math.min(height, node.y));
        }
    });

    if (needsReset) {
        layer.vizState = null; // Force re-init on next frame
        return;
    }


    // Draw Connections
    ctx.lineWidth = LINE_WEIGHT;

    // Predetermine RGBs for stops for efficiency. 
    // FALLBACK if vizColors.stops is missing or empty
    // Use pre-sorted stops if available
    const stops = vizColors.stops && vizColors.stops.length > 0 ? vizColors.stops : [{ color: '#ffffff', offset: 0 }];
    const sortedStops = vizColors.sortedStops ||
        [...stops].sort((a, b) => a.offset - b.offset);


    nodes.forEach((nodeA, i) => {
        let colorA;
        const binIndex = Math.floor((i / nodes.length) * (bufferLength * 0.5));
        const valA = dataArray[binIndex] || 0;
        const useFreqSource = (vizColors.source !== 'volume');

        if (vizColors.mode === 'single') {
            colorA = sortedStops[0]?.color || '#ffffff';
        } else if (vizColors.mode === 'multi-gradient' && vizColors.multiGradients) {
            const t = useFreqSource ? (i / nodes.length) : (valA / 200);
            colorA = getMultiGradientColor(vizColors.multiGradients, t);
        } else { // Default to gradient mode
            const t = useFreqSource ? (i / nodes.length) : (valA / 200);
            colorA = getColorFromStops(sortedStops, t);
        }

        // Draw Node
        ctx.beginPath();
        const drawSize = (nodeA.relativeSize || 1) * BASE_SIZE * pulseFactor;
        ctx.arc(nodeA.x, nodeA.y, drawSize, 0, Math.PI * 2);
        ctx.fillStyle = colorA;
        ctx.fill();

        // Check connections
        for (let j = i + 1; j < nodes.length; j++) {
            const nodeB = nodes[j];
            const dx = nodeA.x - nodeB.x;
            const dy = nodeA.y - nodeB.y;
            const distSq = dx * dx + dy * dy;
            const minDistSq = CONNECT_DIST * CONNECT_DIST;

            if (distSq < minDistSq) {
                const dist = Math.sqrt(distSq);
                const alpha = (1 - (dist / CONNECT_DIST)) * (0.2 + energy * 0.8);

                ctx.beginPath();
                ctx.moveTo(nodeA.x, nodeA.y);
                ctx.lineTo(nodeB.x, nodeB.y);

                // Use colorA with alpha
                ctx.strokeStyle = colorToRgba(colorA, alpha);
                ctx.stroke();
            }
        }
    });
}

/**
 * Get default settings for proximity dots visualizer
 */
export function getConstellationDefaults() {
    return { ...DEFAULTS };
}

/**
 * Rescale nodes for resize
 */
export function scaleConstellationNodes(oldW, oldH, newW, newH, layer) {
    if (!layer.vizState?.nodes) return;
    const scaleX = newW / oldW;
    const scaleY = newH / oldH;
    layer.vizState.nodes.forEach(node => {
        node.x *= scaleX;
        node.y *= scaleY;
    });
}
/**
 * Set node size for a specific layer
 */
export function setConstellationNodeSize(size, layer) {
    if (!layer) return;
    if (!layer.vizSettings) layer.vizSettings = {};
    if (!layer.vizSettings.constellation) layer.vizSettings.constellation = { ...DEFAULTS };
    layer.vizSettings.constellation.baseSize = size;
}

/**
 * Set line weight for a specific layer
 */
export function setConstellationLineWeight(weight, layer) {
    if (!layer) return;
    if (!layer.vizSettings) layer.vizSettings = {};
    if (!layer.vizSettings.constellation) layer.vizSettings.constellation = { ...DEFAULTS };
    layer.vizSettings.constellation.lineWeight = weight;
}

/**
 * Set intensity for a specific layer
 */
export function setConstellationIntensity(val, layer) {
    if (!layer) return;
    if (!layer.vizSettings) layer.vizSettings = {};
    if (!layer.vizSettings.constellation) layer.vizSettings.constellation = { ...DEFAULTS };
    layer.vizSettings.constellation.intensity = val;
}

export function setConstellationNodeSpeed(val, layer) {
    if (!layer) return;
    if (!layer.vizSettings) layer.vizSettings = {};
    if (!layer.vizSettings.constellation) layer.vizSettings.constellation = { ...DEFAULTS };
    layer.vizSettings.constellation.nodeSpeed = val;
}
