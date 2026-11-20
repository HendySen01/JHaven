<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  personalSpace,
  presetInput,
  spacePreferences,
  type AccountPreset,
  type SpacePreferences,
} from '@jhaven/shared';
import { availableTrackIds, TRACKS } from '../types/audio';
import { BUILTIN_PRESETS, copyMix, singleTrackMix } from '../domain/audio';
import { useAudioStore } from '../stores/audio';
import { useAuthStore } from '../stores/auth';
import { useSpaceRequests } from '../lib/space';

const auth = useAuthStore();
const audio = useAudioStore();
const presets = ref<AccountPreset[]>([]);
const preferences = ref<SpacePreferences | null>(null);
const editId = ref<string | null>(null);
const name = ref('');
const nameField = ref<HTMLInputElement>();
const mix = ref(copyMix(audio.mix));
const source = ref('');
const selected = ref('');
const volume = ref(45);
const timer = ref(0);
const message = ref('');
const ready = ref(false);
const devices = computed(() => [
  ...audio.presets,
  ...audio.favorites.map((id) => ({
    id: `favorite:${id}`,
    name: TRACKS[id].name,
    mix: singleTrackMix(id),
  })),
]);
const { busy, error, run } = useSpaceRequests(() => {
  presets.value = [];
  preferences.value = null;
  ready.value = false;
  editId.value = null;
  name.value = '';
  mix.value = copyMix({});
  source.value = '';
  selected.value = '';
  volume.value = 45;
  timer.value = 0;
  message.value = '';
});
async function load(request: () => Promise<unknown>) {
  const data = personalSpace.parse(await request());
  presets.value = data.presets;
  preferences.value = data.preferences;
  const defaultScenes = data.preferences?.scene?.kind === 'preset' ? data.presets : BUILTIN_PRESETS;
  audio.savedAccountScene =
    defaultScenes.find((scene) => scene.id === data.preferences?.scene?.id) ?? null;
  selected.value = data.preferences?.scene?.id ?? '';
  volume.value = data.preferences?.volume ?? 45;
  timer.value = data.preferences?.timerMinutes ?? 0;
  ready.value = true;
}
watch(
  () => auth.user?.id,
  (id) => {
    if (id) void run(load);
  },
  { immediate: true },
);
function edit(preset?: AccountPreset) {
  editId.value = preset?.id ?? null;
  name.value = preset?.name ?? '';
  mix.value = copyMix(preset?.mix ?? audio.mix);
  source.value = '';
  if (preset) void nextTick(() => nameField.value?.focus());
}
function loadDevice() {
  const preset = devices.value.find((p) => p.id === source.value);
  if (!preset) return;
  editId.value = null;
  name.value = preset.name;
  mix.value = copyMix(preset.mix);
  message.value = '已复制到表单。确认名称后保存，同名时会提示冲突。';
}
function save() {
  message.value = '';
  const data = presetInput.safeParse({ name: name.value, mix: mix.value });
  if (!data.success) {
    message.value = '请填写 1–40 字的名称，并开启至少一条音轨。';
    return;
  }
  const id = editId.value;
  void run(async (request) => {
    await request(id ? `/presets/${id}` : '/presets', id ? 'PUT' : 'POST', data.data);
    await load(request);
    edit();
    message.value = '账户场景已保存。';
  });
}
function remove(preset: AccountPreset) {
  if (!window.confirm(`删除账户场景「${preset.name}」？`)) return;
  message.value = '';
  void run(async (request) => {
    await request(`/presets/${preset.id}`, 'DELETE');
    if (audio.accountMix && audio.currentId === preset.id) audio.clearAccountMix();
    await load(request);
    if (editId.value === preset.id) edit();
    message.value = '账户场景已删除。';
  });
}
function savePreferences() {
  message.value = '';
  const id = selected.value;
  const data = spacePreferences.safeParse({
    scene: id ? { kind: presets.value.some((p) => p.id === id) ? 'preset' : 'builtin', id } : null,
    volume: volume.value,
    timerMinutes: timer.value,
  });
  if (!data.success) {
    message.value = '音量须为 0–100，定时须为 0–180 整分钟。';
    return;
  }
  void run(async (request) => {
    await request('/preferences', 'PUT', data.data);
    await load(request);
    message.value = '默认播放设置已保存。';
  });
}
function useDefault() {
  if (!preferences.value) return;
  const p = preferences.value;
  const scenarios = p.scene?.kind === 'preset' ? presets.value : BUILTIN_PRESETS;
  audio.applyAccountMix(
    scenarios.find((item) => item.id === p.scene?.id) ?? null,
    p.volume,
    p.timerMinutes,
  );
  message.value = '已应用到账户播放器。可在声音库开始播放。';
}
function resetPreferences() {
  void run(async (request) => {
    await request('/preferences', 'DELETE');
    audio.clearAccountMix();
    await load(request);
    message.value = '账户默认设置已清除。';
  });
}
</script>

<template>
  <section class="space-section" aria-labelledby="account-sound-heading">
    <h2 id="account-sound-heading">我的声音场景</h2>
    <p v-if="error" class="field-error" role="alert">{{ error }}</p>
    <p v-if="message" class="auth-hint" role="status">{{ message }}</p>
    <p v-if="busy" class="auth-hint" role="status">稍等一下…</p>
    <button v-if="!ready && !busy" type="button" class="button button-secondary" @click="run(load)">
      重试读取账户场景
    </button>
    <template v-if="ready">
      <ul v-if="presets.length" class="space-list">
        <li v-for="preset in presets" :key="preset.id">
          <strong>{{ preset.name }}</strong>
          <div class="space-actions">
            <RouterLink
              class="quiet-link"
              to="/relax#ambient-player"
              @click="audio.applyAccountMix(preset)"
              >使用场景<span class="sr-only"> {{ preset.name }}</span></RouterLink
            >
            <button class="quiet-link" type="button" :disabled="busy" @click="edit(preset)">
              编辑<span class="sr-only"> {{ preset.name }}</span>
            </button>
            <button class="quiet-link" type="button" :disabled="busy" @click="remove(preset)">
              删除<span class="sr-only"> {{ preset.name }}</span>
            </button>
          </div>
        </li>
      </ul>
      <p v-else class="auth-hint">想常听一份混音？可以把它存到这里。</p>
      <details class="space-details" :open="editId !== null || undefined">
        <summary>新建、导入或编辑场景</summary>
        <div v-if="devices.length" class="space-actions">
          <label
            >设备收藏或预设
            <select v-model="source">
              <option value="">选择要导入的场景</option>
              <option v-for="item in devices" :key="item.id" :value="item.id">
                {{ item.name }}
              </option>
            </select>
          </label>
          <button
            type="button"
            class="button button-secondary"
            :disabled="!source || busy"
            @click="loadDevice"
          >
            复制到表单
          </button>
        </div>
        <form class="space-form" @submit.prevent="save">
          <label
            >账户场景名称 <input ref="nameField" v-model="name" required maxlength="40"
          /></label>
          <button
            class="quiet-link"
            type="button"
            :disabled="busy"
            @click="mix = copyMix(audio.mix)"
          >
            载入当前混音
          </button>
          <fieldset class="space-tracks">
            <legend>音轨和音量</legend>
            <div v-for="id in availableTrackIds" :key="id">
              <label class="space-check"
                ><input v-model="mix[id].enabled" type="checkbox" />{{ TRACKS[id].name }}</label
              >
              <input
                v-model.number="mix[id].volume"
                :aria-label="`${TRACKS[id].name}账户音量`"
                type="number"
                min="0"
                max="100"
                step="any"
                :disabled="!mix[id].enabled"
              />
            </div>
          </fieldset>
          <div class="space-actions">
            <button type="submit" class="button button-primary" :disabled="busy">
              {{ editId ? '保存场景修改' : '保存账户场景' }}
            </button>
            <button v-if="editId" class="quiet-link" type="button" :disabled="busy" @click="edit()">
              取消编辑
            </button>
          </div>
        </form>
      </details>
      <section class="space-section" aria-labelledby="defaults-heading">
        <h2 id="defaults-heading">默认播放设置</h2>
        <p class="auth-hint">登录时，只有播放器空闲才会换成你的默认设置。想听时，再按播放。</p>
        <form class="space-form" @submit.prevent="savePreferences">
          <label
            >默认场景
            <select v-model="selected">
              <option value="">沿用当前混音</option>
              <optgroup label="内置场景">
                <option v-for="preset in BUILTIN_PRESETS" :key="preset.id" :value="preset.id">
                  {{ preset.name }}
                </option>
              </optgroup>
              <optgroup v-if="presets.length" label="账户场景">
                <option v-for="preset in presets" :key="preset.id" :value="preset.id">
                  {{ preset.name }}
                </option>
              </optgroup>
            </select>
          </label>
          <div class="space-fields">
            <label
              >默认音量
              <input v-model.number="volume" type="number" min="0" max="100" step="any" required
            /></label>
            <label
              >定时分钟（0 为不定时）
              <input v-model.number="timer" type="number" min="0" max="180" required
            /></label>
          </div>
          <div class="space-actions">
            <button type="submit" :disabled="busy" class="button button-primary">
              保存默认设置
            </button>
            <button
              v-if="preferences"
              type="button"
              :disabled="busy"
              class="button button-secondary"
              @click="useDefault"
            >
              应用默认设置
            </button>
            <button
              v-if="preferences"
              type="button"
              :disabled="busy"
              class="quiet-link"
              @click="resetPreferences"
            >
              清除默认设置
            </button>
          </div>
        </form>
      </section>
    </template>
  </section>
</template>
