export function parseWorkoutCSV(csvText) {
    let newPlan = [];
    let newTotal = 0;
    const lines = csvText.split('\n');

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cols = line.split(',');
        if (cols.length < 5) continue;

        const reps = parseInt(cols[1], 10) || 1;
        const dist = parseInt(cols[2], 10) || 0;
        const mode = (cols[3] || '').trim().toLowerCase();
        const time = parseInt(cols[4], 10) || 0;
        const desc = cols.slice(5).join(',').trim();

        for (let r = 1; r <= reps; r++) {
            newPlan.push({
                section: cols[0],
                dist,
                mode: mode === 'rest' ? 'rest' : 'interval',
                time,
                desc,
                rep: r,
                totalReps: reps
            });
            newTotal += dist;
        }
    }

    if (newPlan.length > 0) {
        return { plan: newPlan, total: newTotal };
    } else {
        return null;
    }
}
