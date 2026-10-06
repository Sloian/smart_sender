import { NavigationType } from 'react-router'

interface SearchCommit {
  from: string
}

export interface SearchCommitState {
  searchCommit: SearchCommit
}

function searchCommitOf(state: unknown): SearchCommit | null {
  if (typeof state !== 'object' || state === null || !('searchCommit' in state)) return null
  const commit = state.searchCommit
  if (typeof commit !== 'object' || commit === null || !('from' in commit) || typeof commit.from !== 'string') {
    return null
  }
  return { from: commit.from }
}

export function searchCommitState(fromKey: string): SearchCommitState {
  return { searchCommit: { from: fromKey } }
}

export function isOwnSearchCommit(state: unknown, previousKey: string, navigationType: NavigationType): boolean {
  return navigationType !== NavigationType.Pop && searchCommitOf(state)?.from === previousKey
}

export function draftAfterNavigation(draft: string | null, search: string, ownCommit: boolean): string | null {
  return ownCommit && draft !== search ? draft : null
}
