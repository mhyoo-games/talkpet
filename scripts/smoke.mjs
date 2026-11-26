// 웹 연습판 확인 (headless Chrome): 처음 → 알 → 대화로 깨어남 → 돌보기 → 빨리 감기·밤잠 → 이름 부르기 → 다시 열어도 그대로 → 휴대폰
// dist를 http로 띄운 뒤: URL=http://localhost:8765/ node scripts/smoke.mjs  (SHOTS=폴더 이면 화면을 찍음)
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = await import(process.env.PLAYWRIGHT_PATH || 'playwright'); }
const { chromium } = pw;
const URL = (process.env.URL || 'http://localhost:8765/') + 'index.html?dev=1';
const SHOTS = process.env.SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const p = await b.newPage({ viewport: { width: 1100, height: 760 } });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
let n = 0;
const ok = (m) => console.log(`✓ ${++n}. ${m}`);
const fail = async (m) => { console.error(`✗ ${m}`); console.error(errs.join('\n')); await b.close(); process.exit(1); };
const check = async (cond, m) => { if (!(await cond())) await fail(m); ok(m); };
const shot = async (name, page = p) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });
const logText = () => p.textContent('#log');
const card = () => p.textContent('#card');
const say = async (t) => { await p.fill('#text', t); await p.press('#text', 'Enter'); await p.waitForTimeout(60); };

await p.goto(URL);
// 연습판 시계를 다음 낮 12시(한국)로 맞춰 둠 (밤이면 펫이 자서 결과가 달라짐)
await p.evaluate(() => {
  localStorage.clear();
  const H = 3_600_000, D = 24 * H, t = Date.now(), noon = Math.floor((t + 9 * H) / D) * D + 12 * H - 9 * H;
  localStorage.setItem('tp_sim', JSON.stringify({ offset: (noon > t ? noon : noon + D) - t }));
});
await p.reload();
await check(async () => (await card()).includes('아직 이 방에 펫이 없어요'), '처음: 펫 없음');
await say('안녕');
await check(async () => !(await logText()).includes('알이 하나'), '그냥 대화로는 시작하지 않음');
await say('/도움말');
await check(async () => (await logText()).includes('알이 하나 생겼어요') && (await logText()).includes('/밥'), '명령으로 시작 → 알 + 도움말');
for (let i = 0; i < 10; i++) { await p.click(`.who button >> nth=${i % 3}`); await say(`수다 ${i}`); }
await check(async () => (await logText()).includes('알이 살짝 흔들렸어요'), '대화로 알이 따뜻해짐');
await p.click('[data-skip="1"]');
await check(async () => (await logText()).includes('알이 깨졌어요') && /아기/.test(await card()), '한 시간 뒤 깨어남 → 상태 카드');
await shot('1-hatched');
const name = await p.evaluate(() => window.__tp.sim.room.pet.name);
await p.click('.quick button:has-text("밥")');
await check(async () => (await logText()).includes('밥을 줬어요'), '빠른 버튼: 밥');
await p.click('.who button >> nth=1');
await say('/놀기 바위');
await check(async () => (await logText()).includes('바위 vs'), '가위바위보');
await say(`${name}${/[가-힣]/.test(name) && (name.charCodeAt(name.length - 1) - 0xac00) % 28 ? '아' : '야'} 씻자`);
await check(async () => (await logText()).includes('씻겨 줬어요'), '이름 불러서 씻기');
await say('/이름 초코');
await check(async () => (await card()).includes('초코'), '이름 바꾸기');
await say('/순위');
await check(async () => (await logText()).includes('🏆'), '순위');
// 하루 빨리 감기: 밤에 자고 아침 인사, 똥
await p.click('[data-skip="24"]');
await check(async () => (await logText()).includes('좋은 아침'), '하루 빨리 감기: 밤에 자고 아침 인사');
await check(async () => /배고파|심심|똥|졸려|근질/.test(await logText()), '돌봐 달라고 먼저 말함');
await shot('2-day');
// 다시 열어도 그대로
const before = await card();
await p.reload();
await check(async () => (await card()).split('\n')[0] === before.split('\n')[0] && (await logText()).includes('좋은 아침'), '다시 열어도 펫·대화 그대로');
// 오래 내버려 두면 떠남 → 앨범 → 새알
for (let i = 0; i < 4; i++) await p.click('[data-skip="24"]');
await check(async () => (await logText()).includes('편지를 남기고 떠났어요'), '오래 내버려 두면 편지를 남기고 떠남');
await say('/앨범');
await check(async () => (await logText()).includes('📒 앨범') && (await logText()).includes('초코'), '앨범');
await say('/새알');
await check(async () => (await card()).includes('알'), '새 알');
// 휴대폰
const saved = await p.evaluate(() => localStorage.getItem('tp_sim'));
const m = await b.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await m.addInitScript((v) => { if (!sessionStorage.getItem('x')) { localStorage.setItem('tp_sim', v); sessionStorage.setItem('x', '1'); } }, saved);
await m.goto(URL);
await check(async () => (await m.$$('.msg')).length > 10 && await m.isVisible('#text') && await m.isVisible('#card'), '휴대폰 화면');
await shot('3-phone', m);
if (errs.length) await fail(`오류: ${errs.join(' / ')}`);
console.log(`모두 통과 (${n}단계)`);
await b.close();
