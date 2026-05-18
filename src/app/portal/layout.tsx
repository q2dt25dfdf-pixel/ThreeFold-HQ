import { ReactNode } from 'react'

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F7F3EC' }}>
      {children}
    </div>
  )
}
