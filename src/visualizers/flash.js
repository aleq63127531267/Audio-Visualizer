/**
 * Flash Visualizer
 * Fills the screen with a color that flashes based on average frequency.
 */
export function drawFlash(ctx, canvas, dataArray, bufferLength, vizColors, layer) {
    const width = canvas.width;
    const height = canvas.height;

    // Get settings
    const settings = layer?.vizSettings?.flash || { intensity: 1.0 };
    const INTENSITY = settings.intensity || 1.0;

    // Calculate average frequency
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
    }
    const average = sum / bufferLength;
    const flashIntensity = (average / 255) * INTENSITY;

    // Only flash if it passes a certain threshold
    if (flashIntensity < 0.05) return;

    // Get color from vizColors
    let color;
    if (vizColors.mode === 'single') {
        color = vizColors.stops[0]?.color || '#ffffff';
    } else {
        // For flash, we just use the first color stop of the current mode
        color = vizColors.stops[0]?.color || '#ffffff';
    }

    // Draw full screen rectangle with globalAlpha
    ctx.save();
    ctx.globalAlpha = Math.min(1.0, flashIntensity);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
}

export function getFlashDefaults() {
    return {}; // No special settings yet
}
