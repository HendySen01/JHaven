<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute } from 'vue-router';
import { practiceId, type PracticeId } from '@jhaven/shared';
import { practices } from '../domain/relaxation';
import { createPracticeClock } from '../domain/practice-clock';
import { BUILTIN_PRESETS } from '../domain/audio';
import { useAudioEngine } from '../composables/useAudioEngine';
import { usePracticeSpeech } from '../composables/usePracticeSpeech';
import { usePracticeRecommendation } from '../composables/usePracticeRecommendation';
import { useAuthStore } from '../stores/auth';
import { useSpaceRequests } from '../lib/space';
import SleepTimer from '../components/audio/SleepTimer.vue';

const route = useRoute();
const id: PracticeId = practiceId.safeParse(route.params.id).data ?? 'unwind';
const practice = practices[id];
const audio = useAudioEngine();
const auth = useAuthStore();
const speech = usePracticeSpeech();
const clock = createPracticeClock();
const state = ref<'ready' | 'running' | 'paused' | 'finished'>('ready');
const index = ref(0);
const current = computed(() => practice.steps[index.value]!);
const remaining = ref(practice.steps[0]!.seconds);
const heading = ref<HTMLElement>();
const stepHeading = ref<HTMLElement>();
const dim = ref(true);
const speechEnabled = ref(false);
const sound = ref('');
const soundOptions = computed(() => {
  const choices = [...BUILTIN_PRESETS, ...audio.presets];
  if (
    audio.savedAccountScene &&
    !choices.some((choice) => choice.id === audio.savedAccountScene?.id)
  )
    choices.push(audio.savedAccountScene);
  return choices;
});
const suggestion = usePracticeRecommendation();
const selectedSound = computed(() =>
  soundOptions.value.find((choice) => choice.id === sound.value),
);
const outsideAudio = computed(() => !audio.practiceAudio && audio.snapshot.status !== 'idle');
const exercising = computed(() => state.value === 'running' || state.value === 'paused');
const saved = ref(false);
const completed = ref(false);
const finalSeconds = ref(0);
let skipped = false;
let accountedMs = 0;
let resumeAudio = false;
let owner: string | undefined;
let recordId: string | undefined;
let ticker: ReturnType<typeof setInterval> | undefined;
const { busy, error, run } = useSpaceRequests(() => {
  owner = undefined;
  recordId = undefined;
  saved.value = false;
});
const canSave = computed(
  () => !!auth.user && owner === auth.user.id && !!recordId && finalSeconds.value > 0,
);

function stopClock() {
  clearInterval(ticker);
  ticker = undefined;
  clock.pause();
}
function speak() {
  if (speechEnabled.value && state.value === 'running')
    speech.speak(current.value.title + '。' + current.value.text);
}
function resume() {
  state.value = 'running';
  clock.resume();
  ticker ??= setInterval(update, 200);
  speak();
  if (resumeAudio && audio.practiceAudio) void audio.play();
  resumeAudio = false;
}
function pause() {
  update();
  if (state.value !== 'running') return;
  stopClock();
  state.value = 'paused';
  speech.stop();
  resumeAudio = audio.practiceAudio && ['playing', 'loading'].includes(audio.snapshot.status);
  if (resumeAudio) audio.pause();
}
function update() {
  if (state.value !== 'running') return;
  remaining.value = Math.max(0, Math.ceil(current.value.seconds - clock.elapsed() / 1000));
  if (remaining.value === 0) advance(false, false);
}
function start() {
  owner = auth.user?.id;
  recordId = globalThis.crypto?.randomUUID?.();
  completed.value = false;
  finalSeconds.value = 0;
  saved.value = false;
  skipped = false;
  accountedMs = 0;
  index.value = 0;
  clock.reset();
  remaining.value = current.value.seconds;
  resume();
  void nextTick(() => stepHeading.value?.focus());
}
function finish(done: boolean) {
  stopClock();
  speech.stop();
  audio.endPracticeAudio();
  resumeAudio = false;
  completed.value = done && !skipped;
  finalSeconds.value = Math.round(
    (accountedMs + Math.min(clock.elapsed(), current.value.seconds * 1000)) / 1000,
  );
  state.value = 'finished';
  void nextTick(() => heading.value?.focus());
}
function advance(skip: boolean, focus = true) {
  if (!exercising.value) return;
  const running = state.value === 'running';
  skipped ||= skip;
  if (index.value === practice.steps.length - 1) {
    finish(true);
    return;
  }
  stopClock();
  speech.stop();
  accountedMs += Math.min(clock.elapsed(), current.value.seconds * 1000);
  clock.reset();
  index.value++;
  remaining.value = current.value.seconds;
  if (running) resume();
  if (focus) void nextTick(() => stepHeading.value?.focus());
}
function setSpeech(event: Event) {
  speechEnabled.value = (event.target as HTMLInputElement).checked;
  if (speechEnabled.value) speak();
  else speech.stop();
}
function selectSound() {
  if (!audio.practiceAudio) return;
  if (selectedSound.value) audio.setPracticeScene(selectedSound.value);
  else audio.endPracticeAudio();
}
function playSound() {
  if (!selectedSound.value || !audio.beginPracticeAudio()) return;
  if (audio.currentId !== selectedSound.value.id) audio.setPracticeScene(selectedSound.value);
  void audio.play();
}
function save() {
  if (!canSave.value || saved.value) return;
  void run(async (request) => {
    await request('/relaxation', 'POST', {
      id: recordId,
      practice: id,
      seconds: finalSeconds.value,
      completed: completed.value,
    });
    saved.value = true;
  });
}
function reset() {
  state.value = 'ready';
  void nextTick(() => heading.value?.focus());
}
function onVisibility() {
  if (document.hidden && state.value === 'running') pause();
}
function cleanup() {
  stopClock();
  speech.stop();
  audio.endPracticeAudio();
}
function onPageHide() {
  if (state.value === 'running') pause();
  cleanup();
  resumeAudio = false;
}
watch(
  () => auth.user?.id,
  () => {
    if (!soundOptions.value.some((choice) => choice.id === sound.value)) sound.value = '';
    resumeAudio = false;
  },
);
onMounted(() => {
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
});
onBeforeRouteLeave(cleanup);
onBeforeUnmount(() => {
  cleanup();
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('pagehide', onPageHide);
});
</script>

<template>
  <div class="practice-page" :class="{ 'practice-dim': exercising && dim }">
    <div class="practice-content">
      <RouterLink class="quiet-link" to="/relax#practice-choices">返回练习选择</RouterLink>
      <h1 ref="heading" tabindex="-1">
        {{ state === 'finished' ? '练习已结束' : practice.title }}
      </h1>
      <template v-if="state === 'ready'">
        <p class="page-lead">{{ practice.description }}</p>
        <p>
          适合成年人在清醒、安全的环境中尝试。你可以睁眼；如果感到不适，请随时结束。请勿在驾驶时使用。
        </p>
        <button class="button button-primary" type="button" @click="start">开始练习</button>
        <RouterLink class="quiet-link" to="/relaxation-evidence">依据与适用边界</RouterLink>
      </template>

      <template v-else-if="exercising">
        <section class="practice-step" aria-labelledby="step-title">
          <p class="practice-progress">
            第 {{ index + 1 }} / {{ practice.steps.length }} 步 ·
            {{ state === 'paused' ? '已暂停' : remaining + ' 秒' }}
          </p>
          <div aria-live="polite">
            <h2 id="step-title" ref="stepHeading" tabindex="-1">{{ current.title }}</h2>
            <p>{{ current.text }}</p>
          </div>
          <div class="practice-actions">
            <button
              class="button button-primary"
              type="button"
              @click="state === 'running' ? pause() : resume()"
            >
              {{ state === 'running' ? '暂停练习' : '继续练习' }}
            </button>
            <button class="button button-secondary" type="button" @click="advance(false)">
              {{ index === practice.steps.length - 1 ? '完成练习' : '下一步' }}
            </button>
            <button class="quiet-link" type="button" @click="advance(true)">跳过此步</button>
            <button class="quiet-link" type="button" @click="finish(false)">结束练习</button>
          </div>
        </section>
        <details class="practice-display">
          <summary>显示与语音</summary>
          <label><input v-model="dim" type="checkbox" /> 渐暗背景</label>
          <label
            ><input
              :checked="speechEnabled"
              :disabled="!speech.voice.value"
              type="checkbox"
              @change="setSpeech"
            />
            本机中文语音</label
          >
          <p v-if="!speech.voice.value">此设备没有可用的本机中文语音，仍可阅读引导。</p>
          <p v-if="speech.error.value" role="status">{{ speech.error.value }}</p>
        </details>
        <section class="practice-sound" aria-label="练习声音">
          <h2>练习声音</h2>
          <template v-if="outsideAudio">
            <p>当前播放器的声音与计时会继续。你可以保留原播放，或先停止它再选择练习声音。</p>
            <button type="button" class="quiet-link" @click="audio.stop">停止当前声音</button>
            <label class="practice-volume"
              >当前播放音量
              <input
                type="range"
                min="0"
                max="100"
                :value="audio.masterVolume"
                @input="audio.setMaster(Number(($event.target as HTMLInputElement).value))"
              />
              <output>{{ audio.masterVolume }}%</output>
            </label>
          </template>
          <template v-else>
            <div class="practice-actions">
              <label
                >声音场景
                <select v-model="sound" @change="selectSound">
                  <option value="">静音</option>
                  <option v-for="item in soundOptions" :key="item.id" :value="item.id">
                    {{ item.name }}
                  </option>
                </select>
              </label>
              <button
                v-if="suggestion.scene && sound !== suggestion.scene"
                type="button"
                class="quiet-link"
                @click="
                  sound = suggestion.scene ?? '';
                  selectSound();
                "
              >
                选用建议场景
              </button>
              <button
                v-if="selectedSound && ['playing', 'loading'].includes(audio.snapshot.status)"
                type="button"
                class="quiet-link"
                @click="audio.stop"
              >
                停止练习声音
              </button>
              <button
                v-else-if="selectedSound"
                type="button"
                class="button button-secondary"
                :disabled="state === 'paused' || audio.snapshot.status === 'stopping'"
                @click="playSound"
              >
                {{ audio.snapshot.status === 'error' ? '重试声音' : '播放练习声音' }}
              </button>
            </div>
            <label class="practice-volume"
              >练习音量
              <input
                type="range"
                min="0"
                max="100"
                :value="audio.masterVolume"
                :disabled="!selectedSound"
                @input="
                  audio.beginPracticeAudio() &&
                  audio.setMaster(Number(($event.target as HTMLInputElement).value))
                "
              />
              <output>{{ audio.masterVolume }}%</output>
            </label>
            <p v-if="audio.snapshot.error" role="alert">{{ audio.snapshot.error }}</p>
            <p v-else-if="audio.snapshot.fading" role="status">声音正在渐弱。</p>
            <details
              v-if="selectedSound"
              class="practice-timing"
              @toggle="audio.beginPracticeAudio()"
            >
              <summary>定时停止与渐弱</summary>
              <SleepTimer />
            </details>
          </template>
        </section>
      </template>

      <template v-else>
        <p class="page-lead">{{ completed ? '你完成了这次练习。' : '停在这里也可以。' }}</p>
        <p v-if="error" role="alert">{{ error }}</p>
        <p v-if="saved" role="status">练习已保存。</p>
        <template v-else-if="canSave">
          <p>由你决定是否保存练习类型、实际时长和完成状态。</p>
          <button class="button button-secondary" type="button" :disabled="busy" @click="save">
            保存这次练习
          </button>
        </template>
        <p v-else-if="!auth.user">访客练习无需注册，本次不会保存。</p>
        <div class="practice-actions">
          <button class="button button-primary" type="button" :disabled="busy" @click="reset">
            再练一次
          </button>
          <RouterLink v-if="auth.user" class="quiet-link" to="/account#relaxation-history"
            >查看练习记录</RouterLink
          >
        </div>
      </template>
    </div>
  </div>
</template>
