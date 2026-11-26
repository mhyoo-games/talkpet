import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY, HOUR, MIN, GRADUATE, hourOf, isQuiet, lineOf, newPet, tick } from '../src/core/pet.ts';
import { due, handle, newRoom, parse, parseRoom } from '../src/core/room.ts';
import { call, card, josa } from '../src/core/words.ts';
import type { Room } from '../src/core/types.ts';

// 2026-11-27 12:00 (한국·일본) = 03:00 UTC
const NOON = Date.UTC(2026, 10, 27, 3, 0);
const say = (room: Room | null, sender: string, text: string, time: number) => handle(room, { sender, text, time });

/** 알을 깨워 아기까지 만든 방 */
function hatched(seed = 1, t = NOON) {
  let { room } = say(null, '민지', '안녕', t);
  room.seed = seed;
  for (let i = 0; i < 12; i++) room = say(room, '준호', `대화 ${i}`, t + i * MIN).room;
  room = say(room, '민지', '어디까지 했어', t + 40 * MIN).room;
  assert.equal(room.pet!.stage, 'baby');
  return room;
}

test('처음 보는 방: 알을 주고, 대화 10번 + 30분이면 깨어남', () => {
  const a = say(null, '민지', '안녕', NOON);
  assert.equal(a.room.pet!.stage, 'egg');
  assert.match(a.out[0], /알이 하나 생겼어요/);
  let room = a.room;
  for (let i = 0; i < 10; i++) room = say(room, '준호', 'ㅎㅇ', NOON + i * MIN).room;
  assert.equal(room.pet!.stage, 'egg', '30분 전에는 아직');
  const b = say(room, '민지', '깨어났나', NOON + 31 * MIN);
  assert.equal(b.room.pet!.stage, 'baby');
  assert.ok(b.out.some((t) => t.includes('알이 깨졌어요')));
});

test('대화가 없어도 6시간이면 깨어남', () => {
  const { room } = say(null, '민지', '안녕', NOON);
  const r = due(room, NOON + 6 * HOUR + MIN);
  assert.equal(r.room.pet!.stage, 'baby');
});

test('명령: / 와 ! , 이름 부르기, 흔한 낱말은 무시', () => {
  assert.deepEqual(parse('/밥', null), { action: 'feed', arg: '' });
  assert.deepEqual(parse('!놀기 가위', null), { action: 'play', arg: '가위' });
  assert.equal(parse('/없는말', null), null);
  assert.equal(parse('밥 먹었어?', '몽글'), null);
  assert.equal(parse('몽글아 밥 먹자', '몽글')!.action, 'feed');
  assert.equal(parse('몽글이 귀여워', '몽글')!.action, 'pat');
  assert.equal(parse('몽글아', '몽글')!.action, 'call');
  assert.equal(parse('몽글아 똥 쌌어?', '몽글')!.action, 'clean');
  assert.equal(parse('구름 많네', '구름'), null, '이름이 흔한 낱말이어도 부르는 말이 아니면 무시');
  assert.equal(parse('구름아 잘자', '구름')!.action, 'sleep');
  assert.equal(parse('몽글몽글하다', '몽글'), null);
});

test('조사: 받침에 따라', () => {
  assert.equal(call('몽글'), '몽글아'); assert.equal(call('보리'), '보리야');
  assert.equal(josa('몽글', '이가'), '몽글이'); assert.equal(josa('보리', '이가'), '보리가');
  assert.equal(josa('보리', '을를'), '보리를');
});

test('밥: 배부름이 오르고 돌본 점수, 같은 사람은 3분 안에 다시 못 줌, 배부르면 탈', () => {
  const room = hatched();
  const t = NOON + HOUR;
  room.pet!.full = 40;
  let r = say(room, '민지', '/밥', t);
  assert.ok(r.room.pet!.full > 70);
  assert.equal(r.room.members['민지'].care, 3);
  r = say(r.room, '민지', '/밥', t + MIN);
  assert.match(r.out[0], /방금|남았어요/);
  r = say(r.room, '준호', '/밥', t + 2 * MIN);
  assert.ok(r.room.pet!.full >= 99);
  const h = r.room.pet!.health;
  r = say(r.room, '서연', '/밥', t + 3 * MIN);
  assert.match(r.out[0], /배가 터질/);
  assert.equal(r.room.pet!.health, h - 5);
  assert.equal(r.room.members['서연']?.care ?? 0, 0, '과식은 점수 없음');
});

test('밥 먹고 2~4시간 뒤 똥 → 치우면 점수', () => {
  const room = hatched();
  let r = say(room, '민지', '/밥', NOON + HOUR);
  const out = due(r.room, NOON + 5 * HOUR + MIN);
  assert.equal(out.room.pet!.poop, 1);
  assert.ok(out.out.some((t) => t.includes('똥을 쌌어요')));
  r = say(out.room, '준호', '/치우기', NOON + 5 * HOUR + 2 * MIN);
  assert.equal(r.room.pet!.poop, 0);
  assert.equal(r.room.members['준호'].care, 2);
});

test('밤(0~8시)에는 저절로 자고 아침에 일어나 인사, 밤에는 먼저 조르지 않음', () => {
  const room = hatched();
  assert.equal(hourOf(room, NOON), 12);
  assert.equal(isQuiet(room, NOON + 13 * HOUR), true); // 새벽 1시
  const night = due(room, NOON + 13 * HOUR);
  assert.equal(night.room.pet!.asleep, true);
  assert.ok(!night.out.some((t) => /배고파|심심/.test(t)), '밤에는 조르지 않음');
  const am = due(night.room, NOON + 20 * HOUR + 5 * MIN); // 아침 8시 5분
  assert.equal(am.room.pet!.asleep, false);
  assert.ok(am.out.some((t) => t.startsWith('☀️')));
});

test('밤에 깨우면 한 시간 뒤 다시 잠', () => {
  const room = hatched();
  let r = due(room, NOON + 14 * HOUR);
  r = say(r.room, '민지', '/깨우기', NOON + 14 * HOUR + MIN);
  assert.equal(r.room.pet!.asleep, false);
  assert.match(r.out[0], /한밤중/);
  r = due(r.room, NOON + 15 * HOUR + 20 * MIN);
  assert.equal(r.room.pet!.asleep, true);
});

test('낮에 재우면 3시간 자고 깸, 졸리지 않으면 안 잠', () => {
  const room = hatched();
  room.pet!.rest = 95;
  let r = say(room, '민지', '/재우기', NOON + HOUR);
  assert.match(r.out[0], /안 졸려요/);
  r.room.pet!.rest = 30;
  r = say(r.room, '준호', '/재우기', NOON + HOUR + MIN);
  assert.equal(r.room.pet!.asleep, true);
  assert.match(say(r.room, '서연', '/밥', NOON + 2 * HOUR).out[0], /자고 있어요/);
  r = due(r.room, NOON + 4 * HOUR + 10 * MIN);
  assert.equal(r.room.pet!.asleep, false);
  assert.ok(r.room.pet!.rest > 90);
});

test('돌보지 않으면 졸라 대고(3시간에 한 번), 계속 두면 편지를 남기고 떠남 → 앨범·새알', () => {
  let room = hatched();
  // 마지막 대화 후 하루 동안 조르는 말은 3시간에 한 번까지
  let nags = 0;
  for (let t = NOON + HOUR; t < NOON + 11 * HOUR; t += MIN) { const r = due(room, t); room = r.room; nags += r.out.filter((x) => /: /.test(x)).length; }
  assert.ok(nags >= 1 && nags <= 4, `조름 ${nags}번`);
  let left: string[] = [];
  for (let t = NOON + 11 * HOUR; t < NOON + 6 * DAY && room.pet; t += 10 * MIN) left = due(room, t).out;
  assert.equal(room.pet, null);
  assert.ok(left.some((x) => x.includes('편지를 남기고 떠났어요')));
  assert.equal(room.album.length, 1);
  assert.equal(room.album[0].why, 'ranaway');
  assert.match(say(room, '민지', '/앨범', NOON + 7 * DAY).out[0], /💌/);
  const egg = say(room, '민지', '/새알', NOON + 7 * DAY);
  assert.equal(egg.room.pet!.stage, 'egg');
});

test('잘 돌보면 자라서 갈래가 정해지고(밥 위주 → 통통이), 14일 뒤 독립', () => {
  let room = hatched(7);
  const who = ['민지', '준호', '서연'];
  let lineMsg = '';
  for (let t = NOON + HOUR; room.pet && t < NOON + GRADUATE + 2 * DAY; t += 30 * MIN) {
    const r = due(room, t); room = r.room;
    for (const x of r.out) if (x.includes('로 자랐어요')) lineMsg = x;
    const p = room.pet;
    if (!p || isQuiet(room, t)) continue;
    const w = who[Math.floor(t / (30 * MIN)) % 3];
    const cmd = p.sick ? '/약' : p.poop ? '/치우기' : p.full < 60 ? '/밥' : p.clean < 50 ? '/씻기' : p.rest < 30 ? '/재우기' : p.joy < 50 ? '/놀기' : '/쓰다듬기';
    const o = say(room, w, cmd, t + MIN); room = o.room;
    for (const x of o.out) if (x.includes('로 자랐어요')) lineMsg = x;
  }
  assert.match(lineMsg, /통통이|깡총이|반짝이|꾸벅이|재잘이/);
  assert.equal(room.pet, null);
  assert.equal(room.album.at(-1)!.why, 'graduated');
  assert.equal(room.album.at(-1)!.stage, 'adult');
  assert.ok(room.album.at(-1)!.top.length >= 1);
});

test('갈래 고르기: 방치가 길면 삐죽이', () => {
  const room = newRoom(NOON, 3);
  const p = newPet(room, NOON);
  p.style = { feed: 3, play: 2, talk: 40, wash: 1, sleep: 0, neglect: 30 };
  assert.equal(lineOf(p), 'neglect');
  p.style = { feed: 9, play: 2, talk: 200, wash: 1, sleep: 0, neglect: 0 };
  assert.equal(lineOf(p), 'feed');
});

test('가위바위보·이름 바꾸기·상태 카드·순위', () => {
  const room = hatched(5);
  let r = say(room, '민지', '/놀기 가위', NOON + HOUR);
  assert.match(r.out[0], /가위 vs/);
  r = say(r.room, '준호', '/이름 초코!!', NOON + HOUR + MIN);
  assert.equal(r.room.pet!.name, '초코');
  assert.match(r.out[0], /초코야/);
  assert.equal(parse('초코야 놀자', '초코')!.action, 'play');
  const c = card(r.room.pet!, NOON + HOUR);
  assert.match(c, /초코 · 아기 · 1일째/);
  assert.match(c, /배부름/);
  assert.match(say(r.room, '서연', '/순위', NOON + HOUR + 2 * MIN).out[0], /🥇 민지/);
});

test('그냥 대화는 기분을 조금(한 시간 10까지) 올림', () => {
  const room = hatched();
  room.pet!.joy = 50;
  let r = { room, out: [] as string[] };
  for (let i = 0; i < 30; i++) r = say(r.room, '민지', `수다 ${i}`, NOON + HOUR + i * 10_000);
  assert.ok(r.room.pet!.joy <= 60.5 && r.room.pet!.joy >= 58, `기분 ${r.room.pet!.joy}`);
});

test('저장했다 다시 읽어도 같은 결과 (JSON), 망가진 값도 받아 줌', () => {
  const a = hatched(11);
  const b = parseRoom(JSON.parse(JSON.stringify(a)), NOON);
  const x = say(a, '민지', '/놀기', NOON + 2 * HOUR), y = say(b, '민지', '/놀기', NOON + 2 * HOUR);
  assert.deepEqual(x.out, y.out);
  const broken = parseRoom('망가짐', NOON);
  assert.equal(broken.pet, null);
  assert.deepEqual(broken.album, []);
});

test('tick: 10분씩 나눠도 한 번에 흘려도 같음', () => {
  const r1 = hatched(9), r2 = hatched(9);
  tick(r1.pet!, r1, NOON + 30 * HOUR);
  for (let t = NOON + HOUR; t <= NOON + 30 * HOUR; t += 7 * MIN) tick(r2.pet!, r2, t);
  tick(r2.pet!, r2, NOON + 30 * HOUR);
  assert.ok(Math.abs(r1.pet!.full - r2.pet!.full) < 2, `${r1.pet!.full} ${r2.pet!.full}`);
});
