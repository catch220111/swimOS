import React, { useRef, useState } from 'react';
import { Calendar, Timer, Calculator } from 'lucide-react';

export default function Dashboard({ onNavigate, onStartLive }) {
    const fileInputRef = useRef(null);
    const [css400, setCss400] = useState('');
    const [css200, setCss200] = useState('');

    const calculateCSS = () => {
        const parseTime = (str) => {
            if (!str) return 0;
            const parts = str.split(':');
            if (parts.length === 2) return parseInt(parts[0]) * 60 + parseInt(parts[1]);
            return parseInt(str) || 0;
        };
        const t400 = parseTime(css400);
        const t200 = parseTime(css200);

        if (t400 && t200 && t400 > t200) {
            const cssSpeed = (400 - 200) / (t400 - t200);
            const pace100 = 100 / cssSpeed;
            const m = Math.floor(pace100 / 60);
            const s = Math.round(pace100 % 60);
            return `${m}:${s < 10 ? '0' : ''}${s}/100m`;
        }
        return '...';
    };

    return (
        <div className="view active-view">
            <h1>SwimOS</h1>
            <h2>Dashboard</h2>

            <div className="card" style={{ textAlign: 'center', padding: '30px 20px' }}>
                <div style={{ fontSize: '3rem', marginBottom: '10px' }}>🏊</div>
                <h3 style={{ marginBottom: '8px' }}>SwimOS</h3>
                <p className="muted" style={{ marginBottom: '24px' }}>Select a mode to begin.</p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

                    {/* Option 1: Log Past */}
                    <button
                        className="btn"
                        style={{ background: '#2C2C2E', border: '1px solid #3A3A3C', height: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}
                        onClick={() => onNavigate('log-modal')}
                    >
                        <Calendar size={24} />
                        <span style={{ fontWeight: 600 }}>Log Past Workout</span>
                        <span style={{ fontSize: '0.75rem', color: '#888' }}>Upload CSV to History</span>
                    </button>

                    {/* Option 2: Live Workout */}
                    <button
                        className="btn"
                        style={{ background: 'var(--accent)', color: '#000', height: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}
                        onClick={() => fileInputRef.current.click()}
                    >
                        <Timer size={24} />
                        <span style={{ fontWeight: 700 }}>Start Live Session</span>
                        <span style={{ fontSize: '0.75rem', color: '#000', opacity: 0.7 }}>Upload CSV & Swim</span>
                    </button>
                </div>

                <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept=".csv"
                    onChange={(e) => onStartLive(e.target.files[0])}
                />
            </div>

            {/* CSS Calculator */}
            <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <Calculator size={20} className="muted" />
                    <h3>CSS Calculator</h3>
                </div>

                <div className="row" style={{ marginBottom: '12px' }}>
                    <div className="grow">
                        <label className="muted" style={{ fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>400m Time</label>
                        <input
                            type="text"
                            placeholder="mm:ss"
                            value={css400}
                            onChange={(e) => setCss400(e.target.value)}
                            style={{ width: '100%', padding: '10px', background: '#333', color: '#fff', border: 'none', borderRadius: '8px' }}
                        />
                    </div>
                    <div className="grow">
                        <label className="muted" style={{ fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>200m Time</label>
                        <input
                            type="text"
                            placeholder="mm:ss"
                            value={css200}
                            onChange={(e) => setCss200(e.target.value)}
                            style={{ width: '100%', padding: '10px', background: '#333', color: '#fff', border: 'none', borderRadius: '8px' }}
                        />
                    </div>
                </div>
                <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--accent)' }}>
                    {calculateCSS()}
                </div>
            </div>
        </div>
    );
}
