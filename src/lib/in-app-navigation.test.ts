import { describe, expect, test } from 'vitest'
import { createInAppNavigationCheck } from './in-app-navigation'

describe('createInAppNavigationCheck', () => {
  test('the first page shown is not an in-app navigation', () => {
    const isInAppNavigation = createInAppNavigationCheck()

    expect(isInAppNavigation('first')).toBe(false)
  })

  test('the same first key seen again, as in a StrictMode effect re-run, is still not a navigation', () => {
    const isInAppNavigation = createInAppNavigationCheck()
    isInAppNavigation('first')

    expect(isInAppNavigation('first')).toBe(false)
  })

  test('a different key is an in-app navigation', () => {
    const isInAppNavigation = createInAppNavigationCheck()
    isInAppNavigation('first')

    expect(isInAppNavigation('second')).toBe(true)
  })

  test('going back to the first key after a navigation is an in-app navigation', () => {
    const isInAppNavigation = createInAppNavigationCheck()
    isInAppNavigation('first')
    isInAppNavigation('second')

    expect(isInAppNavigation('first')).toBe(true)
  })
})
