<script setup lang="ts">
import { ArrowUpRight, BookOpen, MoonStar } from '@lucide/vue';
import { APP_INFO } from '@jhaven/shared';
import { scenes } from '../domain/evening';
import { useAudioEngine } from '../composables/useAudioEngine';
import { usePreferencesStore } from '../stores/preferences';
import MoonBackground from '../components/MoonBackground.vue';
import MoodSelector from '../components/MoodSelector.vue';
import PrimaryButton from '../components/PrimaryButton.vue';
import AmbientSceneCard from '../components/AmbientSceneCard.vue';
const audio = useAudioEngine();
const settings = usePreferencesStore();
</script>
<template>
  <div class="home-page page-enter">
    <section class="hero" aria-labelledby="home-title">
      <MoonBackground v-if="settings.preferences.showLandscape" />
      <div class="hero-content">
        <p class="eyebrow"><span class="small-line"></span>A QUIETER KIND OF NIGHT</p>
        <h1 id="home-title" tabindex="-1">
          今晚，<br />让世界慢一点<span class="title-stop">。</span>
        </h1>
        <p class="hero-tagline">{{ APP_INFO.tagline }}</p>
        <p class="hero-description">把喧嚣留在远处，<br />为自己留一个安静的角落。</p>
        <div class="hero-actions">
          <PrimaryButton to="/relax">开始放松</PrimaryButton
          ><a class="quiet-link" href="#scenes">探索夜晚的声音<span aria-hidden="true">↓</span></a>
        </div>
        <p class="hero-note">
          <MoonStar :size="14" aria-hidden="true" />自然实录与稳定背景音 · 由你开启
        </p>
      </div>
      <div v-if="settings.preferences.showLandscape" class="scene-caption" aria-hidden="true">
        <span>STAY A LITTLE. DO A LITTLE LESS.</span><span>今夜，不必着急。</span>
      </div>
    </section>
    <div class="home-sections">
      <MoodSelector />
      <section id="scenes" class="scenes-section" aria-labelledby="scenes-title">
        <div class="section-heading">
          <div>
            <p class="eyebrow">FIND YOUR QUIET</p>
            <h2 id="scenes-title">选一处，喜欢的夜晚</h2>
          </div>
          <RouterLink class="quiet-link" to="/relax"
            >全部场景<ArrowUpRight :size="16" aria-hidden="true"
          /></RouterLink>
        </div>
        <p class="section-intro">
          一场雨，一片海，一阵风。选好喜欢的场景，点击播放后声音才会开始。
        </p>
        <div class="scene-grid">
          <AmbientSceneCard
            v-for="scene in scenes"
            :key="scene.id"
            :scene="scene"
            :selected="audio.currentId === scene.id"
          />
        </div>
      </section>
      <section class="journal-invitation" aria-labelledby="journal-title">
        <div class="journal-symbol" aria-hidden="true">
          <BookOpen :size="30" :stroke-width="1.2" />
        </div>
        <div>
          <p class="eyebrow">A PAGE, JUST FOR YOU</p>
          <h2 id="journal-title">给今天，留一页空白</h2>
          <p>按自己的节奏记录作息和休息感。睡眠日记仅本人可见。</p>
        </div>
        <RouterLink class="quiet-link" to="/journal"
          >了解睡眠日记<ArrowUpRight :size="17" aria-hidden="true"
        /></RouterLink>
      </section>
      <aside class="gentle-note">
        这里没有必须完成的目标。<br class="mobile-break" />你可以只是，安静地待一会儿。
      </aside>
    </div>
  </div>
</template>
