import { THREE_SLOTS, FOUR_SLOTS, describeSlot, markerPosition } from './model.mjs?v=2';

const svg = 'http://www.w3.org/2000/svg';
const labels = document.querySelector('#rhythm-labels');
const markers = document.querySelector('#rhythm-markers');
const slider = document.querySelector('#rhythm-slot');
const reader = document.querySelector('#rhythm-now');
const rateControl = document.querySelector('#rhythm-rate');
const timeReader = document.querySelector('#rhythm-time');
const soundControl = document.querySelector('#rhythm-sound');
const playButton = document.querySelector('#rhythm-play');
const pauseButton = document.querySelector('#rhythm-pause');
const resumeButton = document.querySelector('#rhythm-resume');
const stopButton = document.querySelector('#rhythm-stop');
const status = document.querySelector('#rhythm-status');
const markerNodes = [];
let audioContext;
let audioBuffer;
let source;
let frame = 0;
let playing = false;
let paused = false;
let startedAt = 0;
let elapsedBeforePause = 0;
let measureDuration = 0;
let slotDuration = 0;
let requestToken = 0;

for (let slot = 0; slot < 12; slot += 1) {
  const angle = 2 * Math.PI * slot / 12 - Math.PI / 2;
  const label = document.createElementNS(svg, 'text');
  label.setAttribute('x', (140 + 122 * Math.cos(angle)).toFixed(6));
  label.setAttribute('y', (140 + 122 * Math.sin(angle)).toFixed(6));
  label.setAttribute('class', 'slot-label');
  label.textContent = String(slot + 1);
  labels.append(label);
}

for (const [track, slots, radius, markerRadius, color] of [
  ['a', THREE_SLOTS, 96, 8, 'three'],
  ['b', FOUR_SLOTS, 60, 7, 'four'],
]) {
  slots.forEach((slot, index) => {
    const { x, y } = markerPosition(radius, slot);
    const marker = document.createElementNS(svg, 'circle');
    marker.id = `rhythm-${track}-${index}`;
    marker.setAttribute('cx', x.toFixed(6));
    marker.setAttribute('cy', y.toFixed(6));
    marker.setAttribute('r', markerRadius);
    marker.setAttribute('class', `marker ${color}`);
    marker.setAttribute('data-slot', slot);
    markers.append(marker);
    markerNodes.push(marker);
  });
}

function inspect() {
  const slot = Number(slider.value);
  reader.textContent = describeSlot(slot);
  for (const marker of markerNodes) {
    marker.dataset.active = String(Number(marker.dataset.slot) === slot);
  }
}

function setButtons() {
  playButton.disabled = playing;
  pauseButton.disabled = !playing;
  resumeButton.disabled = !paused;
  stopButton.disabled = !playing && !paused;
}

function releaseSource() {
  if (!source) return;
  const oldSource = source;
  source = undefined;
  oldSource.onended = null;
  try { oldSource.stop(); } catch {}
  try { oldSource.disconnect(); } catch {}
}

function cancelClock() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
}

function stopTransport({ reset = true, message = 'Stopped.' } = {}) {
  requestToken += 1;
  cancelClock();
  releaseSource();
  playing = false;
  paused = false;
  elapsedBeforePause = 0;
  if (reset) slider.value = '0';
  inspect();
  status.textContent = message;
  setButtons();
}

function elapsedNow() {
  return elapsedBeforePause + (playing ? (performance.now() - startedAt) / 1000 : 0);
}

function paintClock() {
  if (!playing) return;
  const elapsed = elapsedNow();
  if (elapsed >= measureDuration) {
    cancelClock();
    releaseSource();
    playing = false;
    paused = false;
    elapsedBeforePause = measureDuration;
    slider.value = '11';
    inspect();
    status.textContent = 'Measure finished.';
    setButtons();
    return;
  }
  slider.value = String(Math.min(11, Math.floor(elapsed / slotDuration)));
  inspect();
  frame = requestAnimationFrame(paintClock);
}

function makeBuffer(context, duration, step) {
  const buffer = context.createBuffer(1, Math.round(duration * context.sampleRate), context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (const [frequency, slots] of [[660, THREE_SLOTS], [330, FOUR_SLOTS]]) {
    for (const slot of slots) {
      const start = slot * step;
      const first = Math.max(0, Math.ceil(start * context.sampleRate));
      const last = Math.min(samples.length, Math.ceil((start + 0.035) * context.sampleRate));
      for (let index = first; index < last; index += 1) {
        const time = index / context.sampleRate;
        const u = time - start;
        if (u >= 0 && u < 0.035) {
          samples[index] += 0.07 * Math.max(0, Math.min(1, u / 0.003, (0.035 - u) / 0.01)) * Math.sin(2 * Math.PI * frequency * u);
        }
      }
    }
  }
  return buffer;
}

async function startAudio(elapsed, token) {
  if (!soundControl.checked) return;
  try {
    if (!audioContext) audioContext = new AudioContext();
    if (token !== requestToken) return;
    if (audioContext.state === 'suspended') await audioContext.resume();
    if (token !== requestToken) return;
    if (!audioBuffer) audioBuffer = makeBuffer(audioContext, measureDuration, slotDuration);
    const nextSource = audioContext.createBufferSource();
    source = nextSource;
    nextSource.buffer = audioBuffer;
    nextSource.loop = false;
    nextSource.connect(audioContext.destination);
    nextSource.onended = () => {
      if (source === nextSource) {
        try { nextSource.disconnect(); } catch {}
        source = undefined;
      }
    };
    nextSource.start(0, elapsed);
  } catch {
    if (token === requestToken) stopTransport({ message: 'Sound is unavailable in this browser.' });
  }
}

async function play() {
  stopTransport({ message: 'Ready.' });
  const rate = Number(rateControl.value);
  slotDuration = 60 / rate;
  measureDuration = 12 * slotDuration;
  audioBuffer = undefined;
  elapsedBeforePause = 0;
  playing = true;
  startedAt = performance.now();
  status.textContent = 'Playing one measure.';
  setButtons();
  const token = ++requestToken;
  frame = requestAnimationFrame(paintClock);
  await startAudio(0, token);
}

async function resume() {
  if (!paused) return;
  paused = false;
  playing = true;
  startedAt = performance.now();
  status.textContent = 'Playing one measure.';
  setButtons();
  const token = ++requestToken;
  frame = requestAnimationFrame(paintClock);
  await startAudio(elapsedBeforePause, token);
}

slider.addEventListener('input', () => {
  const selectedSlot = slider.value;
  stopTransport({ message: 'Stopped.' });
  slider.value = selectedSlot;
  inspect();
});
rateControl.addEventListener('change', () => {
  stopTransport({ message: 'Stopped.' });
  timeReader.textContent = `One measure lasts ${12 * 60 / Number(rateControl.value)} seconds.`;
});
soundControl.addEventListener('change', () => stopTransport({ message: 'Stopped.' }));
playButton.addEventListener('click', play);
pauseButton.addEventListener('click', () => {
  if (!playing) return;
  elapsedBeforePause = Math.min(measureDuration, elapsedNow());
  cancelClock();
  releaseSource();
  playing = false;
  paused = true;
  slider.value = String(Math.min(11, Math.floor(elapsedBeforePause / slotDuration)));
  inspect();
  status.textContent = 'Paused.';
  setButtons();
});
resumeButton.addEventListener('click', resume);
stopButton.addEventListener('click', () => stopTransport());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && playing) pauseButton.click();
});
inspect();
setButtons();
