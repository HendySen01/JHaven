import type { PracticeId } from '@jhaven/shared';
import type { SoundPreset } from '../types/audio';
import type { MoodId } from './evening';

type Step = { title: string; text: string; seconds: number };
type Practice = { title: string; description: string; steps: readonly Step[] };

export const practices = {
  thoughts: {
    title: '思绪整理',
    description: '把一件待办留给明天。',
    steps: [
      {
        title: '挑一件事',
        text: '想一件普通的待办。你可以在心里想，或在纸上写一句。',
        seconds: 20,
      },
      {
        title: '留一个小动作',
        text: '如果愿意，为明天想一个容易开始的动作。想到就好。',
        seconds: 30,
      },
      { title: '先放在这里', text: '把纸放到一旁，或把注意力带回身下的支撑。', seconds: 20 },
    ],
  },
  body: {
    title: '身体觉察',
    description: '留意身体与环境的接触。',
    steps: [
      { title: '感觉支撑', text: '留意椅背、床面或脚下地面的支撑。眼睛可以睁开。', seconds: 20 },
      {
        title: '留意一个部位',
        text: '看看手掌接触到什么。若关注身体不舒服，可以看一眼房间里熟悉的物品。',
        seconds: 25,
      },
      { title: '回到周围', text: '让注意力轻轻回到周围。可以调整成更舒服的姿势。', seconds: 20 },
    ],
  },
  breathing: {
    title: '温和呼吸',
    description: '以舒服的方式留意自然呼吸。',
    steps: [
      { title: '选择舒服的姿势', text: '可以坐着或躺着，保持你平常的呼吸。', seconds: 20 },
      {
        title: '轻轻留意',
        text: '如果舒服，可以留意一两次自然的吸气和呼气。无需数拍、憋气或加深呼吸。',
        seconds: 25,
      },
      {
        title: '松开注意力',
        text: '回到平常的呼吸。感觉头晕、气短或不适时，请结束练习。',
        seconds: 20,
      },
    ],
  },
  unwind: {
    title: '简短放松',
    description: '给清醒的此刻一点余地。',
    steps: [
      {
        title: '安顿下来',
        text: '把手放在舒适的位置。你可以保持睁眼，休息一小会儿。',
        seconds: 20,
      },
      {
        title: '给肩膀留些余地',
        text: '若姿势舒服，让肩膀和下颌自然放松。想动一动也可以。',
        seconds: 25,
      },
      {
        title: '按自己的节奏结束',
        text: '如果仍然清醒，可以先做一件轻松的事，等自己有困意再休息。',
        seconds: 20,
      },
    ],
  },
} satisfies Record<PracticeId, Practice>;

const rules = {
  busy: {
    practice: 'thoughts',
    scene: 'rain',
    reason: '你选了「思绪很多」。可以挑一件待办，把下一步留给明天。',
  },
  noisy: {
    practice: 'body',
    scene: 'steady',
    reason: '你选了「环境嘈杂」。可以先留意身下的支撑，再选择舒适的背景声。',
  },
  sounds: {
    practice: 'body',
    scene: 'coast',
    reason: '你想听一些声音。可以边留意周围的接触感，边试听喜欢的背景声。',
  },
  quiet: {
    practice: 'breathing',
    scene: 'breeze',
    reason: '你想放松。可以短暂留意自然呼吸，声音由你选择。',
  },
  awake: {
    practice: 'unwind',
    scene: null,
    reason: '你选了「暂无睡意」。可以安静坐一会儿，等有困意再休息。',
  },
} as const;

export function recommendPractice(mood: MoodId | null, saved: SoundPreset | null) {
  const rule =
    mood && mood !== 'journal'
      ? rules[mood]
      : ({
          practice: 'unwind',
          scene: null,
          reason: '还没有选择放松状态，可以先从简短放松开始。',
        } as const);
  return { ...rule, scene: saved?.id ?? rule.scene, saved };
}
