import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowLeft,
  Camera,
  Checks,
  DotsThreeVertical,
  Microphone,
  Pause,
  Paperclip,
  PaperPlaneTilt,
  Play,
  Smiley,
  VideoCamera,
  Phone as PhoneIcon,
} from '@phosphor-icons/react'
import { BranchResultsCard } from '@/components/assistant/BranchResultsCard'
import { AppointmentBookingCard } from '@/components/assistant/AppointmentBookingCard'
import { MyAppointmentsCard, type AppointmentLookup } from '@/components/assistant/MyAppointmentsCard'
import { cn } from '@/lib/utils'
import { api, type BranchOut } from '@/lib/api'

interface AppointmentPrefill {
  branch_name: string
  name?: string
  email?: string
  preferred_date?: string
  preferred_time?: string
  reason?: string
}

/**
 * A WhatsApp-styled skin over the exact same public FAQ assistant backend
 * (`context=faq` — branch lookup, appointment booking, human escalation all
 * work here too). This is a UI mockup for demoing "what if this were on
 * WhatsApp" without standing up a real WhatsApp Business webhook/public
 * hosting — it is not connected to WhatsApp itself. Deliberately not linked
 * from any nav so it doesn't clutter the main site; reachable only by its
 * own URL.
 */

const VANTRA_BLOCK_RE = /```vantra:([\w-]+)\n([\s\S]*?)\n```/g

interface VantraBlock {
  type: string
  data: unknown
}

function extractVantraBlocks(text: string): { cleanText: string; blocks: VantraBlock[] } {
  const blocks: VantraBlock[] = []
  const cleanText = text
    .replace(VANTRA_BLOCK_RE, (_m, type: string, json: string) => {
      try {
        blocks.push({ type, data: JSON.parse(json) })
      } catch {
        // drop malformed block
      }
      return ''
    })
    .trim()
  return { cleanText, blocks }
}

interface Message {
  id: number
  role: 'user' | 'assistant'
  text: string
  time: string
}

async function streamReply(message: string, sessionKey: string, onToken: (t: string) => void) {
  const params = new URLSearchParams({ message, session_key: sessionKey, context: 'faq' })
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

function timeNow() {
  return new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

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

// Stable per-message decorative waveform — seeded from the message id so it
// doesn't reshuffle on every re-render.
function waveform(seed: number): number[] {
  let s = seed * 9301 + 49297
  const bars: number[] = []
  for (let i = 0; i < 28; i++) {
    s = (s * 9301 + 49297) % 233280
    bars.push(6 + Math.round((s / 233280) * 18))
  }
  return bars
}

function VoiceNote({ text, id }: { text: string; id: number }) {
  const [playing, setPlaying] = useState(false)
  const bars = useRef(waveform(id)).current
  const ttsSupported = useRef(typeof window !== 'undefined' && 'speechSynthesis' in window)
  const wordCount = text.trim().split(/\s+/).length
  const seconds = Math.max(3, Math.round((wordCount / 150) * 60))
  const duration = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

  function toggle() {
    if (!ttsSupported.current) return
    if (playing) {
      window.speechSynthesis.cancel()
      setPlaying(false)
      return
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.onend = () => setPlaying(false)
    utterance.onerror = () => setPlaying(false)
    window.speechSynthesis.speak(utterance)
    setPlaying(true)
  }

  return (
    <div className="mt-1.5 flex items-center gap-2.5 rounded-2xl bg-black/[0.03] px-3 py-2">
      <button
        onClick={toggle}
        disabled={!ttsSupported.current}
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
        className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full bg-[#25D366] text-white transition-transform active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {playing ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" className="ml-0.5" />}
      </button>
      <div className="flex h-8 flex-1 items-center gap-[3px]">
        {bars.map((h, i) => (
          <span
            key={i}
            className={cn('w-[3px] rounded-full transition-colors', playing && i < bars.length * 0.6 ? 'bg-[#25D366]' : 'bg-black/20')}
            style={{ height: `${h}px` }}
          />
        ))}
      </div>
      <span className="shrink-0 text-[11px] tabular-nums text-black/40">{duration}</span>
    </div>
  )
}

const INITIAL_GREETING: Message = {
  id: 0,
  role: 'assistant',
  text: "Hi! I'm Vantra's assistant on WhatsApp. Ask me about accounts, cards, loans, or say \"find a branch\" / \"book an appointment\" / \"talk to a human.\"",
  time: timeNow(),
}

// A real WhatsApp thread doesn't forget you the moment you close the app —
// reusing the same session key (and restoring the displayed messages) across
// a reload keeps this demo consistent with that, and with how the main FAQ
// page already persists via `persistKey` on ChatPanel.
function loadPersistedSessionKey(): string {
  const existing = localStorage.getItem('vantra_whatsapp_session_key')
  if (existing) return existing
  const fresh = `whatsapp-demo-${crypto.randomUUID()}`
  localStorage.setItem('vantra_whatsapp_session_key', fresh)
  return fresh
}

function loadPersistedMessages(): Message[] {
  try {
    const raw = localStorage.getItem('vantra_whatsapp_messages')
    if (!raw) return [INITIAL_GREETING]
    const parsed = JSON.parse(raw) as Message[]
    return Array.isArray(parsed) && parsed.length ? parsed : [INITIAL_GREETING]
  } catch {
    return [INITIAL_GREETING]
  }
}

export default function WhatsAppDemo() {
  const [messages, setMessages] = useState<Message[]>(loadPersistedMessages)
  const [draft, setDraft] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [listening, setListening] = useState(false)
  const sessionKey = useRef(loadPersistedSessionKey())
  const scrollRef = useRef<HTMLDivElement>(null)
  const nextId = useRef(Math.max(1, ...loadPersistedMessages().map((m) => m.id + 1)))
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const speechSupported = useRef(getSpeechRecognition() !== null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    localStorage.setItem('vantra_whatsapp_messages', JSON.stringify(messages))
  }, [messages, streaming])

  useEffect(() => {
    return () => recognitionRef.current?.stop()
  }, [])

  async function send(text?: string) {
    const value = (text ?? draft).trim()
    if (!value || streaming) return
    const userId = nextId.current++
    const replyId = nextId.current++
    setMessages((m) => [...m, { id: userId, role: 'user', text: value, time: timeNow() }, { id: replyId, role: 'assistant', text: '', time: timeNow() }])
    setDraft('')
    setStreaming(true)
    let full = ''
    try {
      await streamReply(value, sessionKey.current, (token) => {
        full += token
        setMessages((m) => m.map((msg) => (msg.id === replyId ? { ...msg, text: full } : msg)))
      })
    } catch {
      setMessages((m) => m.map((msg) => (msg.id === replyId ? { ...msg, text: "Sorry, I couldn't connect just now." } : msg)))
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
    <div className="flex min-h-screen items-center justify-center bg-[#0b141a] p-0 sm:p-6">
      <div className="flex h-screen w-full max-w-[440px] flex-col overflow-hidden bg-[#efeae2] shadow-2xl sm:h-[900px] sm:rounded-[36px] sm:border-8 sm:border-black">
        {/* Demo disclaimer */}
        <div className="shrink-0 bg-[#111b21] px-3 py-1 text-center text-[10px] font-medium tracking-wide text-white/50">
          UI DEMO — WhatsApp-style preview, not affiliated with WhatsApp/Meta
        </div>

        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 bg-[#075E54] px-3 py-2.5 text-white">
          <ArrowLeft size={20} />
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 font-display text-sm font-bold">V</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-medium">Vantra Bank</p>
            <p className="text-[11px] text-white/70">{streaming ? 'typing…' : 'online'}</p>
          </div>
          <VideoCamera size={19} />
          <PhoneIcon size={17} />
          <DotsThreeVertical size={19} />
        </div>

        {/* Message list */}
        <div
          ref={scrollRef}
          className="flex-1 space-y-1.5 overflow-y-auto px-3 py-3"
          style={{
            backgroundColor: '#efeae2',
            backgroundImage:
              'radial-gradient(circle at 20% 20%, rgba(0,0,0,0.02) 0%, transparent 40%), radial-gradient(circle at 80% 60%, rgba(0,0,0,0.02) 0%, transparent 40%)',
          }}
        >
          {messages.map((m) => {
            const isUser = m.role === 'user'
            const { cleanText, blocks } = extractVantraBlocks(m.text)
            return (
              <div key={m.id} className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[82%] rounded-lg px-2.5 py-1.5 text-[14.2px] leading-relaxed shadow-sm',
                    isUser ? 'rounded-tr-none bg-[#d9fdd3]' : 'rounded-tl-none bg-white',
                  )}
                >
                  {cleanText ? (
                    <div className="[&_p]:m-0 [&_ul]:m-0 [&_ul]:list-disc [&_ul]:space-y-0.5 [&_ul]:pl-4 [&_strong]:font-semibold">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanText}</ReactMarkdown>
                    </div>
                  ) : streaming && m.role === 'assistant' && m.id === messages[messages.length - 1].id ? (
                    <span className="inline-flex gap-1 py-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-black/30 [animation-delay:0ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-black/30 [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-black/30 [animation-delay:300ms]" />
                    </span>
                  ) : null}

                  {blocks.map((b, i) => {
                    if (b.type === 'branches') return <BranchResultsCard key={i} branches={b.data as BranchOut[]} dark={false} />
                    if (b.type === 'appointment-form') return <AppointmentBookingCard key={i} prefill={b.data as AppointmentPrefill} dark={false} />
                    if (b.type === 'appointments') return <MyAppointmentsCard key={i} appointments={b.data as AppointmentLookup[]} dark={false} />
                    return null
                  })}

                  {!isUser && cleanText ? <VoiceNote text={cleanText} id={m.id} /> : null}

                  <div className={cn('mt-0.5 flex items-center justify-end gap-1 text-[10.5px]', isUser ? 'text-black/40' : 'text-black/35')}>
                    {m.time}
                    {isUser ? <Checks size={14} className="text-[#53bdeb]" /> : null}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Input bar */}
        <div className="flex shrink-0 items-center gap-2 bg-[#f0f2f5] px-2 py-2">
          <div className="flex flex-1 items-center gap-2 rounded-full bg-white px-3 py-2">
            <Smiley size={20} className="shrink-0 text-black/40" />
            {listening ? (
              <span className="flex flex-1 items-center gap-1.5 text-sm text-black/50">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> Listening…
              </span>
            ) : (
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="Message"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-black/40"
              />
            )}
            <Paperclip size={19} className="shrink-0 text-black/40" />
            <Camera size={19} className="shrink-0 text-black/40" />
          </div>
          <button
            onClick={() => (draft.trim() ? send() : toggleVoice())}
            disabled={streaming || (!draft.trim() && !speechSupported.current)}
            aria-label={draft.trim() ? 'Send message' : listening ? 'Stop recording' : 'Record voice message'}
            title={!draft.trim() && !speechSupported.current ? 'Voice input is not supported in this browser' : undefined}
            className={cn(
              'grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full text-white transition-transform active:scale-90 disabled:cursor-not-allowed disabled:opacity-50',
              listening ? 'animate-pulse bg-red-500' : 'bg-[#00a884]',
            )}
          >
            {draft.trim() ? <PaperPlaneTilt size={17} weight="fill" /> : <Microphone size={19} weight="fill" />}
          </button>
        </div>
      </div>
    </div>
  )
}
