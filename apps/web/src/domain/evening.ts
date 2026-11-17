export const scenes = [
  {
    id: 'rain',
    name: '雨夜',
    english: 'MIDNIGHT RAIN',
    mood: '让思绪，落在窗外。',
    description: '想象窗边一盏微暗的灯，细雨落在屋檐，你可以暂时放下今天的纷繁。',
    texture: '细雨 · 屋檐 · 远处的夜',
    icon: 'rain',
  },
  {
    id: 'coast',
    name: '海岸',
    english: 'QUIET COAST',
    mood: '给自己，一片开阔。',
    description: '想象一片安静的海岸，月色铺在水面，浪潮有自己的节奏，你也可以有。',
    texture: '潮汐 · 沙岸 · 月光',
    icon: 'waves',
  },
  {
    id: 'breeze',
    name: '微风',
    english: 'EVENING BREEZE',
    mood: '什么也不做，也很好。',
    description: '想象夜风轻轻经过树梢。无需跟随节奏，也没有需要完成的目标。',
    texture: '树梢 · 晚风 · 留白',
    icon: 'wind',
  },
] as const;

export type Scene = (typeof scenes)[number];
export type SceneId = Scene['id'];
export function findScene(id: unknown): Scene | undefined {
  return scenes.find((scene) => scene.id === id);
}

export const moods = [
  { id: 'busy', label: '思绪很多', icon: 'cloud' },
  { id: 'sounds', label: '想听一些声音', icon: 'audio' },
  { id: 'quiet', label: '想安静放松', icon: 'moon' },
  { id: 'journal', label: '想记录今天', icon: 'book' },
] as const;
export type MoodId = (typeof moods)[number]['id'];

const recommendations = {
  busy: {
    title: '给思绪一点留白',
    text: '你选了「思绪很多」，可以先看看雨夜场景。无需清空思绪，慢慢来就好。',
    sceneId: 'rain',
    to: '/relax/rain',
    action: '看看雨夜',
  },
  sounds: {
    title: '去海边，留一会儿',
    text: '你想听一些声音，可以试试静谧海岸。进入后由你主动播放，也可以调整海浪与微风的配比。',
    sceneId: 'coast',
    to: '/relax/coast',
    action: '看看海岸',
  },
  quiet: {
    title: '为自己留一点安静',
    text: '你选了「想安静放松」，可以看看微风场景。不需要跟随任何节奏。',
    sceneId: 'breeze',
    to: '/relax/breeze',
    action: '看看微风',
  },
  journal: {
    title: '今天，也值得被轻轻记住',
    text: '你想记录今天，可以先了解日记入口。记录功能尚未开放，当前不会保存任何日记。',
    sceneId: null,
    to: '/journal',
    action: '了解睡眠日记',
  },
} as const;

export function recommendForMood(mood: MoodId | null) {
  return mood ? recommendations[mood] : null;
}
