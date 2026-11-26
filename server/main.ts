// 톡펫 서버 (Node 22, 외부 패키지 없음). 방마다 상태를 data/rooms/에 JSON으로 저장.
//  POST /api/kakao   {room, text}            카톡 PC에서 복사한 채팅방 글 → 새 메시지에 답 {out: string[]}
//  POST /api/message {room, sender, text}    메시지 하나 → {out: string[]}  (다른 메신저·시험용)
//  POST /api/due     {}                      1분마다: 펫이 먼저 할 말 {out: {room, text}[]}
//  GET  /api/rooms                           방 목록·펫 상태 (확인용)
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { due, handle, parseRoom } from '../src/core/room.ts';
import { fresh, parseChat } from '../src/core/kakao.ts';
import type { Room } from '../src/core/types.ts';

const PORT = Number(process.env.PORT ?? 8790);
const HOST = process.env.HOST ?? '127.0.0.1';
const DATA = process.env.DATA_DIR ?? 'data';
const BOT = (process.env.BOT_NAME ?? '').trim();     // 봇 계정의 카톡 이름 → 자기 말에는 답하지 않음
const TOKEN = process.env.TOKEN ?? '';                // 있으면 요청 머리 x-token이 같아야 함
const now = () => Date.now();
mkdirSync(join(DATA, 'rooms'), { recursive: true });

interface Saved { name: string; room: Room | null; seen: string[] | null }
const file = (name: string) => join(DATA, 'rooms', createHash('sha1').update(name).digest('hex').slice(0, 16) + '.json');
function load(name: string): Saved {
  const f = file(name);
  if (!existsSync(f)) return { name, room: null, seen: null };
  try { const x = JSON.parse(readFileSync(f, 'utf8')) as Saved; return { name, room: x.room ? parseRoom(x.room, now()) : null, seen: x.seen ?? null }; }
  catch { return { name, room: null, seen: null }; }
}
function save(s: Saved) { const f = file(s.name); writeFileSync(f + '.tmp', JSON.stringify(s)); renameSync(f + '.tmp', f); }
function all(): Saved[] {
  return readdirSync(join(DATA, 'rooms')).filter((f) => f.endsWith('.json')).map((f) => {
    try { const x = JSON.parse(readFileSync(join(DATA, 'rooms', f), 'utf8')) as Saved; return load(x.name); } catch { return null; }
  }).filter((x): x is Saved => !!x);
}

function onMessage(s: Saved, sender: string, text: string, t: number): string[] {
  if (BOT && sender === BOT) return [];
  if (!s.room && !/^[/!]|톡펫/.test(text.trim())) {
    // 처음 보는 방은 누가 명령(/도움말 등)이나 "톡펫"을 말해야 시작 → 봇을 그냥 초대만 해 둔 방에서 갑자기 떠들지 않게
    return [];
  }
  const r = handle(s.room, { sender, text, time: t });
  s.room = r.room;
  return r.out;
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let b = '';
  for await (const c of req) { b += c; if (b.length > 5_000_000) throw new Error('too big'); }
  return b ? JSON.parse(b) : {};
}
const json = (res: ServerResponse, code: number, x: unknown) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(x)); };
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

createServer(async (req, res) => {
  try {
    if (TOKEN && req.headers['x-token'] !== TOKEN) return json(res, 401, { error: 'token' });
    const p = new URL(req.url ?? '/', 'http://x').pathname;
    if (req.method === 'POST' && p === '/api/kakao') {
      const b = await body(req);
      const name = String(b.room ?? '').trim();
      if (!name) return json(res, 400, { error: 'room' });
      const s = load(name);
      const f = fresh(s.seen, parseChat(String(b.text ?? '')));
      s.seen = f.seen;
      const out: string[] = [];
      for (const l of f.lines) out.push(...onMessage(s, l.sender, l.text, now()));
      save(s);
      if (f.lines.length) log(`[${name}] 새 메시지 ${f.lines.length}개 → 답 ${out.length}개`);
      return json(res, 200, { out });
    }
    if (req.method === 'POST' && p === '/api/message') {
      const b = await body(req);
      const s = load(String(b.room ?? 'test'));
      const out = onMessage(s, String(b.sender ?? '?'), String(b.text ?? ''), typeof b.time === 'number' ? b.time : now());
      save(s);
      return json(res, 200, { out });
    }
    if (req.method === 'POST' && p === '/api/due') {
      const out: { room: string; text: string }[] = [];
      for (const s of all()) {
        if (!s.room) continue;
        const r = due(s.room, now());
        s.room = r.room; save(s);
        for (const text of r.out) out.push({ room: s.name, text });
      }
      if (out.length) log(`먼저 말하기 ${out.length}개`);
      return json(res, 200, { out });
    }
    if (p === '/api/rooms') {
      return json(res, 200, all().map((s) => ({ name: s.name, pet: s.room?.pet ? { name: s.room.pet.name, stage: s.room.pet.stage, line: s.room.pet.line, health: Math.round(s.room.pet.health) } : null, members: s.room ? Object.keys(s.room.members).length : 0, album: s.room?.album.length ?? 0 })));
    }
    if (p === '/') { res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('톡펫 서버가 켜져 있어요. /api/rooms 에서 방 목록을 볼 수 있어요.\n'); }
    json(res, 404, { error: 'not found' });
  } catch (e) { log('오류', e); json(res, 500, { error: String(e) }); }
}).listen(PORT, HOST, () => log(`톡펫 서버 http://${HOST}:${PORT}${BOT ? ` · 봇 이름 "${BOT}"` : ' · BOT_NAME 없음 (봇이 자기 말에 답할 수 있음)'}`));
