import { Title } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { createInAppNavigationCheck } from '../lib/in-app-navigation'

const isInAppNavigation = createInAppNavigationCheck()

export function PageHeading({ children }: { children: string }) {
  const location = useLocation()
  const [arrivalKey] = useState(location.key)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!isInAppNavigation(arrivalKey)) return
    const heading = headingRef.current
    if (heading === null) return
    heading.focus()
  }, [arrivalKey])

  return (
    <Title ref={headingRef} order={1} size="h2" tabIndex={-1}>
      {children}
    </Title>
  )
}
