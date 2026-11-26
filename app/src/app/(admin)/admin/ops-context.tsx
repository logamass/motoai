'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export const OPS_ROLES = [
  'Platform Admin',
  'Catalog & Pricing Ops',
  'Concierge Advisor (RM)',
  'Dealer Coordinator',
] as const

export type OpsRole = (typeof OPS_ROLES)[number]

export const OPS_PERMISSIONS = [
  { key: 'uploadPdf', label: 'Upload Dealer PDFs' },
  { key: 'editPrice', label: 'Manual Price & Spec Edit' },
  { key: 'publishPrice', label: 'Publish Price Lists' },
  { key: 'liveTakeover', label: 'Live Chat Human Takeover' },
  { key: 'wabaSetup', label: 'WhatsApp Meta API Setup' },
  { key: 'viewPii', label: 'View Buyer Phone PII' },
  { key: 'dispatchLeads', label: 'Dispatch Leads to Showrooms' },
] as const

export type PermissionKey = (typeof OPS_PERMISSIONS)[number]['key']
export type RolePermissions = Record<PermissionKey, boolean>
export type RoleMatrix = Record<OpsRole, RolePermissions>

export interface TeamMember {
  id: string
  name: string
  email: string
  role: OpsRole
  status: 'Active' | 'Invited'
  showroomScope: string
}

export const DEFAULT_ROLE_MATRIX: RoleMatrix = {
  'Platform Admin': {
    uploadPdf: true,
    editPrice: true,
    publishPrice: true,
    liveTakeover: true,
    wabaSetup: true,
    viewPii: true,
    dispatchLeads: true,
  },
  'Catalog & Pricing Ops': {
    uploadPdf: true,
    editPrice: true,
    publishPrice: true,
    liveTakeover: false,
    wabaSetup: false,
    viewPii: false,
    dispatchLeads: false,
  },
  'Concierge Advisor (RM)': {
    uploadPdf: false,
    editPrice: false,
    publishPrice: false,
    liveTakeover: true,
    wabaSetup: false,
    viewPii: true,
    dispatchLeads: true,
  },
  'Dealer Coordinator': {
    uploadPdf: false,
    editPrice: false,
    publishPrice: false,
    liveTakeover: false,
    wabaSetup: false,
    viewPii: true,
    dispatchLeads: true,
  },
}

export const DEFAULT_TEAM_MEMBERS: TeamMember[] = [
  {
    id: 'tm-1',
    name: 'Loga',
    email: 'loga@motoai.in',
    role: 'Platform Admin',
    status: 'Active',
    showroomScope: 'All Chennai Hubs',
  },
  {
    id: 'tm-2',
    name: 'Ananya R',
    email: 'ananya@motoai.in',
    role: 'Catalog & Pricing Ops',
    status: 'Active',
    showroomScope: 'All Brands · TN RTO',
  },
  {
    id: 'tm-3',
    name: 'Vikram K',
    email: 'vikram@motoai.in',
    role: 'Concierge Advisor (RM)',
    status: 'Active',
    showroomScope: 'OMR · Adyar · Velachery',
  },
  {
    id: 'tm-4',
    name: 'Senthil M',
    email: 'senthil@motoai.in',
    role: 'Dealer Coordinator',
    status: 'Active',
    showroomScope: 'Epic Toyota Guindy · Lanson OMR',
  },
]

const STORAGE_ROLE_KEY = 'motoai_ops_active_role_v1'
const STORAGE_MATRIX_KEY = 'motoai_ops_role_matrix_v1'
const STORAGE_TEAM_KEY = 'motoai_ops_team_members_v1'

interface OpsContextValue {
  activeRole: OpsRole
  setActiveRole: (role: OpsRole) => void
  roleMatrix: RoleMatrix
  activePermissions: RolePermissions
  togglePermission: (role: OpsRole, key: PermissionKey, enabled: boolean) => void
  teamMembers: TeamMember[]
  addTeamMember: (member: Omit<TeamMember, 'id'>) => void
  removeTeamMember: (id: string) => void
  resetTeamAndMatrix: () => void
  showToast: (message: string) => void
}

const OpsContext = createContext<OpsContextValue | null>(null)

export function OpsProvider({ children }: { children: ReactNode }) {
  const [activeRole, setActiveRoleState] = useState<OpsRole>('Platform Admin')
  const [roleMatrix, setRoleMatrix] = useState<RoleMatrix>(DEFAULT_ROLE_MATRIX)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(DEFAULT_TEAM_MEMBERS)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  useEffect(() => {
    try {
      const savedRole = window.localStorage.getItem(STORAGE_ROLE_KEY)
      if (savedRole && OPS_ROLES.includes(savedRole as OpsRole)) {
        setActiveRoleState(savedRole as OpsRole)
      }

      const savedMatrix = window.localStorage.getItem(STORAGE_MATRIX_KEY)
      if (savedMatrix) {
        const parsed = JSON.parse(savedMatrix) as Partial<RoleMatrix>
        setRoleMatrix((prev) => ({
          'Platform Admin': { ...prev['Platform Admin'], ...parsed['Platform Admin'] },
          'Catalog & Pricing Ops': {
            ...prev['Catalog & Pricing Ops'],
            ...parsed['Catalog & Pricing Ops'],
          },
          'Concierge Advisor (RM)': {
            ...prev['Concierge Advisor (RM)'],
            ...parsed['Concierge Advisor (RM)'],
          },
          'Dealer Coordinator': {
            ...prev['Dealer Coordinator'],
            ...parsed['Dealer Coordinator'],
          },
        }))
      }

      const savedTeam = window.localStorage.getItem(STORAGE_TEAM_KEY)
      if (savedTeam) {
        const parsedTeam = JSON.parse(savedTeam) as TeamMember[]
        if (Array.isArray(parsedTeam) && parsedTeam.length > 0) {
          setTeamMembers(parsedTeam)
        }
      }
    } catch {
      // Ignore malformed localStorage entries
    }
  }, [])

  useEffect(() => {
    if (!toastMessage) return
    const timer = window.setTimeout(() => setToastMessage(null), 3200)
    return () => window.clearTimeout(timer)
  }, [toastMessage])

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
  }, [])

  const setActiveRole = useCallback(
    (role: OpsRole) => {
      setActiveRoleState(role)
      try {
        window.localStorage.setItem(STORAGE_ROLE_KEY, role)
      } catch {
        // Ignore storage write error
      }
      showToast(`Previewing Ops Console as ${role}`)
    },
    [showToast]
  )

  const togglePermission = useCallback(
    (role: OpsRole, key: PermissionKey, enabled: boolean) => {
      setRoleMatrix((prev) => {
        const next: RoleMatrix = {
          ...prev,
          [role]: {
            ...prev[role],
            [key]: enabled,
          },
        }
        try {
          window.localStorage.setItem(STORAGE_MATRIX_KEY, JSON.stringify(next))
        } catch {
          // Ignore storage write error
        }
        return next
      })
      showToast(`${role}: ${key} ${enabled ? 'enabled' : 'disabled'}`)
    },
    [showToast]
  )

  const addTeamMember = useCallback(
    (member: Omit<TeamMember, 'id'>) => {
      const nextItem: TeamMember = {
        ...member,
        id: `tm-${Date.now()}`,
      }
      setTeamMembers((prev) => {
        const next = [...prev, nextItem]
        try {
          window.localStorage.setItem(STORAGE_TEAM_KEY, JSON.stringify(next))
        } catch {
          // Ignore storage write error
        }
        return next
      })
      showToast(`Added ${member.name} (${member.role})`)
    },
    [showToast]
  )

  const removeTeamMember = useCallback(
    (id: string) => {
      setTeamMembers((prev) => {
        const next = prev.filter((m) => m.id !== id)
        try {
          window.localStorage.setItem(STORAGE_TEAM_KEY, JSON.stringify(next))
        } catch {
          // Ignore storage write error
        }
        return next
      })
      showToast('Team member removed')
    },
    [showToast]
  )

  const resetTeamAndMatrix = useCallback(() => {
    setRoleMatrix(DEFAULT_ROLE_MATRIX)
    setTeamMembers(DEFAULT_TEAM_MEMBERS)
    try {
      window.localStorage.removeItem(STORAGE_MATRIX_KEY)
      window.localStorage.removeItem(STORAGE_TEAM_KEY)
    } catch {
      // Ignore storage error
    }
    showToast('Reset team & role matrix to defaults')
  }, [showToast])

  const value = useMemo<OpsContextValue>(
    () => ({
      activeRole,
      setActiveRole,
      roleMatrix,
      activePermissions: roleMatrix[activeRole],
      togglePermission,
      teamMembers,
      addTeamMember,
      removeTeamMember,
      resetTeamAndMatrix,
      showToast,
    }),
    [
      activeRole,
      setActiveRole,
      roleMatrix,
      togglePermission,
      teamMembers,
      addTeamMember,
      removeTeamMember,
      resetTeamAndMatrix,
      showToast,
    ]
  )

  return (
    <OpsContext.Provider value={value}>
      {children}
      {toastMessage && (
        <div className="ops-toast" role="status" aria-live="polite">
          {toastMessage}
        </div>
      )}
    </OpsContext.Provider>
  )
}

export function useOps(): OpsContextValue {
  const ctx = useContext(OpsContext)
  if (!ctx) {
    throw new Error('useOps must be used inside OpsProvider')
  }
  return ctx
}
