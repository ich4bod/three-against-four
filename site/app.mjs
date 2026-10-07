import { THREE_SLOTS, FOUR_SLOTS, describeSlot, markerPosition } from './model.mjs?v=1';

const svg = 'http://www.w3.org/2000/svg';
const labels = document.querySelector('#rhythm-labels');
const markers = document.querySelector('#rhythm-markers');
const slider = document.querySelector('#rhythm-slot');
const reader = document.querySelector('#rhythm-now');
const markerNodes = [];

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
    const active = Number(marker.dataset.slot) === slot;
    marker.dataset.active = String(active);
  }
}

slider.addEventListener('input', inspect);
inspect();
