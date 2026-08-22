// Static, non-personalized content for the public site and illustrative
// dashboard charts that don't have a dedicated backend model (yet).
// Everything account/agent-specific comes from the real API — see src/lib/api.ts.

export const quickPayees = [
  { name: 'Anna', color: '#e8b23d' },
  { name: 'Sam', color: '#c9c2f0' },
  { name: 'Lily', color: '#bfe3f5' },
  { name: 'Clara', color: '#c7efd8' },
  { name: 'Ruben', color: '#e8b23d' },
]

export const assistantIntro = [
  {
    role: 'assistant' as const,
    text: "Hi, I'm Vantra. I can check balances, explain a charge, help with KYC, or calculate a loan payment. What do you need?",
  },
]

export const faqCategories = [
  { name: 'Accounts & Cards', count: 18 },
  { name: 'Loans & Credit', count: 14 },
  { name: 'KYC & Verification', count: 9 },
  { name: 'Security & Fraud', count: 11 },
  { name: 'Fees & Limits', count: 7 },
]

// A curated sample from each category's full article count above — enough to
// answer the most common questions inline without a click into chat. The rest
// of each category's articles aren't written out individually; "ask in chat"
// covers them.
export const faqArticles = [
  { category: 'Accounts & Cards', q: 'How do I open a new account?', a: 'Tap Get Started, verify your identity (KYC takes under two minutes for most applicants), and your account is ready instantly — no branch visit needed.' },
  { category: 'Accounts & Cards', q: 'How do I freeze or unfreeze my card?', a: 'Go to Cards in the app and toggle Freeze. It takes effect immediately and blocks new purchases; pending transactions already in progress still settle.' },
  { category: 'Accounts & Cards', q: 'Can I have more than one account?', a: 'Yes — most customers hold a checking and a savings account, and Plus/Business plans support additional virtual cards under the same login.' },
  { category: 'Accounts & Cards', q: 'How do I add or manage a beneficiary?', a: 'In the app, go to Transfers → Beneficiaries → Add. Once saved, you can send to them anytime — transfers still require your one-time approval in-app.' },
  { category: 'Loans & Credit', q: 'How is my loan eligibility decided?', a: 'We look at income, existing obligations, and credit history. Log in and ask the assistant "check my loan eligibility" for a real, personalized read — this page can only give general ranges.' },
  { category: 'Loans & Credit', q: 'What loan terms are available?', a: 'Personal loans run 6–60 months at rates from 7.9% APR, fixed for the life of the loan. Use the calculator on this page for an exact monthly payment estimate.' },
  { category: 'Loans & Credit', q: 'How fast do funds arrive after approval?', a: 'Most approved personal loans fund within 24 hours directly to your Vantra checking account.' },
  { category: 'Loans & Credit', q: 'Is there a prepayment penalty?', a: 'No — you can pay off a Vantra loan early at any time with no prepayment penalty or fee.' },
  { category: 'KYC & Verification', q: 'Where do I upload KYC documents?', a: 'Log in, go to Verification, and upload a government-issued photo ID. Our OCR pipeline pre-fills your details automatically — you confirm and submit.' },
  { category: 'KYC & Verification', q: 'How long does verification take?', a: 'Most applicants are auto-reviewed in under two minutes. Edge cases are routed to a human reviewer, typically resolved within one business day.' },
  { category: 'KYC & Verification', q: 'My verification was rejected or needs more info — what now?', a: 'Open the Verification page and start a new submission — you can resubmit as many times as needed. The reviewer notes on your last attempt explain what to fix.' },
  { category: 'Security & Fraud', q: 'How does Vantra protect my account?', a: 'Every transaction is screened in real time for fraud patterns (unusual location, card-testing bursts, amount outliers), plus bank-level encryption and biometric login.' },
  { category: 'Security & Fraud', q: 'I don’t recognize a charge — what do I do?', a: 'Log in and open the transaction, then tap Dispute. It’s routed straight to our fraud team with your description attached — no hold music required.' },
  { category: 'Security & Fraud', q: 'What happens if fraud is confirmed on my card?', a: 'The card is blocked immediately, we open a dispute on your behalf, and you’re notified in-app the moment it’s confirmed.' },
  { category: 'Fees & Limits', q: 'Are there any monthly fees?', a: 'The Everyday plan is free for life. Plus ($9/mo) and Business add optional features for a flat monthly rate — cancel anytime, no lock-in.' },
  { category: 'Fees & Limits', q: 'What are my transfer limits?', a: 'Everyday accounts can send up to $10,000/day; Plus raises that limit. Log in and ask the assistant for your exact current limit.' },
  { category: 'Fees & Limits', q: 'Are there foreign transaction fees?', a: 'No foreign transaction fees on any Vantra card, and international transfers use mid-market exchange rates in 150+ countries.' },
]

export const quickQuestions = [
  'Check my loan eligibility',
  'Compare savings account rates',
  'Where do I upload KYC documents?',
  'Calculate my EMI',
  'How do I freeze my card?',
]

// Shown as extra quick-action chips alongside quickQuestions — each maps to a
// real chat tool (find_nearest_branch / propose_appointment_booking /
// escalate_to_human) rather than just being a canned FAQ prompt.
export const quickActions = [
  'Find a branch near me',
  'Book a branch appointment',
  'Talk to a human agent',
]

export const productOffers = [
  { name: 'Horizon Savings', rate: '4.35% APY', blurb: 'No minimum balance, daily compounding.' },
  { name: 'Vantra Platinum Card', rate: '2% cashback', blurb: 'No annual fee for the first year.' },
  { name: 'Bridge Personal Loan', rate: 'From 7.9% APR', blurb: 'Fixed rate, funds in 24 hours.' },
]

// ---- AML dashboard charts (illustrative — the alerts list itself is real, from /api/aml) ----

export const amlAnomalyTrend = [
  { day: 'Mon', low: 12, high: 28 },
  { day: 'Tue', low: 15, high: 34 },
  { day: 'Wed', low: 18, high: 41 },
  { day: 'Thu', low: 14, high: 30 },
  { day: 'Fri', low: 22, high: 47 },
  { day: 'Sat', low: 9, high: 21 },
  { day: 'Sun', low: 11, high: 25 },
]

export const amlFlagCategories = [
  { name: 'AML', value: 38, color: '#2fd4c4' },
  { name: 'Sanctions', value: 21, color: '#ec4899' },
  { name: 'KYC', value: 18, color: '#8b5cf6' },
  { name: 'Behavioral', value: 14, color: '#f0b959' },
  { name: 'Structuring', value: 9, color: '#fb7185' },
]

export const amlFrameworkCoverage = [
  { framework: 'BSA/AML Program', coverage: 91 },
  { framework: 'OFAC / Sanctions', coverage: 97 },
  { framework: 'FFIEC Exam Manual', coverage: 84 },
]
