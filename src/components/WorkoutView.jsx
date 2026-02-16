import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, SkipForward, X, Square, Volume2, VolumeX, Mic, MicOff, RotateCcw, ChevronDown } from 'lucide-react';
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
    const [voiceEnabled, setVoiceEnabled] = useState(true); // Default ON
    const [showSetList, setShowSetList] = useState(false); // New state for Full Set View

    // Refs
    const intervalRef = useRef(null);
    const startTimeRef = useRef(Date.now());

    // --- Voice Command Setup (Simplified for new flow) ---
    const commands = useMemo(() => ({
        'start': () => !timerActiveRef.current && handleStartRef.current(),
        'go': () => !timerActiveRef.current && handleStartRef.current(),
        'next': () => advanceStepRef.current(true),
        'skip': () => advanceStepRef.current(true), // new command
        'pause': () => timerActiveRef.current && !isPausedRef.current && togglePauseRef.current(),
        'resume': () => timerActiveRef.current && isPausedRef.current && togglePauseRef.current(),
        'stop': () => timerActiveRef.current && !isPausedRef.current && togglePauseRef.current(),
        'quit': () => onExitRef.current(),
        'back': () => prevStepRef.current() // new command
    }), []);

    const { isListening, toggleListening, error: micError, transcript } = useVoiceCommands(commands);

    // Refs
    const timerActiveRef = useRef(timerActive);
    const isPausedRef = useRef(isPaused);
    const handleStartRef = useRef(null);
    const advanceStepRef = useRef(null);
    const prevStepRef = useRef(null);
    const togglePauseRef = useRef(null);
    const onExitRef = useRef(onExit);

    useEffect(() => {
        timerActiveRef.current = timerActive;
        isPausedRef.current = isPaused;
    }, [timerActive, isPaused]);

    // Initial Setup
    useEffect(() => {
        if (workoutPlan && workoutPlan.total > 0) {
            // First step auto-start depends on type, but usually first rep is swim -> auto-start
            setupStep(0, workoutPlan.plan[0].mode !== 'rest');
        }
        return () => clearInterval(intervalRef.current);
    }, [workoutPlan]);

    // Helper: Get Section Info
    const getSectionInfo = () => {
        if (!workoutPlan) return { start: 0, end: 0, total: 0, current: 0 };
        const currentSection = workoutPlan.plan[currentIndex].section;

        let start = currentIndex;
        while (start > 0 && workoutPlan.plan[start - 1].section === currentSection) {
            start--;
        }

        let end = currentIndex;
        while (end < workoutPlan.plan.length - 1 && workoutPlan.plan[end + 1].section === currentSection) {
            end++;
        }

        return {
            start,
            end,
            total: end - start + 1,
            current: currentIndex - start + 1,
            name: currentSection
        };
    };

    const sectionInfo = getSectionInfo();

    const restartRound = () => {
        if (confirm("Restart this set?")) {
            setupStep(sectionInfo.start, true); // Auto-start the restart? Or manual? Let's auto-start if it's a swim.
        }
    };

    const setupStep = (index, autoStart = false) => {
        if (!workoutPlan || index < 0 || index >= workoutPlan.plan.length) return;
        const step = workoutPlan.plan[index];

        setCurrentIndex(index);

        let d = 0;
        for (let i = 0; i < index; i++) d += workoutPlan.plan[i].dist;
        setCurrentDist(d);

        setTimeLeft(step.time);
        setElapsedTime(0);
        setTimerActive(false);
        setIsPaused(false);
        clearInterval(intervalRef.current);

        // Auto-Start Logic:
        // - Interval/Swim: YES (unless Manual 0-time, handled by 0 check)
        // - Rest: NO (User explicitly requested "Do not auto-start")
        if (autoStart && step.mode !== 'rest' && step.time > 0) {
            handleStart();
        }
    };

    const handleStart = () => {
        initAudio();
        if (voiceEnabled && workoutPlan.plan[currentIndex].time > 0) {
            beep(1200, 0.1, 'square', 0.1);
        }
        startTimer();
    };
    handleStartRef.current = handleStart;

    const startTimer = () => {
        setTimerActive(true);
        setIsPaused(false);

        const currentStep = workoutPlan.plan[currentIndex];
        const isManual = currentStep.time === 0;

        intervalRef.current = setInterval(() => {
            if (isManual) {
                setElapsedTime(prev => prev + 1);
            } else {
                setTimeLeft((prev) => {
                    if (prev <= 1) {
                        clearInterval(intervalRef.current);
                        // If it's a Rest, we do NOT auto-advance. We wait for user.
                        // If it's an Interval, we Auto-Advance.
                        if (currentStep.mode === 'rest') {
                            setTimerActive(false); // Finished
                            if (voiceEnabled) beep(1450, 0.5, 'square', 0.5);
                        } else {
                            // Interval Auto-Advance
                            if (voiceEnabled) beep(1450, 0.5, 'square', 0.5);
                            advanceStep(true);
                        }
                        return 0;
                    }
                    if (prev <= 4 && prev > 1 && voiceEnabled) {
                        beep(1200, 0.12, 'square', 0.24);
                    }
                    return prev - 1;
                });
            }
        }, 1000);
    };

    const advanceStep = (forceAutoStart = null) => {
        if (currentIndex < workoutPlan.plan.length - 1) {
            // Determine next step's auto-start preference
            const nextStep = workoutPlan.plan[currentIndex + 1];

            // Default: Intervals auto-start, Rests do NOT.
            // Force override if provided.
            let shouldAutoStart = forceAutoStart;
            if (shouldAutoStart === null) {
                shouldAutoStart = nextStep.mode !== 'rest';
            }

            // Explicit user rule: "Rest... Do not auto-start."
            // So if next is Rest, autoStart should be false unless overridden? 
            // Actually, for Rest, we ALWAYS want manual start for now.
            if (nextStep.mode === 'rest') shouldAutoStart = false;

            setupStep(currentIndex + 1, shouldAutoStart);
        } else {
            finishWorkout();
        }
    };
    advanceStepRef.current = advanceStep;

    const prevStep = () => {
        if (currentIndex > 0) {
            setupStep(currentIndex - 1, false);
        }
    };
    prevStepRef.current = prevStep;

    // ... (finishWorkout, togglePause, etc. unchanged) ...
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

    // Theme & State Logic
    const isRest = currentStep.mode === 'rest';
    let themeColor = isRest ? "#e53e3e" : "#4299e1";
    let bgColor = isRest ? "#3b1717" : "#1a2c42";
    let statusLabel = isRest ? "RESTING" : "SWIMMING";
    const timerFinished = !timerActive && timeLeft === 0 && currentStep.time > 0;

    if (currentStep.time === 0) {
        statusLabel = "MANUAL";
        themeColor = "#ecc94b";
        bgColor = "#44380b";
    }

    const nextStep = workoutPlan.plan[currentIndex + 1];

    // ... (previous button logic) ...
    // Button Logic for REST
    let mainBtn = null;
    let secBtn = null;

    if (isRest) {
        if (timerFinished) {
            mainBtn = (
                <button className="btn" onClick={() => advanceStep(true)}
                    style={{ flex: 1, height: '80px', fontSize: '1.6rem', background: '#48bb78', color: '#000', fontWeight: 900, animation: 'pulse 1.5s infinite' }}>
                    GO TO NEXT SET <SkipForward size={24} style={{ marginLeft: '10px' }} />
                </button>
            );
        } else if (timerActive) {
            mainBtn = (
                <button className="btn btn-danger" onClick={() => advanceStep(true)}
                    style={{ flex: 1, height: '80px', fontSize: '1.3rem', fontWeight: 700 }}>
                    SKIP REST / START SWIM
                </button>
            );
        } else {
            mainBtn = (
                <button className="btn btn-success" onClick={handleStart}
                    style={{ flex: 1, height: '80px', fontSize: '1.8rem', fontWeight: 800 }}>
                    <Play size={32} style={{ marginRight: '10px' }} /> START REST
                </button>
            );
        }
    } else {
        // INTERVAL MODE
        secBtn = (
            <button className="btn" onClick={togglePause} style={{ flex: 1, height: '80px', fontSize: '1.2rem', background: '#4a5568' }}>
                {isPaused ? <Play size={24} style={{ marginRight: '8px' }} /> : <Pause size={24} style={{ marginRight: '8px' }} />}
                {isPaused ? 'RESUME' : 'PAUSE'}
            </button>
        );
        mainBtn = (
            <button className="btn" onClick={() => advanceStep(true)}
                style={{ flex: 2, height: '80px', fontSize: '1.5rem', background: 'var(--accent)', color: '#000', fontWeight: 700 }}>
                <SkipForward size={24} style={{ marginRight: '8px' }} />
                {timerFinished ? "NEXT CARD" : "SKIP INTERVAL"}
            </button>
        );
    }

    return (
        <div className="view active-view" style={{ display: 'flex', flexDirection: 'column', height: '100vh', paddingBottom: '0', overflow: 'hidden' }}>
            <style>{`
                @keyframes pulse {
                    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(72, 187, 120, 0.7); }
                    70% { transform: scale(1.02); box-shadow: 0 0 0 10px rgba(72, 187, 120, 0); }
                    100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(72, 187, 120, 0); }
                }
                .set-list-overlay {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.9); z-index: 100;
                    padding: 20px; overflow-y: auto; display: flex; flexDirection: column;
                }
                .set-item {
                    padding: 15px; border-bottom: 1px solid #333; display: flex; justify-content: space-between;
                }
                .set-item.active {
                    background: rgba(255,255,255,0.1); border-left: 4px solid var(--accent);
                }
            `}</style>

            {/* Set List Overlay */}
            {showSetList && (
                <div className="set-list-overlay">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h2>{sectionInfo.name} Playlist</h2>
                        <button className="btn" onClick={() => setShowSetList(false)} style={{ width: 'auto', padding: '5px 15px' }}>Close</button>
                    </div>
                    {workoutPlan.plan.slice(sectionInfo.start, sectionInfo.end + 1).map((s, idx) => (
                        <div key={idx} className={`set-item ${sectionInfo.start + idx === currentIndex ? 'active' : ''}`}
                            onClick={() => {
                                setupStep(sectionInfo.start + idx, true);
                                setShowSetList(false);
                            }}>
                            <div>
                                <div style={{ fontWeight: 700 }}>{s.dist}m {s.mode}</div>
                                <div style={{ opacity: 0.7, fontSize: '0.9rem' }}>{s.desc}</div>
                            </div>
                            <div style={{ opacity: 0.5 }}>{s.time > 0 ? formatTime(s.time) : '-'}</div>
                        </div>
                    ))}
                    <div style={{ marginTop: '20px' }}>
                        <button className="btn btn-warning" onClick={() => { restartRound(); setShowSetList(false); }}>Restart This Set</button>
                    </div>
                </div>
            )}

            {/* TOP 80% AREA (Container for Top Bar, Card, Controls) */}
            <div style={{ height: '80vh', display: 'flex', flexDirection: 'column' }}>

                {/* Top Bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 15px', flex: '0 0 auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button className="btn" onClick={prevStep} disabled={currentIndex === 0} style={{ padding: '8px', fontSize: '0.9rem', width: 'auto', background: '#333' }}>
                            ←
                        </button>
                        <button className="btn" onClick={restartRound} title="Restart Round" style={{ padding: '8px', width: 'auto', background: '#333' }}>
                            <RotateCcw size={16} />
                        </button>
                        <div style={{
                            background: '#333', padding: '5px 10px', borderRadius: '8px',
                            fontSize: '0.8rem', fontWeight: 700,
                            display: 'flex', alignItems: 'center', gap: '5px'
                        }}>
                            {sectionInfo.name} <span style={{ opacity: 0.5 }}>|</span> <span style={{ color: 'var(--accent)' }}>{sectionInfo.current}/{sectionInfo.total}</span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '5px' }}>
                        <button className="btn" onClick={toggleListening} style={{ width: 'auto', padding: '8px', background: isListening ? 'var(--accent)' : 'transparent', border: isListening ? 'none' : '1px solid #444' }}>
                            {isListening ? <Mic size={18} color="#000" /> : <MicOff size={18} color="#666" />}
                        </button>
                        <button className="btn" onClick={() => setVoiceEnabled(!voiceEnabled)} style={{ width: 'auto', padding: '8px', background: 'transparent', border: '1px solid #444' }}>
                            {voiceEnabled ? <Volume2 size={18} color="#fff" /> : <VolumeX size={18} color="#666" />}
                        </button>
                        <button className="btn btn-danger" style={{ width: 'auto', padding: '8px', fontSize: '0.8rem' }} onClick={onExit}>X</button>
                    </div>
                </div>

                {/* Main Card */}
                <div style={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    border: `6px solid ${themeColor}`, margin: '0 10px 10px 10px', borderRadius: '24px',
                    background: bgColor, transition: 'all 0.3s ease', position: 'relative', overflow: 'hidden'
                }}>
                    {/* Big Background Status Label */}
                    <div style={{
                        fontSize: '15vw', fontWeight: 900, textTransform: 'uppercase',
                        color: 'rgba(255,255,255,0.05)', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                        pointerEvents: 'none', userSelect: 'none', whiteSpace: 'nowrap', textAlign: 'center'
                    }}>
                        {statusLabel}
                    </div>

                    {/* Content Layer */}
                    <div style={{ zIndex: 2, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>

                        {/* View List Toggle */}
                        <div style={{ position: 'absolute', top: '10px', right: '15px' }}>
                            <button onClick={() => setShowSetList(true)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '5px 10px', borderRadius: '15px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                List <ChevronDown size={14} />
                            </button>
                        </div>

                        {/* Top Section: Timer / Current Info */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '10px' }}>
                            <div className="muted" style={{ textTransform: 'uppercase', letterSpacing: '2px', fontSize: '1rem', marginBottom: '5px', color: themeColor }}>
                                {currentStep.dist}m {currentStep.mode}
                            </div>

                            <div style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1.1, maxWidth: '95%', marginBottom: '10px' }}>{currentStep.desc}</div>

                            <div style={{
                                fontSize: '6rem', fontWeight: 900, fontFamily: 'monospace',
                                color: isRest ? '#ff6b6b' : '#63b3ed',
                                background: 'rgba(0,0,0,0.2)', padding: '0 20px', borderRadius: '16px',
                                display: 'inline-block', minWidth: '300px'
                            }}>
                                {currentStep.time === 0 ? formatTime(elapsedTime) : formatTime(timeLeft)}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Controls Area (Inside 80%) */}
                <div style={{ padding: '0 20px 15px', display: 'flex', gap: '15px', flex: '0 0 auto' }}>
                    {secBtn}
                    {mainBtn}
                </div>
            </div>

            {/* GLOBAL NEXT REP PREVIEW (Bottom 20%) */}
            <div style={{
                height: '20vh', background: '#111', borderTop: '2px solid #333',
                padding: '15px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center'
            }}>
                {nextStep ? (
                    <>
                        <div style={{ fontSize: '0.9rem', color: '#888', textTransform: 'uppercase', marginBottom: '5px', letterSpacing: '1px' }}>Up Next</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                            <div>
                                <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#fff', lineHeight: 1 }}>
                                    {nextStep.dist}m <span style={{ color: 'var(--accent)' }}>{nextStep.mode}</span>
                                </div>
                                <div style={{ fontSize: '1.2rem', color: '#bbb', marginTop: '5px' }}>{nextStep.desc || "Standard Swim"}</div>
                            </div>
                            <div style={{ textAlign: 'right', minWidth: '80px' }}>
                                <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'monospace' }}>
                                    {nextStep.time > 0 ? formatTime(nextStep.time) : "MANUAL"}
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--accent)' }}>
                        <div style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '2px' }}>FINISH WORKOUT</div>
                    </div>
                )}
            </div>
        </div>
    );
}
