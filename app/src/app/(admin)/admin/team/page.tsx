'use client'

import { useState, type FormEvent } from 'react'
import {
  OPS_PERMISSIONS,
  OPS_ROLES,
  useOps,
  type OpsRole,
} from '../ops-context'

const ROLE_DESCRIPTIONS: Record<OpsRole, string> = {
  'Platform Admin': 'Full control across WhatsApp Meta API, pricing, team roles, and AI guardrails.',
  'Catalog & Pricing Ops': 'Uploads dealer PDFs, audits 1% TCS arithmetic diffs, and publishes price lists.',
  'Concierge Advisor (RM)': 'Handles live chat human takeover, customer queries, and showroom handoffs.',
  'Dealer Coordinator': 'Coordinates test-drive slots and dispatches qualified leads to showrooms.',
}

export default function AdminTeamPage() {
  const {
    activeRole,
    setActiveRole,
    roleMatrix,
    togglePermission,
    teamMembers,
    addTeamMember,
    removeTeamMember,
    resetTeamAndMatrix,
  } = useOps()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<OpsRole>('Concierge Advisor (RM)')
  const [showroomScope, setShowroomScope] = useState('Chennai · All Showrooms')

  function handleAddMember(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!name.trim() || !email.trim()) return

    addTeamMember({
      name: name.trim(),
      email: email.trim(),
      role,
      status: 'Invited',
      showroomScope: showroomScope.trim() || 'Chennai Hub',
    })

    setName('')
    setEmail('')
    setRole('Concierge Advisor (RM)')
    setShowroomScope('Chennai · All Showrooms')
    setIsModalOpen(false)
  }

  return (
    <div>
      <div className="ops-page-head">
        <div>
          <h2 className="ops-page-title">Team &amp; 4-Role Access Control</h2>
          <p className="ops-page-sub">
            Manage internal B2C MotoAI staff and toggle live role permissions (synced with topbar
            Role Preview).
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="ops-btn ops-btn-outline ops-btn-sm"
            onClick={resetTeamAndMatrix}
          >
            Reset Defaults
          </button>
          <button
            type="button"
            className="ops-btn ops-btn-primary ops-btn-sm"
            onClick={() => setIsModalOpen(true)}
          >
            + Add Team Member
          </button>
        </div>
      </div>

      {/* 4 Finalized B2C Role Summary Cards */}
      <div className="ops-four-col">
        {OPS_ROLES.map((r) => {
          const permCount = Object.values(roleMatrix[r]).filter(Boolean).length
          const memberCount = teamMembers.filter((m) => m.role === r).length
          const isPreviewed = activeRole === r

          return (
            <div
              key={r}
              className="ops-card"
              style={{
                borderColor: isPreviewed ? '#0B6E6E' : '#E2E8F0',
                background: isPreviewed ? '#F0FDFA' : '#FFFFFF',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 6,
                    marginBottom: 6,
                  }}
                >
                  <span className="ops-badge ops-badge-brand">
                    {permCount}/{OPS_PERMISSIONS.length} perms
                  </span>
                  <span className="ops-badge ops-badge-slate">{memberCount} user(s)</span>
                </div>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#0F172A' }}>{r}</div>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                  {ROLE_DESCRIPTIONS[r]}
                </div>
              </div>

              <button
                type="button"
                className={`ops-btn ops-btn-sm ${
                  isPreviewed ? 'ops-btn-primary' : 'ops-btn-outline'
                }`}
                onClick={() => setActiveRole(r)}
              >
                {isPreviewed ? '✓ Previewing Role' : 'Preview Role'}
              </button>
            </div>
          )
        })}
      </div>

      {/* Team Members Table */}
      <section className="ops-card" style={{ marginBottom: 18 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
            marginBottom: 12,
          }}
        >
          <div>
            <h3 className="ops-panel-title">Internal B2C Team Members</h3>
            <div className="ops-panel-sub">
              Single-organization MotoAI team · persisted locally in browser storage
            </div>
          </div>
          <span className="ops-badge ops-badge-slate">{teamMembers.length} Members</span>
        </div>

        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Showroom Scope</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {teamMembers.map((member) => (
                <tr key={member.id}>
                  <td style={{ fontWeight: 700, color: '#0F172A' }}>{member.name}</td>
                  <td>{member.email}</td>
                  <td>
                    <span className="ops-badge ops-badge-brand">{member.role}</span>
                  </td>
                  <td style={{ fontSize: 12.5, color: '#475569' }}>{member.showroomScope}</td>
                  <td>
                    <span
                      className={`ops-badge ${
                        member.status === 'Active' ? 'ops-badge-ok' : 'ops-badge-accent'
                      }`}
                    >
                      {member.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {member.id === 'tm-1' ? (
                      <span style={{ fontSize: 11.5, color: '#94A3B8' }}>Owner</span>
                    ) : (
                      <button
                        type="button"
                        className="ops-btn ops-btn-outline ops-btn-sm"
                        onClick={() => removeTeamMember(member.id)}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Interactive 7 x 4 Role Permission Matrix */}
      <section className="ops-card">
        <div style={{ marginBottom: 12 }}>
          <h3 className="ops-panel-title">Interactive Role Permission Matrix</h3>
          <div className="ops-panel-sub">
            Toggle any capability across the 4 internal roles — changes apply immediately to Role
            Preview and persist locally.
          </div>
        </div>

        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>Permission</th>
                {OPS_ROLES.map((r) => (
                  <th key={r}>{r}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {OPS_PERMISSIONS.map((perm) => (
                <tr key={perm.key}>
                  <td style={{ fontWeight: 700, color: '#0F172A' }}>{perm.label}</td>
                  {OPS_ROLES.map((r) => {
                    const checked = roleMatrix[r][perm.key]
                    return (
                      <td key={`${perm.key}-${r}`}>
                        <label className="ops-switch" aria-label={`${r} - ${perm.label}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => togglePermission(r, perm.key, e.target.checked)}
                          />
                          <span className="ops-switch-slider" />
                        </label>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Add Team Member Modal */}
      {isModalOpen && (
        <div
          className="ops-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsModalOpen(false)
          }}
        >
          <div className="ops-modal" role="dialog" aria-modal="true" aria-labelledby="add-tm-title">
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <h3 id="add-tm-title" style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
                Add MotoAI Team Member
              </h3>
              <button
                type="button"
                className="ops-btn ops-btn-outline ops-btn-sm"
                onClick={() => setIsModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleAddMember}
              style={{ padding: 18, display: 'grid', gap: 12 }}
            >
              <label style={{ display: 'grid', gap: 4, fontSize: 12.5, fontWeight: 700 }}>
                <span>Full Name</span>
                <input
                  required
                  className="ops-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Karthika S"
                />
              </label>

              <label style={{ display: 'grid', gap: 4, fontSize: 12.5, fontWeight: 700 }}>
                <span>Work Email</span>
                <input
                  required
                  type="email"
                  className="ops-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="karthika@motoai.in"
                />
              </label>

              <label style={{ display: 'grid', gap: 4, fontSize: 12.5, fontWeight: 700 }}>
                <span>Internal Role</span>
                <select
                  className="ops-select"
                  value={role}
                  onChange={(e) => setRole(e.target.value as OpsRole)}
                >
                  {OPS_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'grid', gap: 4, fontSize: 12.5, fontWeight: 700 }}>
                <span>Showroom / City Scope</span>
                <input
                  className="ops-input"
                  value={showroomScope}
                  onChange={(e) => setShowroomScope(e.target.value)}
                  placeholder="e.g. Epic Toyota Guindy · OMR"
                />
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  className="ops-btn ops-btn-outline"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="ops-btn ops-btn-primary">
                  Create Invite
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
