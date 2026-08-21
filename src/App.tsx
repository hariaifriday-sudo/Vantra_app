import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider, RequireRole } from '@/lib/auth'
import Homepage from '@/pages/public/Homepage'
import Assistant from '@/pages/public/Assistant'
import Login from '@/pages/public/Login'
import Trust from '@/pages/public/Trust'
import { AccountLayout } from '@/components/layout/AccountLayout'
import Dashboard from '@/pages/account/Dashboard'
import Kyc from '@/pages/account/Kyc'
import Notifications from '@/pages/account/Notifications'
import { Accounts, Cards, Loans, Settings, Transfers } from '@/pages/account/Simple'
import { AgentLayout } from '@/components/layout/AgentLayout'
import AgentDashboard from '@/pages/agent/Dashboard'
import KycReview from '@/pages/agent/KycReview'
import Fraud from '@/pages/agent/Fraud'
import Aml from '@/pages/agent/Aml'
import Documents from '@/pages/agent/Documents'
import Cases from '@/pages/agent/Cases'
import Underwriting from '@/pages/agent/Underwriting'
import Knowledge from '@/pages/agent/Knowledge'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Homepage />} />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="/login" element={<Login />} />
          <Route path="/trust" element={<Trust />} />

          <Route
            path="/app"
            element={
              <RequireRole role="account_holder">
                <AccountLayout />
              </RequireRole>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="accounts" element={<Accounts />} />
            <Route path="transfers" element={<Transfers />} />
            <Route path="cards" element={<Cards />} />
            <Route path="loans" element={<Loans />} />
            <Route path="kyc" element={<Kyc />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          <Route
            path="/agent"
            element={
              <RequireRole role="agent">
                <AgentLayout />
              </RequireRole>
            }
          >
            <Route index element={<AgentDashboard />} />
            <Route path="kyc" element={<KycReview />} />
            <Route path="fraud" element={<Fraud />} />
            <Route path="aml" element={<Aml />} />
            <Route path="documents" element={<Documents />} />
            <Route path="cases" element={<Cases />} />
            <Route path="underwriting" element={<Underwriting />} />
            <Route path="knowledge" element={<Knowledge />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
