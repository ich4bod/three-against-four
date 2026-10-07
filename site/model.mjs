export const THREE_SLOTS = Object.freeze([0, 4, 8]);
export const FOUR_SLOTS = Object.freeze([0, 3, 6, 9]);

export function slotMembership(slot) {
  const three = THREE_SLOTS.includes(slot);
  const four = FOUR_SLOTS.includes(slot);
  return { three, four };
}

export function describeSlot(slot) {
  const { three, four } = slotMembership(slot);
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
