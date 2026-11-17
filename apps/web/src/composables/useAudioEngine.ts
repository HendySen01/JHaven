import { useAudioStore } from '../stores/audio';

// 组件仅获取共享接口；不能按组件挂载创建 AudioContext 或卸载时停止全局播放。
export function useAudioEngine() {
  return useAudioStore();
}
