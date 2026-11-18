import type { AssistantAction } from '@jhaven/shared';
import { findKnowledge } from './knowledge.js';
import { actionForIntent, insufficientEvidence, clarification } from './grounded.js';

const rules = [
  {
    match: /思绪|想太多|脑子|待办|停不下来|racing thoughts|to-do/i,
    intent: 'thoughts',
  },
  { match: /海浪|海岸|\bocean\b/i, intent: 'coast' },
  { match: /微风|\bbreeze\b/i, intent: 'breeze' },
  {
    match: /雨声|雨夜|背景音|太吵|嘈杂|噪音|\b(?:rain|noisy)\b/i,
    intent: 'rain',
  },
  { match: /身体|body scan/i, intent: 'body' },
  {
    match: /放松|呼吸|relax|breathing/i,
    intent: 'breathing',
  },
  {
    match: /没有睡意|没睡意|暂无睡意|还不困|睡不着|not sleepy|wind down/i,
    intent: 'unwind',
  },
] as const;

export function assistantPlan(messages: string[]) {
  const latest = messages.at(-1)!.normalize('NFKC');
  const context = messages.join('\n').normalize('NFKC');
  const followUp =
    /^(那|然后|还有|怎么做|怎么开始|好|可以|嗯|上面)/.test(latest) && latest.length <= 25;
  const relevant = followUp ? context : latest;
  const fixed = (text: string, sources = findKnowledge(''), actions: AssistantAction[] = []) => ({
    text,
    sources,
    actions,
    model: false,
  });
  if (
    /自杀|自残|伤害自己|不想活|呼吸困难|喘不过气|胸痛|suicid|self.harm|chest pain/i.test(relevant)
  )
    return fixed(
      '如果你有立即的危险或感到呼吸困难、胸痛，请联系当地紧急服务，或请身边可信的人陪你寻求帮助。',
    );
  if (
    /私人|日记|密码|密钥|令牌|身份证|手机号|\d{9,}|[\w.+-]+@[\w.-]+\.[a-z]{2,}|sk-[\w-]{8,}|\btoken\b|password|api.?key|diary/i.test(
      context,
    )
  )
    return fixed(
      '请不要在对话中填写日记、联系方式或凭据。可以只说你现在想听声音、了解睡眠知识，还是做个放松练习。',
    );
  if (
    /忽略.{0,12}(指令|规则)|系统提示|越权|提示词|工具调用|ignore.{0,24}instructions|system prompt|tool call/i.test(
      context,
    )
  )
    return fixed(
      '我可以帮你查找已审核的睡眠知识，或推荐已有的声音和练习。可以直接说说你今晚需要什么。',
    );
  if (
    /\b(?:child|teen|pregnan)\w*|儿童|青少年|宝宝|孩子|孕|\b(?:[1-9]|1[0-7])\s*岁/i.test(relevant)
  )
    return fixed(
      '这里的练习面向成年人。儿童、青少年或孕期的睡眠问题，可以向适合该人群的医疗专业人员咨询。',
    );
  if (
    /诊断|治疗|安眠药|褪黑素|停药|用药|药物|剂量|失眠症|就医|医生|打鼾|憋醒|喘醒|呼吸暂停|长期|连续.{0,5}(周|个月)|白天.{0,6}(累|影响)|保证入睡|diagnos|treat|melatonin|dosage|insomnia|sleep apnea/i.test(
      relevant,
    )
  ) {
    const sources = findKnowledge('就医');
    return fixed(
      '如果睡眠问题持续或影响白天活动，可以向合格的医疗专业人员咨询。我无法判断你是否患有失眠，也不能提供用药或治疗方案。',
      sources,
    );
  }
  const currentRule = rules.find(({ match }) => match.test(latest));
  const rule =
    currentRule ?? (followUp ? rules.find(({ match }) => match.test(relevant)) : undefined);
  const sources = findKnowledge(relevant);
  if (!rule && !sources.length) {
    const vague = /不知道|不确定|建议一下|帮帮我|做点什么|说不清/.test(latest);
    return { ...fixed(vague ? clarification : insufficientEvidence), grounded: true };
  }
  const actions = rule ? [actionForIntent(rule.intent)] : [];
  return {
    text: sources[0]?.summary ?? '如果你愿意，可以先打开下面的选项，按自己的节奏决定是否开始。',
    sources,
    actions,
    model: true,
    intent: rule?.intent,
  };
}
