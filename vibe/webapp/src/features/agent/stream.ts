export type AgentStreamEvent = {
  type: string
  data: unknown
}

export async function readAgentEventStream(
  response: Response,
  onEvent: (event: AgentStreamEvent) => void,
  signal?: AbortSignal,
) {
  for await (const event of iterateAgentEventStream(response, signal)) onEvent(event)
}

export async function* iterateAgentEventStream(response: Response, signal?: AbortSignal) {
  if (!response.body) throw new Error('The agent returned an empty stream.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let completed = false
  const cancel = () => { void reader.cancel(signal?.reason).catch(() => {}) }
  signal?.addEventListener('abort', cancel, { once: true })

  try {
    while (true) {
      signal?.throwIfAborted()
      const { done, value } = await reader.read()
      signal?.throwIfAborted()
      buffer = (buffer + decoder.decode(value, { stream: !done })).replace(/\r\n/g, '\n')

      let separator = buffer.indexOf('\n\n')
      while (separator >= 0) {
        const event = parseFrame(buffer.slice(0, separator))
        if (event) yield event
        buffer = buffer.slice(separator + 2)
        separator = buffer.indexOf('\n\n')
      }

      if (done) { completed = true; break }
    }

    if (buffer.trim()) {
      const event = parseFrame(buffer)
      if (event) yield event
    }
  } finally {
    signal?.removeEventListener('abort', cancel)
    if (!completed) await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

function parseFrame(frame: string): AgentStreamEvent | undefined {
  let type = 'message'
  const data: string[] = []

  for (const line of frame.split('\n')) {
    if (!line || line.startsWith(':')) continue
    const separator = line.indexOf(':')
    const field = separator === -1 ? line : line.slice(0, separator)
    const value = separator === -1 ? '' : line.slice(separator + 1).replace(/^ /, '')
    if (field === 'event') type = value
    if (field === 'data') data.push(value)
  }

  if (data.length === 0) return
  const payload = data.join('\n')
  try {
    return { type, data: JSON.parse(payload) as unknown }
  } catch {
    return { type, data: payload }
  }
}
