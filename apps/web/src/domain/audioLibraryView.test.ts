import { describe, expect, it } from 'vitest';
import {
  audioViewScrollTarget,
  chooseAudioViewAnchor,
  parseAudioLibraryView,
  type AudioLibraryView,
} from './audioLibraryView';

const saved: AudioLibraryView = {
  version: 1,
  category: 'texture',
  query: '捏捏',
  scrollTop: 1200,
  anchor: 'track:crispy-squishy',
  anchorOffset: 105,
};

describe('声音页面浏览位置', () => {
  it('保留分类、搜索、滚动位置和音轨锚点', () => {
    expect(parseAudioLibraryView(JSON.stringify(saved))).toEqual(saved);
  });
  it('拒绝损坏、非法分类、越界位置和非法锚点', () => {
    for (const value of [
      '{',
      JSON.stringify({ ...saved, version: 2 }),
      JSON.stringify({ ...saved, category: 'unknown' }),
      JSON.stringify({ ...saved, scrollTop: -1 }),
      JSON.stringify({ ...saved, anchorOffset: null }),
      JSON.stringify({ ...saved, anchor: '[invalid]' }),
    ])
      expect(parseAudioLibraryView(value)).toBeNull();
  });
  it('定位当前可见卡片，忽略视口外区域', () => {
    expect(
      chooseAudioViewAnchor(
        [
          { id: 'offscreen', top: -250, bottom: -10 },
          { id: 'track:crispy-squishy', top: 105, bottom: 340 },
          { id: 'later', top: 350, bottom: 580 },
        ],
        800,
      )?.id,
    ).toBe(saved.anchor);
    expect(chooseAudioViewAnchor([], 800)).toBeNull();
  });
  it('布局增高后仍回到同一音轨偏移；锚点失效时用像素并限制范围', () => {
    expect(audioViewScrollTarget(saved, 0, 1450, 3000)).toBe(1345);
    expect(audioViewScrollTarget(saved, 1345, 105, 3000)).toBe(1345);
    expect(audioViewScrollTarget(saved, 0, null, 900)).toBe(900);
    expect(audioViewScrollTarget(saved, 0, 10, 900)).toBe(0);
  });
});
