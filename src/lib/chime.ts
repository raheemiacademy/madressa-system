// A short two-note chime made in the browser (no sound file). Browsers only play sound once the person has
// interacted with the page, which is always true by the time a new message arrives on a page they're using.
const KEY = 'ra_sound';
export const soundOn = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } };
export const setSound = (on: boolean) => { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode: stays on for this visit */ } };

let ctx: AudioContext | null = null;
export function chime() {
  if (!soundOn()) return;
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
    const now = ctx.currentTime;
    for (const [freq, at] of [[880, 0], [1320, 0.12]] as const) {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.18, now + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + at); osc.stop(now + at + 0.4);
    }
  } catch { /* no audio on this device */ }
}
