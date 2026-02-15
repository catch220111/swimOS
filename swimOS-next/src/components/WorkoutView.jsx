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
    const [isPaused, setIsPaused] = useState(false);
    const [timerActive, setTimerActive] = useState(false);

    // Refs for timer interval
    const intervalRef = useRef(null);
    const startTimeRef = useRef(Date.now());

    // Initial Setup
    useEffect(() => {
        if (workoutPlan && workoutPlan.total > 0) {
            setCurrentIndex(0);
            setCurrentDist(0);
            renderStep(0);
        }
        return () => clearInterval(intervalRef.current);
    }, [workoutPlan]);

    const renderStep = (index) => {
        if (!workoutPlan || index >= workoutPlan.plan.length) return;
        const step = workoutPlan.plan[index];
        setTimeLeft(step.time);
        setTimerActive(false);
        setIsPaused(false);
        clearInterval(intervalRef.current);
    };

    const handleStart = () => {
        initAudio();
        speakText('Take your marks');
        setTimeout(() => {
            beep(1850, 0.38, 'square', 0.95);
            startTimer();
        }, 1300);
    };

    const startTimer = () => {
        setTimerActive(true);
        setIsPaused(false);

        intervalRef.current = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    // Timer finished
                    clearInterval(intervalRef.current);
                    completeStep();
                    return 0;
                }

                // Beep logic
                if (prev <= 4 && prev > 1) {
                    beep(1200, 0.12, 'square', 0.24);
                }

                return prev - 1;
            });
        }, 1000);
    };

    const completeStep = () => {
        beep(1450, 0.5, 'square', 0.5); // Go signal for next or rest end
        const step = workoutPlan.plan[currentIndex];
        setCurrentDist(prev => prev + step.dist);

        if (currentIndex < workoutPlan.plan.length - 1) {
            const nextIdx = currentIndex + 1;
            setCurrentIndex(nextIdx);
            renderStep(nextIdx);

            // Auto-start next if it's a rest or configured (simplifying to auto-start rest for now)
            // In React version we can improve this logic later
            const nextStep = workoutPlan.plan[nextIdx];
            if (nextStep.mode === 'rest') {
                setTimeout(() => startTimer(), 1000);
            }
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
            rpe: 5, // Default for now, could add modal
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

    return (
        <div className="view active-view" style={{ display: 'flex', flexDirection: 'column', height: '100vh', paddingBottom: '0' }}>
            {/* Simple Top Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '20px' }}>
                <div style={{ fontWeight: 700 }}>{currentDist} / {workoutPlan.total}m</div>
                <button className="btn btn-danger" style={{ width: 'auto', padding: '8px 12px', fontSize: '0.8rem' }} onClick={onExit}>QUIT</button>
            </div>

            {/* Main Card */}
            <div style={{
                flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center',
                border: `4px solid ${isRest ? '#5c1e1e' : '#1c5a3a'}`, margin: '20px', borderRadius: '24px', background: '#1c1c1e'
            }}>
                <div className="muted" style={{ textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.9rem' }}>{currentStep.section}</div>
                <div style={{ fontSize: '3rem', fontWeight: 800, margin: '10px 0' }}>{currentStep.dist}m</div>
                <div style={{ fontSize: '1.2rem', marginBottom: '20px' }}>{currentStep.desc}</div>

                <div style={{ fontSize: '5rem', fontWeight: 900, fontFamily: 'monospace', color: isRest ? 'var(--danger)' : 'var(--text-main)' }}>
                    {formatTime(timeLeft)}
                </div>

                <div style={{
                    background: isRest ? 'var(--danger)' : 'var(--success)',
                    color: '#000', padding: '4px 12px', borderRadius: '12px', fontWeight: 700, marginTop: '10px'
                }}>
                    {isRest ? 'REST' : 'GO'}
                </div>

            </div>

            {/* Controls */}
            <div style={{ padding: '20px 20px 100px' }}>
                {!timerActive ? (
                    <button className={`btn ${isRest ? 'btn-warning' : 'btn-success'}`} onClick={handleStart} style={{ height: '80px', fontSize: '1.5rem' }}>
                        <Play style={{ display: 'inline', marginRight: '8px' }} />
                        START {isRest ? 'REST' : 'INTERVAL'}
                    </button>
                ) : (
                    <div className="row">
                        <button className="btn" onClick={togglePause} style={{ height: '80px', fontSize: '1.2rem' }}>
                            {isPaused ? <Play /> : <Pause />}
                            {isPaused ? 'RESUME' : 'PAUSE'}
                        </button>
                        <button className="btn" onClick={completeStep} style={{ height: '80px', fontSize: '1.2rem' }}>
                            <SkipForward />
                            NEXT
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
