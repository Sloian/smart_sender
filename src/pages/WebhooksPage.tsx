import {
  Alert,
  Anchor,
  Badge,
  Button,
  CloseButton,
  EmptyState,
  Group,
  Loader,
  Pagination,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useDebouncedCallback } from '@mantine/hooks'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigationType, useSearchParams } from 'react-router'
import { editPath, FROM_LIST_STATE, listPath, listSearch, parseListParams, toSearchParams } from '../webhooks/list-params'
import { draftAfterNavigation, isOwnSearchCommit, searchCommitNavigation } from '../webhooks/search-history'
import { webhookListQuery, webhookListView } from '../webhooks/webhook-queries'

const SEARCH_DEBOUNCE_MS = 300

export function WebhooksPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigationType = useNavigationType()
  const params = parseListParams(searchParams)
  const { data, error, isPlaceholderData, isFetching, refetch } = useQuery(webhookListQuery(params))
  const view = webhookListView({ data, error, isPlaceholderData, page: params.page })
  const [draft, setDraft] = useState<string | null>(null)
  const [locationKey, setLocationKey] = useState(location.key)

  if (locationKey !== location.key) {
    setLocationKey(location.key)
    setDraft(draftAfterNavigation(draft, params.search, isOwnSearchCommit(location.state, locationKey, navigationType)))
  }

  const searchValue = draft ?? params.search

  function commitSearch(value: string, typed: boolean) {
    if (value === params.search) return
    const next = { page: 1, search: value }
    setSearchParams(toSearchParams(next), searchCommitNavigation(location, navigationType, listSearch(next), typed))
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

  return (
    <Stack>
      <Title order={2}>Webhooks</Title>
      <TextInput
        aria-label="Search webhooks by name"
        placeholder="Search by name"
        value={searchValue}
        onChange={(event) => {
          changeSearch(event.currentTarget.value)
        }}
        rightSectionPointerEvents="all"
        rightSection={searchValue === '' ? null : <CloseButton aria-label="Clear search" onClick={clearSearch} />}
      />
      {view.kind === 'loading' && (
        <Stack role="status" align="center" py="xl">
          <Loader />
          <Text>Loading webhooks…</Text>
        </Stack>
      )}
      {view.kind === 'error' && (
        <Alert color="red" title="Could not load webhooks">
          <Stack align="flex-start">
            <Text size="sm">{view.message}</Text>
            <Button
              variant="light"
              color="red"
              loading={isFetching}
              onClick={() => {
                void refetch()
              }}
            >
              Retry
            </Button>
          </Stack>
        </Alert>
      )}
      {view.kind === 'empty' && (
        <EmptyState
          title="No webhooks found"
          description={
            params.search === '' ? 'There are no webhooks yet.' : `No webhook names contain “${params.search}”.`
          }
        >
          {params.search !== '' && (
            <EmptyState.Actions>
              <Button variant="default" onClick={clearSearch}>
                Show all webhooks
              </Button>
            </EmptyState.Actions>
          )}
        </EmptyState>
      )}
      {view.kind === 'out-of-range' && (
        <EmptyState
          title="Page not found"
          description={`Page ${params.page} does not exist. The last page is ${view.lastPage}.`}
        >
          <EmptyState.Actions>
            <Button component={Link} to={listPath({ ...params, page: view.lastPage })} replace variant="default">
              Go to page {view.lastPage}
            </Button>
          </EmptyState.Actions>
        </EmptyState>
      )}
      {view.kind === 'rows' && (
        <>
          <Table.ScrollContainer minWidth={640}>
            <Table aria-busy={isPlaceholderData || undefined} style={{ opacity: isPlaceholderData ? 0.6 : 1 }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>URL</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {view.rows.map((webhook) => (
                  <Table.Tr key={webhook.id}>
                    <Table.Td>
                      <Anchor component={Link} to={editPath(webhook.id, params)} state={FROM_LIST_STATE}>
                        {webhook.name}
                      </Anchor>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" ff="monospace" truncate>
                        {webhook.url}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {webhook.active ? (
                        <Badge color="green" variant="light">
                          Active
                        </Badge>
                      ) : (
                        <Badge color="gray" variant="light">
                          Inactive
                        </Badge>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              {`Showing ${view.from}–${view.to} of ${view.total}`}
            </Text>
            <Pagination
              total={view.lastPage}
              value={params.page}
              onChange={(page) => {
                setSearchParams(toSearchParams({ ...params, page }))
              }}
              hideWithOnePage
            />
          </Group>
        </>
      )}
    </Stack>
  )
}
