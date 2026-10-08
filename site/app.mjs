import { THREE_SLOTS, FOUR_SLOTS, DEFAULT_PATTERN, patternSlots, patternEvents, describeSlot, markerPosition } from './model.mjs?v=3';

const svg = 'http://www.w3.org/2000/svg';
const labels = document.querySelector('#rhythm-labels');
const markers = document.querySelector('#rhythm-markers');
const flat = document.querySelector('#rhythm-flat');
const flatCursor = document.querySelector('#rhythm-flat-cursor');
const slider = document.querySelector('#rhythm-slot');
const reader = document.querySelector('#rhythm-now');
const nextReader = document.querySelector('#rhythm-next-a');
const nextFourReader = document.querySelector('#rhythm-next-b');
const gapsReader = document.querySelector('#rhythm-gaps-a');
const gapsFourReader = document.querySelector('#rhythm-gaps-b');
const previousEventButton = document.querySelector('#rhythm-previous-event');
const nextEventButton = document.querySelector('#rhythm-next-event');
const nextMeetingButton = document.querySelector('#rhythm-next-meeting');
const eventsReader = document.querySelector('#rhythm-events');
const meetingsReader = document.querySelector('#rhythm-meetings');
const rateControl = document.querySelector('#rhythm-rate');
const timeReader = document.querySelector('#rhythm-time');
const soundControl = document.querySelector('#rhythm-sound');
const measuresControl = document.querySelector('#rhythm-measures');
const progressReader = document.querySelector('#rhythm-measure-progress');
const hearingControl = document.querySelector('#rhythm-hear-track');
const voicesControl = document.querySelector('#rhythm-voices');
let hearingChoice = 'both';
let voicesChoice = 'usual';
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
const compareButton = document.querySelector('#rhythm-compare-play');
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
let totalDuration = 0;
let measureCount = 1;
let slotDuration = 0;
let requestToken = 0;
let comparing = false;
let compareTimer = 0;

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
    const flatNote = document.createElementNS(svg, 'rect');
    flatNote.id = `rhythm-flat-${track}-${index}`;
    flatNote.setAttribute('y', track === 'a' ? 20 : 60);
    flatNote.setAttribute('width', 20);
    flatNote.setAttribute('height', 20);
    flatNote.setAttribute('class', `flat-note ${color}`);
    flat.insertBefore(flatNote, flatCursor);
    markerNodes.push({ marker, flatNote });
  });
}

function cyclicGaps(slots) {
  return slots.map((slot, index) => (slots[(index + 1) % slots.length] - slot + 12) % 12 || 12);
}

function nextDistance(slots, slot) {
  return slots.length ? Math.min(...slots.map(note => (note - slot + 12) % 12)) : null;
}

function updateGapReaders(slot) {
  const { three, four } = patternSlots(pattern);
  for (const [label, slots, nextTarget, gapsTarget] of [
    ['Three', three, nextReader, gapsReader],
    ['Four', four, nextFourReader, gapsFourReader],
  ]) {
    const distance = nextDistance(slots, slot);
    nextTarget.textContent = distance === null
      ? `${label}: no notes in this measure.`
      : distance === 0
        ? `${label}: a note here.`
        : `${label}: next note in ${distance} slots.`;
    gapsTarget.textContent = slots.length
      ? `${label} gaps: ${cyclicGaps(slots).join(', ')} slots.`
      : `${label} gaps: no notes.`;
  }
}

function inspect() {
  const slot = Number(slider.value);
  reader.textContent = describeSlot(slot, pattern);
  updateGapReaders(slot);
  const { notes, meetings } = walkSlots();
  eventsReader.textContent = `Note slots: ${slotList(notes)}.`;
  meetingsReader.textContent = `Together slots: ${slotList(meetings)}.`;
  previousEventButton.disabled = notes.length === 0;
  nextEventButton.disabled = notes.length === 0;
  nextMeetingButton.disabled = meetings.length === 0;
  for (const { marker } of markerNodes) {
    marker.dataset.active = String(Number(marker.dataset.slot) === slot);
  }
  flatCursor.setAttribute('x1', 22 + 31 * slot);
  flatCursor.setAttribute('x2', 22 + 31 * slot);
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
  for (const { marker, flatNote } of markerNodes) {
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
    flatNote.setAttribute('x', 12 + 31 * slot);
    flatNote.dataset.enabled = String(enabled);
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
  compareButton.disabled = !keptPattern || playing || paused || comparing;
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
  if (comparing) stopTransport({ reset: !preserveSlot, message: 'Stopped.' });
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
  playButton.disabled = playing || comparing;
  pauseButton.disabled = !playing || comparing;
  resumeButton.disabled = !paused || comparing;
  stopButton.disabled = !playing && !paused && !comparing;
  compareButton.disabled = !keptPattern || playing || paused || comparing;
  for (const control of [slider, previousEventButton, nextEventButton, nextMeetingButton, rateControl, measuresControl, soundControl, hearingControl, editor, undoButton, resetButton, keepButton, returnButton, forgetButton]) {
    control.disabled = comparing;
  }
  if (editor) {
    for (const control of editor.querySelectorAll('input, select, button')) control.disabled = comparing;
  }
  undoButton.disabled = comparing || history.length === 0;
  returnButton.disabled = comparing || !keptPattern || samePattern(pattern, keptPattern);
  forgetButton.disabled = comparing || !keptPattern;
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
  if (compareTimer) clearTimeout(compareTimer);
  compareTimer = 0;
  comparing = false;
  cancelClock();
  releaseSource();
  playing = false;
  paused = false;
  elapsedBeforePause = 0;
  if (reset) slider.value = '0';
  progressReader.textContent = `Measure 1 of ${measuresControl.value}.`;
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
  if (elapsed >= totalDuration) {
    cancelClock();
    releaseSource();
    playing = false;
    paused = false;
    elapsedBeforePause = totalDuration;
    slider.value = '11';
    progressReader.textContent = `Measure ${measureCount} of ${measureCount}.`;
    inspect();
    status.textContent = measureCount === 1 ? 'Measure finished.' : 'Measures finished.';
    setButtons();
    return;
  }
  slider.value = String(Math.floor(elapsed / slotDuration) % 12);
  const currentMeasure = Math.min(measureCount, Math.floor(elapsed / measureDuration) + 1);
  progressReader.textContent = `Measure ${currentMeasure} of ${measureCount}.`;
  inspect();
  frame = requestAnimationFrame(paintClock);
}

function makeBuffer(context, duration, step, hearing, voices, layers = [{ pattern, offset: 0 }]) {
  const buffer = context.createBuffer(1, Math.round(duration * context.sampleRate), context.sampleRate);
  const samples = buffer.getChannelData(0);
  const frequencies = voices === 'swapped' ? { a: 330, b: 660 } : { a: 660, b: 330 };
  for (const [track, choice] of [['three', 'a'], ['four', 'b']]) {
    const frequency = frequencies[choice];
    if (hearing !== 'both' && hearing !== choice) continue;
    for (const layer of layers) {
      for (const { slot, three, four } of patternEvents(layer.pattern)) {
        if (track === 'three' ? !three : !four) continue;
        const start = layer.offset + slot * step;
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
  }
  return buffer;
}

async function startAudio(elapsed, token, voiceSnapshot) {
  if (!soundControl.checked) return;
  try {
    if (!audioContext) audioContext = new AudioContext();
    if (token !== requestToken) return;
    if (audioContext.state === 'suspended') await audioContext.resume();
    if (token !== requestToken) return;
    if (!audioBuffer) {
      const layers = Array.from({ length: measureCount }, (_, index) => ({ pattern, offset: index * measureDuration }));
      audioBuffer = makeBuffer(audioContext, totalDuration, slotDuration, hearingChoice, voiceSnapshot, layers);
    }
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

function endComparison(message) {
  if (!comparing) return;
  if (compareTimer) clearTimeout(compareTimer);
  compareTimer = 0;
  requestToken += 1;
  releaseSource();
  comparing = false;
  status.textContent = message;
  setButtons();
  renderKeptPattern();
}

async function playComparison() {
  if (!keptPattern || comparing || playing || paused) return;
  stopTransport({ message: 'Ready.' });
  const rate = Number(rateControl.value);
  const step = 60 / rate;
  const duration = 12 * step;
  const gap = 0.2;
  const kept = clonePattern(keptPattern);
  const current = clonePattern(pattern);
  const hearing = hearingChoice;
  const voiceSnapshot = voicesChoice;
  const withSound = soundControl.checked;
  const token = ++requestToken;
  comparing = true;
  status.textContent = 'Kept measure.';
  renderKeptPattern();
  setButtons();
  const nextPhase = phase => {
    if (!comparing || token !== requestToken) return;
    if (phase === 0) {
      status.textContent = 'A short silence.';
      compareTimer = setTimeout(() => nextPhase(1), gap * 1000);
    } else if (phase === 1) {
      status.textContent = 'Current measure.';
      compareTimer = setTimeout(() => endComparison('Comparison finished.'), duration * 1000);
    }
  };
  compareTimer = setTimeout(() => nextPhase(0), duration * 1000);
  if (!withSound) return;
  try {
    if (!audioContext) audioContext = new AudioContext();
    if (token !== requestToken) return;
    if (audioContext.state === 'suspended') await audioContext.resume();
    if (token !== requestToken || !comparing) return;
    const buffer = makeBuffer(audioContext, 2 * duration + gap, step, hearing, voiceSnapshot, [
      { pattern: kept, offset: 0 },
      { pattern: current, offset: duration + gap },
    ]);
    const nextSource = audioContext.createBufferSource();
    source = nextSource;
    nextSource.buffer = buffer;
    nextSource.loop = false;
    nextSource.connect(audioContext.destination);
    nextSource.onended = () => {
      if (source === nextSource) {
        try { nextSource.disconnect(); } catch {}
        source = undefined;
      }
    };
    nextSource.start(0);
  } catch {
    if (token === requestToken) endComparison('Sound is unavailable in this browser.');
  }
}

async function play() {
  stopTransport({ message: 'Ready.' });
  const rate = Number(rateControl.value);
  measureCount = Number(measuresControl.value);
  slotDuration = 60 / rate;
  measureDuration = 12 * slotDuration;
  totalDuration = measureCount * measureDuration;
  playButton.textContent = `Play ${measuresControl.selectedOptions[0].text.toLowerCase()} measure${measureCount === 1 ? '' : 's'}`;
  audioBuffer = undefined;
  elapsedBeforePause = 0;
  const voiceSnapshot = voicesChoice;
  playing = true;
  startedAt = performance.now();
  status.textContent = 'Playing one measure.';
  progressReader.textContent = `Measure 1 of ${measureCount}.`;
  setButtons();
  const token = ++requestToken;
  frame = requestAnimationFrame(paintClock);
  await startAudio(0, token, voiceSnapshot);
}

async function resume() {
  if (!paused) return;
  paused = false;
  playing = true;
  startedAt = performance.now();
  status.textContent = 'Playing one measure.';
  progressReader.textContent = `Measure ${Math.min(measureCount, Math.floor(elapsedBeforePause / measureDuration) + 1)} of ${measureCount}.`;
  setButtons();
  const token = ++requestToken;
  const voiceSnapshot = voicesChoice;
  frame = requestAnimationFrame(paintClock);
  await startAudio(elapsedBeforePause, token, voiceSnapshot);
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
  if (comparing) stopTransport({ message: 'Stopped.' });
  keptPattern = clonePattern(pattern);
  renderKeptPattern();
});
returnButton.addEventListener('click', () => {
  if (!keptPattern || samePattern(pattern, keptPattern)) return;
  commitPattern(clonePattern(keptPattern), { preserveSlot: true });
});
forgetButton.addEventListener('click', () => {
  if (comparing) stopTransport({ message: 'Stopped.' });
  keptPattern = undefined;
  renderKeptPattern();
});

slider.addEventListener('input', () => changeInspection(slider.value));
previousEventButton.addEventListener('click', () => walkInspection('notes', 'previous'));
nextEventButton.addEventListener('click', () => walkInspection('notes', 'next'));
nextMeetingButton.addEventListener('click', () => walkInspection('meetings', 'next'));
measuresControl.addEventListener('change', () => {
  stopTransport({ message: 'Stopped.' });
  playButton.textContent = `Play ${measuresControl.selectedOptions[0].text.toLowerCase()} measure${Number(measuresControl.value) === 1 ? '' : 's'}`;
});
rateControl.addEventListener('change', () => {
  stopTransport({ message: 'Stopped.' });
  timeReader.textContent = `One measure lasts ${12 * 60 / Number(rateControl.value)} seconds.`;
});
hearingControl.addEventListener('change', () => {
  hearingChoice = hearingControl.value;
  stopTransport({ message: 'Stopped.' });
});
voicesControl.addEventListener('change', () => {
  voicesChoice = voicesControl.value;
  stopTransport({ message: 'Stopped.' });
});
soundControl.addEventListener('change', () => stopTransport({ message: 'Stopped.' }));
playButton.addEventListener('click', play);
pauseButton.addEventListener('click', () => {
  if (!playing) return;
  requestToken += 1;
  elapsedBeforePause = Math.min(totalDuration, elapsedNow());
  const currentMeasure = Math.min(measureCount, Math.floor(elapsedBeforePause / measureDuration) + 1);
  progressReader.textContent = `Measure ${currentMeasure} of ${measureCount}.`;
  cancelClock();
  releaseSource();
  playing = false;
  paused = true;
  slider.value = String(elapsedBeforePause >= totalDuration ? 11 : Math.floor(elapsedBeforePause / slotDuration) % 12);
  inspect();
  status.textContent = 'Paused.';
  setButtons();
});
resumeButton.addEventListener('click', resume);
stopButton.addEventListener('click', () => stopTransport());
compareButton.addEventListener('click', playComparison);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && comparing) stopTransport({ message: 'Stopped.' });
  else if (document.hidden && playing) pauseButton.click();
});
renderPattern();
setButtons();
