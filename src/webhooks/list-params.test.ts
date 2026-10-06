import { describe, expect, test } from 'vitest'
import {
  canonicalListTarget,
  editPath,
  listPath,
  listSearch,
  parseListParams,
  parseWebhookId,
  toSearchParams,
  WEBHOOKS_PATH,
  type ListParams,
} from './list-params'

const parse = (query: string) => parseListParams(new URLSearchParams(query))

describe('parseListParams', () => {
  test.each([
    ['', 1],
    ['page=', 1],
    ['page=0', 1],
    ['page=-1', 1],
    ['page=1.5', 1],
    ['page=abc', 1],
    ['page=2abc', 1],
    ['page=%202', 1],
    ['page=02', 1],
    ['page=9007199254740993', 1],
    ['page=2', 2],
    ['page=10', 10],
  ])('%j gives page %i', (query, page) => {
    expect(parse(query).page).toBe(page)
  })

  test.each([
    ['', ''],
    ['search=hook', 'hook'],
    ['search=%20%20lead%20%20', '  lead  '],
    ['search=a%26b', 'a&b'],
  ])('%j gives search %j', (query, search) => {
    expect(parse(query).search).toBe(search)
  })
})

const samples: [ListParams, string][] = [
  [{ page: 1, search: '' }, ''],
  [{ page: 2, search: '' }, '?page=2'],
  [{ page: 1, search: 'hook' }, '?search=hook'],
  [{ page: 2, search: 'hook' }, '?page=2&search=hook'],
  [{ page: 1, search: 'a&b c' }, '?search=a%26b+c'],
]

describe('listSearch', () => {
  test.each(samples)('%j serializes to %j', (params, expected) => {
    expect(listSearch(params)).toBe(expected)
  })

  test.each(samples)('%j round trips', (params) => {
    const parsed = parseListParams(new URLSearchParams(listSearch(params)))
    expect(parsed).toEqual(params)
    expect(listSearch(parsed)).toBe(listSearch(params))
  })

  test('toSearchParams puts page before search', () => {
    expect([...toSearchParams({ page: 3, search: 'x' }).keys()]).toEqual(['page', 'search'])
  })
})

describe('paths', () => {
  test('list paths', () => {
    expect(WEBHOOKS_PATH).toBe('/webhooks')
    expect(listPath({ page: 2, search: 'hook' })).toBe('/webhooks?page=2&search=hook')
    expect(listPath({ page: 1, search: '' })).toBe('/webhooks')
  })

  test('edit paths keep the list params', () => {
    expect(editPath(5, { page: 2, search: 'hook' })).toBe('/webhooks/5?page=2&search=hook')
    expect(editPath(5, { page: 1, search: '' })).toBe('/webhooks/5')
  })
})

describe('parseWebhookId', () => {
  test.each([
    ['5', 5],
    ['12', 12],
  ])('%j gives %i', (value, id) => {
    expect(parseWebhookId(value)).toBe(id)
  })

  test.each([undefined, '', '0', '-3', 'abc', '5abc', '1.5', '05', '../auth', '9007199254740993'])(
    '%j gives null',
    (value) => {
      expect(parseWebhookId(value)).toBeNull()
    },
  )
})

describe('canonicalListTarget', () => {
  const target = (path: string) => canonicalListTarget(new URL(path, 'http://localhost'))

  test.each([
    ['/webhooks?page=2&search=hook', null],
    ['/webhooks', null],
    ['/webhooks?page=1', '/webhooks'],
    ['/webhooks?page=abc&search=hook', '/webhooks?search=hook'],
    ['/webhooks?search=hook&page=2', '/webhooks?page=2&search=hook'],
    ['/webhooks?search=', '/webhooks'],
    ['/webhooks?page=2&foo=1', '/webhooks?page=2'],
  ])('%j gives %j', (path, expected) => {
    expect(target(path)).toBe(expected)
  })

  test('the canonical target is itself canonical', () => {
    const first = target('/webhooks?foo=1&search=a%26b&page=02')
    expect(first).toBe('/webhooks?search=a%26b')
    expect(target(first ?? '')).toBeNull()
  })
})
