// ─────────────────────────────────────────────────────────────────────────────
// swimVision.js — Computer vision engine for swim lap and stroke detection
//
// CAMERA PLACEMENT
//   Phone at pool edge, landscape orientation, front camera facing down the lane.
//   The swimmer appears at the BOTTOM of the frame when near the camera and
//   shrinks toward the top as they swim away.
//
// FRAME ZONES  (fractions of width / height)
//   ┌──────────────────────────────┐
//   │         FAR WALL             │ y = 0.00 – 0.40
//   │                              │
//   │         SWIM LANE            │ y = 0.10 – 0.90  (full lane width)
//   │    LEFT  │  RIGHT side       │ x = 0/0.5/1
//   │                              │
//   │       NEAR WALL              │ y = 0.60 – 1.00  ← phone end
//   └──────────────────────────────┘
//
// EVENTS EMITTED (via onEvent callback)
//   { type: 'swimmer_detected' }
//   { type: 'lap_finish',  timestamp, lapTimeSec }
//   { type: 'lap_start',   timestamp }
//   { type: 'stroke_update', count, ratePerMin }
// ─────────────────────────────────────────────────────────────────────────────

// Processing resolution (downscaled for performance)
const PROC_W = 320;
const PROC_H = 180;
const TARGET_FPS = 15;
const FRAME_MS = 1000 / TARGET_FPS;

// Zone definitions [x1, y1, x2, y2] as fractions
const ZONE = {
  nearWall:  [0.00, 0.60, 1.00, 1.00],  // Bottom 40% — swimmer at wall
  swimLane:  [0.00, 0.10, 1.00, 0.90],  // Full swim area
  leftSide:  [0.00, 0.10, 0.50, 0.90],  // Left half — tracks left arm
  rightSide: [0.50, 0.10, 1.00, 0.90],  // Right half — tracks right arm
};

// Motion detection thresholds
const PIX_THRESH = 12;          // Minimum pixel delta (0–255) to register as motion
const PRESENCE_FRAC = 0.022;    // Fraction of near-zone motion to confirm swimmer
const PRESENCE_FRAMES = 4;      // Consecutive frames required to confirm swimmer
const LAP_DEBOUNCE_S = 2.5;     // Minimum seconds between lap events
const BG_LEARN_RATE = 0.04;     // How fast background model adapts to lighting
const BG_STILL_THRESH = 0.007;  // Total-frame motion below this = background update

// Stroke detection timing
const STROKE_MIN_MS = 380;   // Fastest plausible stroke interval (~158 SPM)
const STROKE_MAX_MS = 2600;  // Slowest realistic stroke interval (~23 SPM)


// ─────────────────────────────────────────────────────────────────────────────
// SwimVisionEngine — main orchestrator
// ─────────────────────────────────────────────────────────────────────────────
export class SwimVisionEngine {
    /**
     * @param {HTMLVideoElement} videoEl  Live camera feed
     * @param {(event: object) => void} onEvent  Callback for swim events
     */
    constructor(videoEl, onEvent) {
        this._video = videoEl;
        this._onEvent = onEvent;

        // Hidden canvas for pixel processing (never rendered to DOM)
        this._canvas = document.createElement('canvas');
        this._canvas.width = PROC_W;
        this._canvas.height = PROC_H;
        this._ctx = this._canvas.getContext('2d', { willReadFrequently: true });

        this._running = false;
        this._rafId = null;
        this._lastProcTime = 0;

        // Background model — slow EMA of frames captured when pool is still
        this._bg = null;

        this._lap = new LapDetector(onEvent);
        this._strokes = new StrokeCounter(onEvent);
    }

    start() {
        if (this._running) return;
        this._running = true;
        const loop = (ts) => {
            if (!this._running) return;
            if (ts - this._lastProcTime >= FRAME_MS) {
                this._processFrame();
                this._lastProcTime = ts;
            }
            this._rafId = requestAnimationFrame(loop);
        };
        this._rafId = requestAnimationFrame(loop);
    }

    stop() {
        this._running = false;
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    }

    /** Call at the start of each new lap to reset the per-lap stroke count. */
    resetCurrentLap() {
        this._strokes.resetLap();
    }

    /** Returns a snapshot for UI display — poll this at ~6fps. */
    getState() {
        return {
            lapState: this._lap.state,
            strokeCount: this._strokes.count,
            ratePerMin: this._strokes.ratePerMin,
            debug: this._lastDebug,
        };
    }

    _processFrame() {
        const vid = this._video;
        if (!vid || vid.readyState < 2 || vid.paused) return;

        // Render video frame into processing canvas
        this._ctx.drawImage(vid, 0, 0, PROC_W, PROC_H);
        const frame = this._ctx.getImageData(0, 0, PROC_W, PROC_H);
        const gray = rgbaToGray(frame.data);

        // First frame: seed background model
        if (!this._bg) {
            this._bg = new Float32Array(gray);
            return;
        }

        // Motion map: absolute difference vs background
        const motionMap = motionVsBg(gray, this._bg);

        // Total scene motion (normalised to [0, 1])
        const totalMotion = totalScore(motionMap);

        // Update background only when scene is still (no swimmer present).
        // This prevents the swimmer from being absorbed into the background.
        if (totalMotion < BG_STILL_THRESH) {
            for (let i = 0; i < gray.length; i++) {
                this._bg[i] = (1 - BG_LEARN_RATE) * this._bg[i] + BG_LEARN_RATE * gray[i];
            }
        }

        // Zone motion scores (each in [0, 1])
        const scores = {
            nearWall:  zoneScore(motionMap, ZONE.nearWall),
            swimLane:  zoneScore(motionMap, ZONE.swimLane),
            leftSide:  zoneScore(motionMap, ZONE.leftSide),
            rightSide: zoneScore(motionMap, ZONE.rightSide),
            total: totalMotion,
        };

        this._lastDebug = scores;
        this._lap.update(scores);
        this._strokes.update(scores, this._lap.state);
    }
}


// ─────────────────────────────────────────────────────────────────────────────
// LapDetector — state machine
//
//  idle  ──(swimmer appears)──►  swimming
//  swimming  ──(near-zone motion spikes)──►  entering
//  entering  ──(motion peaked, now drops)──►  at_wall  ──► emits lap_finish
//  at_wall  ──(motion resumes)──►  departing  ──► emits lap_start
//  departing  ──(near motion clears)──►  swimming  (next lap)
// ─────────────────────────────────────────────────────────────────────────────
class LapDetector {
    constructor(onEvent) {
        this._emit = onEvent;
        this.state = 'idle';

        this._nearEMA = new EMA(0.28);   // Smoothed near-wall motion
        this._presenceFrames = 0;
        this._peakNear = 0;
        this._lapStartTime = null;
        this._lastEventTime = 0;
    }

    update(scores) {
        const near = this._nearEMA.update(scores.nearWall);
        const lane = scores.swimLane;
        const now = Date.now();
        const dtSec = (now - this._lastEventTime) / 1000;

        switch (this.state) {

            case 'idle': {
                // Require a few consecutive frames of activity before committing
                const active = near > PRESENCE_FRAC || lane > PRESENCE_FRAC * 0.6;
                this._presenceFrames = active ? this._presenceFrames + 1 : 0;
                if (this._presenceFrames >= PRESENCE_FRAMES) {
                    this.state = 'swimming';
                    this._lapStartTime = now;
                    this._emit({ type: 'swimmer_detected' });
                }
                break;
            }

            case 'swimming': {
                // Swimmer vanishes → reset to idle
                if (near < PRESENCE_FRAC * 0.15 && lane < PRESENCE_FRAC * 0.25) {
                    this.state = 'idle';
                    this._presenceFrames = 0;
                    break;
                }
                // Strong near-wall motion = swimmer is approaching the wall
                if (near > PRESENCE_FRAC * 2.2 && dtSec > LAP_DEBOUNCE_S) {
                    this.state = 'entering';
                    this._peakNear = near;
                }
                break;
            }

            case 'entering': {
                if (near > this._peakNear) this._peakNear = near;

                // Wall touch: motion was high, has now significantly decayed
                if (near < this._peakNear * 0.35 && this._peakNear > PRESENCE_FRAC * 2) {
                    this.state = 'at_wall';
                    this._lastEventTime = now;
                    const lapTimeSec = this._lapStartTime
                        ? (now - this._lapStartTime) / 1000
                        : null;
                    this._emit({ type: 'lap_finish', timestamp: now, lapTimeSec });
                }
                // False alarm — swimmer never slowed down
                if (near < PRESENCE_FRAC && this._peakNear < PRESENCE_FRAC * 2) {
                    this.state = 'swimming';
                }
                break;
            }

            case 'at_wall': {
                // Push-off: near-zone motion resumes after a brief pause
                if (near > PRESENCE_FRAC * 1.4 && dtSec > 0.4) {
                    this.state = 'departing';
                }
                // Idle timeout (workout ended or phone moved away)
                if (dtSec > 60) {
                    this.state = 'idle';
                    this._presenceFrames = 0;
                }
                break;
            }

            case 'departing': {
                // Swimmer has left the near zone — new lap is underway
                if (near < PRESENCE_FRAC * 0.55) {
                    this.state = 'swimming';
                    this._lapStartTime = now;
                    this._lastEventTime = now;
                    this._peakNear = 0;
                    this._emit({ type: 'lap_start', timestamp: now });
                }
                break;
            }
        }
    }
}


// ─────────────────────────────────────────────────────────────────────────────
// StrokeCounter — counts arm strokes via alternating L/R motion peaks
//
// ALGORITHM
//   Each arm entry creates a brief high-motion pulse on its side of the frame.
//   We track separate peak detectors for left and right, both using adaptive
//   thresholds (local baseline × 1.7 + noise floor) to handle varying lighting
//   and distance from camera.
//
//   Timing gates reject noise (< 380ms) and implausibly long gaps (> 2.6s).
//
// LIMITATION
//   Only counts strokes when the swimmer is within camera view (~5–8m of the
//   phone in a 25m pool). Useful for near-wall stroke efficiency, push-off
//   technique, and relative comparisons across laps.
// ─────────────────────────────────────────────────────────────────────────────
class StrokeCounter {
    constructor(onEvent) {
        this._emit = onEvent;
        this.count = 0;
        this.ratePerMin = null;

        // Fast smoothers track instantaneous arm motion
        this._leftEMA  = new EMA(0.40);
        this._rightEMA = new EMA(0.40);

        // Slow smoothers build a local baseline for adaptive thresholding
        this._leftBase  = new EMA(0.04);
        this._rightBase = new EMA(0.04);

        this._leftPeak  = false;   // Currently inside a left-arm peak
        this._rightPeak = false;
        this._lastStroke = 0;
        this._strokeTimes = [];    // Ring buffer for rate calculation
    }

    resetLap() {
        this.count = 0;
        this.ratePerMin = null;
        this._leftPeak = false;
        this._rightPeak = false;
        this._lastStroke = 0;
        this._strokeTimes = [];
        this._leftBase.reset();
        this._rightBase.reset();
    }

    update(scores, lapState) {
        // Suppress counting when swimmer is not actively swimming
        if (lapState === 'idle' || lapState === 'at_wall') return;

        const L = this._leftEMA.update(scores.leftSide);
        const R = this._rightEMA.update(scores.rightSide);
        this._leftBase.update(L);
        this._rightBase.update(R);

        // Adaptive threshold: well above local noise floor
        const lThresh = this._leftBase.value * 1.7 + 0.003;
        const rThresh = this._rightBase.value * 1.7 + 0.003;

        const now = Date.now();
        const dt = now - this._lastStroke;

        // Rising-edge detection for left arm
        if (L > lThresh && !this._leftPeak) {
            this._leftPeak = true;
            if (dt >= STROKE_MIN_MS) this._recordStroke(now);
        } else if (L < lThresh * 0.65) {
            this._leftPeak = false;  // Hysteresis prevents chattering
        }

        // Rising-edge detection for right arm
        if (R > rThresh && !this._rightPeak) {
            this._rightPeak = true;
            if (dt >= STROKE_MIN_MS) this._recordStroke(now);
        } else if (R < rThresh * 0.65) {
            this._rightPeak = false;
        }
    }

    _recordStroke(now) {
        const dt = now - this._lastStroke;
        // Long gap between strokes means swimmer was out of frame.
        // Reset rate tracking so one stale reading doesn't pollute SPM.
        if (this._lastStroke > 0 && dt > STROKE_MAX_MS) {
            this._strokeTimes = [];
        }

        this.count++;
        this._lastStroke = now;
        this._strokeTimes.push(now);
        if (this._strokeTimes.length > 16) this._strokeTimes.shift();

        // Compute strokes-per-minute from recent stroke intervals
        if (this._strokeTimes.length >= 3) {
            const span = this._strokeTimes.at(-1) - this._strokeTimes[0];
            const avgInterval = span / (this._strokeTimes.length - 1);
            this.ratePerMin = Math.round(60000 / avgInterval);
        }

        this._emit({ type: 'stroke_update', count: this.count, ratePerMin: this.ratePerMin });
    }
}


// ─────────────────────────────────────────────────────────────────────────────
// Pure utility functions
// ─────────────────────────────────────────────────────────────────────────────

/** Convert RGBA pixel array to Float32 grayscale using luminance weights. */
function rgbaToGray(data) {
    const g = new Float32Array(PROC_W * PROC_H);
    for (let i = 0; i < g.length; i++) {
        const p = i * 4;
        g[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    }
    return g;
}

/**
 * Compute per-pixel absolute motion vs background model.
 * Pixels below PIX_THRESH are zeroed out (noise rejection).
 */
function motionVsBg(gray, bg) {
    const m = new Float32Array(PROC_W * PROC_H);
    for (let i = 0; i < m.length; i++) {
        const d = Math.abs(gray[i] - bg[i]);
        m[i] = d > PIX_THRESH ? d : 0;
    }
    return m;
}

/**
 * Mean motion score for a rectangular zone.
 * @param {Float32Array} motionMap
 * @param {[number,number,number,number]} zone  [x1,y1,x2,y2] as fractions
 * @returns {number}  Score in [0, 1]
 */
function zoneScore(motionMap, zone) {
    const [x1f, y1f, x2f, y2f] = zone;
    const x1 = Math.floor(x1f * PROC_W);
    const y1 = Math.floor(y1f * PROC_H);
    const x2 = Math.floor(x2f * PROC_W);
    const y2 = Math.floor(y2f * PROC_H);
    let sum = 0, n = 0;
    for (let y = y1; y < y2; y++) {
        for (let x = x1; x < x2; x++) {
            sum += motionMap[y * PROC_W + x];
            n++;
        }
    }
    return n > 0 ? (sum / n) / 255 : 0;
}

/** Mean motion score across the entire frame. */
function totalScore(motionMap) {
    let sum = 0;
    for (let i = 0; i < motionMap.length; i++) sum += motionMap[i];
    return (sum / motionMap.length) / 255;
}

/** Exponential moving average. */
class EMA {
    constructor(alpha) {
        this.alpha = alpha;
        this.value = 0;
        this._init = false;
    }
    update(x) {
        if (!this._init) { this.value = x; this._init = true; }
        else this.value = this.alpha * x + (1 - this.alpha) * this.value;
        return this.value;
    }
    reset() {
        this.value = 0;
        this._init = false;
    }
}
