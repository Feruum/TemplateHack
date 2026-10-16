import type { AgentDocument, AgentModule } from '@web-app-demo/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { ArcBadge, ArcEmptyState } from '@/components/arc'
import { Alert, AlertDescription, AlertTitle } from '@/components/interface/alert'
import { Button } from '@/components/interface/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/interface/card'
import { Select } from '@/components/interface/select'
import { Typography } from '@/components/typography'
import { useAuth } from '@/features/auth'
import { isSupportedDocument, uploadAgentDocument } from './api'
import { AgentThread } from './AgentThread'
import { MemoryCard } from './MemoryCard'
import { agentDocumentsQueryOptions, agentModulesQueryOptions, agentQueryKeys } from './queries'

const pendingDocumentStatuses = new Set(['PENDING', 'QUEUED', 'PROCESSING'])

export function AgentWorkspace() {
  const { user } = useAuth()
  return <AuthenticatedAgentWorkspace key={user?.id} />
}

function AuthenticatedAgentWorkspace() {
  const { transport, user } = useAuth()
  const queryClient = useQueryClient()
  const [selectedModuleId, setSelectedModuleId] = useState('auto')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadNotice, setUploadNotice] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const moduleQuery = useQuery(agentModulesQueryOptions(transport, user?.id))
  const documentQuery = useQuery({
    ...agentDocumentsQueryOptions(transport, user?.id),
    refetchInterval: (query) => query.state.data?.documents.some((document) => pendingDocumentStatuses.has(document.status)) ? 1500 : false,
  })
  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadAgentDocument(transport, file),
    onSuccess: async (document) => {
      setUploadError(null)
      setUploadNotice(`“${document.filename}” is queued for indexing.`)
      await queryClient.invalidateQueries({ queryKey: agentQueryKeys.documents(user?.id) })
    },
    onError: (error: unknown) => {
      setUploadNotice(null)
      setUploadError(error instanceof Error ? error.message : 'The request could not be completed.')
    },
  })

  function selectFile(file: File | undefined) {
    setUploadError(null)
    setUploadNotice(null)
    if (!file) return
    if (!isSupportedDocument(file)) { setUploadError('Choose a PDF or TXT file no larger than 25 MiB.'); return }
    uploadMutation.mutate(file)
  }

  const modules = moduleQuery.data?.modules ?? []
  const documents = documentQuery.data?.documents ?? []
  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5 p-5 md:p-8">
      <div className="grid gap-2">
        <Typography as="h1" variant="h2">Agent workspace</Typography>
        <Typography tone="muted">Add documents, then ask questions. The backend routes each request to a module and keeps documents private to your account.</Typography>
      </div>
      <div className="grid min-h-[min(68vh,760px)] gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="min-w-0 min-h-[560px]">
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="grid gap-1"><CardTitle>Chat</CardTitle><CardDescription>Pick a module or let the orchestrator choose.</CardDescription></div>
              <Select
                aria-label="Agent module"
                className="w-full sm:w-56"
                label="Agent module"
                onValueChange={setSelectedModuleId}
                options={[
                  { value: 'auto', label: 'Automatic routing' },
                  ...modules.map((module) => ({ value: module.id, label: module.name })),
                ]}
                placeholder="Choose a module"
                value={selectedModuleId}
              />
            </div>
            {moduleQuery.isError && <InlineError message="Could not load agent modules. Check that the agent service is running." />}
          </CardHeader>
          <CardContent className="flex h-[min(68vh,760px)] min-h-[470px] flex-col py-4">
            <AgentThread transport={transport} moduleId={selectedModuleId === 'auto' ? undefined : selectedModuleId} disabled={moduleQuery.isError} />
          </CardContent>
        </Card>
        <aside className="grid min-w-0 content-start gap-5">
          <MemoryCard />
          <Card>
            <CardHeader><CardTitle>Knowledge base</CardTitle><CardDescription>Only PDF and TXT files. Maximum size: 25 MiB.</CardDescription></CardHeader>
            <CardContent className="grid gap-3">
              <input accept=".pdf,.txt,application/pdf,text/plain" aria-label="Document file" className="sr-only" data-testid="agent-document-input" onChange={(event) => { selectFile(event.currentTarget.files?.[0]); event.currentTarget.value = '' }} ref={fileInputRef} type="file" />
              <Button disabled={uploadMutation.isPending} onClick={() => fileInputRef.current?.click()} type="button" variant="outline">{uploadMutation.isPending ? 'Uploading…' : 'Add a document'}</Button>
              {uploadNotice && <Typography tone="muted" variant="bodySm">{uploadNotice}</Typography>}
              {uploadError && <InlineError message={uploadError} />}
              {documentQuery.isError && <InlineError message="Could not load your documents. Check that the agent service is running." />}
              <DocumentList documents={documents} isLoading={documentQuery.isPending} />
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader><CardTitle>Enabled modules</CardTitle></CardHeader>
            <CardContent className="grid gap-3">{modules.length === 0 && !moduleQuery.isError ? <Typography tone="muted" variant="bodySm">Loading modules…</Typography> : modules.map((module) => <ModuleSummary key={module.id} module={module} />)}</CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}

function DocumentList({ documents, isLoading }: { documents: AgentDocument[]; isLoading: boolean }) {
  if (isLoading) return <Typography tone="muted" variant="bodySm">Loading documents…</Typography>
  if (documents.length === 0) return <ArcEmptyState title="Your private knowledge base is empty." description="Only PDF and TXT files. Maximum size: 25 MiB." label="Empty knowledge base" />
  return <ul className="grid gap-2">{documents.map((document) => <li className="flex min-w-0 items-start justify-between gap-3 rounded-md border px-3 py-2" key={document.id} data-testid="agent-document">
    <div className="grid min-w-0 gap-1">
      <Typography className="truncate" variant="bodySmMedium">{document.filename}</Typography>
      {pendingDocumentStatuses.has(document.status) && <Typography tone="muted" variant="caption">Indexing · {document.progress}%</Typography>}
      {document.status === 'FAILED' && <Typography tone="destructive" variant="caption">{document.error_message ?? 'Indexing failed'}</Typography>}
    </div>
    <ArcBadge tone={document.status === 'FAILED' ? 'danger' : document.status === 'COMPLETED' ? 'success' : 'neutral'} size="sm">{document.status.toLowerCase()}</ArcBadge>
  </li>)}</ul>
}

function ModuleSummary({ module }: { module: AgentModule }) {
  return <div className="grid gap-1"><Typography variant="bodySmMedium">{module.name}</Typography><Typography tone="muted" variant="caption">{module.description}</Typography></div>
}

function InlineError({ message }: { message: string }) {
  return <Alert variant="destructive"><AlertTitle>Request failed</AlertTitle><AlertDescription>{message}</AlertDescription></Alert>
}
