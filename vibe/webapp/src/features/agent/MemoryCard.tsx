import { AGENT_MEMORY_MAX_LENGTH } from '@web-app-demo/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Typography } from '@/components/typography'
import { useAuth } from '@/features/auth'
import { createAgentMemory, deleteAgentMemory } from './api'
import { agentMemoriesQueryOptions, agentQueryKeys } from './queries'

export function MemoryCard() {
  const { transport, user } = useAuth()
  const client = useQueryClient()
  const [draft, setDraft] = useState('')
  const queryKey = agentQueryKeys.memories(user?.id)
  const query = useQuery(agentMemoriesQueryOptions(transport, user?.id))
  const refresh = () => client.invalidateQueries({ queryKey })
  const create = useMutation({
    mutationFn: (content: string) => createAgentMemory(transport, content),
    onSuccess: async () => { setDraft(''); await refresh() },
  })
  const remove = useMutation({ mutationFn: (id: string) => deleteAgentMemory(transport, id), onSuccess: refresh })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (draft.trim() && !create.isPending) create.mutate(draft.trim())
  }

  const error = create.error ?? remove.error ?? query.error
  return (
    <Card data-testid="agent-memory">
      <CardHeader>
        <CardTitle>Your memory</CardTitle>
        <CardDescription>Save preferences or context for the agent. Memory contains only notes you save here. Up to 100 private notes.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <form className="grid gap-3" onSubmit={submit}>
          <Textarea aria-label="New memory note" placeholder="For example: Reply in Russian and keep answers concise." value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={AGENT_MEMORY_MAX_LENGTH} disabled={create.isPending} />
          <Button data-testid="agent-memory-save" type="submit" variant="outline" disabled={!draft.trim() || create.isPending || (query.data?.memories.length ?? 0) >= 100}>
            {create.isPending ? 'Saving…' : 'Save note'}
          </Button>
        </form>
        {error && <Alert variant="destructive"><AlertDescription>{error.message}</AlertDescription></Alert>}
        {query.isPending && <Typography tone="muted" variant="bodySm">Loading notes…</Typography>}
        {query.data?.memories.length === 0 && <Typography tone="muted" variant="bodySm">No saved notes. Conversations and uploads are not automatically added to memory.</Typography>}
        {query.data?.memories.map((note) => (
          <div key={note.id} data-testid="agent-memory-note" className="grid gap-2 border-t pt-3">
            <Typography variant="bodySm" className="whitespace-pre-wrap break-words">{note.content}</Typography>
            <Button data-testid="agent-memory-delete" type="button" variant="outline" size="sm" disabled={remove.isPending} aria-label={`Delete note: ${note.content.slice(0, 60)}`} onClick={() => remove.mutate(note.id)}>Delete note</Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
