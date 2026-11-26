// 단톡방 하나: 메시지가 오면 답하고(handle), 1분마다 펫이 먼저 할 말이 있는지 본다(due).
// 카톡·웹 어디에 붙이든 이 두 함수만 부른다. 방 상태는 JSON으로 저장해 두었다가 다시 넘긴다.
import { DAY, HOUR, isQuiet, MIN, newPet, STAGE_NAME, STATS, tick, type PetEvent } from './pet.ts';
import { pick, rand } from './rng.ts';
import type { Member, Msg, Out, Pet, Room } from './types.ts';
import { art, call, card, help, josa, LINES, needOf, ageText } from './words.ts';

export type Action = 'feed' | 'play' | 'wash' | 'clean' | 'sleep' | 'wake' | 'medicine' | 'pat'
  | 'status' | 'rank' | 'album' | 'rename' | 'newegg' | 'help' | 'call';

const WORDS: Record<Exclude<Action, 'call'>, string[]> = {
  feed: ['밥', '먹이', '밥주기', '밥줘', '먹어'],
  play: ['놀기', '놀아', '놀자', '놀아주기', '가위바위보'],
  wash: ['씻기', '목욕', '씻어', '씻자'],
  clean: ['치우기', '똥', '청소', '똥치우기'],
  sleep: ['재우기', '자', '자자', '잠', '코'],
  wake: ['깨우기', '일어나', '기상'],
  medicine: ['약', '치료', '약주기'],
  pat: ['쓰다듬기', '쓰담', '쓰다듬', '토닥', '쓰담쓰담'],
  status: ['상태', '펫', '정보', '톡펫'],
  rank: ['순위', '랭킹'],
  album: ['앨범'],
  rename: ['이름'],
  newegg: ['새알', '입양'],
  help: ['도움말', '명령어', '도움', 'help'],
};
const BY_WORD = new Map<string, Action>();
for (const [a, ws] of Object.entries(WORDS)) for (const w of ws) BY_WORD.set(w, a as Action);

/** 이름을 불렀을 때 무엇을 원하는지 (앞에 있는 것부터) */
const CALL_HINTS: [RegExp, Action][] = [
  [/약|아파/, 'medicine'], [/똥|치우/, 'clean'], [/밥|배고|먹자|먹어|간식/, 'feed'], [/씻|목욕/, 'wash'],
  [/잘\s?자|자자|재워|코\s?자|자러/, 'sleep'], [/일어나|깨어|기상/, 'wake'], [/놀|산책/, 'play'],
  [/쓰담|쓰다듬|착하|귀여|사랑|예쁘|이쁘/, 'pat'], [/뭐\s?해|괜찮|어때|상태|기분/, 'status'],
];

export function parse(text: string, petName: string | null): { action: Action; arg: string } | null {
  const s = text.trim();
  const m = s.match(/^[/!]\s*(\S+)\s*([\s\S]*)$/);
  if (m) { const a = BY_WORD.get(m[1]); return a ? { action: a, arg: m[2].trim() } : null; }
  if (petName) {
    const esc = petName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const c = s.match(new RegExp(`^${esc}(아|야|이|님|씨)?(?=$|[\\s!?.~,ㅋㅎ♡❤])([\\s\\S]*)$`));
    if (c) {
      const rest = c[2];
      for (const [re, a] of CALL_HINTS) if (re.test(rest)) return { action: a, arg: '' };
      // 이름이 흔한 낱말일 수 있으니("구름 많네") 그냥 부를 때는 "몽글아"처럼 부르는 말이거나 이름만일 때
      if (c[1] === '아' || c[1] === '야' || !rest.replace(/[\s!?.~,ㅋㅎ♡❤]/g, '')) return { action: 'call', arg: '' };
      return null;
    }
  }
  return null;
}

export function newRoom(now: number, seed = Math.floor(Math.random() * 2 ** 31)): Room {
  return { v: 1, seed, tz: 540, quiet: [0, 8], pet: null, members: {}, album: [], lastMsg: now, lastNag: now, lastChime: 0, chat: { hour: 0, n: 0 } };
}

/** 예전 저장값·망가진 값도 받아 줌 */
export function parseRoom(x: unknown, now: number): Room {
  const r = (x && typeof x === 'object' ? x : {}) as Partial<Room>;
  const base = newRoom(now, typeof r.seed === 'number' ? r.seed : undefined);
  return { ...base, ...r, v: 1, members: r.members ?? {}, album: Array.isArray(r.album) ? r.album : [], chat: r.chat ?? base.chat };
}

const COOLDOWN: Partial<Record<Action, number>> = { feed: 3 * MIN, play: 3 * MIN, wash: 3 * MIN, sleep: 3 * MIN, wake: 3 * MIN, medicine: MIN, pat: 20_000, clean: 20_000 };

function member(room: Room, who: string): Member {
  return (room.members[who] ??= { care: 0, n: 0, last: {} });
}

function eventText(room: Room, p: Pet, e: PetEvent): string | null {
  const n = p.name;
  switch (e.kind) {
    case 'hatched': return `🐣 톡… 톡… 알이 깨졌어요!\n${art(p)}\n이름은 "${n}"예요. /이름 새이름 으로 바꿀 수 있어요. /도움말`;
    case 'grew':
      if (e.stage === 'child') return `🐥 ${josa(n, '이가')} 한 뼘 자라서 어린이가 됐어요!\n${art(p)}`;
      if (e.stage === 'teen' && p.line) return `✨ ${josa(n, '이가')} "${LINES[p.line].teen}"(으)로 자랐어요! ${LINES[p.line].why} 그런가 봐요.\n${art(p)}`;
      if (e.stage === 'adult' && p.line) return `🎉 ${josa(n, '이가')} 어른 "${LINES[p.line].adult}"(이)가 됐어요! 다들 잘 키워 줘서 고마워요.\n${art(p)}`;
      return null;
    case 'poop': return isQuiet(room, p.t) ? null : `💩 ${josa(n, '이가')} 똥을 쌌어요… (/치우기)`;
    case 'sick': return `🤒 ${josa(n, '이가')} 아파요… 약이 필요해요 (/약)`;
    case 'morning': return `☀️ 좋은 아침! ${josa(n, '이가')} 일어났어요.\n${art(p)}${needOf(p) ? `\n${needOf(p)}` : ''}`;
    case 'woke': return `👀 ${josa(n, '이가')} 낮잠에서 깼어요.`;
    case 'ranaway': return null; // leave()에서
    case 'graduated': return null;
  }
}

function topCarers(room: Room, k = 3) {
  return Object.entries(room.members).filter(([, m]) => m.care > 0).sort((a, b) => b[1].care - a[1].care).slice(0, k).map(([w]) => w);
}

/** 펫이 떠남: 앨범에 남기고 편지, 돌본 점수는 새 펫을 위해 0으로 */
function leave(room: Room, why: 'ranaway' | 'graduated', now: number): string {
  const p = room.pet!;
  const top = topCarers(room);
  room.album.push({ name: p.name, stage: p.stage, line: p.line, from: p.born, to: now, why, top });
  room.pet = null;
  for (const m of Object.values(room.members)) { m.care = 0; m.n = 0; }
  const thanks = top.length ? `${top.join(', ')}님이 돌봐 준 건 잊지 않을게요.` : '';
  if (why === 'graduated') return `🎓 ${josa(p.name, '이가')} 다 자라서 넓은 세상으로 떠났어요!\n💌 "${thanks || '모두 고마웠어요.'} 가끔 놀러 올게요!"\n앨범에 남겼어요 (/앨범). /새알 로 새 알을 받을 수 있어요.`;
  return `💌 ${josa(p.name, '이가')} 편지를 남기고 떠났어요…\n"배고프고 심심했어요. ${thanks || '그래도 이 방이 좋았어요.'}"\n앨범에 남겼어요 (/앨범). /새알 로 새 알을 받을 수 있어요.`;
}

/** 시간 흘리기 + 일어난 일을 말로 */
function advance(room: Room, now: number, out: string[]) {
  const p = room.pet;
  if (!p) return;
  for (const e of tick(p, room, now)) {
    if (e.kind === 'ranaway' || e.kind === 'graduated') { out.push(leave(room, e.kind, now)); return; }
    const t = eventText(room, p, e);
    if (t) out.push(t);
  }
}

const RPS = ['가위', '바위', '보'] as const;

function act(room: Room, who: string, action: Action, arg: string, now: number): string {
  const p = room.pet;
  if (action === 'help') return help(p?.name);
  if (action === 'album') {
    if (!room.album.length) return '📒 앨범이 비어 있어요. 아직 떠난 펫이 없어요.';
    return ['📒 앨범', ...room.album.slice(-10).reverse().map((a) => `${a.why === 'graduated' ? '🎓' : '💌'} ${a.name} · ${a.line && (a.stage === 'teen' || a.stage === 'adult') ? LINES[a.line][a.stage] : STAGE_NAME[a.stage]} · ${ageText(a.to - a.from)} 함께${a.top.length ? ` · 잘 돌봐 준 ${a.top.join(', ')}` : ''}`)].join('\n');
  }
  if (action === 'rank') {
    const list = Object.entries(room.members).filter(([, m]) => m.care > 0).sort((a, b) => b[1].care - a[1].care).slice(0, 10);
    if (!list.length) return '🏆 아직 돌본 사람이 없어요. /밥 /놀기 로 시작해 보세요!';
    const medal = ['🥇', '🥈', '🥉'];
    return [`🏆 ${p ? josa(p.name, '을를') : '펫을'} 잘 돌본 순위`, ...list.map(([w, m], i) => `${medal[i] ?? `${i + 1}.`} ${w} — ${m.care}점 (${m.n}번)`)].join('\n');
  }
  if (action === 'newegg') {
    if (p) return `이미 ${josa(p.name, '이가')} 있어요! 한 번에 한 마리만 키울 수 있어요.`;
    room.pet = newPet(room, now);
    return `🥚 ${who}님이 새 알을 받아 왔어요!\n${art(room.pet)}\n대화를 나누면 알이 따뜻해져서 깨어나요.`;
  }
  if (!p) return '이 방에는 지금 펫이 없어요. /새알 로 새 알을 받아 보세요.';
  if (action === 'status') return card(p, now);
  if (action === 'rename') {
    const name = arg.replace(/[^가-힣a-zA-Z0-9]/g, '').slice(0, 8);
    if (!name) return `새 이름을 같이 적어 주세요. 예: /이름 ${p.name}`;
    if (name === p.name) return `이미 "${name}"예요!`;
    const old = p.name; p.name = name;
    return `📛 ${who}님이 ${josa(old, '을를')} "${name}"(이)라고 부르기로 했어요. 이제 "${call(name)}"라고 불러 주세요!`;
  }
  const m = member(room, who);
  const cd = COOLDOWN[action];
  if (cd && m.last[action] !== undefined && now - m.last[action] < cd) return pick(room, [`방금 했잖아요! 조금 있다가요 😅`, `${who}님 잠깐만요, 아직 ${Math.ceil((cd - (now - m.last[action])) / MIN)}분 남았어요 ⏳`]);
  const n = p.name;
  const give = (pts: number) => { m.care += pts; m.n += 1; m.last[action] = now; };
  if (p.stage === 'egg') {
    if (action === 'pat' || action === 'call') { p.warmth += 2; give(1); return `🥚 ${who}님이 알을 쓰다듬었어요. 따뜻해졌어요! (${Math.min(p.warmth, 10)}/10)`; }
    return `아직 알이에요 🥚 대화를 나누면 따뜻해져서 깨어나요 (${Math.min(p.warmth, 10)}/10)`;
  }
  const sleeping = `💤 ${josa(n, '이가')} 쿨쿨 자고 있어요. 깨우려면 /깨우기`;
  switch (action) {
    case 'call': {
      if (p.asleep) return `💤 ${n}: 음냐… (잠꼬대)`;
      const need = needOf(p);
      return `${art(p)}\n${n}: ${need ? need.replace(/^\S+\s/, '') : pick(room, ['네, 불렀어요? 😊', '여기 있어요!', '헤헤 ♪', `${who}님 안녕!`])}`;
    }
    case 'pat': {
      p.joy = Math.min(100, p.joy + 4); give(p.joy < 74 ? 1 : 0);
      if (p.asleep) return `${who}님이 자는 ${josa(n, '을를')} 살살 쓰다듬었어요. (뒤척뒤척) 💤`;
      return `${art(p)}\n${pick(room, ['헤헤, 간지러워요 ♡', '기분 좋아요~', '더 쓰다듬어 주세요!', '(꼬리 살랑살랑)'])}`;
    }
    case 'feed': {
      if (p.asleep) return sleeping;
      if (p.full >= 90) { p.health = Math.max(0, p.health - 5); p.joy = Math.max(0, p.joy - 5); m.last[action] = now; return `🤢 배가 터질 것 같아요… 그만 주세요! (${who}님, 너무 많이 먹으면 탈 나요)`; }
      give(p.full < 70 ? 3 : 1);
      p.full = Math.min(100, p.full + 35); p.style.feed++;
      p.nextPoop ??= now + (2 + rand(room) * 2) * HOUR;
      return `🍚 ${who}님이 밥을 줬어요! 냠냠 😋\n${art(p)} 배부름 ${Math.round(p.full)}`;
    }
    case 'play': {
      if (p.asleep) return sleeping;
      if (p.rest < 15) { m.last[action] = now; return `😪 너무 졸려서 못 놀겠어요… (/재우기)`; }
      give(p.joy < 70 ? 3 : 1);
      p.joy = Math.min(100, p.joy + 30); p.rest = Math.max(0, p.rest - 12); p.full = Math.max(0, p.full - 6); p.style.play++;
      const mine = RPS.find((x) => arg.startsWith(x));
      if (mine) {
        const its = pick(room, RPS), d = (RPS.indexOf(mine) - RPS.indexOf(its) + 3) % 3;
        return `✊✌️🖐 ${who}님 ${mine} vs ${n} ${its}!\n${d === 0 ? '비겼어요! 한 판 더? 😆' : d === 1 ? `${who}님 승! ${n}: 으앙 다음엔 이길 거예요 😤` : `${n} 승! 야호 🎉`}\n기분 ${Math.round(p.joy)}`;
      }
      return `⚽ ${who}님이랑 ${pick(room, ['공놀이', '숨바꼭질', '술래잡기', '비눗방울 놀이', '춤추기'])}를 했어요! 신나요 🎶\n${art(p)} 기분 ${Math.round(p.joy)}`;
    }
    case 'wash': {
      if (p.asleep) return sleeping;
      give(p.clean < 70 ? 3 : 1);
      p.clean = Math.min(100, p.clean + 45); p.style.wash++;
      if (p.line !== 'wash') p.joy = Math.max(0, p.joy - 5);
      return `🛁 ${who}님이 뽀득뽀득 씻겨 줬어요! ${p.line === 'wash' ? '목욕 최고예요 ✨' : '(물은 조금 싫지만…)'}\n${art(p)} 청결 ${Math.round(p.clean)}`;
    }
    case 'clean': {
      if (!p.poop) { m.last[action] = now; return '✨ 치울 게 없어요. 깨끗해요!'; }
      const k = p.poop; give(2 * k);
      p.poop = 0; p.clean = Math.min(100, p.clean + 10 * k);
      return `🧹 ${who}님이 똥 ${k}개를 치웠어요. 고마워요!`;
    }
    case 'sleep': {
      if (p.asleep) return `💤 이미 자고 있어요. 쉿!`;
      if (p.rest >= 85) { m.last[action] = now; return `안 졸려요! 더 놀래요 😝`; }
      give(p.rest < 50 ? 3 : 1);
      p.asleep = true; p.autoSleep = false; p.sleepUntil = now + 3 * HOUR; p.style.sleep++;
      return `🌙 ${who}님이 ${josa(n, '을를')} 재웠어요. 쿨쿨… (3시간 뒤에 일어나요)`;
    }
    case 'wake': {
      if (!p.asleep) return `이미 깨어 있어요 👀`;
      m.last[action] = now;
      p.asleep = false; p.sleepUntil = null; p.joy = Math.max(0, p.joy - 10);
      if (p.autoSleep) { p.autoSleep = false; p.wokenAt = now; return `😫 한밤중인데… ${josa(n, '이가')} 졸린 눈으로 일어났어요. (한 시간 뒤에 다시 자요)`; }
      return `😪 ${josa(n, '이가')} 눈을 비비며 일어났어요.`;
    }
    case 'medicine': {
      if (!p.sick) { m.last[action] = now; p.joy = Math.max(0, p.joy - 5); return `😖 아픈 데 없어요! 써요…`; }
      give(5); p.sick = false; p.health = Math.min(100, p.health + 10);
      return `💊 ${who}님이 약을 먹여 줬어요. 이제 괜찮아요!\n${art(p)}`;
    }
  }
  return help(p.name);
}

const CHIMES = ['(옆에서 귀 쫑긋 듣고 있어요 👂)', '(꾸벅꾸벅…)', '(데굴데굴 굴러다녀요)', '(같이 수다 떨고 싶어요!)', '(빤히 쳐다봐요 👀)'];

/** 방에 메시지가 왔을 때. room이 null이면 처음 보는 방 → 새로 만들고 알을 줌 */
export function handle(room0: Room | null, msg: Msg): Out {
  const out: string[] = [];
  const room = room0 ?? newRoom(msg.time);
  if (!room0) { room.pet = newPet(room, msg.time); out.push(`🥚 안녕하세요! 이 방에 알이 하나 생겼어요.\n${art(room.pet)}\n대화를 나누면 따뜻해져서 깨어나요. 다 같이 키워요! (/도움말)`); }
  advance(room, msg.time, out);
  const p = room.pet;
  const cmd = parse(msg.text, p ? p.name : null);
  room.lastMsg = msg.time;
  if (cmd) { out.push(act(room, msg.sender, cmd.action, cmd.arg, msg.time)); return { room, out }; }
  // 그냥 대화: 알은 따뜻해지고, 펫은 기분이 조금 좋아짐 (한 시간에 10까지)
  if (p) {
    p.style.talk++;
    if (p.stage === 'egg') {
      p.warmth++;
      if (p.warmth === 7) out.push('🥚 (알이 살짝 흔들렸어요…!)');
      return { room, out };
    }
    const hr = Math.floor(msg.time / HOUR);
    if (room.chat.hour !== hr) room.chat = { hour: hr, n: 0 };
    if (!p.asleep && room.chat.n < 10) { p.joy = Math.min(100, p.joy + 1); room.chat.n++; }
    // 가끔 대화에 끼어듦 (45분에 한 번까지)
    if (!p.asleep && msg.time - room.lastChime > 45 * MIN && rand(room) < 1 / 25) {
      room.lastChime = msg.time;
      out.push(/ㅋㅋ|ㅎㅎ/.test(msg.text) ? `${p.name}: ㅋㅋㅋ (따라 웃어요)` : `${p.name} ${pick(room, CHIMES)}`);
    }
  }
  return { room, out };
}

/** 1분마다: 시간을 흘리고, 일어난 일·급한 것을 먼저 말함 (조용한 시간엔 급한 것 말 안 함, 3시간에 한 번, 이틀 넘게 조용한 방엔 안 함) */
export function due(room: Room, now: number): Out {
  const out: string[] = [];
  advance(room, now, out);
  if (out.length) room.lastNag = now; // 방금 말했으니 조르기는 3시간 뒤
  const p = room.pet;
  if (p && p.stage !== 'egg' && !p.asleep && !isQuiet(room, now) && now - room.lastNag >= 3 * HOUR && now - room.lastMsg < 2 * DAY && !out.length) {
    const need = needOf(p);
    if (need) { room.lastNag = now; out.push(`${art(p)}\n${p.name}: ${need.replace(/^\S+\s/, '')}`); }
  }
  // 아침 인사도 이틀 넘게 조용한 방에는 하지 않음
  if (now - room.lastMsg >= 2 * DAY) return { room, out: out.filter((t) => !t.startsWith('☀️')) };
  return { room, out };
}

export { STATS };
