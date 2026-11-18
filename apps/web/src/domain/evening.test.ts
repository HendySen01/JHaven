import { describe, expect, it } from 'vitest';
import { findScene, moods, recommendForMood } from './evening';

describe('今晚状态与场景规则', () => {
  it('未选择时不推断用户状态', () => {
    expect(recommendForMood(null)).toBeNull();
  });
  it.each(moods)('$label 有可解释的真实入口', (mood) => {
    const result = recommendForMood(mood.id);
    expect(result?.text).toContain(mood.label);
    if (result?.sceneId) expect(findScene(result.sceneId)).toBeDefined();
    else expect(result?.to).toBe(mood.id === 'journal' ? '/journal' : '/relax#practice-choices');
  });
  it.each(['unknown', undefined, ['rain'], '<script>'])('无效场景 %j 不返回伪造场景', (id) => {
    expect(findScene(id)).toBeUndefined();
  });
});
