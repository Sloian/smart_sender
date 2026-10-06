import { NavigationType } from 'react-router'

interface SearchCommit {
  from: string
  origin: string
}

export interface SearchCommitState {
  searchCommit: SearchCommit
}

export interface SearchCommitNavigation {
  replace: boolean
  state: SearchCommitState
}

interface CurrentEntry {
  key: string
  search: string
  state: unknown
}

function searchCommitOf(state: unknown): SearchCommit | null {
  if (typeof state !== 'object' || state === null || !('searchCommit' in state)) return null
  const commit = state.searchCommit
  if (typeof commit !== 'object' || commit === null || !('from' in commit) || !('origin' in commit)) return null
  const { from, origin } = commit
  return typeof from === 'string' && typeof origin === 'string' ? { from, origin } : null
}

export function searchCommitNavigation(
  current: CurrentEntry,
  navigationType: NavigationType,
  target: string,
  typed: boolean,
): SearchCommitNavigation {
  const previous = typed && navigationType !== NavigationType.Pop ? searchCommitOf(current.state) : null
  const replace = previous !== null && target !== previous.origin
  const origin = replace ? previous.origin : current.search
  return { replace, state: { searchCommit: { from: current.key, origin } } }
}

export function isOwnSearchCommit(state: unknown, previousKey: string, navigationType: NavigationType): boolean {
  return navigationType !== NavigationType.Pop && searchCommitOf(state)?.from === previousKey
}

export function draftAfterNavigation(draft: string | null, search: string, ownCommit: boolean): string | null {
  return ownCommit && draft !== search ? draft : null
}
