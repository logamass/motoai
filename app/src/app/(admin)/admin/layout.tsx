import type { ReactNode } from 'react'
import { OpsProvider } from './ops-context'
import { OpsShell } from './OpsShell'
import './ops.css'

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <OpsProvider>
      <OpsShell>{children}</OpsShell>
    </OpsProvider>
  )
}
