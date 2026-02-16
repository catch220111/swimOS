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
    const [restPhase, setRestPhase] = useState('swim'); // 'swim' or 'rest' for Two-Phase Rest Mode
    const [currentTimeLeft, setCurrentTimeLeft] = useState(0); // For display updates (countdown)
    const [currentElapsedTime, setCurrentElapsedTime] = useState(0); // For display updates (countup)

    // Flash State
    const [screenFlash, setScreenFlash] = useState(false);

    const [isPaused, setIsPaused] = useState(false);
    const [timerActive, setTimerActive] = useState(false);
    const [voiceEnabled, setVoiceEnabled] = useState(true); // Default ON
    const [showSetList, setShowSetList] = useState(false);
    const [completedSplits, setCompletedSplits] = useState({});

    // Refs
    const rafRef = useRef(null);
    const stepEndTimeRef = useRef(null); // The target timestamp for Count-Down completion
    const stepStartTimeRef = useRef(null); // The timestamp when Count-Up started

    // Overall Workout Stats
    const totalWorkoutStartTimeRef = useRef(Date.now()); // Changed name to clarify

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
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
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

    // Helper: Stats
    const getSessionStats = () => {
        if (!workoutPlan) return { dist: 0, kcal: 0, time: '0:00' };

        // Completed Distance
        // If we want exact tracking, we'd sum up completed steps.
        // Approximate: currentDist
        const dist = currentDist + (restPhase === 'swim' && currentDist < workoutPlan.total ? 0 : 0); // Logic can be improved

        // Calories: Dist * 0.25 (Avg for moderate pace)
        const kcal = Math.floor(dist * 0.25);

        // Time
        const totalElapsed = Date.now() - totalWorkoutStartTimeRef.current;
        const mins = Math.floor(totalElapsed / 60000);
        const secs = Math.floor((totalElapsed % 60000) / 1000);

        return { dist, kcal, time: `${mins}:${secs.toString().padStart(2, '0')}` };
    };

    const restartRound = () => {
        if (confirm("Restart this set?")) {
            setupStep(sectionInfo.start, true); // Auto-start the restart? Or manual? Let's auto-start if it's a swim.
        }
    };

    const setupStep = (index, autoStart = false) => {
        if (!workoutPlan || index < 0 || index >= workoutPlan.plan.length) return;
        const step = workoutPlan.plan[index];

        setCurrentIndex(index);

        // Recalculate distance
        let d = 0;
        for (let i = 0; i < index; i++) d += workoutPlan.plan[i].dist;
        setCurrentDist(d);

        // State Reset
        setCurrentElapsedTime(0);
        setTimerActive(false);
        setIsPaused(false);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        stepEndTimeRef.current = null;
        stepStartTimeRef.current = null;

        // Two-Phase Logic:
        if (step.mode === 'rest') {
            setRestPhase('swim');
            setCurrentTimeLeft(0);
        } else {
            setRestPhase(null);
            setCurrentTimeLeft(step.time); // Initialize display
        }

        if (autoStart && step.time > 0) {
            handleStart();
        }
    };

    const handleStart = () => {
        initAudio(); // Initialize audio context
        if (voiceEnabled && (workoutPlan.plan[currentIndex].time > 0 || restPhase === 'rest')) {
            beep(1200, 0.1, 'square', 0.1);
        }
        startTimer();
    };
    handleStartRef.current = handleStart;

    const startRestPhase = () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        const step = workoutPlan.plan[currentIndex];

        // CAPTURE SPLIT
        setCompletedSplits(prev => ({
            ...prev,
            [currentIndex]: currentElapsedTime
        }));

        setRestPhase('rest');
        setCurrentTimeLeft(step.time); // Reset display to full rest time
        setTimerActive(true);

        // Reset timing refs for Phase 2
        stepEndTimeRef.current = null;
        stepStartTimeRef.current = null;

        if (voiceEnabled) beep(1200, 0.1, 'square', 0.1);
        startTimer();
    };

    const startTimer = () => {
        setTimerActive(true);
        setIsPaused(false);

        const currentStep = workoutPlan.plan[currentIndex];
        const isCountUp = (currentStep.time === 0) || (currentStep.mode === 'rest' && restPhase === 'swim');
        const duration = currentStep.time;

        // Initialize Timing Refs if null (Start)
        // If resuming (isPaused was true), we DO NOT reset start/end refs to preserve "Late Start" / "Wall Clock"
        // Exception: If we just switched phases (startRestPhase), they were nullified, so we set them.

        if (isCountUp) {
            if (!stepStartTimeRef.current) {
                // Adjust for existing elapsed if resuming? 
                // "Count Up" usually just resumes where it left off.
                // start = now - previouslyElapsed
                stepStartTimeRef.current = Date.now() - (currentElapsedTime * 1000);
            }
        } else {
            // Count Down
            if (!stepEndTimeRef.current) {
                // New Start: End = Now + Duration
                // Resume: If we want "Late Start" (clock kept running), we shouldn't have cleared endTime on pause.
                // But setupStep clears it. togglePause does NOT clear it.
                // So if it's null, it's a fresh start.
                stepEndTimeRef.current = Date.now() + (duration * 1000);
            }
        }

        const tick = () => {
            const now = Date.now();

            if (isCountUp) {
                const elapsed = Math.floor((now - stepStartTimeRef.current) / 1000);
                setCurrentElapsedTime(elapsed);
                rafRef.current = requestAnimationFrame(tick);
            } else {
                // Count Down (Wall Clock)
                const remainingRaw = Math.ceil((stepEndTimeRef.current - now) / 1000);
                const remaining = Math.max(0, remainingRaw);

                setCurrentTimeLeft(remaining);

                if (remaining <= 0) {
                    // DONE
                    if (rafRef.current) cancelAnimationFrame(rafRef.current);

                    // Trigger Flash
                    setScreenFlash(true);
                    setTimeout(() => setScreenFlash(false), 1200);

                    // Sound
                    if (voiceEnabled) {
                        beep(1500, 0.8, 'square', 1.0);
                    }

                    advanceStep(true);
                } else {
                    rafRef.current = requestAnimationFrame(tick);
                }
            }
        };
        rafRef.current = requestAnimationFrame(tick);
    };

    // Correct Beep Logic requires ref
    const lastBeepRef = useRef(null);
    const isCountUpMode = (workoutPlan?.plan[currentIndex]?.time === 0) || (workoutPlan?.plan[currentIndex]?.mode === 'rest' && restPhase === 'swim');
    useEffect(() => {
        if (!timerActive || isCountUpMode) return;
        if (currentTimeLeft <= 4 && currentTimeLeft > 1 && currentTimeLeft !== lastBeepRef.current) {
            lastBeepRef.current = currentTimeLeft;
            if (voiceEnabled) beep(880, 0.1, 'square', 0.2);
        }
    }, [currentTimeLeft, timerActive, voiceEnabled, isCountUpMode]); // Utilizing the state update loop for side-effect beeps

    const advanceStep = (forceAutoStart = null) => {
        if (currentIndex < workoutPlan.plan.length - 1) {
            const nextStep = workoutPlan.plan[currentIndex + 1];
            let shouldAutoStart = forceAutoStart;
            if (shouldAutoStart === null) shouldAutoStart = nextStep.mode !== 'rest';
            if (nextStep.mode === 'rest') shouldAutoStart = false; // Rest always manual start (Phase 1)
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

    const finishWorkout = () => {
        // (Unchanged)
        const durationMin = Math.ceil((Date.now() - totalWorkoutStartTimeRef.current) / 60000);
        // MERGE LOGS
        // Create a detailed breakdown that includes the actual splits
        const enrichedPlan = workoutPlan.plan.map((step, idx) => ({
            ...step,
            actualTime: completedSplits[idx] || (step.time > 0 ? step.time : 0) // Use captured time or planned time
        }));

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
            splits: completedSplits, // Save raw splits
            breakdown: analyzeWorkout(workoutPlan.plan), // Stats (unchanged)
            detailedPlan: enrichedPlan // Full history
        };
        saveLog(log);
        alert('Workout Complete!');
        onExitRef.current();
    };

    const togglePause = () => {
        if (!timerActive) return;
        if (isPaused) {
            // RESUME
            // "Late Start" Logic: We DO NOT shift the stepEndTimeRef.
            // Current Time will be compared to original Target Time.
            // If we paused for 10s, "remaining" will naturally be 10s less.
            // Count-Up: We DO shift start time to ignore pause duration?
            // "Manual Mode... custom pauses." -> Count Up should probably technically pause?
            // Let's adopt user pref: Interval/Rest (CountDown) = Wall Clock. Manual (CountUp) = Stopwatch.

            const currentStep = workoutPlan.plan[currentIndex];
            const isCountUp = (currentStep.time === 0) || (currentStep.mode === 'rest' && restPhase === 'swim');

            if (isCountUp) {
                // Adjust start time so the "gap" is ignored
                stepStartTimeRef.current = Date.now() - (currentElapsedTime * 1000);
                // Yes, standard stopwatch behavior.
            } else {
                // Count Down: DO NOTHING to stepEndTimeRef. It keeps running.
            }
            startTimer();
        } else {
            // PAUSE
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            setIsPaused(true);
        }
    };
    togglePauseRef.current = togglePause;

    // UI Logic
    const currentStep = workoutPlan?.plan[currentIndex];
    if (!currentStep) return <div className="view active-view">Loading...</div>;
    const sessionStats = getSessionStats();

    // Theme & State Logic
    const isRestRow = currentStep.mode === 'rest';
    const isRestingActual = isRestRow && restPhase === 'rest';
    let themeColor = "#4299e1";
    let bgColor = "#1a2c42";
    let statusLabel = "SWIMMING";
    if (isRestingActual) {
        themeColor = "#e53e3e"; bgColor = "#3b1717"; statusLabel = "RESTING";
    } else if (currentStep.time === 0) {
        statusLabel = "MANUAL"; themeColor = "#ecc94b"; bgColor = "#44380b";
    }

    const nextStep = workoutPlan.plan[currentIndex + 1];

    // Display Logic
    const displayTime = isCountUpMode ? formatTime(currentElapsedTime) : formatTime(currentTimeLeft);

    // Button Logic (Refactored to check isRestingActual)
    let mainBtn = null;
    let secBtn = null;

    if (isRestRow) {
        if (restPhase === 'swim') {
            mainBtn = (
                <button className="btn" onClick={startRestPhase}
                    style={{ flex: 2, height: '80px', fontSize: '1.5rem', background: 'var(--accent)', color: '#000', fontWeight: 700 }}>
                    <SkipForward size={24} style={{ marginRight: '8px' }} />
                    FINISHED SWIM
                </button>
            );
        } else {
            mainBtn = (
                <button className="btn btn-danger" onClick={() => advanceStep(true)}
                    style={{ flex: 1, height: '80px', fontSize: '1.3rem', fontWeight: 700 }}>
                    SKIP REST
                </button>
            );
        }
    } else {
        mainBtn = (
            <button className="btn" onClick={() => advanceStep(true)}
                style={{ flex: 2, height: '80px', fontSize: '1.5rem', background: 'var(--accent)', color: '#000', fontWeight: 700 }}>
                <SkipForward size={24} style={{ marginRight: '8px' }} />
                SKIP INTERVAL
            </button>
        );
    }

    // Secondary Button (Pause) for all modes
    secBtn = (
        <button className="btn" onClick={togglePause} style={{ flex: 1, maxFlex: '0 0 100px', height: '80px', fontSize: '1.2rem', background: '#4a5568' }}>
            {isPaused ? <Play size={24} /> : <Pause size={24} />}
            <span style={{ marginLeft: '5px' }}>{isPaused ? 'RESUME' : 'PAUSE'}</span>
        </button>
    );

    return (
        <div className="view active-view" style={{ display: 'flex', flexDirection: 'column', height: '100vh', paddingBottom: '0', overflow: 'hidden' }}>
            {/* Screen Flash Overlay */}
            {screenFlash && (
                <div style={{
                    position: 'fixed', inset: 0, background: '#48bb78', zIndex: 9999,
                    animation: 'flashFade 1.2s forwards', pointerEvents: 'none'
                }}>
                    <style>{`@keyframes flashFade { 0% { opacity: 1; } 100% { opacity: 0; } }`}</style>
                </div>
            )}

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

                {/* TOP BAR (Session Dashboard) */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 15px', flex: '0 0 auto', background: '#0d1117', borderBottom: '1px solid #333' }}>
                    {/* Dashboard Left */}
                    <div style={{ display: 'flex', gap: '15px', fontSize: '0.85rem', fontWeight: 600 }}>
                        <div style={{ color: 'var(--accent)' }}>{sessionStats.dist}m <span style={{ color: '#666' }}>/ {workoutPlan.total}m</span></div>
                        <div style={{ color: '#fff' }}>{sessionStats.time}</div>
                        <div style={{ color: '#ecc94b' }}>{sessionStats.kcal} kcal</div>
                    </div>

                    {/* Dashboard Right (Exit) */}
                    <div style={{ display: 'flex', gap: '5px' }}>
                        <button className="btn btn-sm" onClick={toggleListening} style={{ padding: '5px 10px', background: 'transparent' }}>
                            {isListening ? <Mic size={16} color="var(--accent)" /> : <MicOff size={16} color="#666" />}
                        </button>
                        <button className="btn" onClick={() => setVoiceEnabled(!voiceEnabled)} style={{ width: 'auto', padding: '5px 10px', background: 'transparent', border: '1px solid #444' }}>
                            {voiceEnabled ? <Volume2 size={16} color="#fff" /> : <VolumeX size={16} color="#666" />}
                        </button>
                        <button className="btn btn-danger" style={{ width: 'auto', padding: '5px 12px', fontSize: '0.8rem' }} onClick={onExit}>EXIT</button>
                    </div>
                </div>

                {/* Sub-Header (Nav + Round Info) */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px', flex: '0 0 auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button onClick={prevStep} disabled={currentIndex === 0} style={{ background: '#333', border: 'none', color: '#fff', padding: '5px 10px', borderRadius: '5px' }}>←</button>
                        <div style={{ background: '#333', padding: '5px 10px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700 }}>
                            {sectionInfo.name} • Step {sectionInfo.current}/{sectionInfo.total}
                        </div>
                    </div>
                    <button onClick={restartRound} title="Restart Round" style={{ background: '#333', border: 'none', color: '#fff', padding: '5px', borderRadius: '50%' }}>
                        <RotateCcw size={14} />
                    </button>
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

                            {/* PERFORMANCE LOG: Show Last Split */}
                            {isRestingActual && completedSplits[currentIndex] && (
                                <div style={{ background: 'rgba(255,255,255,0.15)', padding: '5px 15px', borderRadius: '20px', marginBottom: '10px', border: '1px solid rgba(255,255,255,0.3)' }}>
                                    <span style={{ fontSize: '1rem', opacity: 0.8, marginRight: '8px' }}>LAST:</span>
                                    <span style={{ fontSize: '1.4rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--accent)' }}>
                                        {formatTime(completedSplits[currentIndex])}
                                    </span>
                                </div>
                            )}

                            <div style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1.1, maxWidth: '95%', marginBottom: '10px' }}>{currentStep.desc}</div>

                            {/* TIMER DISPLAY */}
                            <div style={{
                                fontSize: '6rem', fontWeight: 900, fontFamily: 'monospace',
                                color: isRestingActual ? '#ff6b6b' : '#63b3ed',
                                background: 'rgba(0,0,0,0.2)', padding: '0 20px', borderRadius: '16px',
                                display: 'inline-block', minWidth: '300px'
                            }}>
                                {displayTime}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Controls Area */}
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

