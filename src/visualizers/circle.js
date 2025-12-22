// Default settings
const DEFAULTS = {
    radius: 150
};

// Gradient cache
let cachedGradient = null;
let cachedGradientKey = null;

function getGradientKey(mode, stops, centerX, centerY, radius) {
    return `${mode}-${JSON.stringify(stops)}-${centerX}-${centerY}-${radius}`;
}

export function drawCircle(ctx, canvas, dataArray, bufferLength, vizColors, layer) {
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    // Get settings from layer or use defaults
    const settings = layer?.vizSettings?.circle || DEFAULTS;
    const radius = settings.radius || DEFAULTS.radius;
    const INTENSITY = settings.intensity || 1.0;

    // Draw base circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.stroke();

    // We'll mirror the data to make it symmetric
    const usableLength = Math.floor(bufferLength * 0.7);
    const angleStep = Math.PI / usableLength;

    ctx.lineWidth = 2;

    // Use pre-sorted stops if available
    const sortedStops = vizColors.sortedStops ||
        [...vizColors.stops].sort((a, b) => a.offset - b.offset);

    let strokeStyle;

    if (vizColors.mode === 'single') {
        strokeStyle = sortedStops[0]?.color || '#fff';
    } else if (vizColors.mode === 'gradient-freq') {
        // Check gradient cache
        const gradientKey = getGradientKey(vizColors.mode, sortedStops, centerX, centerY, radius);
        if (cachedGradientKey === gradientKey && cachedGradient) {
            strokeStyle = cachedGradient;
        } else {
            const gradient = ctx.createLinearGradient(0, centerY - radius - 50, 0, centerY + radius + 50);
            sortedStops.forEach(s => {
                gradient.addColorStop(Math.min(1, Math.max(0, s.offset / 100)), s.color);
            });
            strokeStyle = gradient;
            cachedGradient = gradient;
            cachedGradientKey = gradientKey;
        }
    } else if (vizColors.mode === 'multi-gradient' && vizColors.multiGradients) {
        const gradientKey = getGradientKey(vizColors.mode, vizColors.multiGradients, centerX, centerY, radius);
        if (cachedGradientKey === gradientKey && cachedGradient) {
            strokeStyle = cachedGradient;
        } else {
            const gradient = ctx.createLinearGradient(0, centerY - radius - 50, 0, centerY + radius + 50);
            vizColors.multiGradients.forEach(grad => {
                grad.stops.forEach(s => {
                    const masterOffset = grad.start + (s.offset / 100) * (grad.end - grad.start);
                    gradient.addColorStop(Math.min(1, Math.max(0, masterOffset / 100)), s.color);
                });
            });
            strokeStyle = gradient;
            cachedGradient = gradient;
            cachedGradientKey = gradientKey;
        }
    }

    ctx.strokeStyle = strokeStyle || '#fff';
    ctx.beginPath();

    // Right side (0 to PI)
    for (let i = 0; i < usableLength; i++) {
        const value = dataArray[i];
        const barHeight = value * 0.8 * INTENSITY;
        const angle = (Math.PI * 1.5) + (i * angleStep);

        const xStart = centerX + Math.cos(angle) * radius;
        const yStart = centerY + Math.sin(angle) * radius;
        const xEnd = centerX + Math.cos(angle) * (radius + barHeight);
        const yEnd = centerY + Math.sin(angle) * (radius + barHeight);

        ctx.moveTo(xStart, yStart);
        ctx.lineTo(xEnd, yEnd);
    }

    // Left side (0 to -PI) mirror
    for (let i = 0; i < usableLength; i++) {
        const value = dataArray[i];
        const barHeight = value * 0.8 * INTENSITY;
        const angle = (Math.PI * 1.5) - (i * angleStep);

        const xStart = centerX + Math.cos(angle) * radius;
        const yStart = centerY + Math.sin(angle) * radius;
        const xEnd = centerX + Math.cos(angle) * (radius + barHeight);
        const yEnd = centerY + Math.sin(angle) * (radius + barHeight);

        ctx.moveTo(xStart, yStart);
        ctx.lineTo(xEnd, yEnd);
    }
    ctx.stroke();
}

/**
 * Get default settings for circle visualizer
 */
export function getCircleDefaults() {
    return { ...DEFAULTS };
}

/**
 * Invalidate gradient cache (call when colors change)
 */
export function invalidateCircleCache() {
    cachedGradient = null;
    cachedGradientKey = null;
}
