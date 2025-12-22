import { hexToRgb, getMultiGradientColor } from '../utils/colorUtils.js';

const DEFAULTS = {
    nodeCount: 50,
    connectDist: 120,
    speed: 1.0,
    pulseStrength: 0.8,
    intensity: 1.0
};

/**
 * Crystal Wall Visualizer
 * Similar to Proximity Dots but hides nodes and fills closed shapes.
 */
export function drawCrystalWall(ctx, canvas, dataArray, bufferLength, vizColors, layer) {
    if (!layer) return;

    const width = canvas.width;
    const height = canvas.height;

    const settings = layer.vizSettings?.crystalWall || DEFAULTS;
    const NODE_COUNT = settings.nodeCount || DEFAULTS.nodeCount;
    const CONNECT_DIST = settings.connectDist || DEFAULTS.connectDist;
    const SPEED = settings.speed || DEFAULTS.speed;
    const PULSE = settings.pulseStrength || DEFAULTS.pulseStrength;
    const INTENSITY = settings.intensity || DEFAULTS.intensity;

    // Init State (reuse proximity logic for nodes)
    if (!layer.vizState || !layer.vizState.nodes ||
        layer.vizState.lastNodeCount !== NODE_COUNT) {

        layer.vizState = {
            nodes: [],
            lastNodeCount: NODE_COUNT
        };

        for (let i = 0; i < NODE_COUNT; i++) {
            layer.vizState.nodes.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 1.5 * SPEED,
                vy: (Math.random() - 0.5) * 1.5 * SPEED
            });
        }
    }

    const nodes = layer.vizState.nodes;

    // Audio Analysis
    let sum = 0;
    const bassBins = Math.min(20, bufferLength);
    for (let i = 0; i < bassBins; i++) sum += dataArray[i];
    const rawEnergy = bassBins > 0 ? (sum / bassBins / 255) : 0;
    const energy = Math.pow(rawEnergy, 0.7) * INTENSITY;
    const pulseFactor = 1 + energy * PULSE;

    // Update Nodes
    nodes.forEach(node => {
        node.x += node.vx * pulseFactor;
        node.y += node.vy * pulseFactor;

        if (node.x < 0 || node.x > width) node.vx *= -1;
        if (node.y < 0 || node.y > height) node.vy *= -1;
        node.x = Math.max(0, Math.min(width, node.x));
        node.y = Math.max(0, Math.min(height, node.y));
    });

    // Get RGBs
    const stops = vizColors.stops && vizColors.stops.length > 0 ? vizColors.stops : [{ color: '#ffffff' }];
    const stopRGBs = stops.map(s => hexToRgb(s.color));

    // For Crystal Wall, we find triangles (triplets of connected nodes)
    // and fill them. We also ensure every node has at least one connection if possible.
    for (let i = 0; i < nodes.length; i++) {
        let neighbors = [];
        for (let j = 0; j < nodes.length; j++) {
            if (i === j) continue;
            const dSq = distSq(nodes[i], nodes[j]);
            if (dSq < CONNECT_DIST * CONNECT_DIST) {
                neighbors.push(j);
            }
        }

        // Fallback: If no neighbors in range, find the 2 nearest
        if (neighbors.length === 0) {
            const sortedByDist = nodes
                .map((n, idx) => ({ idx, dist: i === idx ? Infinity : distSq(nodes[i], n) }))
                .sort((a, b) => a.dist - b.dist);
            neighbors.push(sortedByDist[0].idx);
            neighbors.push(sortedByDist[1].idx);
        }

        // Triangle detection among neighbors
        for (let idxJ = 0; idxJ < neighbors.length; idxJ++) {
            const j = neighbors[idxJ];
            if (j <= i) continue; // Avoid double counting pairs

            for (let idxK = idxJ + 1; idxK < neighbors.length; idxK++) {
                const k = neighbors[idxK];
                // Check if j and k are also connected (to form a triangle with i)
                if (distSq(nodes[j], nodes[k]) < (CONNECT_DIST * CONNECT_DIST * 2)) { // Slightly more lenient for the "third leg" if forced
                    fillTriangle(ctx, nodes[i], nodes[j], nodes[k], energy, stopRGBs, vizColors);
                }
            }
        }
    }
}

function distSq(n1, n2) {
    const dx = n1.x - n2.x;
    const dy = n1.y - n2.y;
    return dx * dx + dy * dy;
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
        ctx.fillStyle = colorString.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
        ctx.strokeStyle = colorString.replace('rgb(', 'rgba(').replace(')', `, ${alpha * 0.5})`);
    } else if (vizColors.mode === 'single') {
        const rgb = stopRGBs[0] || { r: 255, g: 255, b: 255 };
        colorString = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
        ctx.fillStyle = colorString;
        ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha * 0.5})`;
    } else {
        // Gradient mode
        const t = useFreqSource ? (centerX / ctx.canvas.width) : energy;
        colorString = getColorFromStops(sortedStops, t);
        ctx.fillStyle = colorString.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
        ctx.strokeStyle = colorString.replace('rgb(', 'rgba(').replace(')', `, ${alpha * 0.5})`);
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
