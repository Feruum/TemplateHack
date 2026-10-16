import type { ComponentProps } from 'react'

import { PasswordField } from '@/components/interface/password-field'

type PasswordInputProps = Omit<ComponentProps<typeof PasswordField>, 'type' | 'messages'> & {
  visibilityLabel?: string
}

export function PasswordInput({
  visibilityLabel = 'entered password',
  ...props
}: PasswordInputProps) {
  return (
    <PasswordField
      {...props}
      messages={{
        showPassword: `Show ${visibilityLabel}`,
        hidePassword: `Hide ${visibilityLabel}`,
      }}
    />
  )
}
