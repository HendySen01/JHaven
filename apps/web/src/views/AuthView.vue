<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { credentialsSchema, registrationSchema } from '@jhaven/shared';
import { useAuthStore } from '../stores/auth';

const props = defineProps<{ registration: boolean }>();
const auth = useAuthStore();
const router = useRouter();
const username = ref(props.registration ? '' : auth.registeredUsername);
const password = ref('');
const confirmation = ref('');
const interacted = ref({ username: false, password: false, confirmation: false });
const submitted = ref(false);
const validation = computed(() =>
  (props.registration ? registrationSchema : credentialsSchema).safeParse({
    username: username.value,
    password: password.value,
  }),
);
const errors = computed(() => {
  const fields = validation.value.success ? [] : validation.value.error.issues;
  return {
    username: fields.find((item) => item.path[0] === 'username')?.message,
    password: fields.find((item) => item.path[0] === 'password')?.message,
    confirmation:
      props.registration && confirmation.value !== password.value ? '两次输入的密码不一致。' : '',
  };
});
function fieldError(field: keyof typeof errors.value) {
  return interacted.value[field] || submitted.value ? errors.value[field] : undefined;
}
watch(
  () => props.registration,
  () => {
    password.value = '';
    confirmation.value = '';
    interacted.value = { username: false, password: false, confirmation: false };
    submitted.value = false;
    auth.error = '';
  },
);
async function submit() {
  submitted.value = true;
  auth.error = '';
  const credentials = validation.value;
  if (!credentials.success || errors.value.confirmation) return;
  const registration = props.registration;
  if (!(await auth.submit(registration ? 'register' : 'login', credentials.data))) return;
  password.value = '';
  confirmation.value = '';
  if (registration) await router.replace({ name: 'login' });
  else await router.replace({ name: 'account' });
}
</script>

<template>
  <div class="content-page auth-page">
    <RouterLink class="quiet-link back-link" to="/relax">返回声音场景</RouterLink>
    <h1 tabindex="-1">{{ registration ? '创建账户' : '登录 JHaven' }}</h1>
    <p v-if="!registration && auth.registeredUsername" class="foundation-notice" role="status">
      账户已创建，请使用刚设置的密码登录。
    </p>
    <p v-else class="page-lead">
      {{ registration ? '只需用户名和密码。声音库也可直接使用。' : '登录后可查看你的账户。' }}
    </p>
    <form class="auth-form" novalidate @submit.prevent="submit">
      <label for="auth-username">用户名</label>
      <input
        id="auth-username"
        v-model="username"
        type="text"
        autocomplete="username"
        autocapitalize="none"
        spellcheck="false"
        maxlength="32"
        required
        :aria-invalid="Boolean(fieldError('username'))"
        :aria-describedby="fieldError('username') ? 'username-error' : undefined"
        @blur="interacted.username = true"
      />
      <p v-if="fieldError('username')" id="username-error" class="field-error">
        {{ fieldError('username') }}
      </p>
      <label for="auth-password">密码</label>
      <input
        id="auth-password"
        v-model="password"
        type="password"
        :autocomplete="registration ? 'new-password' : 'current-password'"
        maxlength="128"
        required
        :aria-invalid="Boolean(fieldError('password'))"
        :aria-describedby="
          fieldError('password') ? 'password-error' : registration ? 'password-hint' : undefined
        "
        @blur="interacted.password = true"
      />
      <p v-if="fieldError('password')" id="password-error" class="field-error">
        {{ fieldError('password') }}
      </p>
      <p v-else-if="registration" id="password-hint" class="auth-hint">
        至少 12 个字符，可以使用密码短语。
      </p>
      <template v-if="registration">
        <label for="auth-confirmation">确认密码</label>
        <input
          id="auth-confirmation"
          v-model="confirmation"
          type="password"
          autocomplete="new-password"
          maxlength="128"
          required
          :aria-invalid="Boolean(fieldError('confirmation'))"
          :aria-describedby="fieldError('confirmation') ? 'confirmation-error' : undefined"
          @blur="interacted.confirmation = true"
        />
        <p v-if="fieldError('confirmation')" id="confirmation-error" class="field-error">
          {{ fieldError('confirmation') }}
        </p>
      </template>
      <p v-if="auth.error" class="field-error" role="alert">{{ auth.error }}</p>
      <button class="button button-primary" type="submit" :disabled="auth.pending">
        {{ auth.pending ? '正在提交…' : registration ? '注册' : '登录' }}
      </button>
      <RouterLink
        v-if="!auth.pending"
        class="quiet-link"
        :to="{ name: registration ? 'login' : 'register' }"
        >{{ registration ? '已有账户，去登录' : '创建一个账户' }}</RouterLink
      >
    </form>
  </div>
</template>
