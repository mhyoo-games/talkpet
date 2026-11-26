// 톡펫 상태 모양 (순수 데이터 → JSON으로 그대로 저장)

export type Stat = 'full' | 'joy' | 'clean' | 'rest';
/** 돌본 방식 — 청소년이 될 때 이걸로 갈래가 정해진다 */
export type Style = 'feed' | 'play' | 'talk' | 'wash' | 'sleep' | 'neglect';
export type Stage = 'egg' | 'baby' | 'child' | 'teen' | 'adult';

export interface Pet {
  name: string;
  born: number;            // 알을 받은 때 (ms)
  hatched: number | null;  // 깨어난 때
  stage: Stage;
  line: Style | null;      // 청소년부터 정해지는 갈래
  full: number; joy: number; clean: number; rest: number; // 0~100, 높을수록 좋음
  health: number;          // 0이 되면 가출
  poop: number;
  nextPoop: number | null; // 밥 먹은 뒤 똥 쌀 때
  sick: boolean;
  asleep: boolean;
  autoSleep: boolean;      // 밤이라 저절로 잠든 것
  sleepUntil: number | null;
  wokenAt: number | null;  // 밤에 깨운 때 (1시간 뒤 다시 잠)
  warmth: number;          // 알: 대화로 따뜻해진 정도
  style: Record<Style, number>;
  t: number;               // 마지막으로 계산한 때
}

export interface Member {
  care: number;                       // 돌본 점수
  n: number;                          // 돌본 횟수
  last: Record<string, number>;       // 행동별 마지막 때 (같은 사람 연속 막기)
}

export interface AlbumEntry {
  name: string; stage: Stage; line: Style | null;
  from: number; to: number;
  why: 'ranaway' | 'graduated';
  top: string[];                      // 가장 잘 돌본 사람들
}

export interface Room {
  v: 1;
  seed: number;
  tz: number;                // 분 단위 시간대 (한국·일본 540)
  quiet: [number, number];   // 조용한 시간 [시작 시, 끝 시) — 펫이 자고 먼저 말을 걸지 않음
  pet: Pet | null;
  members: Record<string, Member>;
  album: AlbumEntry[];
  lastMsg: number;           // 방에서 마지막으로 누가 말한 때
  lastNag: number;           // 펫이 마지막으로 먼저 말 건 때
  lastChime: number;         // 대화에 끼어든 때
  chat: { hour: number; n: number }; // 대화로 오른 기분 (한 시간에 10까지)
}

export interface Msg { sender: string; text: string; time: number }
export interface Out { room: Room; out: string[] }
