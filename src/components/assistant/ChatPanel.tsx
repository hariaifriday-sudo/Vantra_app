import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Microphone, PaperPlaneTilt, SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react'
import { AssistantOrb } from './AssistantOrb'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

type ChatContext = 'faq' | 'account' | 'agent_copilot'

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  onresult: ((event: unknown) => void) | null
  onend: (() => void) | null
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

async function streamAssistantReply(
  message: string,
  sessionKey: string,
  context: ChatContext,
  onToken: (token: string) => void,
) {
  const token = api.token.get()
  const params = new URLSearchParams({ message, session_key: sessionKey, context, ...(token ? { token } : {}) })
  const res = await fetch(`${api.base}/api/chat/stream?${params.toString()}`)
  if (!res.body) throw new Error('No response stream')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    onToken(decoder.decode(value, { stream: true }))
  }
}

export function ChatPanel({
  title = 'Ask Vantra',
  initialMessages,
  context = 'faq',
  dark = false,
  className,
}: {
  title?: string
  initialMessages: ChatMessage[]
  context?: ChatContext
  dark?: boolean
  className?: string
}) {
  const [messages, setMessages] = useState(initialMessages)
  const [draft, setDraft] = useState('')
  const [listening, setListening] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [speakReplies, setSpeakReplies] = useState(false)
  const sessionKey = useRef(crypto.randomUUID())
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const speechSupported = useRef(getSpeechRecognition() !== null)
  const ttsSupported = useRef(typeof window !== 'undefined' && 'speechSynthesis' in window)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    return () => {
      if (ttsSupported.current) window.speechSynthesis.cancel()
    }
  }, [])

  async function send(text?: string) {
    const value = (text ?? draft).trim()
    if (!value || streaming) return
    setMessages((m) => [...m, { role: 'user', text: value }, { role: 'assistant', text: '' }])
    setDraft('')
    setStreaming(true)
    let fullReply = ''

    try {
      await streamAssistantReply(value, sessionKey.current, context, (token) => {
        fullReply += token
        setMessages((m) => {
          const next = [...m]
          next[next.length - 1] = { role: 'assistant', text: next[next.length - 1].text + token }
          return next
        })
      })
      if (speakReplies && ttsSupported.current && fullReply.trim()) {
        window.speechSynthesis.cancel()
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(fullReply))
      }
    } catch {
      setMessages((m) => {
        const next = [...m]
        next[next.length - 1] = { role: 'assistant', text: "Sorry, I couldn't reach the assistant just now. Please try again." }
        return next
      })
    } finally {
      setStreaming(false)
    }
  }

  function toggleVoice() {
    const Recognition = getSpeechRecognition()
    if (!Recognition) return

    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }

    const recognition = new Recognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'
    recognition.onresult = (event) => {
      const e = event as { results: { transcript: string }[][] }
      const transcript = e.results?.[0]?.[0]?.transcript
      if (transcript) send(transcript)
    }
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  return (
    <div
      className={cn(
        'flex h-full flex-col overflow-hidden rounded-3xl border border-border-hair',
        dark ? 'bg-[#0f1216] text-[#f2f3f5]' : 'bg-surface text-ink',
        className,
      )}
    >
      <div className="flex items-center gap-3 border-b border-border-hair px-5 py-4">
        <AssistantOrb size={32} listening={listening} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold">{title}</p>
          <p className="text-xs text-ink-muted">{streaming ? 'Thinking…' : 'Online · answers in seconds'}</p>
        </div>
        <button
          onClick={() => {
            if (speakReplies && ttsSupported.current) window.speechSynthesis.cancel()
            setSpeakReplies((v) => !v)
          }}
          disabled={!ttsSupported.current}
          aria-label={speakReplies ? 'Turn off spoken replies' : 'Turn on spoken replies'}
          aria-pressed={speakReplies}
          title={ttsSupported.current ? undefined : 'Voice output is not supported in this browser'}
          className={cn(
            'grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40',
            speakReplies ? 'bg-accent text-accent-ink' : 'text-ink-muted hover:text-ink',
          )}
        >
          {speakReplies ? <SpeakerHigh size={16} weight="fill" /> : <SpeakerSlash size={16} />}
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        <AnimatePresence initial={false}>
          {messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              <div className={cn('max-w-[85%] gap-2', m.role === 'assistant' && 'flex items-start')}>
                {m.role === 'assistant' ? <AssistantOrb size={22} className="mt-1 shrink-0" /> : null}
                <div
                  className={cn(
                    'rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
                    m.role === 'user'
                      ? 'rounded-tr-sm bg-accent text-accent-ink'
                      : cn('rounded-tl-sm', dark ? 'bg-white/[0.06] text-[#f2f3f5]' : 'bg-surface-2 text-ink'),
                  )}
                >
                  {m.text || (m.role === 'assistant' && streaming && i === messages.length - 1 ? (
                    <span className="inline-flex gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60 [animation-delay:0ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60 [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60 [animation-delay:300ms]" />
                    </span>
                  ) : null)}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="border-t border-border-hair p-3">
        <div className={cn('flex items-center gap-2 rounded-full border px-3 py-2', dark ? 'border-white/10 bg-white/[0.04]' : 'border-border-hair bg-paper')}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Ask something..."
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-muted"
          />
          <button
            onClick={toggleVoice}
            disabled={!speechSupported.current}
            aria-label={listening ? 'Stop voice input' : 'Start voice input'}
            aria-pressed={listening}
            title={speechSupported.current ? undefined : 'Voice input is not supported in this browser'}
            className={cn(
              'grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40',
              listening ? 'bg-accent text-accent-ink' : 'text-ink-muted hover:text-ink',
            )}
          >
            <Microphone size={16} weight={listening ? 'fill' : 'regular'} />
          </button>
          <button
            onClick={() => send()}
            disabled={streaming}
            aria-label="Send message"
            className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full bg-accent text-accent-ink transition-transform active:scale-90 disabled:opacity-50"
          >
            <PaperPlaneTilt size={15} weight="fill" />
          </button>
        </div>
      </div>
    </div>
  )
}
