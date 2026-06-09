import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Camera, Eye, EyeOff } from 'lucide-react';
import { SwimVisionEngine } from '../utils/swimVision';

// ── Visual state mapping ────────────────────────────────────────────────────
const STATE = {
    idle:      { color: '#4a5568', label: 'IDLE' },
    swimming:  { color: '#48bb78', label: 'SWIMMING' },
    entering:  { color: '#ecc94b', label: 'ARRIVING' },
    at_wall:   { color: '#e53e3e', label: 'AT WALL' },
    departing: { color: '#63b3ed', label: 'PUSH OFF' },
};


/**
 * SwimCamera
 *
 * Wraps the SwimVisionEngine and provides a compact status panel.
 * Mount it inside WorkoutView to enable automatic lap and stroke detection.
 *
 * Props:
 *   onLapFinish(event)    – fired when swimmer touches the near wall
 *   onLapStart(event)     – fired when swimmer pushes off the near wall
 *   onStrokeUpdate(event) – fired each time a stroke is detected
 */
export default function SwimCamera({ onLapFinish, onLapStart, onStrokeUpdate }) {
    const videoRef  = useRef(null);
    const engineRef = useRef(null);
    const streamRef = useRef(null);

    const [camState,   setCamState]   = useState('off');  // off | starting | on | error
    const [lapState,   setLapState]   = useState('idle');
    const [strokes,    setStrokes]    = useState(0);
    const [ratePerMin, setRatePerMin] = useState(null);
    const [debug,      setDebug]      = useState(null);
    const [preview,    setPreview]    = useState(false);
    const [errMsg,     setErrMsg]     = useState('');

    // ── Engine event handler ──────────────────────────────────────────────
    const onEvent = useCallback((evt) => {
        if (evt.type === 'lap_finish')    onLapFinish?.(evt);
        if (evt.type === 'lap_start')     onLapStart?.(evt);
        if (evt.type === 'stroke_update') {
            setStrokes(evt.count);
            setRatePerMin(evt.ratePerMin ?? null);
            onStrokeUpdate?.(evt);
        }
    }, [onLapFinish, onLapStart, onStrokeUpdate]);

    // ── Camera lifecycle ──────────────────────────────────────────────────
    const startCamera = async () => {
        setCamState('starting');
        setErrMsg('');
        try {
            // Request front camera at 720p (iPhone 13 supports up to 4K)
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user',
                    width:  { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 },
                },
                audio: false,
            });

            streamRef.current = stream;
            videoRef.current.srcObject = stream;
            await videoRef.current.play();

            engineRef.current = new SwimVisionEngine(videoRef.current, onEvent);
            engineRef.current.start();
            setCamState('on');
        } catch (e) {
            setCamState('error');
            setErrMsg(
                e.name === 'NotAllowedError'
                    ? 'Camera permission denied. Please allow camera access and try again.'
                    : e.message
            );
        }
    };

    const stopCamera = useCallback(() => {
        engineRef.current?.stop();
        engineRef.current = null;
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;

        setCamState('off');
        setLapState('idle');
        setStrokes(0);
        setRatePerMin(null);
        setDebug(null);
        setPreview(false);
    }, []);

    // Cleanup on unmount
    useEffect(() => () => stopCamera(), [stopCamera]);

    // Poll engine state for UI (~6fps is plenty)
    useEffect(() => {
        if (camState !== 'on') return;
        const id = setInterval(() => {
            const s = engineRef.current?.getState();
            if (!s) return;
            setLapState(s.lapState ?? 'idle');
            setDebug(s.debug ?? null);
        }, 160);
        return () => clearInterval(id);
    }, [camState]);

    // ── Derived display values ────────────────────────────────────────────
    const isOn = camState === 'on';
    const stInfo = STATE[lapState] ?? STATE.idle;

    return (
        <div style={{
            background: '#0f1923',
            border: `2px solid ${isOn ? stInfo.color : '#2d3748'}`,
            borderRadius: '16px',
            padding: '12px 14px',
            transition: 'border-color 0.4s ease',
        }}>

            {/* ── Header ──────────────────────────────────────────────── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Camera size={15} color={isOn ? stInfo.color : '#4a5568'} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 800, letterSpacing: '1px', color: '#e2e8f0' }}>
                        SWIM VISION
                    </span>
                    {isOn && (
                        <span style={{
                            background: stInfo.color,
                            color: '#000',
                            padding: '1px 8px',
                            borderRadius: '8px',
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            letterSpacing: '0.5px',
                        }}>
                            {stInfo.label}
                        </span>
                    )}
                </div>

                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {isOn && (
                        <button
                            onClick={() => setPreview(v => !v)}
                            title={preview ? 'Hide preview' : 'Show preview'}
                            style={btnGhost}
                        >
                            {preview ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                    )}
                    <button
                        onClick={isOn ? stopCamera : startCamera}
                        disabled={camState === 'starting'}
                        style={{ ...btnSolid, background: isOn ? '#742a2a' : '#276749' }}
                    >
                        {camState === 'starting' ? '···' : isOn ? 'STOP' : 'START'}
                    </button>
                </div>
            </div>

            {/* ── Error ───────────────────────────────────────────────── */}
            {errMsg && (
                <div style={{ color: '#fc8181', fontSize: '0.75rem', marginTop: '6px' }}>
                    ⚠ {errMsg}
                </div>
            )}

            {/* ── Camera preview (hidden by default) ──────────────────── */}
            {/* Mirror applied via scaleX(-1) — standard for front cameras */}
            <video
                ref={videoRef}
                playsInline
                muted
                style={{
                    display: isOn && preview ? 'block' : 'none',
                    width: '100%',
                    maxHeight: '140px',
                    objectFit: 'cover',
                    borderRadius: '8px',
                    marginTop: '10px',
                    transform: 'scaleX(-1)',
                    background: '#000',
                }}
            />

            {/* ── Stats row ───────────────────────────────────────────── */}
            {isOn && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    <StatTile label="STROKES" value={strokes}    color="#63b3ed" />
                    {ratePerMin != null && (
                        <StatTile label="SPM" value={ratePerMin} color="#48bb78" />
                    )}
                    {debug && (
                        <>
                            <MotionTile label="NEAR" value={debug.nearWall} />
                            <MotionTile label="LANE" value={debug.swimLane} />
                        </>
                    )}
                </div>
            )}

            {/* ── Setup hint (shown when off) ──────────────────────────── */}
            {!isOn && camState !== 'error' && (
                <p style={{ fontSize: '0.7rem', color: '#4a5568', margin: '8px 0 0', lineHeight: 1.4 }}>
                    Place phone at pool edge in landscape mode. Front camera should face down the lane.
                </p>
            )}
        </div>
    );
}


// ── Sub-components ────────────────────────────────────────────────────────────

function StatTile({ label, value, color }) {
    return (
        <div style={tile}>
            <div style={tileLabel}>{label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 900, color, fontFamily: 'monospace', lineHeight: 1 }}>
                {value}
            </div>
        </div>
    );
}

/** Animated bar showing real-time motion level for a zone. */
function MotionTile({ label, value }) {
    // 0.08 is treated as "full" motion (swimmer very close)
    const pct = Math.min(100, (value / 0.08) * 100);
    const color = value > 0.03 ? '#48bb78' : value > 0.012 ? '#ecc94b' : '#4a5568';
    return (
        <div style={tile}>
            <div style={tileLabel}>{label}</div>
            <div style={{
                width: '100%', height: '5px', background: '#2d3748',
                borderRadius: '2px', margin: '5px 0 3px', overflow: 'hidden',
            }}>
                <div style={{
                    width: `${pct}%`, height: '100%',
                    background: color, borderRadius: '2px',
                    transition: 'width 0.1s, background 0.2s',
                }} />
            </div>
            <div style={{ fontSize: '0.6rem', color, fontFamily: 'monospace' }}>
                {(value * 100).toFixed(1)}%
            </div>
        </div>
    );
}


// ── Shared styles ─────────────────────────────────────────────────────────────

const tile = {
    flex: 1,
    background: '#1a2535',
    borderRadius: '8px',
    padding: '6px 8px',
    textAlign: 'center',
    minWidth: 0,
};

const tileLabel = {
    fontSize: '0.55rem',
    color: '#718096',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    marginBottom: '2px',
};

const btnGhost = {
    background: 'transparent',
    border: '1px solid #4a5568',
    color: '#a0aec0',
    padding: '4px 8px',
    borderRadius: '7px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
};

const btnSolid = {
    border: 'none',
    color: '#fff',
    padding: '5px 12px',
    borderRadius: '7px',
    fontSize: '0.72rem',
    fontWeight: 700,
    cursor: 'pointer',
};
