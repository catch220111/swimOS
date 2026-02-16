import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, SkipForward, X, Square, Volume2, VolumeX, Mic, MicOff } from 'lucide-react';
import { formatTime } from '../utils/formatters';
import { initAudio, beep, speakText } from '../utils/audio';
import { saveLog } from '../utils/storage';
import { analyzeWorkout } from '../utils/analytics';
import useVoiceCommands from '../utils/useVoiceCommands';

export default function WorkoutView({ workoutPlan, onExit }) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [currentDist, setCurrentDist] = useState(0);
    const [timeLeft, setTimeLeft] = useState(0);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [timerActive, setTimerActive] = useState(false);
    const [timerFinished, setTimerFinished] = useState(false);
    const [voiceEnabled, setVoiceEnabled] = useState(true); // Default ON

    // Refs
    const intervalRef = useRef(null);
    const startTimeRef = useRef(Date.now());

    // --- Voice Command Setup ---
    // We use useMemo so options don't recreate on every render, causing effect re-runs
    const commands = useMemo(() => ({
        'start': () => {
            // If timer is finished, "start" means advance. 
            // If timer is NOT active and NOT finished, "start" means start timer.
            if (timerFinishedRef.current) advanceStepRef.current();
            else if (!timerActiveRef.current) handleStartRef.current();
        },
        'go': () => {
            if (timerFinishedRef.current) advanceStepRef.current();
            else if (!timerActiveRef.current) handleStartRef.current();
        },
        'next': () => {
            // "Next" usually means skip or advance
            if (timerFinishedRef.current) advanceStepRef.current();
            else if (timerActiveRef.current) {
                // Check if it's manual mode? Or just force finish?
                // Force finish current step
                clearInterval(intervalRef.current);
                handleTimerCompleteRef.current();
            }
        },
        'pause': () => {
            if (timerActiveRef.current && !isPausedRef.current) togglePauseRef.current();
        },
        'resume': () => {
            if (timerActiveRef.current && isPausedRef.current) togglePauseRef.current();
        },
        'stop': () => {
            if (timerActiveRef.current && !isPausedRef.current) togglePauseRef.current();
        },
        'quit': () => onExitRef.current()
    }), []); // Dependencies handled via Refs below

    const { isListening, toggleListening, error: micError, transcript } = useVoiceCommands(commands);

    // Refs for Voice Commands to access latest state without closure staleness
    const timerFinishedRef = useRef(timerFinished);
    const timerActiveRef = useRef(timerActive);
    const isPausedRef = useRef(isPaused);
    const handleStartRef = useRef(null);
    const advanceStepRef = useRef(null);
    const togglePauseRef = useRef(null);
    const handleTimerCompleteRef = useRef(null);
    const onExitRef = useRef(onExit);

    useEffect(() => {
        timerFinishedRef.current = timerFinished;
        timerActiveRef.current = timerActive;
        isPausedRef.current = isPaused;
    }, [timerFinished, timerActive, isPaused]);

    // Initial Setup
    useEffect(() => {
        if (workoutPlan && workoutPlan.total > 0) {
            setupStep(0);
        }
        return () => clearInterval(intervalRef.current);
    }, [workoutPlan]);

    const setupStep = (index) => {
        if (!workoutPlan || index >= workoutPlan.plan.length) return;
        const step = workoutPlan.plan[index];

        setCurrentIndex(index);
        setTimeLeft(step.time); // Set initial time
        setElapsedTime(0);
        setTimerActive(false);
        setIsPaused(false);
        setTimerFinished(false);
        clearInterval(intervalRef.current);
    };

    const handleStart = () => {
        initAudio();
        // Only speak/beep if starting a timed interval
        if (workoutPlan.plan[currentIndex].mode !== 'rest') {
            if (voiceEnabled) speakText('Take your marks');
            setTimeout(() => {
                if (voiceEnabled) beep(1850, 0.38, 'square', 0.95);
                startTimer();
            }, 1300);
        } else {
            // Immediate start for rests
            startTimer();
        }
    };
    handleStartRef.current = handleStart;

    const startTimer = () => {
        setTimerActive(true);
        setIsPaused(false);
        setTimerFinished(false);

        const currentStep = workoutPlan.plan[currentIndex];
        const isManual = currentStep.time === 0;

        intervalRef.current = setInterval(() => {
            if (isManual) {
                // Count UP
                setElapsedTime(prev => prev + 1);
            } else {
                // Count DOWN
                setTimeLeft((prev) => {
                    if (prev <= 1) {
                        // Timer finished
                        clearInterval(intervalRef.current);
                        handleTimerComplete();
                        return 0;
                    }

                    // Beep logic (only for countdowns)
                    if (prev <= 4 && prev > 1 && voiceEnabled) {
                        beep(1200, 0.12, 'square', 0.24);
                    }

                    return prev - 1;
                });
            }
        }, 1000);
    };

    const handleTimerComplete = () => {
        setTimerActive(false);
        setTimerFinished(true);
        if (voiceEnabled) beep(1450, 0.5, 'square', 0.5); // Signal completion
    };
    handleTimerCompleteRef.current = handleTimerComplete;

    // Called when user clicks "NEXT" (or "START REST" / "START INTERVAL")
    const advanceStep = () => {
        const step = workoutPlan.plan[currentIndex];
        setCurrentDist(prev => prev + step.dist);

        if (currentIndex < workoutPlan.plan.length - 1) {
            setupStep(currentIndex + 1);
        } else {
            finishWorkout();
        }
    };
    advanceStepRef.current = advanceStep;

    const finishWorkout = () => {
        const durationMin = Math.ceil((Date.now() - startTimeRef.current) / 60000);
        const log = {
            date: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString(),
            timestamp: Date.now(),
            dist: workoutPlan.total,
            duration: durationMin + ' mins',
            quickTime: '-',
            rpe: 5,
            completedMode: 'planned',
            failPoint: '-',
            laps: 0,
            breakdown: analyzeWorkout(workoutPlan.plan)
        };
        saveLog(log);
        alert('Workout Complete!');
        onExit();
    };
    onExitRef.current = onExit;

    const togglePause = () => {
        if (!timerActive) return;
        if (isPaused) {
            startTimer();
        } else {
            clearInterval(intervalRef.current);
            setIsPaused(true);
        }
    };
    togglePauseRef.current = togglePause;

    const currentStep = workoutPlan?.plan[currentIndex];
    if (!currentStep) return <div className="view active-view">Loading...</div>;

    const isRest = currentStep.mode === 'rest';
    // If timer is finished:
    // - If it WAS a rest, we are ready to GO (swim).
    // - If it WAS a swim, we are ready to REST (or next swim).
    const showGo = (isRest && timerFinished);

    // UI Labels & Theme
    const nextStep = workoutPlan.plan[currentIndex + 1];
    const nextIsRest = nextStep?.mode === 'rest';

    let mainButtonText = "START";
    let statusLabel = "";
    let themeColor = ""; // Border/Accent color
    let bgColor = ""; // Card Background

    if (timerFinished) {
        // WAITING TO ADVANCE
        if (isRest) {
            // Rest Done -> Ready to Swim
            mainButtonText = "START INTERVAL";
            statusLabel = "READY";
            themeColor = "#ecc94b"; // Gold
            bgColor = "#44380b";
        } else {
            // Swim Done -> Ready to Rest/Next
            if (nextIsRest) {
                if (nextStep.time === 0) mainButtonText = "NEXT";
                else mainButtonText = "START REST";
                statusLabel = "FINISHED";
            } else {
                mainButtonText = "START NEXT INTERVAL";
                statusLabel = "FINISHED";
            }
            themeColor = "#48bb78"; // Greenish (success)
            bgColor = "#1c3c2e";
        }
    } else {
        // ACTIVE TIMER
        if (isRest) {
            mainButtonText = "START REST"; // (Ideally shouldn't show during timer, only pause)
            statusLabel = "RESTING";
            themeColor = "#e53e3e"; // Red
            bgColor = "#3b1717";
        } else {
            mainButtonText = "START INTERVAL";
            statusLabel = "SWIMMING";
            themeColor = "#4299e1"; // Blue
            bgColor = "#1a2c42";
        }
    }

    return (
        <div className="view active-view" style={{ display: 'flex', flexDirection: 'column', height: '100vh', paddingBottom: '0' }}>
            {/* Simple Top Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px' }}>
                <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>{currentDist} / {workoutPlan.total}m</div>

                <div style={{ fontWeight: 700, opacity: 0.8, fontSize: '1rem', background: '#333', padding: '4px 10px', borderRadius: '8px' }}>
                    Rep {currentStep.rep} / {currentStep.totalReps}
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                    {/* Voice Command Toggle */}
                    <button
                        className="btn"
                        onClick={toggleListening}
                        style={{
                            width: 'auto', padding: '8px',
                            background: isListening ? 'var(--accent)' : 'transparent',
                            border: isListening ? 'none' : '1px solid #444',
                            color: isListening ? '#000' : '#666'
                        }}
                        title={micError || "Voice Control"}
                    >
                        {isListening ? <Mic size={20} /> : <MicOff size={20} />}
                    </button>

                    {/* Audio Feedback Toggle */}
                    <button
                        className="btn"
                        onClick={() => setVoiceEnabled(!voiceEnabled)}
                        style={{ width: 'auto', padding: '8px', background: 'transparent', border: '1px solid #444', color: voiceEnabled ? '#fff' : '#666' }}
                    >
                        {voiceEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
                    </button>
                    <button className="btn btn-danger" style={{ width: 'auto', padding: '8px 12px', fontSize: '0.8rem' }} onClick={onExit}>QUIT</button>
                </div>
            </div>

            {/* Transcript Helper (Optional Debug) */}
            {transcript && isListening && (
                <div style={{ position: 'absolute', top: 60, right: 20, fontSize: '0.8rem', color: 'var(--accent)', opacity: 0.5 }}>
                    "{transcript}"
                </div>
            )}

            {/* Main Card */}
            <div style={{
                flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center',
                border: `6px solid ${themeColor}`, margin: '0 10px 10px 10px', borderRadius: '24px',
                background: bgColor,
                transition: 'all 0.3s ease',
                position: 'relative', overflow: 'hidden'
            }}>
                {/* Big Status Label */}
                <div style={{
                    fontSize: '15vw', fontWeight: 900, textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.05)', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    pointerEvents: 'none', userSelect: 'none', whiteSpace: 'nowrap'
                }}>
                    {statusLabel}
                </div>

                {/* Content Layer */}
                <div style={{ zIndex: 2, width: '100%', padding: '0 20px' }}>
                    <div className="muted" style={{ textTransform: 'uppercase', letterSpacing: '2px', fontSize: '1rem', marginBottom: '10px', color: themeColor }}>
                        {statusLabel} • {currentStep.section}
                    </div>

                    <div style={{ fontSize: '3.5rem', fontWeight: 800, lineHeight: 1 }}>{currentStep.dist}m</div>
                    <div style={{ fontSize: '1.4rem', marginBottom: '10px', opacity: 0.9 }}>{currentStep.desc}</div>

                    {/* Timer Display */}
                    <div style={{
                        fontSize: '6rem', fontWeight: 900, fontFamily: 'monospace',
                        color: showGo ? '#000' : (isRest ? '#ff6b6b' : '#63b3ed'),
                        background: showGo ? 'var(--accent)' : 'rgba(0,0,0,0.2)',
                        padding: '0 20px', borderRadius: '16px',
                        display: 'inline-block', minWidth: '300px'
                    }}>
                        {showGo ? "GO!" : (currentStep.time === 0 ? formatTime(elapsedTime) : formatTime(timeLeft))}
                    </div>

                    <div style={{ fontSize: '0.9rem', opacity: 0.6, textTransform: 'uppercase', marginTop: '10px' }}>
                        {currentStep.time === 0 ? 'Time Elapsed' : 'Time Remaining'}
                    </div>

                    {/* UP NEXT PREVIEW (Only during Rest/Finished) */}
                    {(isRest || timerFinished) && nextStep && (
                        <div style={{
                            marginTop: '30px',
                            background: 'rgba(0,0,0,0.3)',
                            padding: '15px',
                            borderRadius: '12px',
                            borderLeft: '4px solid #fff',
                            textAlign: 'left',
                            maxWidth: '400px',
                            width: '100%',
                            marginLeft: 'auto',
                            marginRight: 'auto'
                        }}>
                            <div style={{ fontSize: '0.8rem', opacity: 0.6, textTransform: 'uppercase' }}>Up Next</div>
                            <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                                {nextStep.dist}m • {nextStep.desc || nextStep.mode}
                            </div>
                            <div style={{ fontSize: '0.9rem' }}>
                                {nextStep.time > 0 ? formatTime(nextStep.time) + " Interval" : "Manual / Rest"}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Controls */}
            <div style={{ padding: '20px 20px 40px' }}>
                {!timerActive ? (
                    // Start Button (or Next Button if finished)
                    <button
                        className="btn"
                        onClick={timerFinished ? advanceStep : handleStart}
                        style={{
                            height: '80px', fontSize: '1.8rem',
                            background: timerFinished ? (isRest ? 'var(--accent)' : '#fff') : themeColor,
                            color: timerFinished ? '#000' : '#fff',
                            border: 'none',
                            boxShadow: '0 4px 15px rgba(0,0,0,0.3)'
                        }}
                    >
                        {timerFinished ? <SkipForward style={{ display: 'inline', marginRight: '12px' }} size={32} /> : <Play style={{ display: 'inline', marginRight: '12px' }} size={32} />}
                        {mainButtonText}
                    </button>
                ) : (
                    // Pausing / Manual Finish
                    <div className="row">
                        <button className="btn" onClick={togglePause} style={{ height: '80px', fontSize: '1.2rem', background: '#4a5568' }}>
                            {isPaused ? <Play /> : <Pause />}
                            {isPaused ? 'RESUME' : 'PAUSE'}
                        </button>
                        <button className="btn" onClick={() => {
                            clearInterval(intervalRef.current);
                            handleTimerComplete();
                        }} style={{ height: '80px', fontSize: '1.2rem', background: '#4a5568' }}>
                            <SkipForward />
                            NEXT
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
