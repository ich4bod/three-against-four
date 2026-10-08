import { THREE_SLOTS, FOUR_SLOTS, DEFAULT_PATTERN, patternSlots, patternEvents, describeSlot, markerPosition } from './model.mjs?v=3';

const svg = 'http://www.w3.org/2000/svg';
const labels = document.querySelector('#rhythm-labels');
const markers = document.querySelector('#rhythm-markers');
const slider = document.querySelector('#rhythm-slot');
const reader = document.querySelector('#rhythm-now');
const previousEventButton = document.querySelector('#rhythm-previous-event');
const nextEventButton = document.querySelector('#rhythm-next-event');
const nextMeetingButton = document.querySelector('#rhythm-next-meeting');
const eventsReader = document.querySelector('#rhythm-events');
const meetingsReader = document.querySelector('#rhythm-meetings');
const rateControl = document.querySelector('#rhythm-rate');
const timeReader = document.querySelector('#rhythm-time');
const soundControl = document.querySelector('#rhythm-sound');
const hearingControl = document.querySelector('#rhythm-hear-track');
let hearingChoice = 'both';
const playButton = document.querySelector('#rhythm-play');
const pauseButton = document.querySelector('#rhythm-pause');
const resumeButton = document.querySelector('#rhythm-resume');
const stopButton = document.querySelector('#rhythm-stop');
const status = document.querySelector('#rhythm-status');
const editor = document.querySelector('#rhythm-editor');
const offsetControl = document.querySelector('#rhythm-offset');
const undoButton = document.querySelector('#rhythm-undo');
const resetButton = document.querySelector('#rhythm-reset-pattern');
const keepButton = document.querySelector('#rhythm-keep');
const returnButton = document.querySelector('#rhythm-return');
const forgetButton = document.querySelector('#rhythm-forget');
const keptEmpty = document.querySelector('#rhythm-kept-empty');
const keptBody = document.querySelector('#rhythm-kept-body');
let keptPattern;
const markerNodes = [];
let pattern = { a: [...DEFAULT_PATTERN.a], b: [...DEFAULT_PATTERN.b], offset: DEFAULT_PATTERN.offset };
const history = [];
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
    const marker = document.createElementNS(svg, 'circle');
    marker.id = `rhythm-${track}-${index}`;
    marker.setAttribute('r', markerRadius);
    marker.setAttribute('class', `marker ${color}`);
    marker.dataset.track = track;
    marker.dataset.index = index;
    marker.dataset.baseSlot = slot;
    markers.append(marker);
    markerNodes.push(marker);
  });
}

function inspect() {
  const slot = Number(slider.value);
  reader.textContent = describeSlot(slot, pattern);
  const { notes, meetings } = walkSlots();
  eventsReader.textContent = `Note slots: ${slotList(notes)}.`;
  meetingsReader.textContent = `Together slots: ${slotList(meetings)}.`;
  previousEventButton.disabled = notes.length === 0;
  nextEventButton.disabled = notes.length === 0;
  nextMeetingButton.disabled = meetings.length === 0;
  for (const marker of markerNodes) {
    marker.dataset.active = String(Number(marker.dataset.slot) === slot);
  }
}

function walkSlots() {
  const events = patternEvents(pattern);
  return {
    notes: events.filter(event => event.three || event.four).map(event => event.slot),
    meetings: events.filter(event => event.three && event.four).map(event => event.slot),
  };
}

function navigateSlot(slots, current, direction) {
  if (!slots.length) return current;
  if (direction === 'previous') {
    return slots.findLast(slot => slot < current) ?? slots[slots.length - 1];
  }
  return slots.find(slot => slot > current) ?? slots[0];
}

function changeInspection(selectedSlot) {
  stopTransport({ message: 'Stopped.' });
  slider.value = String(selectedSlot);
  inspect();
}

function walkInspection(kind, direction) {
  const slots = walkSlots()[kind];
  if (!slots.length) return;
  const current = Number(slider.value);
  const selectedSlot = navigateSlot(slots, current, direction);
  if (selectedSlot !== current) changeInspection(selectedSlot);
}

function renderPattern() {
  const active = patternSlots(pattern);
  document.querySelector('#rhythm-a-slots').textContent = `Three plays slots: ${active.three.length ? active.three.map(slot => slot + 1).join(', ') : 'none'}.`;
  document.querySelector('#rhythm-b-slots').textContent = `Four plays slots: ${active.four.length ? active.four.map(slot => slot + 1).join(', ') : 'none'}.`;
  for (const marker of markerNodes) {
    const track = marker.dataset.track;
    const index = Number(marker.dataset.index);
    const baseSlot = Number(marker.dataset.baseSlot);
    const enabled = pattern[track][index];
    const slot = track === 'a' ? baseSlot : (baseSlot + pattern.offset) % 12;
    const position = markerPosition(track === 'a' ? 96 : 60, slot);
    marker.setAttribute('cx', position.x.toFixed(6));
    marker.setAttribute('cy', position.y.toFixed(6));
    marker.dataset.slot = slot;
    marker.dataset.muted = String(!enabled);
  }
  for (const track of ['a', 'b']) {
    pattern[track].forEach((checked, index) => {
      document.querySelector(`#rhythm-${track}-note-${index}`).checked = checked;
    });
  }
  offsetControl.value = String(pattern.offset);
  undoButton.disabled = history.length === 0;
  renderKeptPattern();
  inspect();
}

function samePattern(left, right) {
  return left.offset === right.offset && left.a.every((value, index) => value === right.a[index]) && left.b.every((value, index) => value === right.b[index]);
}

function clonePattern(value) {
  return { a: [...value.a], b: [...value.b], offset: value.offset };
}

function slotList(slots) {
  return slots.length ? slots.map(slot => slot + 1).join(', ') : 'none';
}

function renderKeptPattern() {
  keptEmpty.hidden = Boolean(keptPattern);
  keptBody.hidden = !keptPattern;
  returnButton.disabled = !keptPattern || samePattern(pattern, keptPattern);
  forgetButton.disabled = !keptPattern;
  if (!keptPattern) return;
  const current = patternSlots(pattern);
  const kept = patternSlots(keptPattern);
  for (const [track, name, label] of [['a', 'three', 'Three'], ['b', 'four', 'Four']]) {
    document.querySelector(`#rhythm-kept-${track}`).textContent = `Kept ${name}: ${slotList(kept[name])}.`;
    const currentOnly = current[name].filter(slot => !kept[name].includes(slot));
    const keptOnly = kept[name].filter(slot => !current[name].includes(slot));
    document.querySelector(`#rhythm-compare-${track}`).textContent = `${label} · current only: ${slotList(currentOnly)} · kept only: ${slotList(keptOnly)}.`;
  }
}

function commitPattern(next, { preserveSlot = false } = {}) {
  if (samePattern(pattern, next)) return;
  history.push({ a: [...pattern.a], b: [...pattern.b], offset: pattern.offset });
  if (history.length > 24) history.shift();
  if (playing || paused) stopTransport({ reset: !preserveSlot, message: 'Stopped.' });
  pattern = next;
  renderPattern();
}

function readControls() {
  commitPattern({
    a: pattern.a.map((_, index) => document.querySelector(`#rhythm-a-note-${index}`).checked),
    b: pattern.b.map((_, index) => document.querySelector(`#rhythm-b-note-${index}`).checked),
    offset: Number(offsetControl.value),
  });
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

function makeBuffer(context, duration, step, hearing) {
  const buffer = context.createBuffer(1, Math.round(duration * context.sampleRate), context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (const [frequency, track, choice] of [[660, 'three', 'a'], [330, 'four', 'b']]) {
    if (hearing !== 'both' && hearing !== choice) continue;
    for (const { slot, three, four } of patternEvents(pattern)) {
      if (track === 'three' ? !three : !four) continue;
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
    if (!audioBuffer) audioBuffer = makeBuffer(audioContext, measureDuration, slotDuration, hearingChoice);
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

editor.addEventListener('change', event => {
  if (event.target.matches('input[type="checkbox"], #rhythm-offset')) readControls();
});
undoButton.addEventListener('click', () => {
  if (!history.length) return;
  if (playing || paused) stopTransport({ message: 'Stopped.' });
  pattern = history.pop();
  renderPattern();
});
resetButton.addEventListener('click', () => commitPattern({ a: [...DEFAULT_PATTERN.a], b: [...DEFAULT_PATTERN.b], offset: DEFAULT_PATTERN.offset }));

keepButton.addEventListener('click', () => {
  keptPattern = clonePattern(pattern);
  renderKeptPattern();
});
returnButton.addEventListener('click', () => {
  if (!keptPattern || samePattern(pattern, keptPattern)) return;
  commitPattern(clonePattern(keptPattern), { preserveSlot: true });
});
forgetButton.addEventListener('click', () => {
  keptPattern = undefined;
  renderKeptPattern();
});

slider.addEventListener('input', () => changeInspection(slider.value));
previousEventButton.addEventListener('click', () => walkInspection('notes', 'previous'));
nextEventButton.addEventListener('click', () => walkInspection('notes', 'next'));
nextMeetingButton.addEventListener('click', () => walkInspection('meetings', 'next'));
rateControl.addEventListener('change', () => {
  stopTransport({ message: 'Stopped.' });
  timeReader.textContent = `One measure lasts ${12 * 60 / Number(rateControl.value)} seconds.`;
});
hearingControl.addEventListener('change', () => {
  hearingChoice = hearingControl.value;
  stopTransport({ message: 'Stopped.' });
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
renderPattern();
setButtons();
