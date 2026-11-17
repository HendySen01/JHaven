<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAudioEngine } from '../../composables/useAudioEngine';
const audio = useAudioEngine();
const initialMinutes = audio.snapshot.timer.duration / 60;
const minutes = ref(
  initialMinutes === 0 || [10, 20, 30].includes(initialMinutes) ? String(initialMinutes) : 'custom',
);
const custom = ref(initialMinutes || 10);
const fade = ref(audio.snapshot.fadeSeconds);
const error = ref('');
const remaining = computed(() => {
  const seconds = Math.ceil(audio.snapshot.timer.remaining);
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
});
function apply() {
  error.value = '';
  try {
    const value = minutes.value === 'custom' ? custom.value : Number(minutes.value);
    audio.setTimer(value * 60, fade.value);
  } catch (issue) {
    error.value = issue instanceof Error ? issue.message : '定时设置无效。';
  }
}
</script>
<template>
  <section class="sleep-timer" aria-labelledby="timer-title">
    <div class="timer-heading">
      <h3 id="timer-title">让声音，慢慢落幕</h3>
      <span class="timer-remaining" aria-live="off"
        >{{ audio.snapshot.timer.duration ? `剩余 ${remaining}` : '不定时'
        }}<small v-if="audio.snapshot.timer.duration && !audio.snapshot.timer.running">
          · 等待 / 暂停计时</small
        ></span
      >
    </div>
    <form class="timer-form" @submit.prevent="apply">
      <label
        >停止时间<select v-model="minutes" aria-label="停止时间">
          <option value="0">不定时</option>
          <option value="10">10 分钟</option>
          <option value="20">20 分钟</option>
          <option value="30">30 分钟</option>
          <option value="custom">自定义</option>
        </select></label
      >
      <label v-if="minutes === 'custom'"
        >自定义分钟<input
          v-model.number="custom"
          type="number"
          min="0.1"
          max="180"
          step="0.1"
          required
          aria-label="自定义分钟"
      /></label>
      <label
        >结束前渐弱<select v-model.number="fade" aria-label="结束前渐弱">
          <option :value="5">5 秒</option>
          <option :value="15">15 秒</option>
          <option :value="30">30 秒</option>
          <option :value="60">60 秒</option>
        </select></label
      >
      <button class="button button-secondary" type="submit">应用定时</button>
    </form>
    <p v-if="error" class="audio-feedback" role="alert">{{ error }}</p>
    <div v-if="audio.snapshot.timer.duration" class="timer-actions">
      <button
        type="button"
        class="quiet-link"
        :disabled="audio.snapshot.status !== 'playing'"
        @click="audio.snapshot.timer.running ? audio.pauseTimer() : audio.resumeTimer()"
      >
        {{ audio.snapshot.timer.running ? '暂停计时' : '继续计时' }}</button><button
        type="button"
        class="quiet-link"
        @click="audio.resetTimer"
      >
        重新计时</button
      ><button type="button" class="quiet-link" @click="audio.setTimer(0, fade)">取消定时</button>
    </div>
    <p class="audio-hint">
      以实际经过时间计算；暂停声音会暂停计时。渐弱最长为本次定时长度。刷新取消定时。后台与手机锁屏受浏览器限制，不能保证持续播放或准时停止。
    </p>
  </section>
</template>
