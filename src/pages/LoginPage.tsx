import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, Center, Paper, PasswordInput, Stack, TextInput, Title } from '@mantine/core'
import { useForm } from 'react-hook-form'
import { useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { signIn } from '../auth/auth-service'
import { REASON_PARAM, REDIRECT_PARAM, SESSION_EXPIRED_REASON, safeRedirectPath } from '../auth/redirect'
import { applyServerErrors } from '../lib/server-errors'

const loginSchema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
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
    <Center mih="100vh">
      <Paper withBorder p="xl" w={380}>
        <form onSubmit={(event) => void onSubmit(event)} noValidate>
          <Stack>
            <Title order={2}>Sign in</Title>
            {sessionExpired && (
              <Alert color="yellow" title="Session expired">
                Your session has expired. Please sign in again.
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
