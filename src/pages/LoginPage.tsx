import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, Center, Paper, PasswordInput, Stack, TextInput } from '@mantine/core'
import { useForm } from 'react-hook-form'
import { useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { signIn } from '../auth/auth-service'
import { REASON_PARAM, REDIRECT_PARAM, SESSION_EXPIRED_REASON, safeRedirectPath } from '../auth/redirect'
import { PageHeading } from '../components/PageHeading'
import { PageTitle } from '../components/PageTitle'
import { applyServerErrors } from '../lib/server-errors'

const loginSchema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
})

type LoginValues = z.infer<typeof loginSchema>

const LOGIN_FIELDS = ['email', 'password'] as const

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const sessionExpired = searchParams.get(REASON_PARAM) === SESSION_EXPIRED_REASON
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } })

  const onSubmit = handleSubmit(async (values) => {
    try {
      await signIn(values)
    } catch (error) {
      applyServerErrors(error, LOGIN_FIELDS, setError)
      return
    }
    const redirectTo = searchParams.get(REDIRECT_PARAM)
    const target = safeRedirectPath(redirectTo)
    await navigate(target, { replace: true })
  })

  return (
    <Center mih="100vh" p="md">
      <PageTitle title="Sign in" />
      <Paper withBorder p="xl" w="100%" maw={380}>
        <form onSubmit={(event) => void onSubmit(event)} noValidate>
          <Stack>
            <PageHeading>Sign in to Smart Sender</PageHeading>
            {sessionExpired && (
              <Alert color="yellow" title="Session expired">
                Sign in again to continue. You'll return to the page you were on.
              </Alert>
            )}
            {errors.root?.server && <Alert color="red">{errors.root.server.message}</Alert>}
            <TextInput
              label="Email"
              type="email"
              autoComplete="username"
              error={errors.email?.message}
              {...register('email')}
            />
            <PasswordInput
              label="Password"
              autoComplete="current-password"
              error={errors.password?.message}
              aria-invalid={errors.password !== undefined}
              {...register('password')}
            />
            <Button type="submit" loading={isSubmitting}>
              Sign in
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  )
}
