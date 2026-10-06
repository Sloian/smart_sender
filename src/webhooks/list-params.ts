import { redirect, type LoaderFunctionArgs } from 'react-router'

export interface ListParams {
  page: number
  search: string
}

export const WEBHOOKS_PATH = '/webhooks'

const PAGE_PARAM = 'page'
const SEARCH_PARAM = 'search'
const FIRST_PAGE = 1

function parsePositiveInt(value: string | null | undefined): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function parseListParams(searchParams: URLSearchParams): ListParams {
  return {
    page: parsePositiveInt(searchParams.get(PAGE_PARAM)) ?? FIRST_PAGE,
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
  return query ? `?${query}` : ''
}

export function listPath(params: ListParams): string {
  return WEBHOOKS_PATH + listSearch(params)
}

export function editPath(id: number, params: ListParams): string {
  return `${WEBHOOKS_PATH}/${encodeURIComponent(String(id))}${listSearch(params)}`
}

export function parseWebhookId(value: string | undefined): number | null {
  return parsePositiveInt(value)
}

export function canonicalListTarget(url: URL): string | null {
  const expected = listSearch(parseListParams(url.searchParams))
  return url.search === expected ? null : WEBHOOKS_PATH + expected
}

export function canonicalListUrl({ request }: LoaderFunctionArgs): Response | null {
  const target = canonicalListTarget(new URL(request.url))
  return target === null ? null : redirect(target)
}
