// Sound, synthesized with WebAudio: no audio files, no network. Short envelopes
// over oscillators and filtered noise, with distance attenuation for distant shots.
// The context starts on the first user gesture (the play click).
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return true;
  }

  function env(gain, peak, decay, when = 0) {
    const t = ctx.currentTime + when;
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + decay);
  }

  function burst({ freq = 800, type = 'square', peak = 0.3, decay = 0.08, slide = 0, when = 0 }) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + when);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), ctx.currentTime + when + decay);
    env(gain, peak, decay, when);
    osc.connect(gain).connect(master);
    osc.start(ctx.currentTime + when);
    osc.stop(ctx.currentTime + when + decay + 0.02);
  }

  function noise({ peak = 0.3, decay = 0.12, filter = 1200, q = 0.8, when = 0 }) {
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = filter;
    filt.Q.value = q;
    const gain = ctx.createGain();
    env(gain, peak, decay, when);
    src.connect(filt).connect(gain).connect(master);
    src.start(ctx.currentTime + when);
    src.stop(ctx.currentTime + when + decay + 0.02);
  }

  function attenuated(dist) {
    if (dist === undefined) return 1;
    return Math.max(0.05, 1 - dist / 55);
  }

  return {
    resume: ensure,
    shot(weapon, dist) {
      if (!ensure()) return;
      const vol = attenuated(dist);
      if (weapon === 'marksman') {
        noise({ peak: 0.5 * vol, decay: 0.22, filter: 900 });
        burst({ freq: 140, type: 'sine', peak: 0.4 * vol, decay: 0.18, slide: -80 });
      } else if (weapon === 'rifle') {
        noise({ peak: 0.4 * vol, decay: 0.11, filter: 1800 });
        burst({ freq: 220, type: 'square', peak: 0.18 * vol, decay: 0.07, slide: -140 });
      } else if (weapon === 'smg') {
        noise({ peak: 0.3 * vol, decay: 0.08, filter: 2400 });
      } else {
        noise({ peak: 0.32 * vol, decay: 0.09, filter: 2000 });
        burst({ freq: 300, type: 'square', peak: 0.12 * vol, decay: 0.05, slide: -180 });
      }
    },
    dry() {
      if (!ensure()) return;
      burst({ freq: 2400, type: 'square', peak: 0.12, decay: 0.03 });
    },
    reload() {
      if (!ensure()) return;
      burst({ freq: 900, type: 'square', peak: 0.1, decay: 0.04 });
      burst({ freq: 620, type: 'square', peak: 0.1, decay: 0.04, when: 0.18 });
      burst({ freq: 1200, type: 'square', peak: 0.12, decay: 0.05, when: 0.4 });
    },
    hit(kill, head) {
      if (!ensure()) return;
      burst({ freq: head ? 1600 : 1200, type: 'sine', peak: 0.2, decay: 0.06 });
      if (kill) burst({ freq: 800, type: 'sine', peak: 0.22, decay: 0.12, when: 0.05 });
    },
    hurt() {
      if (!ensure()) return;
      burst({ freq: 180, type: 'sawtooth', peak: 0.2, decay: 0.1, slide: -60 });
    },
    explosion(dist) {
      if (!ensure()) return;
      const vol = attenuated(dist);
      noise({ peak: 0.7 * vol, decay: 0.7, filter: 400 });
      burst({ freq: 90, type: 'sine', peak: 0.6 * vol, decay: 0.6, slide: -40 });
    },
    flashpop(dist) {
      if (!ensure()) return;
      noise({ peak: 0.5 * attenuated(dist), decay: 0.3, filter: 5000, q: 2 });
    },
    beep(final) {
      if (!ensure()) return;
      burst({ freq: final ? 1400 : 980, type: 'sine', peak: 0.18, decay: final ? 0.3 : 0.09 });
    },
    plant() {
      if (!ensure()) return;
      burst({ freq: 660, type: 'sine', peak: 0.2, decay: 0.1 });
      burst({ freq: 880, type: 'sine', peak: 0.2, decay: 0.14, when: 0.12 });
    },
    step(dist) {
      if (!ensure()) return;
      noise({ peak: 0.06 * attenuated(dist), decay: 0.05, filter: 500 });
    },
    click() {
      if (!ensure()) return;
      burst({ freq: 1500, type: 'sine', peak: 0.1, decay: 0.04 });
    },
    win() {
      if (!ensure()) return;
      [523, 659, 784].forEach((f, i) => burst({ freq: f, type: 'sine', peak: 0.2, decay: 0.22, when: i * 0.13 }));
    },
    lose() {
      if (!ensure()) return;
      [392, 330, 262].forEach((f, i) => burst({ freq: f, type: 'sine', peak: 0.18, decay: 0.22, when: i * 0.13 }));
    },
  };
}
