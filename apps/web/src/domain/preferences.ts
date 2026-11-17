export const PREFERENCES_KEY = 'jhaven.ui-preferences.v1';
export interface Preferences {
  version: 1;
  reduceMotion: boolean;
  palette: 'night' | 'moonlight';
  showLandscape: boolean;
}
export const DEFAULT_PREFERENCES: Preferences = {
  version: 1,
  reduceMotion: false,
  palette: 'night',
  showLandscape: true,
};
export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function parsePreferences(raw: string | null): Preferences {
  if (raw === null) return { ...DEFAULT_PREFERENCES };
  const value: unknown = JSON.parse(raw);
  if (
    typeof value !== 'object' ||
    value === null ||
    !('version' in value) ||
    value.version !== 1 ||
    !('reduceMotion' in value) ||
    typeof value.reduceMotion !== 'boolean' ||
    !('showLandscape' in value) ||
    typeof value.showLandscape !== 'boolean' ||
    !('palette' in value) ||
    (value.palette !== 'night' && value.palette !== 'moonlight')
  ) {
    throw new Error('界面偏好格式无效');
  }
  // 仅选取允许的界面字段，不保留未知或私人数据。
  return {
    version: 1,
    reduceMotion: value.reduceMotion,
    palette: value.palette,
    showLandscape: value.showLandscape,
  };
}

export function readPreferences(storage: PreferenceStorage) {
  try {
    return { preferences: parsePreferences(storage.getItem(PREFERENCES_KEY)), error: false };
  } catch {
    return { preferences: { ...DEFAULT_PREFERENCES }, error: true };
  }
}

export function savePreferences(storage: PreferenceStorage, preferences: Preferences): boolean {
  try {
    storage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}
