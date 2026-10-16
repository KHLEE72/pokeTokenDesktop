import { FAMILIES } from '../src/shared/catalog'
import { eggFamilies, hatchFamilyWeight } from '../src/shared/game'

export const firstNormal = (): (() => number) => { let draw=0;return () => draw++ % 2 === 0 ? 0 : .5 }
export function hatchRandom(family: number, shiny = false): () => number {
  const choices=eggFamilies(FAMILIES[family].eggTypes[0])
  const before=choices.slice(0,choices.indexOf(family)).reduce((sum,id)=>sum+hatchFamilyWeight(id),0)
  const total=choices.reduce((sum,id)=>sum+hatchFamilyWeight(id),0)
  let draw=0
  return () => draw++ === 0 ? (before+hatchFamilyWeight(family)/2)/total : shiny ? 0 : .5
}
