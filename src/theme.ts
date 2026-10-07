import { createTheme, darken, type CSSVariablesResolver } from '@mantine/core'

export const theme = createTheme({
  primaryShade: { light: 8, dark: 8 },
})

export const cssVariablesResolver: CSSVariablesResolver = (resolvedTheme) => {
  const alertYellowText = darken(resolvedTheme.colors.yellow[9], 0.35)
  return {
    variables: {},
    light: {
      '--mantine-color-dimmed': 'var(--mantine-color-gray-7)',
      '--mantine-color-error': 'var(--mantine-color-red-9)',
      '--mantine-color-yellow-light-color': alertYellowText,
      '--app-focus-ring-color': 'var(--mantine-primary-color-filled)',
    },
    dark: {
      '--mantine-color-dimmed': 'var(--mantine-color-dark-1)',
      '--mantine-color-error': 'var(--mantine-color-red-5)',
      '--app-focus-ring-color': 'var(--mantine-color-blue-4)',
    },
  }
}
