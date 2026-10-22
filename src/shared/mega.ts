import { FORM_BY_ID, MEGA_FORMS, MEGA_STONES } from './catalog'
import { CANDY_XP, newAppearanceCollection } from './model'
import type { AppearanceCollection, GameState } from './model'

export const MEGA_CANDY_PRICE = 1000
export const appearanceCollection = (game:GameState):AppearanceCollection => game.appearances ?? newAppearanceCollection()
export const ensureAppearances = (game:GameState):AppearanceCollection => game.appearances ??= newAppearanceCollection()
export const collectedAppearance = (game:GameState,id:number,shiny?:boolean):boolean => {
  const forms=appearanceCollection(game)
  const normal=id>1025?forms.owned:game.owned,rare=id>1025?forms.ownedShiny:game.ownedShiny
  return shiny===true?rare.includes(id):shiny===false?normal.includes(id):normal.includes(id)||rare.includes(id)
}
export const megaOptions = (baseAppearanceId:number) => MEGA_FORMS.filter(f=>f.baseAppearanceId===baseAppearanceId)
export const stoneAvailable = (game:GameState,stone:string):boolean => MEGA_FORMS.some(f=>f.stone===stone&&collectedAppearance(game,f.baseAppearanceId!))
export const stonePrice = (game:GameState):number => appearanceCollection(game).freeMegaStoneUsed?MEGA_CANDY_PRICE:0
export function purchaseMegaStone(game:GameState,stone:string):void {
  if(!MEGA_STONES.some(s=>s.id===stone)||!stoneAvailable(game,stone))throw Error('메가진화할 포켓몬을 먼저 만나주세요.')
  const collection=ensureAppearances(game)
  if(collection.megaStones.includes(stone))throw Error('이미 영구 해금한 메가스톤입니다.')
  const price=stonePrice(game)*CANDY_XP
  if(game.candyTokens<price)throw Error('메가스톤을 구매할 사탕이 부족해요.')
  game.candyTokens-=price
  collection.megaStones.push(stone);collection.freeMegaStoneUsed=true
}
export function megaUnlocked(game:GameState,id:number):boolean {
  const form=FORM_BY_ID.get(id)
  return form?.kind==='mega'&&appearanceCollection(game).megaStones.includes(form.stone!)
}
