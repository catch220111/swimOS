import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, X, Square } from 'lucide-react';
import { formatTime } from '../utils/formatters';
import { initAudio, beep, speakText } from '../utils/audio';
import { saveLog } from '../utils/storage';
import { analyzeWorkout } from '../utils/analytics';

export default function WorkoutView({ workoutPlan, onExit }) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [currentDist, setCurrentDist] = useState(0);
    const [timeLeft, setTimeLeft] = useState(0);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [timerActive, setTimerActive] = useState(false);
    const [timerFinished, setTimerFinished] = useState(false); // New state for transition

    // Refs
    const intervalRef = useRef(null);
    const startTimeRef = useRef(Date.now());

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
            speakText('Take your marks');
            setTimeout(() => {
                beep(1850, 0.38, 'square', 0.95);
                startTimer();
            }, 1300);
        } else {
            // Immediate start for rests
            startTimer();
        }
    };

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
                    if (prev <= 4 && prev > 1) {
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
        beep(1450, 0.5, 'square', 0.5); // Signal completion
    };

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

    const togglePause = () => {
        if (!timerActive) return;
        if (isPaused) {
            startTimer();
        } else {
            clearInterval(intervalRef.current);
            setIsPaused(true);
        }
    };

    const currentStep = workoutPlan?.plan[currentIndex];
    if (!currentStep) return <div className="view active-view">Loading...</div>;

    const isRest = currentStep.mode === 'rest';
    // If timer is finished:
    // - If it WAS a rest, we are ready to GO (swim).
    // - If it WAS a swim, we are ready to REST (or next swim).
    const showGo = (isRest && timerFinished);

    // UI Labels
    const nextStep = workoutPlan.plan[currentIndex + 1];
    const nextIsRest = nextStep?.mode === 'rest';

    let mainButtonText = "START";
    if (timerFinished) {
        // We are waiting to advance
        if (isRest) mainButtonText = "START INTERVAL"; // Rest done -> Start Swim
        else mainButtonText = nextIsRest ? "START REST" : "START NEXT INTERVAL"; // Swim done -> Start Rest
    } else {
        // We are waiting to start CURRENT step
        mainButtonText = isRest ? "START REST" : "START INTERVAL";
    }

    return (
        <div className="view active-view" style={{ display: 'flex', flexDirection: 'column', height: '100vh', paddingBottom: '0' }}>
            {/* Simple Top Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '20px' }}>
                <div style={{ fontWeight: 700 }}>{currentDist} / {workoutPlan.total}m</div>
                <div style={{ fontWeight: 700, opacity: 0.7 }}>Rep {currentStep.rep} / {currentStep.totalReps}</div>
                <button className="btn btn-danger" style={{ width: 'auto', padding: '8px 12px', fontSize: '0.8rem' }} onClick={onExit}>QUIT</button>
            </div>

            {/* Main Card */}
            <div style={{
                flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center',
                border: `4px solid ${isRest ? '#5c1e1e' : '#1c5a3a'}`, margin: '20px', borderRadius: '24px', background: '#1c1c1e',
                position: 'relative', overflow: 'hidden'
            }}>
                {/* Step Info */}
                <div className="muted" style={{ textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.9rem' }}>{currentStep.section}</div>
                <div style={{ fontSize: '3rem', fontWeight: 800, margin: '10px 0' }}>{currentStep.dist}m</div>
                <div style={{ fontSize: '1.2rem', marginBottom: '20px' }}>{currentStep.desc}</div>

                {/* Timer Display */}
                <div style={{ fontSize: '5rem', fontWeight: 900, fontFamily: 'monospace', color: isRest ? 'var(--danger)' : 'var(--text-main)' }}>
                    {currentStep.time === 0 ? formatTime(elapsedTime) : formatTime(timeLeft)}
                </div>

                {/* Time Label */}
                <div style={{ fontSize: '0.8rem', opacity: 0.6, textTransform: 'uppercase', marginBottom: '10px' }}>
                    {currentStep.time === 0 ? 'Time Elapsed' : 'Time Remaining'}
                </div>

                {/* Status Badge / GO Overlay */}
                {showGo ? (
                    <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0, 255, 100, 0.9)', color: '#000',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '8rem', fontWeight: 900, zIndex: 10
                    }}>
                        GO!
                    </div>
                ) : (
                    <div style={{
                        background: isRest ? 'var(--danger)' : 'var(--success)',
                        color: '#000', padding: '4px 12px', borderRadius: '12px', fontWeight: 700, marginTop: '10px'
                    }}>
                        {timerFinished ? 'DONE' : (isRest ? 'RESTING' : 'SWIMMING')}
                    </div>
                )}
            </div>

            {/* Controls */}
            <div style={{ padding: '20px 20px 100px' }}>
                {!timerActive ? (
                    // Start Button (or Next Button if finished)
                    <button
                        className={`btn ${isRest ? 'btn-warning' : 'btn-success'}`}
                        onClick={timerFinished ? advanceStep : handleStart}
                        style={{ height: '80px', fontSize: '1.5rem' }}
                    >
                        {timerFinished ? <SkipForward style={{ display: 'inline', marginRight: '8px' }} /> : <Play style={{ display: 'inline', marginRight: '8px' }} />}
                        {mainButtonText}
                    </button>
                ) : (
                    // Pausing / Manual Finish
                    <div className="row">
                        <button className="btn" onClick={togglePause} style={{ height: '80px', fontSize: '1.2rem' }}>
                            {isPaused ? <Play /> : <Pause />}
                            {isPaused ? 'RESUME' : 'PAUSE'}
                        </button>
                        <button className="btn" onClick={() => {
                            clearInterval(intervalRef.current);
                            handleTimerComplete();
                        }} style={{ height: '80px', fontSize: '1.2rem' }}>
                            <SkipForward />
                            NEXT
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
