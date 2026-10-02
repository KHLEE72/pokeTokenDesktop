export type DialogueEvent = 'idle' | 'held' | 'falling' | 'landing' | 'growth' | 'usage' | 'petting'
type Lines = Record<DialogueEvent, readonly string[]>

// Original dialogue written for this app. All choices are local; no model calls.
export const DIALOGUES: Record<number, Lines> = {
  0: {
    petting: ['톡톡, 안에서도 인사해요.', '따뜻한 손길이 전해졌어요.', '알 속에서 꼬물꼬물…'],
    idle: ['안에서 작은 발소리가 들려요.', '따뜻한 곳에서 꿈꾸는 중…', '어떤 친구가 나올까요?'],
    held: ['살살 들어주세요!', '안에 누가 있어요…!', '조심조심, 소중한 알이에요.'],
    falling: ['데굴… 아니, 아래로!', '푹신한 곳이면 좋겠어요!', '껍질아, 조금만 버텨줘!'],
    landing: ['휴, 껍질은 무사해요.', '안에서도 깜짝 놀랐대요.', '다시 따뜻하게 품어주세요.'],
    growth: ['작은 친구가 가까워지고 있어요.', '새로운 만남을 준비하는 중!', '알 속에서 두근두근…'],
    usage: ['작은 온기가 하나 더 쌓였어요.', '코딩 소리가 자장가 같아요.', '조금씩 깨어날 준비를 해요.']
  },
  1: {
    petting: ['쓰다듬어 주니까 씨앗도 좋아해.', '헤헤, 새싹이 간질간질해.', '네 손길이면 햇볕 없이도 따뜻해.'],
    idle: ['햇볕 한 줌이면 기분이 좋아져.', '네 옆에서 천천히 자랄게.', '등의 씨앗도 쉬고 싶대.'],
    held: ['씨앗까지 같이 들어줘!', '우와, 여기선 화면이 잘 보여.', '살살, 아직 작은 새싹이야.'],
    falling: ['덩굴아, 지금은 손이 안 닿아!', '흙이 푹신하면 좋겠다!', '씨앗 꼭 붙잡고 내려갈게!'],
    landing: ['착지! 씨앗도 무사해.', '휴, 땅이 제일 편하다.', '발끝에 뿌리 내릴 뻔했어.'],
    growth: ['네 덕분에 한 뼘 더 자랐어!', '씨앗에도 힘이 가득해.', '우리 같이 자라는 중이네.'],
    usage: ['오늘도 영양분이 쌓이고 있어.', '너의 노력이 씨앗에 닿았어.', '한 줄 한 줄, 새싹이 자라네.']
  },
  2: {
    petting: ['꽃봉오리도 너한테 인사하네.', '기분 좋아서 꽃이 피겠어!', '한 번 더 쓰다듬어 줄래?'],
    idle: ['꽃봉오리가 조금씩 열리고 있어.', '오늘도 활짝 피울 준비 중!', '햇살 좋은 자리를 찾고 있어.'],
    held: ['꽃봉오리가 눌리지 않게 부탁해!', '이 높이면 햇볕을 더 받겠네.', '조심해, 곧 꽃이 필 거야.'],
    falling: ['꽃봉오리부터 지켜야겠어!', '덩굴을 펼치기엔 너무 짧아!', '착지할 자리부터 찾아볼게!'],
    landing: ['봉오리도 나도 멀쩡해!', '살짝 흔들렸지만 괜찮아.', '다음엔 덩굴로 잡아줘.'],
    growth: ['활짝 필 날이 가까워졌어!', '너랑 있으면 더 잘 자라.', '이 꽃봉오리, 기대해도 좋아.'],
    usage: ['꽃봉오리에 힘이 차오르네.', '오늘의 노력도 잘 받았어.', '조금씩, 꾸준히 피워보자.']
  },
  3: {
    petting: ['네 손길에 꽃향기가 짙어졌구나.', '고맙다. 내 그늘에서 쉬어가렴.', '큰 꽃도 이런 인사가 좋단다.'],
    idle: ['잠깐 내 그늘에서 쉬어가.', '서두르지 않아도 꽃은 피어.', '오늘도 함께라서 든든하구나.'],
    held: ['제법 무거울 텐데 괜찮니?', '꽃까지 들려니 힘이 들겠구나.', '내 그늘도 함께 옮겨줄게.'],
    falling: ['꽃잎을 모으고 내려가마.', '땅아, 조금만 받아주렴.', '묵직하게 내려가는구나!'],
    landing: ['쿵. 이제 편히 쉬어도 돼.', '뿌리가 든든해야 꽃도 피지.', '잘 내려왔구나, 고맙다.'],
    growth: ['네 노력이 이렇게 꽃피었구나.', '큰 꽃도 작은 노력에서 시작해.', '함께한 시간이 꽃향기가 됐어.'],
    usage: ['오늘도 그늘이 넓어지고 있어.', '한 걸음씩 잘 해내고 있구나.', '고생했어. 잠깐 숨을 돌리렴.']
  },
  4: {
    petting: ['헤헤, 꼬리 불꽃도 반짝!', '따뜻하지? 나도 기분 좋아.', '네가 쓰다듬으면 힘이 나!'],
    idle: ['꼬리 불꽃은 오늘도 반짝!', '작은 불씨도 꽤 따뜻하지?', '네 옆에서 열심히 타오를게!'],
    held: ['꼬리는 조심해!', '우와! 불꽃이 흔들리잖아!', '너무 세게 흔들면 간지러워!'],
    falling: ['불꽃 꼭 지키고 내려갈게!', '아직 날개는 없는데에!', '뜨거운 착지 준비!'],
    landing: ['휴! 꼬리 불꽃도 멀쩡해.', '조금 놀랐지만 씩씩하게!', '다음엔 살짝만 내려줘.'],
    growth: ['내 불꽃이 더 커졌어!', '같이 더 뜨겁게 성장하자!', '네가 내 불씨를 키워줬어.'],
    usage: ['방금 노력, 따뜻하게 받았어!', '코딩 열정이 불꽃처럼 보여!', '오늘도 불씨를 하나 더 모았네.']
  },
  5: {
    petting: ['흠, 나쁘지 않은 손길인데?', '좋아. 불꽃도 부드러워졌어.', '강해져도 쓰다듬는 건 좋다니까.'],
    idle: ['다음 도전은 뭐야?', '내 불꽃은 아직 여유 있어.', '가만히 있어도 기운이 넘쳐.'],
    held: ['혼자서도 잘 걸을 수 있다고!', '이 정도 높이는 괜찮아.', '꼬리 쪽은 건드리지 마!'],
    falling: ['이 정도는 가볍게 착지하지!', '발부터 내려간다!', '뜨겁게 내려가 볼까!'],
    landing: ['봤지? 깔끔한 착지야.', '이 정도로 놀라진 않아.', '자, 다음 도전으로 가자.'],
    growth: ['이제 더 강하게 타오를 거야!', '우리 제법 잘 맞는데?', '이 기세로 끝까지 가보자!'],
    usage: ['좋아, 또 한 걸음 앞서갔어.', '이 정도 열정이면 충분해!', '어려운 것도 같이 돌파하자.']
  },
  6: {
    petting: ['날개보다 네 손길이 포근하네.', '고마워. 불꽃도 살짝 웃었어.', '이렇게 쉬는 시간도 좋구나.'],
    idle: ['네 작업을 든든하게 지켜볼게.', '가끔은 날개도 쉬어야 해.', '높이 날려면 쉬는 시간도 필요해.'],
    held: ['날개까지 들어주니 고마운걸.', '오늘은 네가 나를 태워주네.', '날개 펼칠 자리도 남겨줘!'],
    falling: ['날개를 접고 착지할게!', '아래쪽 자리 비워줘!', '큰 발로 안전하게 내려간다!'],
    landing: ['도착. 옆에서 계속 지켜볼게.', '날개도 발도 무사해.', '이 정도 착지는 익숙하지.'],
    growth: ['함께라면 더 높이 갈 수 있어.', '네 노력만큼 불꽃도 커졌어.', '이번 성장은 네 덕분이야.'],
    usage: ['좋아, 더 높이 갈 힘이 생겼어.', '오늘의 노력도 잘 기억할게.', '잠깐 쉬어도 불꽃은 꺼지지 않아.']
  },
  7: {
    petting: ['헤헤, 등껍질이 간질간질!', '쓰담쓰담, 물결처럼 기분 좋아.', '반짝반짝, 네 손길 덕분이야!'],
    idle: ['물 한 모금 마시고 할까?', '천천히 걸어도 도착할 수 있어!', '오늘도 등껍질은 반짝반짝.'],
    held: ['등껍질까지 쏙 들어 올렸네!', '공중 수영은 처음인데?', '잡았으면 살살 흔들어줘!'],
    falling: ['등껍질 모드, 준비!', '여기는 물이 아니잖아!', '발부터 내려가야지!'],
    landing: ['착지 성공! 물보라는 없네.', '등껍질 덕분에 든든해.', '휴, 다시 걸어볼까?'],
    growth: ['조금 더 씩씩해졌어!', '네 덕분에 등껍질도 든든해.', '같이 한 발짝 더 나아가자!'],
    usage: ['노력이 한 방울 더 모였네!', '한 방울씩 모으면 큰 바다가 돼.', '잘하고 있어! 물도 잊지 마.']
  },
  8: {
    petting: ['기분 좋아서 꼬리가 흔들려.', '귀까지 살살 쓰다듬어 줘.', '부드러운 물결 같은 손길이네.'],
    idle: ['귀를 쫑긋, 옆에서 듣고 있어.', '꼬리를 정리하고 다시 걸을게.', '꾸준히 가는 게 내 특기야.'],
    held: ['귀랑 꼬리는 살살 부탁해.', '높은 곳에서도 침착하게!', '등껍질을 잘 받쳐줬네.'],
    falling: ['균형 잡고 내려가는 중!', '꼬리까지 꼭 모았어!', '이번에도 침착하게 착지!'],
    landing: ['안전하게 도착했어.', '귀도 꼬리도 다 무사해.', '착지했으니 다시 같이 걷자.'],
    growth: ['꾸준히 함께한 보람이 있네.', '우리 한 단계 더 단단해졌어.', '이제 더 든든하게 곁에 있을게.'],
    usage: ['오늘도 차근차근 잘 가고 있어.', '네 노력이 물결처럼 이어지네.', '잠깐 정리하고 다음으로 가자.']
  },
  9: {
    petting: ['지원군도 쓰다듬으면 기운이 난다.', '고맙다. 등껍질까지 포근하군.', '든든한 친구에게 다정한 인사로군.'],
    idle: ['든든한 지원군, 여기 대기 중.', '힘들면 잠깐 쉬어도 괜찮아.', '큰 파도도 한 방울에서 시작해.'],
    held: ['묵직하지? 등껍질을 받쳐줘.', '대포는 안전하게 접어둘게.', '지원군도 가끔 옮겨줘야지.'],
    falling: ['착지 지점을 확인했다!', '대포 고정, 발부터 내려간다!', '묵직한 착지에 대비!'],
    landing: ['쿵. 안전하게 도착했다.', '지원군, 다시 대기 중.', '등껍질도 대포도 이상 없어.'],
    growth: ['함께 쌓은 힘이 이만큼 커졌어.', '네 노력을 든든하게 받아냈어.', '이제 더 큰 도전도 함께하자.'],
    usage: ['좋아, 한 걸음 더 전진했어.', '차곡차곡 힘을 모으고 있구나.', '오늘도 수고했어. 내가 지켜볼게.']
  }
}

export function pickDialogue(id: number | null, event: DialogueEvent, previous?: string, random = Math.random): string {
  const lines = (DIALOGUES[id ?? 0] ?? DIALOGUES[0])[event]
  const fresh = lines.filter(line => line !== previous)
  const choices = fresh.length ? fresh : lines
  return choices[Math.max(0, Math.min(choices.length - 1, Math.floor(random() * choices.length)))]
}

export interface Speech { text: string; event: DialogueEvent; until: number; summary: string | null }
const priorities: Record<DialogueEvent, number> = { idle: 1, usage: 2, growth: 3, held: 4, falling: 4, landing: 4, petting: 4 }
const cooldowns: Record<DialogueEvent, number> = { idle: 25_000, usage: 60_000, growth: 0, held: 0, falling: 0, landing: 0, petting: 0 }

export class DialogueDirector {
  private active: Speech | null = null
  private lastLines = new Map<string, string>()
  private lastTimes = new Map<DialogueEvent, number>()
  constructor(private random = Math.random, private now = Date.now) {}
  get current(): Speech | null { return this.active && this.active.until > this.now() ? this.active : null }
  clear(): void { this.active = null }
  say(id: number | null, event: DialogueEvent, summary: string | null = null): Speech | null {
    const now = this.now(), active = this.current
    if (active && priorities[active.event] > priorities[event]) return null
    if (now - (this.lastTimes.get(event) ?? -Infinity) < cooldowns[event]) return null
    const key = `${id ?? 0}:${event}`, text = pickDialogue(id, event, this.lastLines.get(key), this.random)
    this.lastLines.set(key, text); this.lastTimes.set(event, now)
    this.active = { text, event, summary, until: now + (event === 'growth' ? 6500 : event === 'falling' ? 3000 : 5000) }
    return this.active
  }
}
