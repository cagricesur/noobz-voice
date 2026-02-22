export const ROOM_ID = 'main'

export const DISPLAY_NAME_STORAGE_KEY = 'noobz-voice-displayName'
export const DISPLAY_NAME_MAX_LENGTH = 15

/** Only letters, numbers, and '-'; max 15 chars. Returns empty string if nothing valid. */
export function normalizeDisplayName(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9-]/g, '')
    .trim()
    .slice(0, DISPLAY_NAME_MAX_LENGTH)
}
