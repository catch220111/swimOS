let audioCtx = null;
let synthesis = window.speechSynthesis;

export function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

export function beep(freq = 1200, duration = 0.12, type = 'square', vol = 0.24) {
    if (!audioCtx) initAudio();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

export function speakText(text) {
    if (!synthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.1;
    synthesis.speak(u);
}
