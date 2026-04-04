import { log } from '../store/log'

// In Docker production (no env var set) derive the WS base from window.location
// so Nginx can proxy ws:// traffic on the same host/port as the HTTP frontend.
const WS_BASE = (() => {
  const env = import.meta.env.VITE_WS_BACKEND_URL as string | undefined
  if (env) return env
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}`
})()

export interface GenerateRequest {
  project_id: string
  prompt: string
  framework: string
  model: string
  screen_id?: string
  image_b64?: string
  iteration_context?: string[]
  current_code?: string
  edit_mode?: boolean
}

export interface DoneFrame {
  session_id: string
  screen_id: string
  full_code: string
  model: string
  framework: string
  prompt_tokens: number
  completion_tokens: number
}

export interface StreamCallbacks {
  onToken: (token: string) => void
  onDone: (frame: DoneFrame) => void
  onError: (message: string) => void
}

export interface AppGenerateRequest {
  project_id: string
  prompt: string
  framework: string
  model: string
  design_name?: string | null
  image_b64?: string   // pure base64 (no data URL prefix), optional reference screenshot
}

export interface AppScreenDoneFrame {
  screen_id: string
  name: string
  index: number
  total: number
  full_code: string
  model: string
  framework: string
  completion_tokens: number
}

export interface AppStreamCallbacks {
  onDesignStart?: () => void
  onDesignToken?: (token: string) => void
  onDesignDone?: () => void
  onPlanningStart?: () => void
  onPlanToken?: (token: string) => void
  onPlan: (screenNames: string[], total: number, prompts: string[]) => void
  onScreenStart: (name: string, index: number, total: number) => void
  onToken: (token: string) => void
  onScreenDone: (frame: AppScreenDoneFrame) => void
  onScreenFailed: (name: string, index: number, prompt: string) => void
  onAllDone: (total: number) => void
  onError: (message: string) => void
}

/** Open a WebSocket to /ws/generate-app, run plan + generate all screens.
 *  Returns an abort function. */
export function startAppGeneration(req: AppGenerateRequest, callbacks: AppStreamCallbacks): () => void {
  const url = `${WS_BASE}/ws/generate-app`
  log.ws(`connecting → ${url}`)

  const ws = new WebSocket(url)
  let finished = false
  let tokenCount = 0

  ws.onopen = () => {
    log.ws('connected (app generation)')
    const preview = req.prompt.length > 60 ? req.prompt.slice(0, 60) + '…' : req.prompt
    log.ws(`→ app gen · ${req.framework} · ${req.model} · "${preview}"`)
    ws.send(JSON.stringify(req))
  }

  ws.onmessage = (event: MessageEvent<string>) => {
    if (finished) return
    try {
      const frame = JSON.parse(event.data) as Record<string, unknown>
      if (frame['type'] === 'plan') {
        const names = frame['screens'] as string[]
        const prompts = (frame['prompts'] as string[] | undefined) ?? []
        const appName = frame['app_name'] as string | undefined
        const designLabel = req.design_name
          ? `Design: ${req.design_name}`
          : `Design: ${appName ?? 'App'} (AI generated)`
        log.info(designLabel)
        log.ws(`← plan: [${names.join(', ')}]`)
        callbacks.onPlan(names, frame['total'] as number, prompts)
      } else if (frame['type'] === 'screen_start') {
        tokenCount = 0
        log.ws(`← screen_start "${frame['name']}" (${(frame['index'] as number) + 1}/${frame['total']})`)
        callbacks.onScreenStart(frame['name'] as string, frame['index'] as number, frame['total'] as number)
      } else if (frame['type'] === 'token') {
        tokenCount++
        log.streaming(`← token stream · ${tokenCount} tokens received`)
        callbacks.onToken(frame['data'] as string)
      } else if (frame['type'] === 'screen_done') {
        log.streaming(null)
        log.ws(`← screen_done "${frame['name']}"  tokens=${frame['completion_tokens']}`)
        callbacks.onScreenDone(frame as unknown as AppScreenDoneFrame)
      } else if (frame['type'] === 'screen_failed') {
        log.streaming(null)
        log.warn(`← screen_failed "${frame['name']}"  reason=${frame['message']}`)
        callbacks.onScreenFailed(frame['name'] as string, frame['index'] as number, frame['prompt'] as string)
      } else if (frame['type'] === 'all_done') {
        finished = true
        log.streaming(null)
        log.ws(`← all_done  total=${frame['total']}`)
        callbacks.onAllDone(frame['total'] as number)
      } else if (frame['type'] === 'design_start') {
        log.info('Generating design system…')
        callbacks.onDesignStart?.()
      } else if (frame['type'] === 'design_token') {
        callbacks.onDesignToken?.(frame['data'] as string)
      } else if (frame['type'] === 'design_done') {
        log.info('Design system ready')
        callbacks.onDesignDone?.()
      } else if (frame['type'] === 'planning') {
        log.info('Planning screens…')
        callbacks.onPlanningStart?.()
      } else if (frame['type'] === 'plan_token') {
        callbacks.onPlanToken?.(frame['data'] as string)
      } else if (frame['type'] === 'skills_applied') {
        const names = (frame['skills'] as string[]).join(', ')
        log.info(`Skills applied: ${names}`)
      } else if (frame['type'] === 'error') {
        finished = true
        log.streaming(null)
        log.error(`← ws error: ${frame['message'] as string}`)
        callbacks.onError(frame['message'] as string)
      }
    } catch {
      log.warn('ws: malformed frame - could not parse JSON')
    }
  }

  ws.onerror = () => {
    if (!finished) {
      finished = true
      log.streaming(null)
      log.error('ws: connection error (app generation)')
      callbacks.onError('WebSocket connection error')
    }
  }

  ws.onclose = (ev) => {
    log.ws(`closed  code=${ev.code}${ev.reason ? '  reason=' + ev.reason : ''}`)
    if (!finished) {
      finished = true
      log.streaming(null)
      log.error(`ws: app generation closed unexpectedly (code ${ev.code})`)
      callbacks.onError('Generation stopped unexpectedly - the model may have run out of memory. Try a shorter prompt or fewer screens.')
    }
  }

  return () => {
    finished = true
    log.streaming(null)
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      log.ws('abort → closing app generation connection')
      ws.close()
    }
  }
}

/** Open a WebSocket to /ws/generate, send req, stream tokens.
 *  Returns an abort function. */
export function startGeneration(req: GenerateRequest, callbacks: StreamCallbacks): () => void {
  const url = `${WS_BASE}/ws/generate`
  log.ws(`connecting → ${url}`)

  const ws = new WebSocket(url)
  let finished = false
  let tokenCount = 0

  ws.onopen = () => {
    log.ws('connected')
    // Log a sanitised view of the request (no raw image bytes)
    const sanitised: Record<string, unknown> = {
      project_id: req.project_id,
      framework: req.framework,
      model: req.model,
      prompt: req.prompt.length > 60 ? req.prompt.slice(0, 60) + '…' : req.prompt,
    }
    if (req.screen_id)   sanitised['screen_id']   = req.screen_id.slice(0, 8) + '…'
    if (req.image_b64)   sanitised['image']        = `[${Math.round(req.image_b64.length * 0.75 / 1024)} KB]`
    if (req.current_code) sanitised['current_code'] = `[${req.current_code.length} chars]`
    if (req.iteration_context?.length) sanitised['iteration_context'] = `[${req.iteration_context.length} entries]`
    log.ws(`→ ${JSON.stringify(sanitised)}`)
    ws.send(JSON.stringify(req))
  }

  ws.onmessage = (event: MessageEvent<string>) => {
    if (finished) return
    try {
      const frame = JSON.parse(event.data) as Record<string, unknown>
      if (frame['type'] === 'token') {
        tokenCount++
        log.streaming(`← token stream · ${tokenCount} tokens received`)
        callbacks.onToken(frame['data'] as string)
      } else if (frame['type'] === 'done') {
        finished = true
        log.streaming(null)
        log.ws(`← done  session=${String(frame['session_id']).slice(0, 8)}  screen=${String(frame['screen_id']).slice(0, 8)}  tokens=${tokenCount}`)
        callbacks.onDone(frame as unknown as DoneFrame)
      } else if (frame['type'] === 'skills_applied') {
        const names = (frame['skills'] as string[]).join(', ')
        log.info(`Skills applied: ${names}`)
      } else if (frame['type'] === 'error') {
        finished = true
        log.streaming(null)
        log.error(`← ws error: ${frame['message'] as string}`)
        callbacks.onError(frame['message'] as string)
      } else {
        log.ws(`← unknown frame type: ${String(frame['type'])}`)
      }
    } catch {
      log.warn('ws: malformed frame - could not parse JSON')
    }
  }

  ws.onerror = () => {
    if (!finished) {
      finished = true
      log.streaming(null)
      log.error('ws: connection error')
      callbacks.onError('WebSocket connection error')
    }
  }

  ws.onclose = (ev) => {
    finished = true
    log.ws(`closed  code=${ev.code}${ev.reason ? '  reason=' + ev.reason : ''}`)
  }

  return () => {
    finished = true
    log.streaming(null)
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      log.ws('abort → closing connection')
      ws.close()
    }
  }
}
