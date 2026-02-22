export const ROOM_ID = 'main'

export const DISPLAY_NAME_STORAGE_KEY = 'noobz-voice-displayName'
export const DISPLAY_NAME_MIN_LENGTH = 5
export const DISPLAY_NAME_MAX_LENGTH = 15

/** Letters (including Turkish ğ, ü, ş, ı, ö, ç etc.), numbers, space, and '-'; max 15 chars. */
export function normalizeDisplayName(value: string): string {
  return value
    .replace(/[^\p{L}\p{N} -]/gu, '')
    .trim()
    .slice(0, DISPLAY_NAME_MAX_LENGTH)
}
