import { redirect, type LoaderFunctionArgs } from 'react-router'
import { isRecord } from '../lib/is-record'

export interface ListParams {
  page: number
  search: string
}

export const WEBHOOKS_PATH = '/webhooks'

const PAGE_PARAM = 'page'
const SEARCH_PARAM = 'search'
const POSITIVE_INT_PATTERN = /^[1-9]\d*$/

export const FIRST_PAGE = 1

function parsePositiveInt(value: string | null | undefined): number | null {
  if (!value) return null
  if (!POSITIVE_INT_PATTERN.test(value)) return null
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) return null
  return parsed
}

export function parseListParams(searchParams: URLSearchParams): ListParams {
  const rawPage = searchParams.get(PAGE_PARAM)
  return {
    page: parsePositiveInt(rawPage) ?? FIRST_PAGE,
    search: searchParams.get(SEARCH_PARAM) ?? '',
  }
}

export function toSearchParams({ page, search }: ListParams): URLSearchParams {
  const params = new URLSearchParams()
  if (page > FIRST_PAGE) params.set(PAGE_PARAM, String(page))
  if (search !== '') params.set(SEARCH_PARAM, search)
  return params
}

export function listSearch(params: ListParams): string {
  const query = toSearchParams(params).toString()
  if (query === '') return ''
  return `?${query}`
}

export function listPath(params: ListParams): string {
  return WEBHOOKS_PATH + listSearch(params)
}

export function editPath(id: number, params: ListParams): string {
  return `${WEBHOOKS_PATH}/${id}${listSearch(params)}`
}

export const FROM_LIST_STATE = { fromList: true } as const

export function isFromList(state: unknown): boolean {
  if (!isRecord(state)) return false
  return state.fromList === true
}

export function parseWebhookId(value: string | undefined): number | null {
  return parsePositiveInt(value)
}

export function canonicalListTarget(url: URL): string | null {
  const params = parseListParams(url.searchParams)
  const expected = listSearch(params)
  if (url.search === expected) return null
  return WEBHOOKS_PATH + expected
}

export function canonicalListUrl({ request }: LoaderFunctionArgs): Response | null {
  const requestedUrl = new URL(request.url)
  const target = canonicalListTarget(requestedUrl)
  if (target === null) return null
  return redirect(target)
}
