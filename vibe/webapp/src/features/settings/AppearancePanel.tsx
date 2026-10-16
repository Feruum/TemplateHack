import { useTheme } from 'next-themes'

import { Card, CardContent, CardDescription, CardHeader } from '@/components/interface/card'
import {
  Field,
  FieldDescription,
} from '@/components/ui/field'
import { Select } from '@/components/interface/select'
import { Typography } from '@/components/typography'

const themes = ['system', 'light', 'dark'] as const
type Theme = typeof themes[number]

export function AppearancePanel() {
  const { theme = 'system', setTheme } = useTheme()
  const selectedTheme = isTheme(theme) ? theme : 'system'

  return (
    <Card>
      <CardHeader>
        <Typography as="h2" variant="h6">
          Appearance
        </Typography>
        <CardDescription>
          Follow your device preference or keep a consistent light or dark theme.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Field>
          <Select
            className="w-full sm:w-52"
            id="appearance-theme"
            label="Theme"
            onValueChange={(value) => {
              if (isTheme(value)) setTheme(value)
            }}
            options={themes.map((item) => ({
              value: item,
              label: item[0].toUpperCase() + item.slice(1),
            }))}
            value={selectedTheme}
          />
          <FieldDescription>
            Changes are saved in this browser and applied immediately.
          </FieldDescription>
        </Field>
      </CardContent>
    </Card>
  )
}

function isTheme(value: string): value is Theme {
  return themes.some((theme) => theme === value)
}
