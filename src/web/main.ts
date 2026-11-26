// 웹 연습판: 단톡방처럼 여러 사람인 척 말을 걸고, 시간을 빨리 감아 보며 톡펫을 키워 본다.
// 카톡에 붙인 것과 같은 규칙(src/core)을 브라우저에서 그대로 돌린다. 저장은 이 브라우저(localStorage)에만.
import { due, handle, parseRoom } from '../core/room.ts';
import { HOUR, DAY, MIN } from '../core/pet.ts';
import { card } from '../core/words.ts';
import type { Room } from '../core/types.ts';

interface Line { who: string; text: string; t: number }
interface Sim { room: Room | null; log: Line[]; offset: number; me: string; people: string[] }
const KEY = 'tp_sim';
const BOT = '톡펫';
const fresh = (): Sim => ({ room: null, log: [], offset: 0, me: '민지', people: ['민지', '준호', '서연'] });

function load(): Sim {
  try {
    const x = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Sim | null;
    if (!x) return fresh();
    return { ...fresh(), ...x, room: x.room ? parseRoom(x.room, Date.now()) : null, log: Array.isArray(x.log) ? x.log.slice(-400) : [] };
  } catch { return fresh(); }
}
let sim = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ ...sim, log: sim.log.slice(-400) })); } catch { /* 저장 못 해도 계속 */ } };
const now = () => Date.now() + sim.offset;

const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T;
const logEl = $('#log'), cardEl = $('#card'), input = $<HTMLInputElement>('#text'), clock = $('#clock'), whoEl = $('#who');

const fmt = (t: number) => {
  const d = new Date(t + 9 * HOUR); // 연습판은 한국 시각으로 보여 줌
  const h = d.getUTCHours();
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

function bubble(l: Line) {
  const div = document.createElement('div');
  div.className = `msg ${l.who === BOT ? 'bot' : l.who === sim.me ? 'me' : 'other'}`;
  const name = document.createElement('div'); name.className = 'name'; name.textContent = l.who;
  const b = document.createElement('div'); b.className = 'bubble'; b.textContent = l.text;
  const time = document.createElement('div'); time.className = 'time'; time.textContent = fmt(l.t);
  div.append(name, b, time);
  logEl.append(div);
}

function render(all = false) {
  if (all) { logEl.textContent = ''; sim.log.forEach(bubble); }
  logEl.scrollTop = logEl.scrollHeight;
  cardEl.textContent = sim.room?.pet ? card(sim.room.pet, now()) : sim.room ? '지금은 펫이 없어요. /새알 로 새 알을 받아 보세요.' : '아직 이 방에 펫이 없어요.\n아무 명령이나 말해 보세요. 예: /도움말';
  clock.textContent = `🕒 ${fmt(now())}${sim.offset ? ` (+${Math.round(sim.offset / HOUR)}시간 빨리 감음)` : ''}`;
  whoEl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.textContent === sim.me));
}

function push(who: string, text: string, t: number) { const l = { who, text, t }; sim.log.push(l); bubble(l); }

function send(text: string) {
  text = text.trim();
  if (!text) return;
  const t = now();
  push(sim.me, text, t);
  // 서버와 같게: 처음 보는 방은 명령이나 "톡펫"을 말해야 시작
  if (!sim.room && !/^[/!]|톡펫/.test(text)) { save(); render(); return; }
  const r = handle(sim.room, { sender: sim.me, text, time: t });
  sim.room = r.room;
  for (const o of r.out) push(BOT, o, t);
  save(); render();
}

function tick() {
  if (!sim.room) { render(); return; }
  const r = due(sim.room, now());
  sim.room = r.room;
  for (const o of r.out) push(BOT, o, now());
  if (r.out.length) save();
  render();
}

/** 빨리 감기: 1분마다 due를 부른 것처럼 (펫이 그 사이에 한 말도 다 보임) */
function skip(ms: number) {
  const end = sim.offset + ms;
  while (sim.offset < end) { sim.offset = Math.min(end, sim.offset + 10 * MIN); if (sim.room) { const r = due(sim.room, now()); sim.room = r.room; for (const o of r.out) push(BOT, o, now()); } }
  save(); render();
}

function people() {
  whoEl.textContent = '';
  for (const p of sim.people) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = p;
    b.onclick = () => { sim.me = p; save(); render(true); input.focus(); };
    whoEl.append(b);
  }
  const add = document.createElement('button'); add.type = 'button'; add.textContent = '+'; add.title = '사람 더하기'; add.className = 'add';
  add.onclick = () => { const n = prompt('이름')?.trim().slice(0, 10); if (n && !sim.people.includes(n)) { sim.people.push(n); sim.me = n; save(); people(); render(true); } };
  whoEl.append(add);
}

$('#form').addEventListener('submit', (e) => { e.preventDefault(); send(input.value); input.value = ''; input.focus(); });
document.querySelectorAll<HTMLButtonElement>('[data-say]').forEach((b) => b.addEventListener('click', () => send(b.dataset.say!)));
document.querySelectorAll<HTMLButtonElement>('[data-skip]').forEach((b) => b.addEventListener('click', () => skip(Number(b.dataset.skip) * HOUR)));
$('#reset').addEventListener('click', () => { if (confirm('처음부터 다시 할까요? 펫과 대화가 지워져요.')) { sim = fresh(); save(); people(); render(true); } });

people(); render(true);
setInterval(tick, 5000);

// 화면 확인용 (?dev=1)
if (new URLSearchParams(location.search).has('dev')) (window as unknown as { __tp: unknown }).__tp = { send, skip, get sim() { return sim; }, DAY };
