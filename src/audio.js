export class AudioEngine {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.source = null;
        this.micSource = null; // Mic Input
        this.micStream = null; // Mic Stream
        this.audioBuffer = null;
        this.isPlaying = false;
        this.isMicActive = false; // Mic State
        this.gainNode = null;
        this.dataArray = null;
        this.fftSize = 2048;

        // Time tracking
        this.startedAt = 0;
        this.pausedAt = 0;
    }

    setLoop(enabled) {
        this.loop = enabled;
        if (this.source) {
            this.source.loop = enabled;
        }
    }

    async init() {
        if (this.audioContext) return;

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioContext();

        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.85;

        this.gainNode = this.audioContext.createGain();
        this.gainNode.connect(this.audioContext.destination);

        // Connect analyser to gain
        this.analyser.connect(this.gainNode);

        this.bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(this.bufferLength);
    }

    async startMic() {
        await this.init();

        // Stop file playback if active
        if (this.isPlaying) {
            this.pause();
        }

        // Resume context if suspended
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.micStream = stream; // Store stream for recording
            this.micSource = this.audioContext.createMediaStreamSource(stream);

            // Connect Mic -> Analyser
            // NOTE: Do NOT connect Mic to Gain/Destination to avoid feedback loop!
            this.micSource.connect(this.analyser);

            this.isMicActive = true;
        } catch (err) {
            console.error('Error accessing microphone:', err);
            alert('Could not access microphone.');
        }
    }

    stopMic() {
        if (this.micSource) {
            this.micSource.disconnect();
            // Stop tracks to release mic
            if (this.micSource.mediaStream) {
                this.micSource.mediaStream.getTracks().forEach(track => track.stop());
            }
            this.micSource = null;
        }
        this.isMicActive = false;
    }

    setVolume(value) {
        if (this.gainNode) {
            this.gainNode.gain.setValueAtTime(value, this.audioContext.currentTime);
        }
    }

    setFFTSize(level) {
        if (!this.analyser) return;
        // level 1 to 6 mapped to powers of 2 (512 to 16384)
        // 1 -> 512 (2^9)
        // 3 -> 2048 (2^11)
        const size = Math.pow(2, parseInt(level) + 8);
        this.analyser.fftSize = size;
        this.bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(this.bufferLength);
    }

    async loadFile(file) {
        await this.init();

        this.stop(); // Reset state

        const arrayBuffer = await file.arrayBuffer();
        this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

        this.play();
    }

    play() {
        if (!this.audioBuffer || this.isPlaying) return;

        this.source = this.audioContext.createBufferSource();
        this.source.buffer = this.audioBuffer;
        this.source.loop = this.loop; // Apply loop state
        this.source.connect(this.analyser);

        // Capture source to check in onended
        const mySource = this.source;

        // Start playback at the paused offset
        this.startedAt = this.audioContext.currentTime - this.pausedAt;
        this.source.start(0, this.pausedAt);

        this.isPlaying = true;

        this.source.onended = () => {
            // Only reset if this component is still playing THIS source
            // If we switched sources (seek), this callback is stale
            if (this.source === mySource) {
                // If looping, we don't stop.
                if (!this.loop && this.currentTime >= this.duration - 0.1) {
                    this.isPlaying = false;
                    this.pausedAt = 0;
                }
            }
        };
    }

    stop() {
        if (this.source) {
            try {
                this.source.onended = null; // Prevent callback from firing
                this.source.stop();
            } catch (e) { /* ignore */ }
            this.source.disconnect();
            this.source = null;
        }
        this.stopTestTone();
        this.isPlaying = false;
        this.pausedAt = 0;
        this.startedAt = 0;
    }

    playTestTone() {
        this.stop(); // Stop any current playback
        this.init(); // Ensure context is ready

        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        this.oscillator = this.audioContext.createOscillator();
        this.oscillator.type = 'sine';
        this.oscillator.frequency.setValueAtTime(20, this.audioContext.currentTime);
        this.oscillator.frequency.exponentialRampToValueAtTime(20000, this.audioContext.currentTime + 5); // 5 sec sweep

        this.oscillator.connect(this.analyser);
        // Also connect to gain so we hear it (optional, maybe user just wants to see? but usually test tone is heard)
        // Let's create a separate gain for test tone to not blast ears, or just use main gain
        this.oscillator.connect(this.gainNode);

        this.oscillator.start();
        this.oscillator.stop(this.audioContext.currentTime + 5); // Stop automatically after sweep
        this.isPlaying = true; // Set playing true so visualizer loop updates if it checks this

        this.oscillator.onended = () => {
            this.oscillator = null;
            this.isPlaying = false;
        };
    }

    stopTestTone() {
        if (this.oscillator) {
            try {
                this.oscillator.stop();
            } catch (e) { }
            this.oscillator.disconnect();
            this.oscillator = null;
        }
    }

    pause() {
        if (!this.isPlaying || !this.source) return;

        this.source.stop();

        // Calculate raw elapsed time
        let elapsed = this.audioContext.currentTime - this.startedAt;

        // precise loop handling
        if (this.loop && this.duration > 0) {
            elapsed = elapsed % this.duration;
        }

        this.pausedAt = elapsed;
        this.isPlaying = false;
        this.source.disconnect();
        this.source = null;
    }

    seek(time) {
        if (!this.audioBuffer) return;

        // Clamp time
        time = Math.max(0, Math.min(time, this.duration));

        if (this.isPlaying) {
            // STOP current source properly
            if (this.source) {
                try {
                    this.source.onended = null;
                    this.source.stop();
                } catch (e) { }
                this.source.disconnect();
                this.source = null;
            }

            this.pausedAt = time;
            this.isPlaying = false;
            this.play();
        } else {
            this.pausedAt = time;
        }
    }

    get duration() {
        return this.audioBuffer ? this.audioBuffer.duration : 0;
    }

    get currentTime() {
        if (this.pausedAt && !this.isPlaying) {
            return this.pausedAt;
        }
        if (!this.startedAt) return 0;

        let time = this.audioContext.currentTime - this.startedAt;

        if (this.loop && this.duration > 0) {
            time = time % this.duration;
        }

        return Math.min(time, this.duration);
    }

    getFrequencyData() {
        if (!this.analyser) return new Uint8Array(0);
        this.analyser.getByteFrequencyData(this.dataArray);
        return this.dataArray;
    }


    getWaveformData() {
        if (!this.analyser) return new Uint8Array(0);
        this.analyser.getByteTimeDomainData(this.dataArray);
        return this.dataArray;
    }
}
