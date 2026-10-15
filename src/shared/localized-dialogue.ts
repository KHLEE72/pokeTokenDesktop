import { POKEMON } from './catalog'
import { Language, pokemonName } from './i18n'
import type { DialogueEvent } from './dialogue'

// Original, offline dialogue. Each profile supplies species-specific details;
// the remaining example roster uses its primary type's personality.
const profiles: Record<number, [string, string, string, string, string, string]> = {
  1: ['A little sunlight for my bulb?', 'Mind the bulb when you lift me!', 'My bulb feels warm and happy.', '背中のタネにも日なたぼっこ！', 'タネをぶつけないように持ってね！', 'タネまでぽかぽかしてきたよ。'],
  2: ['My bud is getting ready to bloom.', 'Careful with the bud on my back!', 'Even my bud seems pleased.', 'つぼみも開く準備をしているよ。', '背中のつぼみはそっとね！', 'つぼみも喜んでいるみたい。'],
  3: ['Take a break in my flower’s shade.', 'Leave a little room for my flower.', 'My flower enjoys a gentle pat too.', '花のかげで少し休もう。', '背中の花の分も場所を空けてね。', '花もやさしい手が好きみたい。'],
  4: ['My tail flame is cheering you on!', 'Keep my tail flame clear!', 'My flame is dancing with joy!', 'しっぽの炎も応援しているよ！', 'しっぽの炎に気をつけてね！', 'うれしくて炎もゆれているよ！'],
  5: ['Ready for a fiery challenge?', 'Easy on the tail, all right?', 'Even a tough flame needs a soft touch.', '次の挑戦も熱くいこう！', 'しっぽはそっと頼むよ！', '強い炎にもやさしい手はいいね。'],
  6: ['Resting my wings beside you.', 'Room for my wings, please!', 'Your hand is warmer than sunshine.', '翼を休めて、そばにいるよ。', '翼を広げる場所も空けてね！', '日なたみたいにあたたかい手だね。'],
  7: ['A sip of water before we start?', 'A little support under my shell!', 'Hehe, my shell tickles!', '始める前にお水をひと口どう？', 'こうらも支えて持ってね！', 'えへへ、こうらがくすぐったい！'],
  8: ['Ears up! I’m listening.', 'Gently with my ears and tail.', 'My tail is swishing happily.', '耳をすませて聞いているよ。', '耳としっぽはそっとお願いね。', 'うれしくてしっぽが動いちゃう。'],
  9: ['Your sturdy backup is standing by.', 'I’ll keep my cannons tucked away.', 'Even your backup enjoys a pat.', '頼れる助っ人、ここで待機中。', '大砲は安全にしまっておくよ。', '助っ人だってなでられると元気になるよ。'],
  133: ['So many paths ahead of us!', 'My fluffy collar needs room too!', 'My fluffy collar feels extra cozy.', 'これからどんな道に進もうかな！', 'ふわふわのえりも一緒に持ってね！', 'えりまでふわっとあたたかいよ。'],
  134: ['Let’s take it one gentle wave at a time.', 'My fin is delicate. Easy does it!', 'That feels like a gentle ripple.', 'やさしい波みたいに進もう。', 'ひれはやさしく持ってね！', 'おだやかな波みたいで気持ちいい。'],
  135: ['A little spark for your next idea!', 'Watch out for my spiky fur!', 'I’ll keep the sparks down for you.', '次のひらめきに、ひとつ火花を！', 'とがった毛には気をつけて！', '静電気はひかえめにしておくね。'],
  136: ['My fluffy fur makes a cozy break.', 'My warm fur is coming along too!', 'Warm fur, warm heart.', 'ふわふわの毛でひと休みしよう。', 'あたたかい毛ごと運んでね！', '毛も心もぽかぽかだよ。'],
  196: ['My forked tail says a good idea is near.', 'I can sense where we’re going.', 'My gem feels a little brighter.', 'しっぽがいいひらめきを感じているよ。', '向かう場所はなんとなくわかるよ。', 'おでこの玉まで明るくなったみたい。'],
  197: ['I’ll keep you company in the quiet.', 'My rings will light the way.', 'My rings are glowing softly.', '静かな時間もそばにいるよ。', '輪っかの光で道を照らすね。', '輪っかもやさしく光っているよ。'],
  470: ['A little sunlight recharges my leaves.', 'Please keep my leaves unfolded.', 'My leaves are rustling happily.', '日差しで葉っぱも元気になるよ。', '葉っぱが折れないように持ってね。', 'うれしくて葉っぱがそよそよ。'],
  471: ['A cool breeze for a busy day.', 'My icy ears need a gentle touch.', 'Even ice can feel warm inside.', '忙しい日にひんやりした風を。', '氷の耳はそっとお願いね。', '心の中はぽかぽかしているよ。'],
  700: ['My feelers are cheering for you!', 'Don’t tangle my ribbonlike feelers!', 'My feelers can feel your kindness.', '触角もひらひら、応援しているよ！', 'リボンみたいな触角をからませないでね！', '触角にもやさしさが伝わるよ。']
}
const typeLines: Record<string, [string, string]> = {
  normal: ['A quiet break is nice too.', 'のんびりするのもいいね。'], fire: ['Let’s keep that little spark alive!', '小さな炎を大切にしよう！'],
  water: ['Little drops add up to an ocean.', '一滴ずつ集めれば大きな海になるよ。'], electric: ['I feel a bright idea coming!', 'ぴかっとひらめきそう！'],
  grass: ['A little sunshine does us good.', '少し日差しを浴びようよ。'], ice: ['Time for a cool little break.', 'ひんやり、ひと休みしよう。'],
  fighting: ['One steady step at a time!', '一歩ずつ、元気にいこう！'], poison: ['Careful and steady wins the day.', '慎重に、着実に進もう。'],
  ground: ['We’re building on solid ground.', '足元を固めて進もう。'], flying: ['A little breeze clears the mind.', 'そよ風で気分もすっきり。'],
  psychic: ['Take a breath. Focus will follow.', 'ひと呼吸すれば、集中できるよ。'], bug: ['Little efforts make a big difference.', '小さな努力も大きな力になるよ。'],
  rock: ['I’m a steady friend to lean on.', 'どっしり、そばで支えるよ。'], ghost: ['Just quietly keeping you company.', 'そっと、そばにいるよ。'],
  dragon: ['Even big dreams start small.', '大きな夢も小さな一歩から。'], dark: ['The quiet helps me think.', '静かな時間は考えごとにぴったり。'],
  steel: ['We’re getting stronger together.', '一緒にもっと強くなろう。'], fairy: ['A little sparkle for your day!', '今日も小さなきらめきを！']
}
export function localizedDialogue(id: number | null, event: DialogueEvent, language: Exclude<Language, 'ko'>): readonly string[] {
  const p = POKEMON.find(p => p.id === id)
  if (!p) {
    const egg = language === 'en' ? {
      idle: ['Something is stirring in here…', 'I can hear you working!', 'A little warmth, a little patience.'],
      held: ['A gentle lift, please!', 'I’m coming along too!', 'Keep my shell safe!'],
      falling: ['Hold on, little shell!', 'Coming down!', 'Please be a soft landing!'],
      landing: ['Safe and snug again.', 'Not a crack!', 'Back to warming up.'],
      growth: ['Is it time to say hello?', 'A new friend is on the way!', 'Your work brought me closer!'],
      usage: ['A little closer to hatching!', 'That felt warm!', 'Growing quietly in here.'],
      petting: ['A tiny tap from inside!', 'I felt that!', 'Hello from my little shell!']
    } : {
      idle: ['中でなにかが動いたみたい…', 'がんばっている音が聞こえるよ！', 'あたたかくして、もう少し待ってね。'],
      held: ['そっと持ってね！', '一緒に移動するよ！', 'からを守ってね！'],
      falling: ['からよ、がんばれ！', '下におりるよ！', 'やわらかく着地したいな！'],
      landing: ['またあたたかくなったよ。', 'ひびは入っていないよ！', 'もう少し、ぬくぬくしよう。'],
      growth: ['そろそろ会えるかな？', '新しい仲間がやってくるよ！', '会える日が近づいたね！'],
      usage: ['孵化まで少し近づいたよ！', '今の、あたたかかった！', '中で少しずつ育っているよ。'],
      petting: ['中からこつん、お返事！', 'ちゃんと伝わったよ！', 'からの中から、こんにちは！']
    }
    return egg[event]
  }
  const profile = profiles[p.id], japanese = language === 'ja', name = pokemonName(p.id, language)
  const idle = profile?.[japanese ? 3 : 0] ?? typeLines[p.types[0]][japanese ? 1 : 0]
  const held = profile?.[japanese ? 4 : 1] ?? (japanese ? `${name}もそっと持ってね！` : `Lift ${name} gently, please!`)
  const pat = profile?.[japanese ? 5 : 2] ?? (japanese ? 'やさしくなでてくれてありがとう！' : 'Thanks for that gentle pat!')
  const lines = japanese ? {
    idle: [idle, `${name}もそばにいるよ。`, '疲れたら一緒に少し休もう。'],
    held: [held, 'ここからだとよく見えるね！', 'どこに連れていってくれるの？'],
    falling: ['足から着地、準備！', `${name}、下におりるよ！`, '着地点を見つけたよ！'],
    landing: ['無事に到着したよ！', 'ふう、少し息を整えよう。', 'また一緒に歩こう！'],
    growth: [`${name}、また一歩成長したよ！`, '君のがんばりが力になったよ。', 'これからも一緒に進もう！'],
    usage: ['今日のがんばりも受け取ったよ！', `${name}も応援しているよ！`, '少しずつ積み重ねていこう。'],
    petting: [pat, 'こうしてそばにいられるとうれしい。', `${name}からも、ありがとう！`]
  } : {
    idle: [idle, `${name} is right here with you.`, 'We can take a little break together.'],
    held: [held, 'What a view from up here!', 'Where are we going together?'],
    falling: ['Feet first. Ready to land!', `${name}, coming down!`, 'I found a place to land!'],
    landing: ['Made it safely!', 'Phew, a little breather.', 'Let’s walk together again!'],
    growth: [`${name} grew a little more!`, 'Your hard work made me stronger.', 'Let’s keep growing together!'],
    usage: ['I felt your hard work today!', `${name} is cheering you on!`, 'Little by little, it all adds up.'],
    petting: [pat, 'It feels good to be here with you.', `A little thank-you from ${name}!`]
  }
  return lines[event]
}
