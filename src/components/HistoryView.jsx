import React, { useState, useEffect } from 'react';
import { getLogs, saveAllLogs } from '../utils/storage';
import { formatDate, formatTimeOfDay } from '../utils/formatters';
import { Trash2 } from 'lucide-react';
import Analytics from './Analytics';

export default function HistoryView() {
    const [logs, setLogs] = useState([]);
    const [activeTab, setActiveTab] = useState('history'); // history | analytics

    useEffect(() => {
        setLogs(getLogs());
    }, []);

    const handleDelete = () => {
        if (window.confirm('Delete all history? This cannot be undone.')) {
            saveAllLogs([]);
            setLogs([]);
            window.location.reload();
        }
    };

    return (
        <div className="view active-view">
            <h1>History</h1>
            <h2>Progress & Analytics</h2>

            <div style={{ padding: '0 20px 20px' }}>
                <div style={{ background: '#1c1c1e', borderRadius: '12px', padding: '4px', display: 'flex', width: '100%' }}>
                    <button
                        className="btn"
                        style={{ flex: 1, padding: '10px', fontSize: '0.9rem', marginBottom: 0, background: activeTab === 'history' ? '#3a3a3c' : 'transparent', color: activeTab === 'history' ? '#fff' : '#888' }}
                        onClick={() => setActiveTab('history')}>
                        History
                    </button>
                    <button
                        className="btn"
                        style={{ flex: 1, padding: '10px', fontSize: '0.9rem', marginBottom: 0, background: activeTab === 'analytics' ? '#3a3a3c' : 'transparent', color: activeTab === 'analytics' ? '#fff' : '#888' }}
                        onClick={() => setActiveTab('analytics')}>
                        Stats & Insights
                    </button>
                </div>
            </div>

            {activeTab === 'history' ? (
                <>
                    <div id="history-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '0 20px' }}>
                        {logs.length === 0 && <div className="muted" style={{ textAlign: 'center', padding: '20px' }}>No workouts logged yet.</div>}

                        {logs.map((log, i) => (
                            <LogCard key={log.timestamp || i} log={log} />
                        ))}
                    </div>

                    {logs.length > 0 && (
                        <div style={{ padding: '20px' }}>
                            <button className="btn btn-danger" onClick={handleDelete}>
                                <Trash2 size={16} style={{ display: 'inline', marginRight: '8px' }} />
                                Clear All Logs
                            </button>
                        </div>
                    )}
                </>
            ) : (
                <Analytics />
            )}
        </div>
    );
}

function LogCard({ log }) {
    let borderColor = '#2C2C2E';
    if (log.dist >= 3000) borderColor = 'var(--accent)';
    else if (log.dist >= 2000) borderColor = 'var(--success)';

    const dateStr = formatDate(log.timestamp || log.date);
    const timeStr = formatTimeOfDay(log.timestamp || log.date);

    return (
        <div style={{
            background: 'var(--card-bg)', borderRadius: '12px', padding: '16px',
            borderLeft: `4px solid ${borderColor}`,
            display: 'flex', flexDirection: 'column', gap: '8px'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>{dateStr}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{timeStr}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)' }}>{log.dist}m</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{log.duration} • RPE {log.rpe}</div>
                </div>
            </div>
            {/* Notes are gone in strict mode, but checking anyway */}
            {log.notes && (
                <div style={{ marginTop: '4px', fontSize: '0.85rem', color: '#ccc', background: '#222', padding: '6px', borderRadius: '6px', fontStyle: 'italic' }}>
                    "{log.notes}"
                </div>
            )}
        </div>
    );
}
