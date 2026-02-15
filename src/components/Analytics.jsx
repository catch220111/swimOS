import React, { useMemo } from 'react';
import { getLogs } from '../utils/storage';

export default function Analytics() {
    const logs = getLogs();

    // Calculate stats
    const stats = useMemo(() => {
        let totalDist = 0;
        let totalDuration = 0;
        const strokeCounts = { free: 0, back: 0, breast: 0, fly: 0, im: 0, mix: 0 };

        logs.forEach(log => {
            totalDist += (log.dist || 0);
            if (log.breakdown && log.breakdown.strokes) {
                Object.keys(log.breakdown.strokes).forEach(s => {
                    strokeCounts[s] = (strokeCounts[s] || 0) + log.breakdown.strokes[s];
                });
            }
        });

        return { totalDist, strokeCounts };
    }, [logs]);

    return (
        <div style={{ padding: '0 20px 20px' }}>
            {/* Consistency Heatmap Placeholder */}
            <div className="card">
                <h3>Consistency</h3>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'center' }}>
                    {Array.from({ length: 30 }).map((_, i) => (
                        <div key={i} style={{ width: '12px', height: '12px', background: Math.random() > 0.7 ? 'var(--success)' : '#333', borderRadius: '2px' }} />
                    ))}
                </div>
                <div className="muted" style={{ fontSize: '0.75rem', marginTop: '8px', textAlign: 'right' }}>Last 30 Days</div>
            </div>

            {/* Volume Stats */}
            <div className="card">
                <h3>Total Volume</h3>
                <div style={{ fontSize: '2rem', fontWeight: 800 }}>{stats.totalDist}m</div>
                <div className="muted">All Time</div>
            </div>

            {/* Stroke Mix */}
            <div className="card">
                <h3>Stroke Mix</h3>
                {Object.entries(stats.strokeCounts).map(([stroke, dist]) => {
                    if (dist === 0) return null;
                    const pct = Math.round((dist / stats.totalDist) * 100);
                    return (
                        <div key={stroke} style={{ marginBottom: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
                                <span style={{ textTransform: 'capitalize' }}>{stroke}</span>
                                <span>{dist}m ({pct}%)</span>
                            </div>
                            <div style={{ width: '100%', height: '6px', background: '#333', borderRadius: '3px' }}>
                                <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: '3px' }} />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
