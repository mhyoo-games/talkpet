import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fresh, parseChat } from '../src/core/kakao.ts';

const A = [
  '2026년 11월 27일 금요일',
  '[민지] [오후 2:04] 안녕',
  '[준호] [오후 2:05] 여러 줄',
  '이어지는 줄',
  '서연님이 들어왔습니다.',
].join('\r\n');

test('복사한 글 읽기: 이름·시각·여러 줄', () => {
  const l = parseChat(A);
  assert.equal(l.length, 2);
  assert.deepEqual(l[0], { sender: '민지', at: '오후 2:04', text: '안녕' });
  // 안내 문구(들어왔습니다)는 이어지는 줄과 구별할 수 없어 앞 메시지에 붙음 — 명령은 첫 줄로만 보므로 상관없음
  assert.equal(l[1].text, '여러 줄\n이어지는 줄\n서연님이 들어왔습니다.');
});

test('날짜 줄은 메시지에 붙지 않음, 대괄호 이름에 공백도', () => {
  const l = parseChat('[김 민 지] [오전 11:59] 점심\n2026년 11월 28일 토요일\n[준호] [오전 12:01] /밥');
  assert.deepEqual(l.map((x) => [x.sender, x.text]), [['김 민 지', '점심'], ['준호', '/밥']]);
});

test('새 메시지만: 처음엔 아무것도, 다음부터 이어지는 곳 뒤', () => {
  const one = parseChat('[민지] [오후 2:04] 안녕\n[준호] [오후 2:05] 하이\n[민지] [오후 2:05] 뭐해');
  const a = fresh(null, one);
  assert.equal(a.lines.length, 0);
  const two = parseChat('[민지] [오후 2:04] 안녕\n[준호] [오후 2:05] 하이\n[민지] [오후 2:05] 뭐해\n[서연] [오후 2:06] /밥\n[민지] [오후 2:06] 몽글아');
  const b = fresh(a.seen, two);
  assert.deepEqual(b.lines.map((x) => x.text), ['/밥', '몽글아']);
  const c = fresh(b.seen, two);
  assert.equal(c.lines.length, 0, '바뀐 게 없으면 없음');
});

test('같은 말이 반복돼도(ㅋㅋ) 새로 온 것만', () => {
  const base = ['[민지] [오후 2:04] 안녕', '[준호] [오후 2:05] ㅋㅋ', '[준호] [오후 2:05] ㅋㅋ'];
  const a = fresh(null, parseChat(base.join('\n')));
  const b = fresh(a.seen, parseChat([...base, '[준호] [오후 2:05] ㅋㅋ'].join('\n')));
  assert.equal(b.lines.length, 1);
});

test('앞쪽이 잘려 나가도(오래된 대화가 목록에서 빠짐) 이어 붙음', () => {
  const lines = Array.from({ length: 20 }, (_, i) => `[민지] [오후 3:${String(i).padStart(2, '0')}] 메시지 ${i}`);
  const a = fresh(null, parseChat(lines.join('\n')));
  const b = fresh(a.seen, parseChat([...lines.slice(10), '[준호] [오후 3:30] 새 글'].join('\n')));
  assert.deepEqual(b.lines.map((x) => x.text), ['새 글']);
});

test('이어지는 곳을 못 찾으면(대화 지움) 예전 것에 답하지 않음', () => {
  const a = fresh(null, parseChat('[민지] [오후 2:04] 하나\n[민지] [오후 2:04] 둘\n[민지] [오후 2:04] 셋'));
  const b = fresh(a.seen, parseChat('[준호] [오후 5:00] 완전히 다른 대화\n[준호] [오후 5:00] 또'));
  assert.equal(b.lines.length, 0);
});
