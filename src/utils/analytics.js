export function analyzeWorkout(plan, upToStepIndex = plan.length) {
    const stats = {
        strokes: { free: 0, back: 0, breast: 0, fly: 0, im: 0, mix: 0 },
        types: { swim: 0, kick: 0, pull: 0, drill: 0 }
    };

    for (let i = 0; i < upToStepIndex; i++) {
        const step = plan[i];
        if (!step || !step.dist) continue;

        const desc = (step.desc || '').toLowerCase();
        const dist = step.dist;

        // Detect Type
        if (desc.includes('kick')) stats.types.kick += dist;
        else if (desc.includes('pull')) stats.types.pull += dist;
        else if (desc.includes('drill')) stats.types.drill += dist;
        else stats.types.swim += dist;

        // Detect Stroke
        let s = 'mix';
        if (desc.includes('free') || desc.includes('fr')) s = 'free';
        else if (desc.includes('back') || desc.includes('bk')) s = 'back';
        else if (desc.includes('breast') || desc.includes('br')) s = 'breast';
        else if (desc.includes('fly') || desc.includes('fl')) s = 'fly';
        else if (desc.includes('im')) s = 'im';

        stats.strokes[s] += dist;
    }
    return stats;
}
