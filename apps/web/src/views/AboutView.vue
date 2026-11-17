<script setup lang="ts">
import { ArrowLeft, ArrowRight, Check } from '@lucide/vue';
import ServiceStatus from '../components/ServiceStatus.vue';

const phases = [
  {
    number: '01',
    title: '让夜晚，有自己的样子',
    status: 'Sprint 2.5 · 声音库 Alpha',
    description: '选择今晚状态，试听和混合自然实录与稳定背景音，保存本地场景与定时渐弱。',
  },
  {
    number: '02',
    title: '让朋友真正用起来',
    status: 'Alpha · 计划中',
    description: '逐步加入可退出的放松引导、账户与私人睡眠日记，并补齐真机音频验证。',
  },
  {
    number: '03',
    title: '一起把体验打磨好',
    status: 'Beta → V1.0 · 计划中',
    description: '依据真实反馈完善兼容性、数据管理和可访问性，再评估个性化能力。',
  },
];
</script>

<template>
  <div class="content-page">
    <RouterLink class="quiet-link back-link" to="/"
      ><ArrowLeft :size="16" aria-hidden="true" />回到港湾</RouterLink
    >
    <p class="eyebrow">A QUIET BEGINNING</p>
    <h1 tabindex="-1">从一个安静的起点，<br />慢慢开始。</h1>
    <p class="page-lead">JHaven 希望让环境音、温和放松与习惯记录，成为你夜晚里轻盈的陪伴。</p>
    <div class="foundation-notice">
      <Check :size="19" aria-hidden="true" />
      <p>
        <strong>当前版本：声音库 Alpha</strong
        ><br />你可以试听和混合声音，保存本地偏好，注册并登录账户。日记与跨设备同步待开放。
      </p>
    </div>

    <section aria-labelledby="roadmap-title" class="roadmap-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">ONE STEP AT A TIME</p>
          <h2 id="roadmap-title">接下来，我们会这样前进</h2>
        </div>
      </div>
      <ol class="roadmap-list">
        <li v-for="phase in phases" :key="phase.number">
          <span class="phase-number">{{ phase.number }}</span>
          <div>
            <span class="phase-status">{{ phase.status }}</span>
            <h3>{{ phase.title }}</h3>
            <p>{{ phase.description }}</p>
          </div>
        </li>
      </ol>
    </section>

    <section id="boundaries" class="boundary-section" aria-labelledby="boundaries-title">
      <p class="eyebrow">WITH CARE, ALWAYS</p>
      <h2 id="boundaries-title">安心使用的边界</h2>
      <div class="boundary-grid">
        <article>
          <h3>陪伴日常休息</h3>
          <p>
            JHaven
            不是医疗诊断或治疗软件，不承诺入睡速度或治疗效果。后续放松体验均可暂停、跳过或结束。
          </p>
        </article>
        <article>
          <h3>让隐私留在你手中</h3>
          <p>
            界面和声音偏好、自定义场景仅保存在当前浏览器的
            localStorage。账户库保存用户名、密码哈希和会话摘要。登录不自动上传原有声音偏好。日记、AI
            与分析追踪尚未开放。
          </p>
        </article>
      </div>
    </section>
    <ServiceStatus />
    <RouterLink class="quiet-link mt-8" to="/"
      >回到安静的首页 <ArrowRight :size="16" aria-hidden="true"
    /></RouterLink>
  </div>
</template>
