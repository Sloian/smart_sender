import { describe, expect, test } from 'vitest'
import { isPlainLeftClick } from './plain-click'

const plainClick = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }

describe('isPlainLeftClick', () => {
  test('a left click with no modifiers is plain', () => {
    expect(isPlainLeftClick(plainClick)).toBe(true)
  })

  test('a middle click is not plain', () => {
    expect(isPlainLeftClick({ ...plainClick, button: 1 })).toBe(false)
  })

  test.each(['metaKey', 'ctrlKey', 'shiftKey', 'altKey'] as const)('a left click with %s is not plain', (modifier) => {
    expect(isPlainLeftClick({ ...plainClick, [modifier]: true })).toBe(false)
  })
})
