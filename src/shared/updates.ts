export type UpdateMode = 'installer' | 'portable' | 'download' | 'development'
export interface UpdateState {
  mode: UpdateMode
  status: 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'error'
  currentVersion: string
  version: string | null
  percent: number
  checkedAt: string | null
  error: string | null
}
export type UpdateAction = 'check' | 'download' | 'install' | 'apply' | 'open'
export const UPDATE_REPOSITORY = { owner: 'KHLEE72', repo: 'pokeTokenDesktop' } as const
export const RELEASES_URL = `https://github.com/${UPDATE_REPOSITORY.owner}/${UPDATE_REPOSITORY.repo}/releases`
