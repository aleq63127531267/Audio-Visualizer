/**
 * Flash Visualizer
 * Fills the screen with a color that flashes based on average frequency.
 */
export function drawFlash(ctx, canvas, dataArray, bufferLength, vizColors) {
    const width = canvas.width;
    const height = canvas.height;

    // Calculate average frequency
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
    }
    const average = sum / bufferLength;
    const intensity = average / 255;

    // Only flash if it passes a certain threshold
    if (intensity < 0.1) return;

    // Get color from vizColors (use first stop)
    const color = vizColors.stops && vizColors.stops.length > 0
        ? vizColors.stops[0].color
        : '#ffffff';

    // Draw full screen rectangle with globalAlpha
    ctx.save();
    ctx.globalAlpha = intensity;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
}

export function getFlashDefaults() {
    return {}; // No special settings yet
}
