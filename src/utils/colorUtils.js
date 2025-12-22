/**
 * Shared color utilities for visualizers
 */

/**
 * Convert hex color to RGB object
 * @param {string} hex - Hex color string (e.g., '#ff00ff')
 * @returns {{r: number, g: number, b: number}}
 */
export function hexToRgb(hex) {
    const bigint = parseInt(hex.slice(1), 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return { r, g, b };
}

/**
 * Convert hex color to RGB string
 * @param {string} hex - Hex color string
 * @returns {string} RGB string (e.g., 'rgb(255,0,255)')
 */
export function hexToRgbString(hex) {
    const c = hexToRgb(hex);
    return `rgb(${c.r},${c.g},${c.b})`;
}

/**
 * Linear interpolation
 * @param {number} start - Start value
 * @param {number} end - End value
 * @param {number} t - Interpolation factor (0-1)
 * @returns {number}
 */
export function lerp(start, end, t) {
    return start + (end - start) * t;
}

/**
 * Get interpolated color from gradient stops
 * @param {Array<{offset: number, color: string}>} stops - Gradient stops (offset 0-100)
 * @param {number} t - Position (0-1)
 * @returns {string} RGB color string
 */
export function getColorFromStops(stops, t) {
    if (!stops || stops.length === 0) return 'rgb(255,255,255)';
    if (stops.length === 1) return hexToRgbString(stops[0].color);

    // Scale t to 0..100 for stops comparison
    const tPerc = t * 100;

    let startStop = stops[0];
    let endStop = stops[stops.length - 1];

    for (let i = 0; i < stops.length - 1; i++) {
        if (tPerc >= stops[i].offset && tPerc <= stops[i + 1].offset) {
            startStop = stops[i];
            endStop = stops[i + 1];
            break;
        }
    }

    if (tPerc < startStop.offset) return hexToRgbString(startStop.color);
    if (tPerc > endStop.offset) return hexToRgbString(endStop.color);

    const range = endStop.offset - startStop.offset;
    const localT = range === 0 ? 0 : (tPerc - startStop.offset) / range;

    const c1 = hexToRgb(startStop.color);
    const c2 = hexToRgb(endStop.color);

    const r = Math.floor(lerp(c1.r, c2.r, localT));
    const g = Math.floor(lerp(c1.g, c2.g, localT));
    const b = Math.floor(lerp(c1.b, c2.b, localT));

    return `rgb(${r},${g},${b})`;
}

/**
 * Get color from multi-gradient setup
 * @param {Array} multiGradients - Array of gradient segments
 * @param {number} t - Position (0-1)
 * @returns {string} RGB color string
 */
export function getMultiGradientColor(multiGradients, t) {
    const tPerc = t * 100;

    // Find all segments that have some influence (within a small margin or overlapping)
    const margin = 5; // 5% overlap/margin for smoothing
    const influencers = multiGradients
        .map(g => {
            const mid = (g.start + g.end) / 2;
            const halfLen = (g.end - g.start) / 2;
            const dist = Math.abs(tPerc - mid);
            // Influence is 1 inside the segment, and tapers off outside
            let influence = 0;
            if (tPerc >= g.start && tPerc <= g.end) {
                influence = 1;
            } else if (dist < halfLen + margin) {
                influence = 1 - (dist - halfLen) / margin;
            }
            return { g, influence };
        })
        .filter(item => item.influence > 0);

    if (influencers.length === 0) return 'rgb(0,0,0)';
    if (influencers.length === 1) {
        const segment = influencers[0].g;
        const range = segment.end - segment.start;
        const localT = range === 0 ? 0 : (tPerc - segment.start) / range;
        return getColorFromStops(segment.stops, localT);
    }

    // Blend multiple segments
    let totalR = 0, totalG = 0, totalB = 0, totalInf = 0;
    influencers.forEach(item => {
        const segment = item.g;
        const range = segment.end - segment.start;
        const localT = range === 0 ? 0 : (tPerc - segment.start) / range;
        const color = getColorFromStops(segment.stops, localT);
        // Extract RGB
        const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
            totalR += parseInt(match[1]) * item.influence;
            totalG += parseInt(match[2]) * item.influence;
            totalB += parseInt(match[3]) * item.influence;
            totalInf += item.influence;
        }
    });

    return `rgb(${Math.floor(totalR / totalInf)}, ${Math.floor(totalG / totalInf)}, ${Math.floor(totalB / totalInf)})`;
}
