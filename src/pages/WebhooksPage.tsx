import {
  Anchor,
  Box,
  Button,
  CloseButton,
  EmptyState,
  Group,
  Pagination,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  VisuallyHidden,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import type { Webhook } from '../api/contract'
import { LoadError } from '../components/LoadError'
import { LoadingState } from '../components/LoadingState'
import { PageHeading } from '../components/PageHeading'
import { PageTitle } from '../components/PageTitle'
import { StatusBadge } from '../components/StatusBadge'
import {
  editPath,
  FIRST_PAGE,
  FROM_LIST_STATE,
  listPath,
  parseListParams,
  toSearchParams,
  type ListParams,
} from '../webhooks/list-params'
import { listAnnouncement, listPageTitle } from '../webhooks/list-text'
import { useListSearch } from '../webhooks/use-list-search'
import { webhookListQuery, webhookListView, type WebhookListView } from '../webhooks/webhook-queries'

type RowsView = Extract<WebhookListView, { kind: 'rows' }>

export function WebhooksPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const params = parseListParams(searchParams)
  const { data, error, isPlaceholderData, isFetching, refetch } = useQuery(webhookListQuery(params))
  const view = webhookListView({ data, error, isPlaceholderData, page: params.page })
  const { searchValue, changeSearch, clearSearch } = useListSearch(params.search)
  const announcement = listAnnouncement({ view, page: params.page, isPlaceholderData })

  function retry() {
    void refetch()
  }

  function changePage(page: number) {
    const next = toSearchParams({ ...params, page })
    setSearchParams(next)
  }

  return (
    <Stack>
      <PageTitle title={listPageTitle(params.page)} />
      <PageHeading>Webhooks</PageHeading>
      <TextInput
        label="Search by name"
        value={searchValue}
        onChange={(event) => {
          changeSearch(event.currentTarget.value)
        }}
        rightSectionPointerEvents="all"
        rightSection={clearSearchButton(searchValue, clearSearch)}
      />
      <VisuallyHidden role="status">{announcement}</VisuallyHidden>
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
        <WebhookRows view={view} params={params} isPlaceholderData={isPlaceholderData} onPageChange={onPageChange} />
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

interface WebhookRowsProps {
  view: RowsView
  params: ListParams
  isPlaceholderData: boolean
  onPageChange: (page: number) => void
}

function WebhookRows({ view, params, isPlaceholderData, onPageChange }: WebhookRowsProps) {
  return (
    <>
      <Box aria-busy={isPlaceholderData} style={{ opacity: isPlaceholderData ? 0.6 : 1 }}>
        <Box visibleFrom="sm">
          <WebhookTable rows={view.rows} params={params} />
        </Box>
        <WebhookCardList rows={view.rows} params={params} />
      </Box>
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {`Showing ${view.from}–${view.to} of ${view.total}`}
        </Text>
        <Pagination total={view.lastPage} value={params.page} onChange={onPageChange} hideWithOnePage />
      </Group>
    </>
  )
}

interface WebhookRowListProps {
  rows: Webhook[]
  params: ListParams
}

function WebhookTable({ rows, params }: WebhookRowListProps) {
  return (
    <Table.ScrollContainer minWidth={640}>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>URL</Table.Th>
            <Table.Th>Status</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((webhook) => (
            <Table.Tr key={webhook.id}>
              <Table.Td>
                <WebhookNameLink webhook={webhook} params={params} />
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
  )
}

function WebhookCardList({ rows, params }: WebhookRowListProps) {
  return (
    <Stack role="list" gap="xs" hiddenFrom="sm">
      {rows.map((webhook) => (
        <Paper key={webhook.id} role="listitem" withBorder p="sm">
          <Group justify="space-between" wrap="nowrap" gap="sm">
            <WebhookNameLink webhook={webhook} params={params} />
            <StatusBadge active={webhook.active} />
          </Group>
          <Text size="sm" ff="monospace" c="dimmed" truncate>
            {webhook.url}
          </Text>
        </Paper>
      ))}
    </Stack>
  )
}

function WebhookNameLink({ webhook, params }: { webhook: Webhook; params: ListParams }) {
  return (
    <Anchor component={Link} to={editPath(webhook.id, params)} state={FROM_LIST_STATE}>
      {webhook.name}
    </Anchor>
  )
}
