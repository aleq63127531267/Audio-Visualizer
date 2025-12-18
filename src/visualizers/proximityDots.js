import { hexToRgb } from '../utils/colorUtils.js';

// Default settings
const DEFAULTS = {
    nodeCount: 80,
    connectDist: 150,
    speed: 1.0,
    pulseStrength: 0.8
};

/**
 * Proximity Dots Visualizer
 * Dots move around and connect with lines when close.
 * Reactive to audio energy (frequency data).
 */
export function drawProximityDots(ctx, canvas, dataArray, bufferLength, vizColors, layer) {
    if (!layer) return;

    const width = canvas.width || 800;
    const height = canvas.height || 600;

    // Get settings from layer or use defaults
    const settings = layer.vizSettings?.proximityDots || DEFAULTS;
    const NODE_COUNT = settings.nodeCount || DEFAULTS.nodeCount;
    const CONNECT_DIST = settings.connectDist || DEFAULTS.connectDist;
    const SPEED = settings.speed || DEFAULTS.speed;
    const PULSE = settings.pulseStrength || DEFAULTS.pulseStrength;

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
                size: Math.random() * 2 + 1,
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
    const energy = bassBins > 0 ? (sum / bassBins / 255) : 0; // Guard against NaN
    const pulseFactor = 1 + energy * PULSE;

    // Detect and repair NaN corruption
    let needsReset = false;

    // Update Nodes
    nodes.forEach(node => {
        node.x += node.vx * pulseFactor;
        node.y += node.vy * pulseFactor;

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
    ctx.lineWidth = 1;

    // Predetermine RGBs for stops for efficiency. 
    // FALLBACK if vizColors.stops is missing or empty
    const stops = vizColors.stops && vizColors.stops.length > 0 ? vizColors.stops : [{ color: '#ffffff' }];
    const stopRGBs = stops.map(s => hexToRgb(s.color));

    nodes.forEach((nodeA, i) => {
        const rgbA = stopRGBs[nodeA.colorIndex % stopRGBs.length] || { r: 255, g: 255, b: 255 };
        const colorA = `rgb(${rgbA.r}, ${rgbA.g}, ${rgbA.b})`;

        // Draw Node
        ctx.beginPath();
        ctx.arc(nodeA.x, nodeA.y, nodeA.size * pulseFactor, 0, Math.PI * 2);
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

                // Blend colors? Simple: use Node A's color with alpha
                ctx.strokeStyle = `rgba(${rgbA.r}, ${rgbA.g}, ${rgbA.b}, ${alpha})`;
                ctx.stroke();
            }
        }
    });
}

/**
 * Get default settings for proximity dots visualizer
 */
export function getProximityDotsDefaults() {
    return { ...DEFAULTS };
}

/**
 * Rescale nodes for resize
 */
export function scaleProximityNodes(oldW, oldH, newW, newH, layer) {
    if (!layer.vizState?.nodes) return;
    const scaleX = newW / oldW;
    const scaleY = newH / oldH;
    layer.vizState.nodes.forEach(node => {
        node.x *= scaleX;
        node.y *= scaleY;
    });
}
