export function createInAppNavigationCheck(): (locationKey: string) => boolean {
  let firstKey: string | null = null
  let navigated = false

  return (locationKey) => {
    if (firstKey === null) {
      firstKey = locationKey
      return false
    }
    if (locationKey !== firstKey) navigated = true
    return navigated
  }
}
