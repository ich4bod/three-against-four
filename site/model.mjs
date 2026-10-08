export const THREE_SLOTS = Object.freeze([0, 4, 8]);
export const FOUR_SLOTS = Object.freeze([0, 3, 6, 9]);

export const DEFAULT_PATTERN = Object.freeze({
  a: Object.freeze([true, true, true]),
  b: Object.freeze([true, true, true, true]),
  offset: 0,
});

export function patternSlots(pattern) {
  const three = THREE_SLOTS.filter((slot, index) => pattern.a[index]);
  const four = FOUR_SLOTS
    .filter((slot, index) => pattern.b[index])
    .map(slot => (slot + pattern.offset) % 12)
    .sort((left, right) => left - right);
  return { three, four };
}

export function patternEvents(pattern) {
  const { three, four } = patternSlots(pattern);
  return Array.from({ length: 12 }, (_, slot) => ({
    slot,
    three: three.includes(slot),
    four: four.includes(slot),
  }));
}

export function slotMembership(slot, pattern = DEFAULT_PATTERN) {
  const event = patternEvents(pattern)[slot];
  return { three: event.three, four: event.four };
}

export function describeSlot(slot, pattern = DEFAULT_PATTERN) {
  const { three, four } = slotMembership(slot, pattern);
  const who = three && four ? 'both' : three ? 'three' : four ? 'four' : 'neither';
  return `Slot ${slot + 1}: ${who}.`;
}

export function markerPosition(radius, slot) {
  const angle = 2 * Math.PI * slot / 12 - Math.PI / 2;
  return {
    x: 140 + radius * Math.cos(angle),
    y: 140 + radius * Math.sin(angle),
  };
}
