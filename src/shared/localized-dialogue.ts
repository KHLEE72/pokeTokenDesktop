import type { Language } from './i18n'
import type { DialogueEvent } from './dialogue'
import { characterDialogue } from './character-dialogue'

export function localizedDialogue(id:number|null,event:DialogueEvent,language:Exclude<Language,'ko'>):readonly string[]{
  const species=characterDialogue(id,event,language)
  if(species)return species
  {
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
}
