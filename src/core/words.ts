// 펫 모습(글자 그림)과 말
import { DAY, moodOf, STAGE_NAME, type Mood } from './pet.ts';
import type { Pet, Stage, Style } from './types.ts';

/** 갈래: 청소년·어른 이름, 표시, 왜 이렇게 자랐는지 */
export const LINES: Record<Style, { teen: string; adult: string; icon: string; why: string }> = {
  feed: { teen: '통통이', adult: '푸짐이', icon: '🍙', why: '밥을 듬뿍 먹고 자라서' },
  play: { teen: '깡총이', adult: '날쌘돌이', icon: '⚡', why: '신나게 뛰어놀며 자라서' },
  talk: { teen: '재잘이', adult: '수다왕', icon: '💬', why: '방에서 나누는 이야기를 듣고 자라서' },
  wash: { teen: '반짝이', adult: '보송이', icon: '✨', why: '늘 깨끗하게 씻고 자라서' },
  sleep: { teen: '꾸벅이', adult: '느긋이', icon: '🌙', why: '푹 자면서 자라서' },
  neglect: { teen: '삐죽이', adult: '시크삐죽이', icon: '💢', why: '혼자 있는 시간이 길어서' },
};

const FACE: Record<Mood, string> = { happy: 'ᵔᴗᵔ', normal: '•ᴗ•', sad: 'ᵕ︵ᵕ', sleep: '-﹏-', sick: '×﹏×', grumpy: '¬_¬' };
const BODY: Record<Style, [string, string]> = { // [청소년, 어른] — {f}가 얼굴
  feed: ['(　{f}　)', '(　　{f}　　)🍙'],
  play: ['ᕕ({f})ᕗ', 'ᕕ( {f} )ᕗ⚡'],
  talk: ['({f})ﾉ💬', '( {f} )ﾉ💬💬'],
  wash: ['✧({f})✧', '✧･ﾟ( {f} )ﾟ･✧'],
  sleep: ['({f})☁', '( {f} )☁☁'],
  neglect: ['({f})💢', '( {f} )ﾉ💢'],
};

export function art(p: Pet): string {
  if (p.stage === 'egg') return p.warmth >= 7 ? '(　🥚　) 톡…톡…' : '(　🥚　)';
  const f = FACE[moodOf(p)];
  const z = p.asleep ? ' zZ' : '';
  if (p.stage === 'baby') return `🐣 ( ${f} )${z}`;
  if (p.stage === 'child') return `🐥 (っ${f}ς)${z}`;
  const line = p.line ?? 'talk';
  return BODY[line][p.stage === 'teen' ? 0 : 1].replace('{f}', f) + z;
}

export function formName(p: Pet): string {
  if ((p.stage === 'teen' || p.stage === 'adult') && p.line) return `${LINES[p.line][p.stage]} (${STAGE_NAME[p.stage]})`;
  return STAGE_NAME[p.stage];
}

/** 받침이 있으면 '아', 없으면 '야' (부를 때) */
export function call(name: string) {
  const c = name.charCodeAt(name.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return name;
  return name + ((c - 0xac00) % 28 ? '아' : '야');
}
/** 이/가, 은/는, 을/를 */
export function josa(name: string, pair: '이가' | '은는' | '을를' | '와과') {
  const c = name.charCodeAt(name.length - 1);
  const has = c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 !== 0 : false;
  const [a, b] = pair === '이가' ? ['이', '가'] : pair === '은는' ? ['은', '는'] : pair === '을를' ? ['을', '를'] : ['과', '와'];
  return name + (has ? a : b);
}

const bar = (x: number) => { const n = Math.round(x / 20); return '■'.repeat(n) + '□'.repeat(5 - n); };

export function card(p: Pet, now: number): string {
  const days = Math.floor((now - (p.hatched ?? p.born)) / DAY) + 1;
  const head = p.stage === 'egg' ? `🥚 ${p.name} · 알 (따뜻함 ${Math.min(p.warmth, 10)}/10)` : `${p.name} · ${formName(p)} · ${days}일째`;
  if (p.stage === 'egg') return `${head}\n${art(p)}\n대화를 나누면 알이 따뜻해져서 깨어나요.`;
  const lines = [
    head, art(p),
    `🍚 배부름 ${bar(p.full)} ${Math.round(p.full)}`,
    `😊 기분　 ${bar(p.joy)} ${Math.round(p.joy)}`,
    `🛁 청결　 ${bar(p.clean)} ${Math.round(p.clean)}`,
    `💤 기운　 ${bar(p.rest)} ${Math.round(p.rest)}`,
    `❤️ 건강 ${Math.round(p.health)}${p.poop ? ` · 💩 ${p.poop}` : ''}${p.sick ? ' · 🤒 아파요' : ''}${p.asleep ? ' · 자는 중' : ''}`,
  ];
  const need = needOf(p);
  if (need) lines.push(need);
  return lines.join('\n');
}

/** 가장 급한 것 한 줄 (없으면 null) */
export function needOf(p: Pet): string | null {
  if (p.stage === 'egg') return null;
  if (p.sick) return '🤒 아파요… 약이 필요해요 (/약)';
  if (p.poop >= 2) return '💩 똥이 쌓였어요 (/치우기)';
  if (p.asleep) return null;
  const low = (['full', 'joy', 'rest', 'clean'] as const).filter((k) => p[k] < 30).sort((a, b) => p[a] - p[b])[0];
  if (low === 'full') return '🍚 배고파요… (/밥)';
  if (low === 'joy') return '🥺 심심해요… 놀아 주세요 (/놀기)';
  if (low === 'rest') return '😪 졸려요… (/재우기)';
  if (low === 'clean') return '🛁 몸이 근질근질해요 (/씻기)';
  return null;
}

export const help = (name = '몽글') => [
  '🐣 톡펫 — 이 방 모두가 함께 키우는 펫이에요',
  '/밥  /놀기  /씻기  /치우기  /재우기  /깨우기  /약  /쓰다듬기',
  '/상태  /순위  /앨범  /이름 새이름  /새알',
  `이름을 불러도 돼요: "${call(name)} 밥 먹자", "${call(name)} 놀자"`,
  '시간이 지나면 배고프고 심심해져요. 돌보는 방식에 따라 다른 모습으로 자라요.',
  '밤에는 자고, 너무 오래 내버려 두면 편지를 남기고 떠나요.',
].join('\n');

export const ageText = (ms: number) => { const d = Math.floor(ms / DAY); return d >= 1 ? `${d}일` : `${Math.max(1, Math.round(ms / 3_600_000))}시간`; };
export const stageWord = (s: Stage) => STAGE_NAME[s];
