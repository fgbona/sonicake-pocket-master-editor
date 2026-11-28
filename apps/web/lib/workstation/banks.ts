/**
 * Banks of three: a name ending in -CLEAN, -RHY or -LEAD has that role, and the save dialogs
 * rename a preset to another role of the same bank ("MTL-RHY" → "MTL-LEAD").
 */
export const ROLES = ['clean', 'rhy', 'lead'] as const;
export type PresetRole = (typeof ROLES)[number];

const SUFFIX = /[\s_-]+(CLEAN|RHY|LEAD)$/i;

/**
 * The role a slot has by its place in its bank, a visual hint only (presets are never renamed for
 * it): the first three of a bank are CLEAN, RHY and LEAD; a fourth (the Matribox's D) is free.
 */
export function slotRole(index: number, bankSize: number): PresetRole | 'free' {
  const at = index % bankSize;
  return at < ROLES.length ? (ROLES[at] as PresetRole) : 'free';
}

/** The role a preset name ends with, or null. */
export function presetRole(name: string): PresetRole | null {
  const m = SUFFIX.exec(name.trim());
  return m ? ((m[1] as string).toLowerCase() as PresetRole) : null;
}

/** The name without its role suffix ("MTL-RHY" → "MTL"). */
export const bankPrefix = (name: string) => name.trim().replace(SUFFIX, '').trim();

/** The name with `role` as its suffix, the prefix cut so the whole fits `max` characters. */
export function withRole(name: string, role: PresetRole, max: number): string {
  const suffix = role.toUpperCase();
  const prefix = bankPrefix(name).slice(0, Math.max(0, max - suffix.length - 1));
  return prefix ? `${prefix}-${suffix}` : suffix.slice(0, max);
}

/** The prefix every role-named preset of a bank shares ("MTL"), or null when they differ or none has a role. */
export function sharedPrefix(names: readonly string[]): string | null {
  const prefixes = new Set(names.filter((n) => presetRole(n) !== null).map(bankPrefix));
  return prefixes.size === 1 ? ([...prefixes][0] as string) || null : null;
}
