import { useLocation, useNavigate } from 'react-router'
import { isFromList } from './list-params'

export function useLeaveEdit(backTo: string): () => Promise<void> {
  const navigate = useNavigate()
  const location = useLocation()

  return async function leave() {
    if (isFromList(location.state)) {
      await navigate(-1)
      return
    }
    await navigate(backTo, { replace: true })
  }
}
