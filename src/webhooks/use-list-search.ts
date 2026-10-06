import { useDebouncedCallback } from '@mantine/hooks'
import { useEffect, useState } from 'react'
import { useLocation, useNavigationType, useSearchParams } from 'react-router'
import { FIRST_PAGE, listSearch, toSearchParams, type ListParams } from './list-params'
import { draftAfterNavigation, isOwnSearchCommit, searchCommitNavigation } from './search-history'

const SEARCH_DEBOUNCE_MS = 300

export interface ListSearch {
  searchValue: string
  changeSearch: (value: string) => void
  clearSearch: () => void
}

export function useListSearch(committedSearch: string): ListSearch {
  const [, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigationType = useNavigationType()
  const [draft, setDraft] = useState<string | null>(null)
  const [locationKey, setLocationKey] = useState(location.key)

  if (locationKey !== location.key) {
    const ownCommit = isOwnSearchCommit(location.state, locationKey, navigationType)
    const nextDraft = draftAfterNavigation(draft, committedSearch, ownCommit)
    setLocationKey(location.key)
    setDraft(nextDraft)
  }

  const searchValue = draft ?? committedSearch

  function commitSearch(value: string, typed: boolean) {
    if (value === committedSearch) return
    const next: ListParams = { page: FIRST_PAGE, search: value }
    const target = listSearch(next)
    const navigation = searchCommitNavigation(location, navigationType, target, typed)
    const nextParams = toSearchParams(next)
    setSearchParams(nextParams, navigation)
  }

  const debouncedCommit = useDebouncedCallback(() => {
    if (draft !== null) commitSearch(draft, true)
  }, SEARCH_DEBOUNCE_MS)

  useEffect(() => {
    if (draft === null) debouncedCommit.cancel()
  }, [draft, debouncedCommit])

  function changeSearch(value: string) {
    setDraft(value)
    debouncedCommit()
  }

  function clearSearch() {
    debouncedCommit.cancel()
    setDraft('')
    commitSearch('', false)
  }

  return { searchValue, changeSearch, clearSearch }
}
