// 카카오톡 PC 채팅방에서 전체 선택·복사한 글 → 메시지 목록, 그리고 지난번 본 것 다음에 새로 온 것만 고르기.
// 윈도 쪽 연결 프로그램(bridge/talkpet-bridge.ps1)은 복사한 글을 그대로 보내고, 읽기·비교는 여기서 한다 (시험할 수 있게).
//
// 복사한 글 모양:
//   2026년 11월 27일 금요일
//   [민지] [오후 2:04] 안녕
//   [준호] [오후 2:05] 여러 줄
//   이어지는 줄
//   서연님이 들어왔습니다.

export interface ChatLine { sender: string; at: string; text: string }

const HEAD = /^\[([^\]]+)\] \[((?:오전|오후) \d{1,2}:\d{2})\] ?(.*)$/;
const DATE = /^-*\s*\d{4}년 \d{1,2}월 \d{1,2}일 \S+요일\s*-*$/;

export function parseChat(text: string): ChatLine[] {
  const out: ChatLine[] = [];
  let open = false; // 바로 앞이 메시지였는지 (다음 줄이 이어지는 줄인지)
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/​/g, '');
    const m = line.match(HEAD);
    if (m) { out.push({ sender: m[1], at: m[2], text: m[3] }); open = true; continue; }
    if (DATE.test(line.trim())) { open = false; continue; }
    if (open && out.length) out[out.length - 1].text += '\n' + line;
  }
  // 여러 줄 메시지 끝의 빈 줄·안내 문구 정리
  for (const l of out) l.text = l.text.replace(/\n+$/, '');
  return out;
}

const key = (l: ChatLine) => `${l.sender}\u0001${l.at}\u0001${l.text}`;

/**
 * 지난번 본 끝부분(seen, 최대 TAIL개) 다음에 새로 온 메시지만.
 * 처음 보는 방이거나 이어지는 곳을 못 찾으면(대화가 지워짐 등) 아무것도 처리하지 않고 지금 것을 본 것으로 둔다 → 예전 대화에 다시 답하지 않음.
 */
export const TAIL = 8;
export function fresh(seen: string[] | null, now: ChatLine[]): { lines: ChatLine[]; seen: string[] } {
  const keys = now.map(key);
  const tail = keys.slice(-TAIL);
  if (!seen || !seen.length) return { lines: [], seen: tail };
  for (let m = Math.min(seen.length, TAIL); m >= 1; m--) {
    const want = seen.slice(-m);
    for (let j = keys.length - 1; j >= m - 1; j--) {
      let ok = true;
      for (let k = 0; k < m && ok; k++) ok = keys[j - k] === want[m - 1 - k];
      if (ok) return { lines: now.slice(j + 1), seen: tail };
    }
    if (m <= 2) break; // 한두 개만 같은 건 믿지 않음 (흔한 "ㅋㅋ")
  }
  return { lines: [], seen: tail };
}
