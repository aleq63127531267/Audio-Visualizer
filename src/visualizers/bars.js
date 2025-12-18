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

    if (!bufferLength || bufferLength === 0) return; // Proactive NaN guard

    const barWidth = (width / bufferLength) * barWidthMultiplier;

    let barHeight;
    let x = 0;

    // Use pre-sorted stops if available
    const sortedStops = vizColors.sortedStops ||
        [...vizColors.stops].sort((a, b) => a.offset - b.offset);

    let fillStyle;

    if (vizColors.mode === 'single') {
        fillStyle = sortedStops[0]?.color || '#fff';
    } else if (vizColors.mode === 'gradient-freq') {
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
    } else if (vizColors.mode === 'gradient-vol') {
        const gradientKey = getGradientKey(vizColors.mode, sortedStops, width, height);
        if (cachedGradientKey === gradientKey && cachedGradient) {
            fillStyle = cachedGradient;
        } else {
            const gradient = ctx.createLinearGradient(0, height, 0, 0);
            sortedStops.forEach(s => {
                gradient.addColorStop(Math.min(1, Math.max(0, s.offset / 100)), s.color);
            });
            fillStyle = gradient;
            cachedGradient = gradient;
            cachedGradientKey = gradientKey;
        }
    }

    ctx.fillStyle = fillStyle;

    for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i];
        ctx.fillRect(x, height - barHeight * 1.5, barWidth, barHeight * 1.5);
        x += barWidth + 1;
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
