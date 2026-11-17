<script setup lang="ts">
import { ArrowLeft, BookOpen, ShieldCheck } from '@lucide/vue';
import PrimaryButton from '../components/PrimaryButton.vue';
</script>
<template>
  <div class="content-page journal-page page-enter">
    <RouterLink class="quiet-link back-link" to="/"
      ><ArrowLeft :size="16" aria-hidden="true" />回到今晚</RouterLink
    >
    <div class="journal-page-icon" aria-hidden="true">
      <BookOpen :size="39" :stroke-width="1.1" />
    </div>
    <p class="eyebrow">YOUR OWN LITTLE JOURNAL</p>
    <h1 tabindex="-1">日记，慢慢来。</h1>
    <p class="page-lead">
      有些夜晚，值得被轻轻记住。<br />记录功能尚未开放，当前不能创建、查看或保存日记。
    </p>
    <div class="foundation-notice">
      <ShieldCheck :size="22" aria-hidden="true" />
      <p>
        <strong>先把隐私，放在前面。</strong
        ><br />我们会先完成账户安全、数据隔离与删除流程，再开放私人记录。你的日记不会默认上传到 AI
        服务。
      </p>
    </div>
    <PrimaryButton to="/relax">先看看夜晚的场景</PrimaryButton>
  </div>
</template>
