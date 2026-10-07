import { documentTitle } from '../lib/document-title'

export function PageTitle({ title }: { title: string }) {
  const text = documentTitle(title)
  return <title>{text}</title>
}
