import { RULESET_VERSION } from '../ruleset/version';

// User settings. Local-only (chrome.storage.local), never synced (ADR-006).

export interface Settings {
  /** Master on/off for the extension. */
  enabled: boolean;
  /** When false, the one default outbound call (RDAP) is suppressed and
   *  `domain-age-young` no-ops (handoff §6 / ADR-006). */
  rdapEnabled: boolean;
  /** Anonymized "I flagged this" feedback. OFF by default — opt-in only. */
  feedbackOptIn: boolean;
  /** Version of the bundled ruleset, surfaced read-only in the options page. */
  rulesetVersion: string;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  rdapEnabled: true,
  feedbackOptIn: false,
  rulesetVersion: RULESET_VERSION,
};

const STORAGE_KEY = 'settings';

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[STORAGE_KEY] as Partial<Settings> | undefined) };
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}
