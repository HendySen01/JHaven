export const AUDIO_LIBRARY_VIEW_PREFIX = 'jhaven.audio.view.v1:';
export const AUDIO_LIBRARY_CATEGORIES = [
  'all',
  'nature',
  'steady',
  'texture',
  'favorites',
] as const;
export type AudioLibraryCategory = (typeof AUDIO_LIBRARY_CATEGORIES)[number];

export interface AudioLibraryView {
  version: 1;
  category: AudioLibraryCategory;
  query: string;
  scrollTop: number;
  anchor: string | null;
  anchorOffset: number;
}

export function parseAudioLibraryView(raw: string | null): AudioLibraryView | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as AudioLibraryView;
    if (
      !value ||
      value.version !== 1 ||
      !AUDIO_LIBRARY_CATEGORIES.includes(value.category) ||
      typeof value.query !== 'string' ||
      value.query.length > 60 ||
      !Number.isFinite(value.scrollTop) ||
      value.scrollTop < 0 ||
      value.scrollTop > 10000000 ||
      !Number.isFinite(value.anchorOffset) ||
      Math.abs(value.anchorOffset) > 10000000 ||
      (value.anchor !== null &&
        (typeof value.anchor !== 'string' || !/^[a-z0-9:-]{1,80}$/.test(value.anchor)))
    )
      return null;
    return value;
  } catch {
    return null;
  }
}

export interface AudioViewAnchor {
  id: string;
  top: number;
  bottom: number;
}

// 优先记住视口中上方的实际卡片，而不是只记一个易受布局变化影响的像素值。
export function chooseAudioViewAnchor(anchors: AudioViewAnchor[], height: number) {
  const line = Math.min(120, height / 3);
  return (
    anchors
      .filter((anchor) => anchor.bottom > 0 && anchor.top < height)
      .sort((a, b) => {
        const distance = (anchor: AudioViewAnchor) =>
          line < anchor.top ? anchor.top - line : Math.max(0, line - anchor.bottom);
        return distance(a) - distance(b) || Math.abs(a.top - line) - Math.abs(b.top - line);
      })[0] ?? null
  );
}

export function audioViewScrollTarget(
  saved: AudioLibraryView,
  currentScrollTop: number,
  currentAnchorTop: number | null,
  maxScrollTop: number,
) {
  const target =
    currentAnchorTop === null
      ? saved.scrollTop
      : currentScrollTop + currentAnchorTop - saved.anchorOffset;
  return Math.max(0, Math.min(maxScrollTop, target));
}
