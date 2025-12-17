import { hexToRgb } from '../utils/colorUtils.js';

// Default settings
const DEFAULTS = {
    nodeCount: 60,
    connectDist: 150
};

export function drawCrystalWall(ctx, canvas, dataArray, bufferLength, vizColors, layer) {
    if (!layer) return;

    const width = canvas.width;
    const height = canvas.height;

    // Get settings from layer or use defaults
    const settings = layer.vizSettings?.crystal || DEFAULTS;
    const NODE_COUNT = settings.nodeCount || DEFAULTS.nodeCount;
    const CONNECT_DIST = settings.connectDist || DEFAULTS.connectDist;

    // Init State
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
                vx: (Math.random() - 0.5) * 1.5,
                vy: (Math.random() - 0.5) * 1.5,
                size: Math.random() * 2 + 1
            });
        }
    }

    const nodes = layer.vizState.nodes;

    // Audio Analysis (Average Bass for energy)
    let sum = 0;
    const bassBins = Math.min(20, bufferLength);
    for (let i = 0; i < bassBins; i++) {
        sum += dataArray[i];
    }
    const energy = sum / bassBins / 255; // 0..1
    const pulse = 1 + energy * 0.5;

    // Update Nodes
    nodes.forEach(node => {
        node.x += node.vx * pulse;
        node.y += node.vy * pulse;

        // Bounce
        if (node.x < 0 || node.x > width) node.vx *= -1;
        if (node.y < 0 || node.y > height) node.vy *= -1;
    });

    // Draw Connections
    ctx.lineWidth = 1;
    const baseColor = vizColors.stops[0]?.color || '#ffffff';
    const rgb = hexToRgb(baseColor);

    nodes.forEach((nodeA, i) => {
        // Draw Node
        ctx.beginPath();
        ctx.arc(nodeA.x, nodeA.y, nodeA.size * pulse, 0, Math.PI * 2);
        ctx.fillStyle = baseColor;
        ctx.fill();

        // Check connections
        for (let j = i + 1; j < nodes.length; j++) {
            const nodeB = nodes[j];
            const dx = nodeA.x - nodeB.x;
            const dy = nodeA.y - nodeB.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < CONNECT_DIST) {
                const alpha = 1 - (dist / CONNECT_DIST);
                ctx.beginPath();
                ctx.moveTo(nodeA.x, nodeA.y);
                ctx.lineTo(nodeB.x, nodeB.y);
                ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha * energy * 2})`;
                ctx.stroke();
            }
        }
    });
}

/**
 * Get default settings for crystal visualizer
 */
export function getCrystalDefaults() {
    return { ...DEFAULTS };
}
