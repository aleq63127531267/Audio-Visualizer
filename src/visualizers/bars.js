import { getColorFromStops, getMultiGradientColor } from '../utils/colorUtils.js';

// Default settings
const DEFAULTS = {
    barWidthMultiplier: 2.5
};

// Gradient cache
let cachedGradient = null;
let cachedGradientKey = null;

function getGradientKey(mode, stops, width, height) {
    return `${mode}-${JSON.stringify(stops)}-${width}-${height}`;
}

export function drawBars(ctx, canvas, dataArray, bufferLength, vizColors, layer) {
    const width = canvas.width;
    const height = canvas.height;

    // Get settings from layer or use defaults
    const settings = layer?.vizSettings?.bars || DEFAULTS;
    const barWidthMultiplier = settings.barWidthMultiplier || DEFAULTS.barWidthMultiplier;
    const INTENSITY = settings.intensity || 1.0;

    if (!bufferLength || bufferLength === 0) return; // Proactive NaN guard

    // Calculate sizing
    const slotWidth = width / bufferLength;
    // Use multiplier relative to slot (center aligned)
    const barWidth = Math.max(1, slotWidth * (barWidthMultiplier > 0.1 ? barWidthMultiplier : 0.8));

    let barHeight;

    // Use pre-sorted stops if available
    const sortedStops = vizColors.sortedStops ||
        [...vizColors.stops].sort((a, b) => a.offset - b.offset);

    let fillStyle;
    const useFreqSource = (vizColors.source !== 'volume');

    if (vizColors.mode === 'single') {
        fillStyle = sortedStops[0]?.color || '#fff';
    } else if (vizColors.mode === 'gradient' && useFreqSource) {
        // Check gradient cache
        const gradientKey = getGradientKey(vizColors.mode, sortedStops, width, height);
        if (cachedGradientKey === gradientKey && cachedGradient) {
            fillStyle = cachedGradient;
        } else {
            const gradient = ctx.createLinearGradient(0, 0, width, 0);
            sortedStops.forEach(s => {
                gradient.addColorStop(Math.min(1, Math.max(0, s.offset / 100)), s.color);
            });
            fillStyle = gradient;
            cachedGradient = gradient;
            cachedGradientKey = gradientKey;
        }
    } else if (vizColors.mode === 'multi-gradient' && useFreqSource && vizColors.multiGradients) {
        const gradientKey = getGradientKey(vizColors.mode, vizColors.multiGradients, width, height);
        if (cachedGradientKey === gradientKey && cachedGradient) {
            fillStyle = cachedGradient;
        } else {
            const gradient = ctx.createLinearGradient(0, 0, width, 0);
            vizColors.multiGradients.forEach(grad => {
                grad.stops.forEach(s => {
                    const masterOffset = grad.start + (s.offset / 100) * (grad.end - grad.start);
                    gradient.addColorStop(Math.min(1, Math.max(0, masterOffset / 100)), s.color);
                });
            });
            fillStyle = gradient;
            cachedGradient = gradient;
            cachedGradientKey = gradientKey;
        }
    }

    if (fillStyle) ctx.fillStyle = fillStyle;

    for (let i = 0; i < bufferLength; i++) {
        // Vertical scaling: % of window height
        const percent = dataArray[i] / 255;
        barHeight = percent * height * INTENSITY;

        if (!useFreqSource) {
            const t = percent;
            if (vizColors.mode === 'multi-gradient') {
                ctx.fillStyle = getMultiGradientColor(vizColors.multiGradients, t);
            } else {
                ctx.fillStyle = getColorFromStops(sortedStops, t);
            }
        }

        // Horizontal positioning: Strict slots
        const x = i * slotWidth;
        const drawX = x + (slotWidth - barWidth) / 2;

        ctx.fillRect(drawX, height - barHeight, barWidth, barHeight);
    }
}

/**
 * Get default settings for bars visualizer
 */
export function getBarsDefaults() {
    return { ...DEFAULTS };
}

/**
 * Invalidate gradient cache
 */
export function invalidateBarsCache() {
    cachedGradient = null;
    cachedGradientKey = null;
}
