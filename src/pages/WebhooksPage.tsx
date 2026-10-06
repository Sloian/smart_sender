import {
  Anchor,
  Badge,
  Button,
  CloseButton,
  EmptyState,
  Group,
  Pagination,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { LoadError } from '../components/LoadError'
import { LoadingState } from '../components/LoadingState'
import {
  editPath,
  FIRST_PAGE,
  FROM_LIST_STATE,
  listPath,
  parseListParams,
  toSearchParams,
  type ListParams,
} from '../webhooks/list-params'
import { useListSearch } from '../webhooks/use-list-search'
import { webhookListQuery, webhookListView, type WebhookListView } from '../webhooks/webhook-queries'

type RowsView = Extract<WebhookListView, { kind: 'rows' }>

export function WebhooksPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const params = parseListParams(searchParams)
  const { data, error, isPlaceholderData, isFetching, refetch } = useQuery(webhookListQuery(params))
  const view = webhookListView({ data, error, isPlaceholderData, page: params.page })
  const { searchValue, changeSearch, clearSearch } = useListSearch(params.search)

  function retry() {
    void refetch()
  }

  function changePage(page: number) {
    const next = toSearchParams({ ...params, page })
    setSearchParams(next)
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
        rightSection={clearSearchButton(searchValue, clearSearch)}
      />
      <WebhookListContent
        view={view}
        params={params}
        isPlaceholderData={isPlaceholderData}
        retrying={isFetching}
        onRetry={retry}
        onClearSearch={clearSearch}
        onPageChange={changePage}
      />
    </Stack>
  )
}

function clearSearchButton(value: string, onClear: () => void): ReactNode {
  if (value === '') return null
  return <CloseButton aria-label="Clear search" onClick={onClear} />
}

interface WebhookListContentProps {
  view: WebhookListView
  params: ListParams
  isPlaceholderData: boolean
  retrying: boolean
  onRetry: () => void
  onClearSearch: () => void
  onPageChange: (page: number) => void
}

function WebhookListContent({
  view,
  params,
  isPlaceholderData,
  retrying,
  onRetry,
  onClearSearch,
  onPageChange,
}: WebhookListContentProps) {
  switch (view.kind) {
    case 'loading':
      return <LoadingState label="Loading webhooks…" />
    case 'error':
      return <LoadError title="Could not load webhooks" message={view.message} retrying={retrying} onRetry={onRetry} />
    case 'empty':
      return <EmptyWebhookList params={params} onClearSearch={onClearSearch} />
    case 'out-of-range':
      return <PageNotFound params={params} lastPage={view.lastPage} />
    case 'rows':
      return (
        <WebhookTable view={view} params={params} isPlaceholderData={isPlaceholderData} onPageChange={onPageChange} />
      )
  }
}

function EmptyWebhookList({ params, onClearSearch }: { params: ListParams; onClearSearch: () => void }) {
  return (
    <>
      <FirstPageRedirect params={params} />
      <EmptyState title="No webhooks found" description={emptyDescription(params.search)}>
        <ShowAllWebhooks search={params.search} onClear={onClearSearch} />
      </EmptyState>
    </>
  )
}

function FirstPageRedirect({ params }: { params: ListParams }) {
  if (params.page <= FIRST_PAGE) return null
  return <Navigate to={listPath({ ...params, page: FIRST_PAGE })} replace />
}

function emptyDescription(search: string): string {
  if (search === '') return 'There are no webhooks yet.'
  return `No webhook names contain “${search}”.`
}

function ShowAllWebhooks({ search, onClear }: { search: string; onClear: () => void }) {
  if (search === '') return null
  return (
    <EmptyState.Actions>
      <Button variant="default" onClick={onClear}>
        Show all webhooks
      </Button>
    </EmptyState.Actions>
  )
}

function PageNotFound({ params, lastPage }: { params: ListParams; lastPage: number }) {
  return (
    <EmptyState title="Page not found" description={`Page ${params.page} does not exist. The last page is ${lastPage}.`}>
      <EmptyState.Actions>
        <Button component={Link} to={listPath({ ...params, page: lastPage })} replace variant="default">
          Go to page {lastPage}
        </Button>
      </EmptyState.Actions>
    </EmptyState>
  )
}

interface WebhookTableProps {
  view: RowsView
  params: ListParams
  isPlaceholderData: boolean
  onPageChange: (page: number) => void
}

function WebhookTable({ view, params, isPlaceholderData, onPageChange }: WebhookTableProps) {
  return (
    <>
      <Table.ScrollContainer minWidth={640}>
        <Table aria-busy={isPlaceholderData} style={{ opacity: isPlaceholderData ? 0.6 : 1 }}>
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
                  <StatusBadge active={webhook.active} />
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
        <Pagination total={view.lastPage} value={params.page} onChange={onPageChange} hideWithOnePage />
      </Group>
    </>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  if (active) {
    return (
      <Badge color="green" variant="light">
        Active
      </Badge>
    )
  }
  return (
    <Badge color="gray" variant="light">
      Inactive
    </Badge>
  )
}
