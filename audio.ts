// Simple sci-fi sound synthesizer using Web Audio API
// No external assets needed

let audioCtx: AudioContext | null = null;

const initAudio = () => {
  if (!audioCtx && typeof window !== "undefined") {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  return audioCtx;
};

const createOscillator = (
  freq: number,
  type: OscillatorType,
  duration: number,
  vol: number = 0.1
) => {
  const ctx = initAudio();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);

  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start();
  osc.stop(ctx.currentTime + duration);
};

// ✅ New: UI "select" = quick rising arpeggio, clean & futuristic
export const playSelectSound = () => {
  // 3 short notes: A5 -> C#6 -> E6 (triangle, soft)
  createOscillator(880, "triangle", 0.06, 0.035);
  setTimeout(() => createOscillator(1109, "triangle", 0.06, 0.03), 55);
  setTimeout(() => createOscillator(1318, "triangle", 0.07, 0.028), 110);
};

// ✅ New: Hover = subtle high blip, less bassy, non-annoying
export const playHoverSound = () => {
  // gentle high blip
  createOscillator(1200, "sine", 0.07, 0.015);
};

// ✅ New: Engage = deeper, longer power-up sweep
export const playEngageSound = () => {
  // Power up sound: low → high sweep
  const ctx = initAudio();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sawtooth";
  // start lower, end higher, slightly longer ramp
  osc.frequency.setValueAtTime(220, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + 0.35);

  gain.gain.setValueAtTime(0.06, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start();
  osc.stop(ctx.currentTime + 0.45);
};

// ✅ New: Error = quick descending glitchy double-beep
export const playErrorSound = () => {
  // first beep: higher, then lower = "uh-oh" feel
  createOscillator(700, "square", 0.12, 0.04);
  setTimeout(() => createOscillator(420, "square", 0.14, 0.045), 90);
};
