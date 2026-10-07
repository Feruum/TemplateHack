export type AgentStreamEvent = {
  type: string
  data: unknown
}

export async function readAgentEventStream(
  response: Response,
  onEvent: (event: AgentStreamEvent) => void,
  signal?: AbortSignal,
) {
  if (!response.body) throw new Error('The agent returned an empty stream.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      signal?.throwIfAborted()
      const { done, value } = await reader.read()
      buffer = (buffer + decoder.decode(value, { stream: !done })).replace(/\r\n/g, '\n')

      let separator = buffer.indexOf('\n\n')
      while (separator >= 0) {
        dispatchFrame(buffer.slice(0, separator), onEvent)
        buffer = buffer.slice(separator + 2)
        separator = buffer.indexOf('\n\n')
      }

      if (done) break
    }

    if (buffer.trim()) dispatchFrame(buffer, onEvent)
  } finally {
    reader.releaseLock()
  }
}

function dispatchFrame(frame: string, onEvent: (event: AgentStreamEvent) => void) {
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
    onEvent({ type, data: JSON.parse(payload) as unknown })
  } catch {
    onEvent({ type, data: payload })
  }
}
