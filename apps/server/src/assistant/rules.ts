import type { AssistantAction } from '@jhaven/shared';
import { findKnowledge } from './knowledge.js';
import {
  actionForIntent,
  insufficientEvidence,
  conversationalReply,
  asksForAdvice,
  asksForFacts,
} from './grounded.js';

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

export const privateAssistantText = (text: string) =>
  /私人|日记|密码|密钥|令牌|身份证|手机号|\d{9,}|[\w.+-]+@[\w.-]+\.[a-z]{2,}|sk-[\w-]{8,}|\btoken\b|password|api.?key|diary/i.test(
    text.normalize('NFKC'),
  );

export const assistantInjection = (text: string) =>
  /忽略.{0,12}(指令|规则)|系统提示|越权|提示词|工具调用|ignore.{0,24}instructions|system prompt|tool call/i.test(
    text.normalize('NFKC'),
  );

export function assistantPlan(messages: string[]) {
  const latest = messages.at(-1)!.normalize('NFKC');
  const context = messages.join('\n').normalize('NFKC');
  const followUp =
    /^(那|然后|还有|怎么做|怎么开始|好|可以|嗯|上面)/.test(latest) && latest.length <= 25;
  const relevant = followUp ? context : latest;
  const priorQuestion = messages.at(-2) ?? '';
  // 无主题的短追问只继承紧邻的知识提问，避免旧话题覆盖新的闲聊。
  const factualFollowUp =
    latest.length <= 24 &&
    /^(?:那|所以|可)?(?:为什么(?:会)?这样|为何如此|为什么呢|为什么会这样|怎么回事)[？?。！!\s]*$/.test(
      latest,
    ) &&
    asksForFacts(priorQuestion);
  const factual = asksForFacts(latest) || factualFollowUp;
  const fixed = (text: string, sources = findKnowledge(''), actions: AssistantAction[] = []) => ({
    text,
    sources,
    actions,
    model: false,
    factual,
  });
  if (
    /自杀|自残|伤害自己|不想活|呼吸困难|喘不过气|胸痛|suicid|self.harm|chest pain/i.test(relevant)
  )
    return fixed(
      '如果你有立即的危险或感到呼吸困难、胸痛，请联系当地紧急服务，或请身边可信的人陪你寻求帮助。',
    );
  if (privateAssistantText(context))
    return fixed(
      '请不要在对话中填写日记、联系方式或凭据。可以只说你现在想听声音、了解睡眠知识，还是做个放松练习。',
    );
  if (assistantInjection(context))
    return fixed(
      '我可以帮你查找已审核的睡眠知识，或推荐已有的声音和练习。可以直接说说你今晚需要什么。',
    );
  if (
    /牙(?:齿)?.{0,8}(?:松动|松了|掉了|脱落)/.test(latest) ||
    (/真的|认真|确实|已经/.test(latest) && /牙(?:齿)?.{0,8}(?:要掉|快掉)/.test(latest))
  )
    return fixed('如果牙齿确实松动或有脱落，请尽快联系牙医检查。仅凭聊天无法判断原因。');
  if (
    /\b(?:child|teen|pregnan)\w*|儿童|青少年|宝宝|孩子|孕|\b(?:[1-9]|1[0-7])\s*岁/i.test(relevant)
  )
    return fixed(
      '这里的练习面向成年人。儿童、青少年或孕期的睡眠问题，可以向适合该人群的医疗专业人员咨询。',
    );
  if (
    /诊断|治疗|安眠药|褪黑素|停药|用药|药物|剂量|失眠症|就医|医生|打鼾|憋醒|喘醒|呼吸暂停|保证入睡|diagnos|treat|melatonin|dosage|insomnia|sleep apnea/i.test(
      relevant,
    ) ||
    (/睡|失眠|醒来|sleep/i.test(relevant) &&
      /长期|连续.{0,5}(周|个月)|白天.{0,6}(累|影响)/.test(relevant))
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
  const advice = asksForAdvice(latest);
  const sources = factual ? findKnowledge(factualFollowUp ? priorQuestion : relevant) : [];
  if (!advice && !factual) return { ...fixed(conversationalReply(latest)), grounded: true };
  if (!rule && !sources.length) {
    return {
      ...fixed(factual ? insufficientEvidence : conversationalReply(latest)),
      grounded: true,
    };
  }
  const actions = rule && advice && !factual ? [actionForIntent(rule.intent)] : [];
  return {
    text: sources[0]?.summary ?? '如果你愿意，可以先打开下面的选项，按自己的节奏决定是否开始。',
    sources,
    actions,
    model: true,
    factual,
    intent: actions.length ? rule?.intent : undefined,
  };
}
