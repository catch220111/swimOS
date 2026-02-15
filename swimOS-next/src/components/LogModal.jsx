import React, { useState, useRef } from 'react';
import { X, Upload, Check } from 'lucide-react';
import { parseWorkoutCSV } from '../utils/csvParser';
import { analyzeWorkout } from '../utils/analytics';
import { saveLog } from '../utils/storage';

export default function LogModal({ isOpen, onClose, onSaveSuccess }) {
    const fileInputRef = useRef(null);
    const [date, setDate] = useState(new Date().toISOString().slice(0, 16));
    const [rpe, setRpe] = useState(5);
    const [csvData, setCsvData] = useState(null); // { plan, total, breakdown }
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            const result = parseWorkoutCSV(ev.target.result);
            if (result) {
                const breakdown = analyzeWorkout(result.plan);
                setCsvData({ ...result, breakdown });
                setError('');
            } else {
                setError('Could not parse workout from CSV.');
            }
        };
        reader.readAsText(file);
    };

    const handleSave = () => {
        if (!csvData) {
            setError('Please upload a valid CSV workout first.');
            return;
        }

        const dateObj = new Date(date);
        const timestamp = dateObj.getTime();
        if (isNaN(timestamp)) {
            setError('Please enter a valid date.');
            return;
        }

        const newLog = {
            date: dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString(),
            timestamp: timestamp,
            dist: csvData.total,
            duration: 'Imported',
            quickTime: '-',
            notes: '',
            rpe: rpe,
            completedMode: 'remote',
            failPoint: '-',
            laps: 0,
            breakdown: csvData.breakdown
        };

        saveLog(newLog);
        onSaveSuccess();
        onClose();
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
            <div className="panel" style={{ width: '100%', maxWidth: '400px', background: '#1a1a1a', border: '1px solid #333' }}>
                <h3 className="panel-title" style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '16px' }}>
                    Log Past Workout (CSV Required)
                </h3>

                <label className="muted" style={{ display: 'block', marginBottom: '6px' }}>Date & Time</label>
                <input
                    type="datetime-local"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    style={{ marginBottom: '12px', width: '100%', padding: '10px', background: '#333', color: '#fff', border: 'none', borderRadius: '8px' }}
                />

                {/* CSV Upload Section */}
                <div style={{
                    background: '#222', padding: '15px', borderRadius: '12px', border: '1px dashed #444',
                    marginBottom: '16px', textAlign: 'center'
                }}>
                    <div style={{ fontSize: '2rem', marginBottom: '8px' }}><Upload size={32} /></div>
                    <div style={{ fontWeight: 700, color: '#fff', marginBottom: '4px' }}>Upload Workout CSV</div>
                    <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '12px' }}>Required for accurate breakdown</div>

                    <button className="btn btn-primary" onClick={() => fileInputRef.current.click()}>Select File</button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        accept=".csv"
                        onChange={handleFileChange}
                    />

                    {csvData && (
                        <div style={{ marginTop: '10px' }}>
                            <div style={{ color: 'var(--success)', fontWeight: 700, fontSize: '1.1rem', marginBottom: '8px' }}>
                                ✓ Loaded {csvData.total}m
                            </div>
                        </div>
                    )}
                    {error && <div style={{ color: 'var(--danger)', marginTop: '10px', fontSize: '0.9rem' }}>{error}</div>}
                </div>

                <label className="muted" style={{ display: 'block', marginBottom: '6px' }}>RPE (1-10)</label>
                <input
                    type="number"
                    min="1" max="10"
                    value={rpe}
                    onChange={(e) => setRpe(parseInt(e.target.value))}
                    style={{ marginBottom: '12px', width: '100%', padding: '10px', background: '#333', color: '#fff', border: 'none', borderRadius: '8px' }}
                />

                {/* Buttons */}
                <div className="row">
                    <button className="btn" style={{ background: '#333' }} onClick={onClose}>Cancel</button>
                    <button className="btn btn-success" onClick={handleSave}>Save</button>
                </div>
            </div>
        </div>
    );
}
