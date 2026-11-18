import { assistantSource } from '@jhaven/shared';

export const knowledgeVersion = '2026-11-18.1';
const records = [
  {
    id: 'wind-down',
    title: 'NHLBI · 健康睡眠习惯',
    url: 'https://www.nhlbi.nih.gov/health/sleep-deprivation/healthy-sleep-habits',
    published: '2022-03-24',
    population: '面向公众的睡眠健康资料，本应用仅给成年人提供练习。',
    evidence: '官方健康建议，未对这些具体建议逐项评级。',
    summary: '睡前可以留出安静、低亮度的一段时间。若还没有睡意，可以先做一件轻松的事。',
    limits: '一般习惯提示，无法判断个体夜间症状的原因，也未验证本应用的具体练习。',
    keywords: [
      '睡前习惯',
      '作息',
      '没睡意',
      '暂无睡意',
      '没有睡意',
      '睡不着',
      '还不困',
      '安静',
      '屏幕',
      'wind down',
      'not sleepy',
      'sleep habits',
    ],
  },
  {
    id: 'caffeine',
    title: 'NHLBI · 咖啡因与睡前习惯',
    url: 'https://www.nhlbi.nih.gov/health/sleep-deprivation/healthy-sleep-habits',
    published: '2022-03-24',
    population: '面向公众的睡眠健康资料。',
    evidence: '官方健康建议，未逐项评级。',
    summary:
      '咖啡因可能影响入睡。若你发现晚间饮用会影响睡眠，可以把含咖啡因饮品留到白天较早的时段。',
    limits: '个体敏感度不同，本建议不提供剂量或固定停饮时间。',
    keywords: ['咖啡', '咖啡因', '浓茶', '能量饮料', 'coffee', 'caffeine'],
  },
  {
    id: 'auditory-review',
    title: 'Capezuti 等 · 听觉刺激与睡眠',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9163611/',
    published: '2022-06-01',
    population: '34 项研究中的 1,103 名成人，多数研究在实验室或医院开展。',
    evidence: '系统综述，研究差异较大，睡眠效果证据不足。',
    summary:
      '白噪声、粉红噪声和混合声音改善睡眠的证据不明确。可以把喜欢的声音当作可随时停止的背景。',
    limits: '声音强度、环境和结局指标不同，结果不能外推到任意录音或整夜使用。',
    keywords: [
      '白噪',
      '粉红噪',
      '背景音',
      '声音',
      '噪音',
      '嘈杂',
      '助眠音',
      '雨声',
      '雨夜',
      '海浪',
      '海岸',
      '微风',
      'white noise',
      'pink noise',
      'rain',
      'ocean',
    ],
  },
  {
    id: 'bedtime-writing',
    title: 'Scullin 等 · 睡前写待办事项',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5758411/',
    published: '2018-01-01',
    population: '57 名 18–30 岁健康成年人。',
    evidence: '单夜实验室随机比较，样本小，属于初步证据。',
    summary: '一项小型研究比较了睡前写未来待办与写已完成事项。你可以只为明天留一个很小的下一步。',
    limits: '没有无写作对照。单夜结果不能推广到长期睡眠困难或本应用的短提示。',
    keywords: ['思绪', '想太多', '脑子', '待办', '整理', '停不下来', 'racing thoughts', 'to-do'],
  },
  {
    id: 'relaxation-guide',
    title: 'AASM · 成人慢性失眠临床指南',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7853203/',
    published: '2021-02-01',
    population: '患有慢性失眠的成年人，供临床人员参考。',
    evidence: '对单独使用临床放松疗法的条件性推荐，证据质量低。',
    summary: '可以按自己的节奏做一般放松，练习不舒服时可以停下。',
    limits: '指南中的临床疗法与这里的短练习不同。尚无针对本应用的临床验证。',
    keywords: ['放松', '身体觉察', '呼吸', '放松训练', 'relax', 'breathing', 'body scan'],
  },
  {
    id: 'seek-care',
    title: 'NHLBI · 睡眠困难的就医评估',
    url: 'https://www.nhlbi.nih.gov/health/insomnia/diagnosis',
    published: '2022-03-24',
    population: '寻求评估睡眠困难及其影响的人群。',
    evidence: '官方患者教育资料，未逐项评级。',
    summary: '如果睡眠问题反复出现或影响白天活动，可以向合格的医疗专业人员咨询。',
    limits: '这里无法作诊断，也不提供用药、停药或临床治疗方案。',
    keywords: [
      '长期',
      '总是失眠',
      '连续几周',
      '白天影响',
      '就医',
      '医生',
      '失眠症',
      '用药',
      '药物',
      'insomnia',
      'medication',
    ],
  },
];

export function findKnowledge(text: string) {
  const normalized = text.normalize('NFKC').toLowerCase();
  const words = new Set(normalized.match(/[a-z]+/g));
  return records
    .map(({ keywords, ...source }) => ({
      source,
      score: keywords.filter((term) =>
        /^[a-z]+$/.test(term) ? words.has(term) : normalized.includes(term),
      ).length,
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(({ source }) => assistantSource.parse(source));
}
