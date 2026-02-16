export function parseWorkoutCSV(csvText) {
    const lines = csvText.split('\n');
    const newPlan = [];
    let newTotal = 0;

    // Start from index 1 to skip primary header (if present), but we'll also scan for others.
    // Actually, let's be safer: if line 0 is header, skip it. 
    // If not (no header file?), maybe we shouldn't skip? 
    // Standard CSV usually has header. We'll stick to i=1 for now but handle interruptions.

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();

        // 1. Row Skipping: Skip empty lines
        if (!line) continue;

        // 2. Header Detection: Skip repeated headers or metadata lines
        if (line.toLowerCase().includes('section,reps,dist,mode')) continue;

        const cols = line.split(',');

        // Basic validation: must have at least enough columns for Section/Reps/Dist/Mode
        // We'll be lenient but safeguard against total garbage
        if (cols.length < 4) continue;

        const section = cols[0].trim();
        const reps = parseInt(cols[1], 10) || 1;
        const dist = parseInt(cols[2], 10) || 0;
        let mode = (cols[3] || '').trim().toLowerCase();

        // 3. Error Handling for Time
        let timeVal = cols[4] ? cols[4].trim() : '';
        let time = parseInt(timeVal, 10);

        // "If a row is missing the Seconds value, default to '0' and set Mode to 'Rest'"
        if (isNaN(time) || timeVal === '') {
            time = 0;
            // Only force rest if it was truly invalid/missing, to prevent crashing "Interval" logic
            if (mode !== 'rest') {
                console.warn(`Row ${i + 1}: Missing time for ${mode}. Defaulting to Rest/0s.`);
                mode = 'rest';
            }
        }

        const desc = cols.slice(5).join(',').trim();

        // Expand Reps
        for (let r = 1; r <= reps; r++) {
            newPlan.push({
                section,
                dist,
                mode: mode === 'rest' ? 'rest' : 'interval', // Normalize
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
