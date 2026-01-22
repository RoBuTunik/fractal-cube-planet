const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const sounds = {};

export async function loadSound(name, url) {
    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        sounds[name] = await audioCtx.decodeAudioData(arrayBuffer);
    } catch (e) {
        console.warn(`Failed to load sound: ${name}`, e);
    }
}

export function playSound(name) {
    if (!sounds[name]) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const source = audioCtx.createBufferSource();
    source.buffer = sounds[name];
    source.connect(audioCtx.destination);
    source.start(0);
}

// Pre-load common sounds
loadSound('split', 'split.mp3');
loadSound('enter', 'enter.mp3');