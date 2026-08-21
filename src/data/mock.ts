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

export const quickQuestions = [
  'Check my loan eligibility',
  'Compare savings account rates',
  'Where do I upload KYC documents?',
  'Calculate my EMI',
  'How do I freeze my card?',
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
