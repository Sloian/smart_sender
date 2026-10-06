import { NavigationType } from 'react-router'
import { describe, expect, test } from 'vitest'
import { draftAfterNavigation, isOwnSearchCommit, searchCommitState } from './search-history'

describe('isOwnSearchCommit', () => {
  test('a push or replace carrying a commit from the previous location is own', () => {
    expect(isOwnSearchCommit(searchCommitState('k1'), 'k1', NavigationType.Push)).toBe(true)
    expect(isOwnSearchCommit(searchCommitState('k1'), 'k1', NavigationType.Replace)).toBe(true)
  })

  test('back or forward onto a committed entry is not own', () => {
    expect(isOwnSearchCommit(searchCommitState('k1'), 'k1', NavigationType.Pop)).toBe(false)
  })

  test('a commit made from another location is not own', () => {
    expect(isOwnSearchCommit(searchCommitState('k0'), 'k1', NavigationType.Push)).toBe(false)
  })

  test('a navigation without commit state is not own', () => {
    expect(isOwnSearchCommit(null, 'k1', NavigationType.Push)).toBe(false)
    expect(isOwnSearchCommit({ fromList: true }, 'k1', NavigationType.Push)).toBe(false)
    expect(isOwnSearchCommit({ searchCommit: { from: 1 } }, 'k1', NavigationType.Push)).toBe(false)
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
