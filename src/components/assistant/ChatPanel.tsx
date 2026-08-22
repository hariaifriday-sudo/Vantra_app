import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Microphone, PaperPlaneTilt, SpeakerHigh, SpeakerSlash, X } from '@phosphor-icons/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AssistantOrb } from './AssistantOrb'
import { BranchResultsCard } from './BranchResultsCard'
import { AppointmentBookingCard } from './AppointmentBookingCard'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import type { BranchOut } from '@/lib/api'
import { emitDataChanged } from '@/lib/refresh'

interface PendingTransferBlock {
  pending_transfer_id: number
  to: string
  amount: number
  from_account: string
}

// The backend appends zero or more ```vantra:<type>\n{json}\n``` fenced blocks
// after its natural-language reply — one deterministic way to hand the UI
// structured data (an approval card, branch results, a booking form) without
// trusting the model to reproduce IDs/URLs/addresses verbatim in prose.
const VANTRA_BLOCK_RE = /```vantra:([\w-]+)\n([\s\S]*?)\n```/g

interface VantraBlock {
  type: string
  data: unknown
}

function extractVantraBlocks(text: string): { cleanText: string; blocks: VantraBlock[] } {
  const blocks: VantraBlock[] = []
  const cleanText = text
    .replace(VANTRA_BLOCK_RE, (_match, type: string, json: string) => {
      try {
        blocks.push({ type, data: JSON.parse(json) })
      } catch {
        // malformed block — drop it silently rather than showing raw JSON
      }
      return ''
    })
    .trimEnd()
  return { cleanText, blocks }
}

function TransferApprovalCard({ transfer, dark }: { transfer: PendingTransferBlock; dark: boolean }) {
  const [status, setStatus] = useState<'awaiting' | 'working' | 'approved' | 'rejected' | 'error'>('awaiting')

  async function decide(decision: 'approve' | 'reject') {
    setStatus('working')
    try {
      await api.post(`/api/banking/transfers/pending/${transfer.pending_transfer_id}/${decision}`)
      setStatus(decision === 'approve' ? 'approved' : 'rejected')
      if (decision === 'approve') emitDataChanged()
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className={cn('mt-2 w-full rounded-xl border p-3 text-sm', dark ? 'border-white/10 bg-white/[0.04]' : 'border-border-hair bg-paper')}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">Transfer to {transfer.to}</span>
        <span className="font-display text-base font-semibold">${transfer.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
      <p className="mt-0.5 text-xs text-ink-muted">From {transfer.from_account}</p>

      {status === 'awaiting' || status === 'working' ? (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => decide('approve')}
            disabled={status === 'working'}
            className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink transition-transform active:scale-95 disabled:opacity-50"
          >
            <Check size={14} weight="bold" /> Approve
          </button>
          <button
            onClick={() => decide('reject')}
            disabled={status === 'working'}
            className={cn(
              'flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-transform active:scale-95 disabled:opacity-50',
              dark ? 'border-white/15 text-white/80' : 'border-border-hair text-ink-muted',
            )}
          >
            <X size={14} weight="bold" /> Reject
          </button>
        </div>
      ) : status === 'approved' ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <Check size={14} weight="bold" /> Approved — transfer complete
        </p>
      ) : status === 'rejected' ? (
        <p className="mt-3 text-xs font-semibold text-ink-muted">Rejected — no money moved.</p>
      ) : (
        <p className="mt-3 text-xs font-semibold text-red-500">Something went wrong — try again from the app.</p>
      )}
    </div>
  )
}

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

function MarkdownMessage({ text, dark }: { text: string; dark: boolean }) {
  return (
    <div
      className={cn(
        'space-y-2 text-sm leading-relaxed [&_p]:m-0',
        '[&_strong]:font-semibold',
        '[&_ul]:m-0 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-4',
        '[&_ol]:m-0 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-4',
        '[&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs',
        dark ? '[&_code]:bg-white/10' : '[&_code]:bg-black/5',
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ ...props }) => (
            // eslint-disable-next-line jsx-a11y/anchor-has-content
            <a {...props} target="_blank" rel="noreferrer" className="underline underline-offset-2" />
          ),
          table: ({ ...props }) => (
            <div className="my-1 overflow-x-auto rounded-lg border border-border-hair">
              <table {...props} className="w-full border-collapse text-xs" />
            </div>
          ),
          thead: ({ ...props }) => <thead {...props} className={cn(dark ? 'bg-white/[0.08]' : 'bg-black/5')} />,
          th: ({ ...props }) => <th {...props} className="whitespace-nowrap px-2.5 py-1.5 text-left font-semibold" />,
          td: ({ ...props }) => (
            <td {...props} className={cn('whitespace-nowrap border-t px-2.5 py-1.5', dark ? 'border-white/10' : 'border-border-hair')} />
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

export interface ChatPanelHandle {
  sendMessage: (text: string) => void
}

function loadPersisted(persistKey: string | undefined, initialMessages: ChatMessage[]): ChatMessage[] {
  if (!persistKey) return initialMessages
  try {
    const raw = localStorage.getItem(`vantra_chat_${persistKey}`)
    if (!raw) return initialMessages
    const parsed = JSON.parse(raw) as ChatMessage[]
    return Array.isArray(parsed) && parsed.length ? parsed : initialMessages
  } catch {
    return initialMessages
  }
}

export const ChatPanel = forwardRef<ChatPanelHandle, {
  title?: string
  initialMessages: ChatMessage[]
  context?: ChatContext
  dark?: boolean
  className?: string
  /** When set, the conversation survives a reload via localStorage under this key. */
  persistKey?: string
  /** Fires true right as a reply starts being read aloud, false when it stops. */
  onSpeakingChange?: (speaking: boolean) => void
  /** Fires on every change to the full transcript — lets a parent page (e.g. to
   * drive "already asked" suggestion filtering) see what's been discussed. */
  onMessagesChange?: (messages: ChatMessage[]) => void
}>(function ChatPanel(
  { title = 'Ask Vantra', initialMessages, context = 'faq', dark = false, className, persistKey, onSpeakingChange, onMessagesChange },
  ref,
) {
  const [messages, setMessages] = useState(() => loadPersisted(persistKey, initialMessages))
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
    onMessagesChange?.(messages)
    if (persistKey) localStorage.setItem(`vantra_chat_${persistKey}`, JSON.stringify(messages))
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        // Strip the ```vantra:...``` data blocks before speaking — they're
        // structured JSON for the UI, not something to read aloud.
        const { cleanText } = extractVantraBlocks(fullReply)
        const utterance = new SpeechSynthesisUtterance(cleanText)
        utterance.onstart = () => onSpeakingChange?.(true)
        utterance.onend = () => onSpeakingChange?.(false)
        utterance.onerror = () => onSpeakingChange?.(false)
        window.speechSynthesis.speak(utterance)
      }
      // The assistant can create/update/delete goals and schedule auto-payments
      // directly (no separate approval step), so any account-context reply may
      // have changed data other pages are showing — have them refetch.
      if (context === 'account') emitDataChanged()
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

  useImperativeHandle(ref, () => ({ sendMessage: (text: string) => send(text) }))

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
            if (speakReplies && ttsSupported.current) {
              window.speechSynthesis.cancel()
              onSpeakingChange?.(false)
            }
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
                    'max-w-full rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                    m.role === 'user'
                      ? 'rounded-tr-sm whitespace-pre-wrap bg-accent text-accent-ink'
                      : cn('rounded-tl-sm', dark ? 'bg-white/[0.06] text-[#f2f3f5]' : 'bg-surface-2 text-ink'),
                  )}
                >
                  {m.text ? (
                    m.role === 'assistant' ? (
                      (() => {
                        const { cleanText, blocks } = extractVantraBlocks(m.text)
                        return (
                          <>
                            <MarkdownMessage text={cleanText} dark={dark} />
                            {blocks.map((block, bi) => {
                              if (block.type === 'approve-transfer') return <TransferApprovalCard key={bi} transfer={block.data as PendingTransferBlock} dark={dark} />
                              if (block.type === 'branches') return <BranchResultsCard key={bi} branches={block.data as BranchOut[]} dark={dark} />
                              if (block.type === 'appointment-form')
                                return <AppointmentBookingCard key={bi} prefill={block.data as { branch_name: string; name?: string; email?: string; preferred_date?: string; preferred_time?: string; reason?: string }} dark={dark} />
                              return null
                            })}
                          </>
                        )
                      })()
                    ) : (
                      m.text
                    )
                  ) : m.role === 'assistant' && streaming && i === messages.length - 1 ? (
                    <span className="inline-flex gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60 [animation-delay:0ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60 [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60 [animation-delay:300ms]" />
                    </span>
                  ) : null}
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
})
