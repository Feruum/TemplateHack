import { Alert, AlertDescription, AlertTitle } from '@/components/interface/alert'

export function FormAlert({
  message,
  title = 'Authentication failed',
}: {
  message: string | null
  title?: string
}) {
  if (!message) return null

  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}
