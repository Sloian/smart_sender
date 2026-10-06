import type { Me } from '../api/contract'

let currentUser: Me | null = null

export const session = {
  user: (): Me | null => currentUser,
  start(user: Me): void {
    currentUser = user
  },
  clear(): void {
    currentUser = null
  },
}
