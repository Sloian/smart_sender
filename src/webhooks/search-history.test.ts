import { NavigationType } from 'react-router'
import { describe, expect, test } from 'vitest'
import { draftAfterNavigation, isOwnSearchCommit, searchCommitNavigation } from './search-history'

const commit = (from: string, origin = '') => ({ searchCommit: { from, origin } })

describe('searchCommitNavigation', () => {
  const entry = (search: string, state: unknown = null) => ({ key: 'k1', search, state })

  test('the first typed commit pushes and remembers where the search started', () => {
    expect(searchCommitNavigation(entry('?page=3'), NavigationType.Push, '?search=we', true)).toEqual({
      replace: false,
      state: commit('k1', '?page=3'),
    })
  })

  test('a typed commit on top of an own commit replaces it and keeps the origin', () => {
    const current = entry('?search=we', commit('k0', '?page=3'))

    expect(searchCommitNavigation(current, NavigationType.Push, '?search=web', true)).toEqual({
      replace: true,
      state: commit('k1', '?page=3'),
    })
    expect(searchCommitNavigation(current, NavigationType.Replace, '?search=webh', true).replace).toBe(true)
  })

  test('a typed commit back to the origin pushes instead of duplicating the entry before it', () => {
    const current = entry('?search=we', commit('k0', ''))

    expect(searchCommitNavigation(current, NavigationType.Replace, '', true)).toEqual({
      replace: false,
      state: commit('k1', '?search=we'),
    })
  })

  test('a typed commit on an entry reached by back or forward pushes', () => {
    const current = entry('?search=lead', commit('k0', '?page=3'))

    expect(searchCommitNavigation(current, NavigationType.Pop, '?search=order', true)).toEqual({
      replace: false,
      state: commit('k1', '?search=lead'),
    })
  })

  test('clearing the search pushes', () => {
    const current = entry('?search=zzz', commit('k0', '?page=3'))

    expect(searchCommitNavigation(current, NavigationType.Push, '', false)).toEqual({
      replace: false,
      state: commit('k1', '?search=zzz'),
    })
  })

  test('foreign or malformed state starts a new search', () => {
    for (const state of [{ fromList: true }, { searchCommit: { from: 'k0' } }, { searchCommit: { from: 1, origin: '' } }]) {
      expect(searchCommitNavigation(entry('?page=2', state), NavigationType.Push, '?search=a', true).replace).toBe(false)
    }
  })
})

describe('isOwnSearchCommit', () => {
  test('a push or replace carrying a commit from the previous location is own', () => {
    expect(isOwnSearchCommit(commit('k1'), 'k1', NavigationType.Push)).toBe(true)
    expect(isOwnSearchCommit(commit('k1'), 'k1', NavigationType.Replace)).toBe(true)
  })

  test('back or forward onto a committed entry is not own', () => {
    expect(isOwnSearchCommit(commit('k1'), 'k1', NavigationType.Pop)).toBe(false)
  })

  test('a commit made from another location is not own', () => {
    expect(isOwnSearchCommit(commit('k0'), 'k1', NavigationType.Push)).toBe(false)
  })

  test('a navigation without commit state is not own', () => {
    expect(isOwnSearchCommit(null, 'k1', NavigationType.Push)).toBe(false)
    expect(isOwnSearchCommit({ fromList: true }, 'k1', NavigationType.Push)).toBe(false)
    expect(isOwnSearchCommit({ searchCommit: { from: 1, origin: '' } }, 'k1', NavigationType.Push)).toBe(false)
    expect(isOwnSearchCommit({ searchCommit: null }, 'k1', NavigationType.Push)).toBe(false)
  })
})

describe('draftAfterNavigation', () => {
  test('a foreign navigation drops the draft so the input shows the url', () => {
    expect(draftAfterNavigation('ab', '', false)).toBeNull()
    expect(draftAfterNavigation('q', '', false)).toBeNull()
  })

  test('an own commit drops a draft it already committed', () => {
    expect(draftAfterNavigation('ab', 'ab', true)).toBeNull()
  })

  test('an own commit keeps text typed while it was in flight', () => {
    expect(draftAfterNavigation('abc', 'ab', true)).toBe('abc')
  })

  test('no draft stays no draft', () => {
    expect(draftAfterNavigation(null, 'ab', true)).toBeNull()
  })
})
