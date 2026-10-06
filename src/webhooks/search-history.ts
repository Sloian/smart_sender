import { NavigationType } from 'react-router'
import { isRecord } from '../lib/is-record'

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
  if (!isRecord(state)) return null
  const commit = state.searchCommit
  if (!isRecord(commit)) return null
  const { from, origin } = commit
  if (typeof from !== 'string') return null
  if (typeof origin !== 'string') return null
  return { from, origin }
}

function previousCommit(current: CurrentEntry, navigationType: NavigationType, typed: boolean): SearchCommit | null {
  if (!typed) return null
  if (navigationType === NavigationType.Pop) return null
  return searchCommitOf(current.state)
}

export function searchCommitNavigation(
  current: CurrentEntry,
  navigationType: NavigationType,
  target: string,
  typed: boolean,
): SearchCommitNavigation {
  const previous = previousCommit(current, navigationType, typed)
  if (previous !== null && target !== previous.origin) {
    return { replace: true, state: { searchCommit: { from: current.key, origin: previous.origin } } }
  }
  return { replace: false, state: { searchCommit: { from: current.key, origin: current.search } } }
}

export function isOwnSearchCommit(state: unknown, previousKey: string, navigationType: NavigationType): boolean {
  if (navigationType === NavigationType.Pop) return false
  const commit = searchCommitOf(state)
  if (commit === null) return false
  return commit.from === previousKey
}

export function draftAfterNavigation(draft: string | null, search: string, ownCommit: boolean): string | null {
  if (!ownCommit) return null
  if (draft === search) return null
  return draft
}
