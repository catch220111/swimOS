const KEY_LOGS = 'swimLogs';
const KEY_PLAN = 'currentWorkoutPlan';

export function getLogs() {
    try {
        return JSON.parse(localStorage.getItem(KEY_LOGS) || '[]');
    } catch {
        return [];
    }
}

export function saveLog(logEntry) {
    const history = getLogs();
    history.unshift(logEntry);
    // Sort descending by time
    history.sort((a, b) => {
        const tA = a.timestamp || Date.parse(a.date) || 0;
        const tB = b.timestamp || Date.parse(b.date) || 0;
        return tB - tA;
    });
    localStorage.setItem(KEY_LOGS, JSON.stringify(history));
    return history;
}

export function saveAllLogs(logs) {
    localStorage.setItem(KEY_LOGS, JSON.stringify(logs));
}

export function getSavedWorkout() {
    try {
        const saved = localStorage.getItem(KEY_PLAN);
        return saved ? JSON.parse(saved) : null;
    } catch {
        return null;
    }
}

export function saveWorkout(plan) {
    localStorage.setItem(KEY_PLAN, JSON.stringify(plan));
}

export function clearSavedWorkout() {
    localStorage.removeItem(KEY_PLAN);
}
