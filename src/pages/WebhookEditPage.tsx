import { Alert, Button, EmptyState, Group, Loader, Stack, Text, TextInput, Title } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import type { Webhook } from '../api/contract'
import { applyServerErrors } from '../lib/server-errors'
import { isFromList, listPath, parseListParams, parseWebhookId } from '../webhooks/list-params'
import { applyWebhookUpdate, webhookDetailView, webhookQuery } from '../webhooks/webhook-queries'
import { updateWebhook } from '../webhooks/webhooks-api'

type EditValues = Pick<Webhook, 'name' | 'url'>

const EDIT_FIELDS = ['name', 'url'] as const

export function WebhookEditPage() {
  const { id: rawId } = useParams()
  const [searchParams] = useSearchParams()
  const backTo = listPath(parseListParams(searchParams))
  const id = parseWebhookId(rawId)

  return (
    <Stack maw={560}>
      <Title order={2}>Edit webhook</Title>
      {id === null ? <WebhookNotFound backTo={backTo} /> : <WebhookEditor key={id} id={id} backTo={backTo} />}
    </Stack>
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

  switch (view.kind) {
    case 'loading':
      return (
        <Stack role="status" align="center" py="xl">
          <Loader />
          <Text>Loading webhook…</Text>
        </Stack>
      )
    case 'not-found':
      return <WebhookNotFound backTo={backTo} />
    case 'error':
      return (
        <Alert color="red" title="Could not load the webhook">
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
      )
    case 'ready':
      return <WebhookEditForm webhook={view.webhook} backTo={backTo} />
  }
}

function WebhookEditForm({ webhook, backTo }: { webhook: Webhook; backTo: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
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
    activeKey.current = location.key
    return () => {
      activeKey.current = null
    }
  }, [location.key])

  async function submit(values: EditValues) {
    const submittedFrom = location.key
    try {
      await mutation.mutateAsync(values)
    } catch (error) {
      if (activeKey.current === submittedFrom) applyServerErrors(error, EDIT_FIELDS, setError)
      return
    }
    if (activeKey.current === submittedFrom) await leave()
  }

  async function leave() {
    if (isFromList(location.state)) await navigate(-1)
    else await navigate(backTo, { replace: true })
  }

  return (
    <form onSubmit={(event) => void handleSubmit(submit)(event)} noValidate>
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
              void navigate(backTo)
            }}
          >
            Cancel
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
