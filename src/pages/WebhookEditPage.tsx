import { Alert, Anchor, Box, Button, EmptyState, Group, Stack, Text, TextInput } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type MouseEvent, type ReactNode, type SubmitEvent } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useParams, useSearchParams } from 'react-router'
import type { Webhook } from '../api/contract'
import { LoadError } from '../components/LoadError'
import { LoadingState } from '../components/LoadingState'
import { PageHeading } from '../components/PageHeading'
import { PageTitle } from '../components/PageTitle'
import { StatusBadge } from '../components/StatusBadge'
import { isPlainLeftClick } from '../lib/plain-click'
import { applyServerErrors } from '../lib/server-errors'
import { editPageHeading, editPageTitle, formatCreatedDate } from '../webhooks/edit-text'
import { listPath, parseListParams, parseWebhookId } from '../webhooks/list-params'
import { useLeaveEdit } from '../webhooks/use-leave-edit'
import {
  applyWebhookUpdate,
  webhookDetailView,
  webhookQuery,
  type WebhookDetailView,
} from '../webhooks/webhook-queries'
import { updateWebhook } from '../webhooks/webhooks-api'

type EditValues = Pick<Webhook, 'name' | 'url'>

const EDIT_FIELDS = ['name', 'url'] as const

const NOT_FOUND_VIEW: WebhookDetailView = { kind: 'not-found' }

export function WebhookEditPage() {
  const { id: rawId } = useParams()
  const [searchParams] = useSearchParams()
  const listParams = parseListParams(searchParams)
  const backTo = listPath(listParams)
  const id = parseWebhookId(rawId)

  if (id === null) {
    return (
      <EditPageLayout view={NOT_FOUND_VIEW} backTo={backTo} submitting={false}>
        <WebhookNotFound backTo={backTo} />
      </EditPageLayout>
    )
  }
  return <WebhookEditor key={id} id={id} backTo={backTo} />
}

interface EditPageLayoutProps {
  view: WebhookDetailView
  backTo: string
  submitting: boolean
  children: ReactNode
}

function EditPageLayout({ view, backTo, submitting, children }: EditPageLayoutProps) {
  const leave = useLeaveEdit(backTo)

  return (
    <Stack maw={560}>
      <PageTitle title={editPageTitle(view)} />
      <BackToListLink href={backTo} disabled={submitting} onLeave={leave} />
      <PageHeading>{editPageHeading(view)}</PageHeading>
      <WebhookFacts view={view} />
      {children}
    </Stack>
  )
}

interface BackToListLinkProps {
  href: string
  disabled: boolean
  onLeave: () => Promise<void>
}

function BackToListLink({ href, disabled, onLeave }: BackToListLinkProps) {
  const linkColor = disabled ? 'dimmed' : undefined

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (disabled) {
      event.preventDefault()
      return
    }
    if (!isPlainLeftClick(event)) return
    event.preventDefault()
    void onLeave()
  }

  return (
    <Box>
      <Anchor href={href} size="sm" aria-disabled={disabled} c={linkColor} onClick={handleClick}>
        <span aria-hidden="true">‹ </span>
        Webhooks
      </Anchor>
    </Box>
  )
}

function WebhookFacts({ view }: { view: WebhookDetailView }) {
  if (view.kind !== 'ready') return null
  const created = formatCreatedDate(view.webhook.created_at)
  return (
    <Group gap="sm">
      <StatusBadge active={view.webhook.active} />
      <Text size="sm" c="dimmed">
        {`Created ${created}`}
      </Text>
    </Group>
  )
}

function WebhookNotFound({ backTo }: { backTo: string }) {
  return (
    <EmptyState title="Webhook not found" description="The webhook does not exist or the link is wrong.">
      <EmptyState.Actions>
        <Button component={Link} to={backTo} variant="default">
          Back to webhooks
        </Button>
      </EmptyState.Actions>
    </EmptyState>
  )
}

function WebhookEditor({ id, backTo }: { id: number; backTo: string }) {
  const { data, error, isFetching, refetch } = useQuery(webhookQuery(id))
  const view = webhookDetailView({ data, error })
  const [submitting, setSubmitting] = useState(false)

  function retry() {
    void refetch()
  }

  return (
    <EditPageLayout view={view} backTo={backTo} submitting={submitting}>
      <WebhookEditBody
        view={view}
        backTo={backTo}
        retrying={isFetching}
        onRetry={retry}
        onSubmittingChange={setSubmitting}
      />
    </EditPageLayout>
  )
}

interface WebhookEditBodyProps {
  view: WebhookDetailView
  backTo: string
  retrying: boolean
  onRetry: () => void
  onSubmittingChange: (submitting: boolean) => void
}

function WebhookEditBody({ view, backTo, retrying, onRetry, onSubmittingChange }: WebhookEditBodyProps) {
  switch (view.kind) {
    case 'loading':
      return <LoadingState label="Loading webhook…" />
    case 'not-found':
      return <WebhookNotFound backTo={backTo} />
    case 'error':
      return (
        <LoadError title="Could not load the webhook" message={view.message} retrying={retrying} onRetry={onRetry} />
      )
    case 'ready':
      return <WebhookEditForm webhook={view.webhook} backTo={backTo} onSubmittingChange={onSubmittingChange} />
  }
}

interface WebhookEditFormProps {
  webhook: Webhook
  backTo: string
  onSubmittingChange: (submitting: boolean) => void
}

function WebhookEditForm({ webhook, backTo, onSubmittingChange }: WebhookEditFormProps) {
  const queryClient = useQueryClient()
  const location = useLocation()
  const leave = useLeaveEdit(backTo)
  const activeKey = useRef<string | null>(location.key)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EditValues>({ defaultValues: { name: webhook.name, url: webhook.url } })
  const mutation = useMutation({
    mutationFn: (values: EditValues) => updateWebhook(webhook.id, values),
    onSuccess: (updated) => {
      applyWebhookUpdate(queryClient, updated)
    },
  })

  useEffect(() => {
    onSubmittingChange(isSubmitting)
  }, [isSubmitting, onSubmittingChange])

  useEffect(() => {
    activeKey.current = location.key
    return () => {
      activeKey.current = null
    }
  }, [location.key])

  function isStillOnSubmittedEntry(submittedFrom: string): boolean {
    return activeKey.current === submittedFrom
  }

  async function submit(values: EditValues) {
    const submittedFrom = location.key
    try {
      await mutation.mutateAsync(values)
    } catch (error) {
      if (isStillOnSubmittedEntry(submittedFrom)) applyServerErrors(error, EDIT_FIELDS, setError)
      return
    }
    if (isStillOnSubmittedEntry(submittedFrom)) await leave()
  }

  function handleFormSubmit(event: SubmitEvent<HTMLFormElement>) {
    const onSubmit = handleSubmit(submit)
    void onSubmit(event)
  }

  return (
    <form onSubmit={handleFormSubmit} noValidate>
      <Stack>
        {errors.root?.server && <Alert color="red">{errors.root.server.message}</Alert>}
        <TextInput label="Name" autoComplete="off" error={errors.name?.message} {...register('name')} />
        <TextInput label="URL" autoComplete="off" error={errors.url?.message} {...register('url')} />
        <Group>
          <Button type="submit" loading={isSubmitting}>
            Save
          </Button>
          <Button
            type="button"
            variant="default"
            disabled={isSubmitting}
            onClick={() => {
              void leave()
            }}
          >
            Cancel
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
