import { hexToRgbString, getColorFromStops, getMultiGradientColor } from '../utils/colorUtils.js';

// Default settings
const DEFAULTS = {
    particleCount: 150,
    baseSize: 3
};

class Particle {
    constructor(canvas, index, baseSize = 3) {
        this.canvas = canvas;
        this.index = index;
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.baseSize = Math.random() * baseSize + 1;
        this.currentSize = this.baseSize;
        this.currentValue = 0;
        this.speedX = (Math.random() - 0.5) * 0.5;
        this.speedY = (Math.random() - 0.5) * 0.5;
        this.color = '#ffffff';
    }

    update(frequencyData, bufferLength, vizColors, sortedStops, particleCount, intensity = 1.0) {
        this.x += this.speedX * intensity;
        this.y += this.speedY * intensity;

        // Wrap
        if (this.x < 0) this.x = this.canvas.width;
        if (this.x > this.canvas.width) this.x = 0;
        if (this.y < 0) this.y = this.canvas.height;
        if (this.y > this.canvas.height) this.y = 0;

        const binIndex = Math.floor((this.index / particleCount) * (bufferLength * 0.5));
        const value = frequencyData[binIndex] || 0;
        this.currentValue = value;

        // Pulsate: add size based on volume
        this.currentSize = this.baseSize + (value / 255) * 10 * intensity;

        // Color Calculation
        const useFreqSource = (vizColors.source !== 'volume');

        if (vizColors.mode === 'single') {
            this.color = sortedStops[0] ? hexToRgbString(sortedStops[0].color) : '#fff';
        } else if (vizColors.mode === 'multi-gradient' && vizColors.multiGradients) {
            const t = useFreqSource ? (this.index / particleCount) : (value / 200);
            this.color = getMultiGradientColor(vizColors.multiGradients, t);
        } else {
            const t = useFreqSource ? (this.index / particleCount) : (value / 200);
            this.color = getColorFromStops(sortedStops, t);
        }
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        // Add glow
        ctx.shadowBlur = (this.currentValue / 255) * 30;
        ctx.shadowColor = this.color;

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.currentSize, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
    }

    /**
     * Scale particle position when canvas resizes
     */
    scale(oldW, oldH, newW, newH) {
        if (oldW > 0 && oldH > 0) {
            this.x = (this.x / oldW) * newW;
            this.y = (this.y / oldH) * newH;
        }
    }
}

export function drawParticles(ctx, canvas, dataArray, bufferLength, vizColors, layer) {
    if (!layer) return;

    // Get settings from layer or use defaults
    const settings = layer.vizSettings?.particles || DEFAULTS;
    const particleCount = settings.particleCount || DEFAULTS.particleCount;
    const baseSize = settings.baseSize || DEFAULTS.baseSize;
    const INTENSITY = settings.intensity || 1.0;

    // Initialize State if needed
    if (!layer.vizState || !layer.vizState.particles) {
        layer.vizState = {
            particles: [],
            lastParticleCount: particleCount,
            lastBaseSize: baseSize
        };
        for (let i = 0; i < particleCount; i++) {
            layer.vizState.particles.push(new Particle(canvas, i, baseSize));
        }
    }

    const particles = layer.vizState.particles;

    // Check if particle count changed
    if (layer.vizState.lastParticleCount !== particleCount) {
        adjustParticleCount(layer, canvas, particleCount, baseSize);
        layer.vizState.lastParticleCount = particleCount;
    }

    // Check if base size changed
    if (layer.vizState.lastBaseSize !== baseSize) {
        layer.vizState.particles.forEach(p => {
            p.baseSize = Math.random() * baseSize + 1;
        });
        layer.vizState.lastBaseSize = baseSize;
    }

    // Use pre-sorted stops from vizColors if available
    const sortedStops = vizColors.sortedStops ||
        [...vizColors.stops].sort((a, b) => a.offset - b.offset);

    particles.forEach(p => {
        p.update(dataArray, bufferLength, vizColors, sortedStops, particleCount, INTENSITY);
        p.draw(ctx);
    });
}

/**
 * Scale all particles when canvas resizes
 * @param {number} oldW - Previous canvas width
 * @param {number} oldH - Previous canvas height
 * @param {number} newW - New canvas width
 * @param {number} newH - New canvas height
 * @param {object} layer - Layer object containing vizState
 */
export function scaleParticles(oldW, oldH, newW, newH, layer) {
    if (!layer?.vizState?.particles) return;

    layer.vizState.particles.forEach(p => {
        p.scale(oldW, oldH, newW, newH);
    });
}

/**
 * Adjust the particle count for a layer
 * @param {object} layer - Layer object
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {number} count - New particle count
 * @param {number} baseSize - Base particle size
 */
function adjustParticleCount(layer, canvas, count, baseSize) {
    if (!layer.vizState) return;

    const particles = layer.vizState.particles;
    const currentCount = particles.length;

    if (count > currentCount) {
        // Add more particles
        for (let i = currentCount; i < count; i++) {
            particles.push(new Particle(canvas, i, baseSize));
        }
    } else if (count < currentCount) {
        // Remove excess particles
        particles.length = count;
        // Update indices
        particles.forEach((p, i) => p.index = i);
    }
}

/**
 * Set particle count for a specific layer (exposed for settings)
 * @param {number} count - New particle count
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {object} layer - Layer object
 */
export function setParticleCount(count, canvas, layer) {
    if (!layer) return;

    // Ensure settings object exists
    if (!layer.vizSettings) layer.vizSettings = {};
    if (!layer.vizSettings.particles) layer.vizSettings.particles = { ...DEFAULTS };

    layer.vizSettings.particles.particleCount = count;

    // If particles exist, adjust immediately
    if (layer.vizState?.particles) {
        adjustParticleCount(layer, canvas, count, layer.vizSettings.particles.baseSize);
    }
}

/**
 * Set particle size for a specific layer
 */
export function setParticleSize(size, layer) {
    if (!layer) return;

    if (!layer.vizSettings) layer.vizSettings = {};
    if (!layer.vizSettings.particles) layer.vizSettings.particles = { ...DEFAULTS };

    layer.vizSettings.particles.baseSize = size;
}

/**
 * Get default settings for particles
 */
export function getParticleDefaults() {
    return { ...DEFAULTS };
}
