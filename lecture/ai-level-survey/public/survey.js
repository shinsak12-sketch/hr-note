// 설문 문항·점수·등급 정의. 브라우저(index.html)와 서버(api/submit.js)가 같이 쓴다.

export const GROUPS = 8;

export const QUESTIONS = [
  {
    id: 'freq',
    title: '최근 한 달, AI(챗GPT·제미나이·클로드 등)를 얼마나 썼나요?',
    options: [
      { label: '거의 안 썼다', score: 0 },
      { label: '궁금해서 한두 번', score: 1 },
      { label: '일주일에 몇 번', score: 2 },
      { label: '거의 매일 켜 둔다', score: 3 },
    ],
  },
  {
    id: 'uses',
    title: '주로 어디에 쓰나요?',
    hint: '해당하는 것 모두',
    multi: true,
    options: [
      { key: 'search', label: '검색 대신 질문', score: 1 },
      { key: 'write', label: '문서·메일 작성', score: 2 },
      { key: 'summary', label: '요약·번역', score: 1 },
      { key: 'excel', label: '엑셀·수식·표', score: 2 },
      { key: 'image', label: '이미지·영상 만들기', score: 2 },
      { key: 'code', label: '프로그램·웹페이지 만들기', score: 3 },
      { key: 'auto', label: '반복 업무 자동화', score: 3 },
      { key: 'none', label: '아직 없다', score: 0, exclusive: true },
    ],
  },
  {
    id: 'paid',
    title: '유료 AI를 쓰고 있나요?',
    options: [
      { label: '아니요, 무료만', score: 0 },
      { label: '써 봤다가 해지했다', score: 1 },
      { label: '하나 쓰고 있다', score: 2, paid: true },
      { label: '두 개 이상 쓴다', score: 3, paid: true },
    ],
  },
  {
    id: 'prompt',
    title: 'AI에게 일을 시킬 때 나는?',
    options: [
      { label: '시켜 본 적이 별로 없다', score: 0 },
      { label: '검색어처럼 짧게 묻는다', score: 1 },
      { label: '상황과 조건을 설명하고 부탁한다', score: 2 },
      { label: '예시·양식까지 주고 결과 형식을 정한다', score: 3 },
    ],
  },
  {
    id: 'retry',
    title: '답이 마음에 안 들면?',
    options: [
      { label: '그냥 닫는다', score: 0 },
      { label: '복사해서 내가 고친다', score: 1 },
      { label: '다시 해 달라고 한 번 더 묻는다', score: 2 },
      { label: '원하는 결과가 나올 때까지 대화로 다듬는다', score: 3 },
    ],
  },
  {
    id: 'made',
    title: 'AI로 만들어 실제로 쓴 것 중 가장 큰 것은?',
    options: [
      { label: '아직 없다', score: 0 },
      { label: '문서·메일 초안', score: 1 },
      { label: '엑셀 서식, 이미지, 보고서', score: 2 },
      { label: '내가 쓰는 프로그램이나 자동화', score: 3 },
    ],
  },
  {
    id: 'vibe',
    title: '"바이브코딩"이라는 말, 어느 정도 아나요?',
    options: [
      { label: '오늘 처음 듣는다', score: 0 },
      { label: '들어는 봤다', score: 1 },
      { label: '한 번 따라 해 봤다', score: 2 },
      { label: '만든 걸 실제로 쓰고 있다', score: 3 },
    ],
  },
  {
    id: 'wish',
    title: 'AI한테 제일 떠넘기고 싶은 일은?',
    hint: '한 줄로 (강사 화면에 이름 없이 뜰 수 있어요)',
    text: true,
    max: 40,
  },
];

export const LEVELS = [
  {
    lv: 0, name: '관망형', title: 'AI? 아직 구경 중',
    light: '#9a8bf0', dark: '#6b5fc7',
    desc: '들어는 봤지만 손이 잘 안 가는 단계. 오늘이 시작하기 딱 좋은 날이에요.',
    next: '오늘은 AI에게 말 거는 것부터. 질문 하나만 던져 봐도 반은 왔어요.',
  },
  {
    lv: 1, name: '검색형', title: '똑똑한 검색창으로 쓰는 중',
    light: '#7c66e8', dark: '#8f7ff0',
    desc: '궁금한 걸 묻고 답을 받는 데는 익숙해요. 아직은 "물어보는" 쪽에 가까워요.',
    next: '질문 대신 "만들어 줘"라고 해 보세요. 결과물이 나오기 시작하면 Lv.2예요.',
  },
  {
    lv: 2, name: '제작형', title: 'AI로 결과물을 만든다',
    light: '#5b3fd1', dark: '#b9adff',
    desc: '문서·표·이미지처럼 손에 잡히는 결과를 AI와 같이 만들어요. 오늘 모두의 목표 지점!',
    next: '오늘 만든 프로그램을 내일 업무에 한 번 써 보세요. 반복되면 Lv.3이에요.',
  },
  {
    lv: 3, name: '자동화형', title: 'AI에게 일을 맡긴다',
    light: '#3a1f9e', dark: '#e6e0ff',
    desc: '반복되는 일을 AI가 만든 도구로 돌리고 있어요. 오늘은 조원들의 든든한 지원군!',
    next: '조에서 막히는 사람 옆에 앉아 주세요. 가르치면 내 실력도 한 단계 올라가요.',
  },
];

export const MAX_SCORE = 21;

// 방 코드 기본값: 한국 날짜 YYMMDD. 강사 화면 QR에는 방 코드가 붙어 나간다.
export function defaultRoom(now = Date.now()) {
  const d = new Date(now + 9 * 3600e3);
  return d.toISOString().slice(2, 10).replace(/-/g, '');
}

// answers: { freq: 0..3, uses: ['write', ...], paid: 0..3, prompt, retry, made, vibe, wish: '...' }
export function grade(answers) {
  const a = answers || {};
  let score = 0;
  for (const q of QUESTIONS) {
    if (q.text) continue;
    if (q.multi) {
      const picked = q.options.filter((o) => (a[q.id] || []).includes(o.key));
      score += picked.reduce((m, o) => Math.max(m, o.score), 0);
    } else {
      const o = q.options[a[q.id]];
      if (o) score += o.score;
    }
  }
  const level = score >= 16 ? 3 : score >= 10 ? 2 : score >= 5 ? 1 : 0;
  return { score, level };
}

// 서버에서 들어온 값을 정리. 잘못된 값은 버린다.
export function clean(answers) {
  const a = answers || {};
  const out = {};
  for (const q of QUESTIONS) {
    if (q.text) {
      out[q.id] = String(a[q.id] || '').replace(/\s+/g, ' ').trim().slice(0, q.max);
    } else if (q.multi) {
      const keys = q.options.map((o) => o.key);
      out[q.id] = [...new Set(Array.isArray(a[q.id]) ? a[q.id] : [])].filter((k) => keys.includes(k));
    } else {
      const i = Number(a[q.id]);
      out[q.id] = Number.isInteger(i) && i >= 0 && i < q.options.length ? i : null;
    }
  }
  return out;
}

export function isPaid(answers) {
  const q = QUESTIONS.find((x) => x.id === 'paid');
  return !!q.options[answers?.paid]?.paid;
}

export function useLabel(key) {
  return QUESTIONS.find((x) => x.id === 'uses').options.find((o) => o.key === key)?.label || key;
}
