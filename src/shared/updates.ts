export type UpdateMode = 'installer' | 'download' | 'development'
export interface UpdateState {
  mode: UpdateMode
  status: 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'downloaded' | 'error'
  currentVersion: string
  version: string | null
  percent: number
  checkedAt: string | null
  error: string | null
}
export type UpdateAction = 'check' | 'download' | 'install' | 'open'
export const UPDATE_REPOSITORY = { owner: 'KHLEE72', repo: 'pokeTokenShimeji' } as const
export const RELEASES_URL = `https://github.com/${UPDATE_REPOSITORY.owner}/${UPDATE_REPOSITORY.repo}/releases`
