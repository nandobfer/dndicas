/**
 * Hexadecimal color codes for damage types based on Baldur's Gate 3.
 */
export const damageTypeHex = {
  acid: "#80b000",
  cold: "#3399cc",
  fire: "#ee5500",
  force: "#cc3333",
  healing: "#30bbbb",
  lightning: "#3366cc",
  necrotic: "#40b050",
  poison: "#44bb00",
  radiant: "#ccaa00",
  thunder: "#8844bb",
  psychic: "#cc77aa",
  physical: "#8c8c8c",
} as const;

export type DamageTypeKey = keyof typeof damageTypeHex;
