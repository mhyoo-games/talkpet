// 시간이 흐르면 펫이 어떻게 바뀌는지 (배고파지고, 자고, 똥 싸고, 자라고, 아프고, 떠나고)
import { rand } from './rng.ts';
import type { Pet, Room, Stage, Stat, Style } from './types.ts';

export const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
export const STATS: Stat[] = ['full', 'joy', 'clean', 'rest'];

/** 알 → 깨어나기: 대화 10번 + 30분, 또는 대화가 없어도 6시간 */
export const HATCH = { warmth: 10, min: 30 * MIN, max: 6 * HOUR };
/** 깨어난 뒤 자라는 때 */
export const GROW: { stage: Stage; at: number }[] = [
  { stage: 'child', at: 12 * HOUR },
  { stage: 'teen', at: 2 * DAY },
  { stage: 'adult', at: 5 * DAY },
];
/** 깨어난 지 이만큼 지나면 다 자라서 독립(앨범에 남고 새 알) */
export const GRADUATE = 14 * DAY;

/** 한 시간에 줄어드는 양 (깨어 있을 때 / 잘 때) */
const AWAKE: Record<Stat, number> = { full: -5, joy: -4, clean: -2.5, rest: -4 };
const ASLEEP: Record<Stat, number> = { full: -2, joy: 0, clean: -1, rest: 25 };
export const LONELY_AFTER = 12 * HOUR; // 대화가 이만큼 없으면 외로워서 기분이 더 빨리 떨어짐

export type PetEvent =
  | { kind: 'hatched' } | { kind: 'grew'; stage: Stage } | { kind: 'poop' } | { kind: 'sick' }
  | { kind: 'morning' } | { kind: 'woke' } | { kind: 'ranaway' } | { kind: 'graduated' };

const NAMES = ['몽글', '콩콩', '보리', '꼬미', '뭉치', '도토리', '말랑', '토실', '포동', '구름'];

export function newPet(room: Room, now: number): Pet {
  return {
    name: NAMES[Math.floor(rand(room) * NAMES.length)], born: now, hatched: null, stage: 'egg', line: null,
    full: 80, joy: 80, clean: 100, rest: 100, health: 100, poop: 0, nextPoop: null, sick: false,
    asleep: false, autoSleep: false, sleepUntil: null, wokenAt: null, warmth: 0,
    style: { feed: 0, play: 0, talk: 0, wash: 0, sleep: 0, neglect: 0 }, t: now,
  };
}

/** 방 시간대로 몇 시인지 (0~23.99) */
export const hourOf = (room: Room, t: number) => (((t + room.tz * MIN) % DAY) + DAY) % DAY / HOUR;
export function isQuiet(room: Room, t: number) {
  const h = hourOf(room, t), [a, b] = room.quiet;
  return a === b ? false : a < b ? h >= a && h < b : h >= a || h < b;
}

const clamp = (x: number) => Math.max(0, Math.min(100, x));

/** 돌본 방식 중 가장 큰 것 → 갈래. 대화는 많이 쌓이니 1/40로, 방치는 시간 단위라 1/2로 친다 */
export function lineOf(p: Pet): Style {
  const w: Record<Style, number> = {
    feed: p.style.feed, play: p.style.play, wash: p.style.wash, sleep: p.style.sleep,
    talk: p.style.talk / 40, neglect: p.style.neglect / 2,
  };
  let best: Style = 'talk';
  for (const k of ['feed', 'play', 'wash', 'sleep', 'talk', 'neglect'] as Style[]) if (w[k] > w[best]) best = k;
  return best;
}

export type Mood = 'happy' | 'normal' | 'sad' | 'sleep' | 'sick' | 'grumpy';
export function moodOf(p: Pet): Mood {
  if (p.sick) return 'sick';
  if (p.asleep) return 'sleep';
  const avg = (p.full + p.joy + p.clean + p.rest) / 4;
  if (avg >= 70 && p.poop < 2) return 'happy';
  if (avg < 35 || p.full < 15 || p.joy < 15) return 'sad';
  return p.line === 'neglect' ? 'grumpy' : 'normal';
}

/**
 * 펫 시간을 now까지 흘린다 (10분씩 나눠 계산: 밤·잠·똥·병이 중간에 바뀌어도 맞게).
 * 방(room.lastMsg 등)은 읽기만 하고, 난수 씨앗만 바꾼다. 떠나면 'ranaway'·'graduated'를 돌려주고 멈춘다.
 */
export function tick(p: Pet, room: Room, now: number): PetEvent[] {
  const ev: PetEvent[] = [];
  const STEP = 10 * MIN;
  while (p.t < now) {
    const dt = Math.min(STEP, now - p.t), h = dt / HOUR, t = p.t + dt;
    p.t = t;
    if (p.stage === 'egg') {
      const age = t - p.born;
      if ((p.warmth >= HATCH.warmth && age >= HATCH.min) || age >= HATCH.max) { p.stage = 'baby'; p.hatched = t; ev.push({ kind: 'hatched' }); }
      continue;
    }
    // 밤이면 저절로 자고, 아침이면 일어남. 밤에 깨우면 1시간 뒤 다시 잠
    const night = isQuiet(room, t);
    if (night && !p.asleep && !(p.wokenAt !== null && t - p.wokenAt < HOUR)) { p.asleep = true; p.autoSleep = true; p.sleepUntil = null; }
    if (!night && p.asleep && p.autoSleep) { p.asleep = false; p.autoSleep = false; p.wokenAt = null; ev.push({ kind: 'morning' }); }
    if (p.asleep && !p.autoSleep && p.sleepUntil !== null && t >= p.sleepUntil) { p.asleep = false; p.sleepUntil = null; ev.push({ kind: 'woke' }); }
    // 줄어들기
    const r = p.asleep ? ASLEEP : AWAKE;
    for (const k of STATS) p[k] = clamp(p[k] + r[k] * h);
    p.clean = clamp(p.clean - 2 * p.poop * h);
    if (!p.asleep && t - room.lastMsg > LONELY_AFTER) p.joy = clamp(p.joy - 3 * h);
    // 똥
    if (!p.asleep && p.nextPoop !== null && t >= p.nextPoop) { p.poop = Math.min(4, p.poop + 1); p.nextPoop = null; p.clean = clamp(p.clean - 10); ev.push({ kind: 'poop' }); }
    // 병: 더럽거나 굶으면 한 시간에 25% 확률
    if (!p.sick && (p.clean < 15 || p.poop >= 3 || p.full <= 0) && rand(room) < 1 - Math.pow(0.75, h)) { p.sick = true; ev.push({ kind: 'sick' }); }
    // 건강: 바닥난 것마다 한 시간에 3씩, 아프면 2씩 줄고, 다 괜찮으면 3씩 회복
    const zeros = STATS.filter((k) => p[k] <= 0).length;
    p.health = clamp(p.health - (3 * zeros + (p.sick ? 2 : 0)) * h + (zeros === 0 && !p.sick && STATS.every((k) => p[k] >= 50) ? 3 * h : 0));
    p.style.neglect += zeros * h;
    if (p.health <= 0) { ev.push({ kind: 'ranaway' }); return ev; }
    // 자라기
    const age = t - (p.hatched ?? t);
    for (const g of GROW) if (age >= g.at && STAGE_ORDER.indexOf(p.stage) < STAGE_ORDER.indexOf(g.stage)) {
      p.stage = g.stage;
      if (g.stage === 'teen') p.line = lineOf(p);
      ev.push({ kind: 'grew', stage: g.stage });
    }
    if (age >= GRADUATE) { ev.push({ kind: 'graduated' }); return ev; }
  }
  return ev;
}

export const STAGE_ORDER: Stage[] = ['egg', 'baby', 'child', 'teen', 'adult'];
export const STAGE_NAME: Record<Stage, string> = { egg: '알', baby: '아기', child: '어린이', teen: '청소년', adult: '어른' };
