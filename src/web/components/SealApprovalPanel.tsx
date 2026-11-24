import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Clock3, Lock, PenTool, Send, ShieldCheck, Stamp, XCircle } from 'lucide-react'
import { get, post } from '../lib/api'
import { useMeta } from '../lib/meta'
import { useToast } from '../lib/toast'
import { Modal } from '../ui/kit'
import { canRequestCompanySeal, canUseCompanySealDirectly } from '@shared/swk-staff-access'

export interface SealApprovalStatus {
  canDirect: boolean
  canRequest: boolean
  approvedSeal: boolean
  approvedSignature: boolean
  pending: {
    id: number
    document_title: string
    include_seal: boolean
    include_signature: boolean
    created_at: string
  } | null
  latest: {
    id: number
    status: 'Pending' | 'Approved' | 'Rejected'
    decision_note: string | null
    expires_at: string | null
    decided_by_name: string | null
  } | null
}

interface SealApprovalPanelProps {
  sourceType: 'studio' | 'word' | 'print'
  sourceId?: number | null
  documentTitle: string
  recipientName?: string
  includeSeal?: boolean
  includeSignature?: boolean
  onToggleSeal?: (next: boolean) => void
  onToggleSignature?: (next: boolean) => void
  compact?: boolean
}

export function SealApprovalPanel({
  sourceType,
  sourceId,
  documentTitle,
  recipientName,
  includeSeal = false,
  includeSignature = false,
  onToggleSeal,
  onToggleSignature,
  compact = false,
}: SealApprovalPanelProps) {
  const { me, meta } = useMeta()
  const toast = useToast()
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [reqSeal, setReqSeal] = useState(true)
  const [reqSig, setReqSig] = useState(true)
  const [recipient, setRecipient] = useState(recipientName || '')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const canDirect = canUseCompanySealDirectly(me)
  const canRequest = canRequestCompanySeal(me)

  const statusQ = useQuery({
    queryKey: ['seal-approval-check', sourceType, sourceId ?? 'none'],
    enabled: Boolean(me && !me.party_id && canRequest),
    queryFn: () =>
      get<SealApprovalStatus>('/api/seal-approvals/check', {
        source_type: sourceType,
        ...(sourceId ? { source_id: sourceId } : {}),
      }),
    refetchInterval: 30_000,
  })

  if (!me || me.party_id || !canRequest) return null

  const st = statusQ.data
  const sealAllowed = canDirect || Boolean(st?.approvedSeal)
  const sigAllowed = canDirect || Boolean(st?.approvedSignature)
  const hasSealImg = Boolean(meta?.settings?.document_seal)
  const hasSigImg = Boolean(meta?.settings?.document_signature)

  const submitRequest = async () => {
    if (!reqSeal && !reqSig) {
      toast.error('Select Company Seal and/or Owner Signature.')
      return
    }
    if (reason.trim().length < 5) {
      toast.error('Please enter a brief justification for Owner approval (at least 5 characters).')
      return
    }
    setSubmitting(true)
    try {
      await post('/api/seal-approvals', {
        source_type: sourceType,
        source_id: sourceId ?? null,
        document_title: documentTitle.trim() || 'SWK Official Document',
        recipient_name: recipient.trim() || undefined,
        reason: reason.trim(),
        include_seal: reqSeal,
        include_signature: reqSig,
      })
      toast.ok('Sent to Owner Shabib Siraj for seal & signature approval')
      setModalOpen(false)
      setReason('')
      void qc.invalidateQueries({ queryKey: ['seal-approval-check'] })
      void qc.invalidateQueries({ queryKey: ['seal-approvals'] })
    } catch (e: any) {
      toast.error(e?.message || 'Could not submit approval request')
    } finally {
      setSubmitting(false)
    }
  }

  const requestModal = (
    <Modal
      open={modalOpen}
      onClose={() => setModalOpen(false)}
      width={500}
      title="Request Owner Approval — Seal & Signature"
      footer={
        <>
          <div className="flex-1" />
          <button type="button" className="btn outline" onClick={() => setModalOpen(false)}>
            Cancel
          </button>
          <button type="button" className="btn green" disabled={submitting} onClick={() => void submitRequest()}>
            <Send size={14} /> {submitting ? 'Sending…' : 'Send to Owner'}
          </button>
        </>
      }
    >
      <div className="grid gap-3.5 text-sm">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-ink">
          <strong>SWK Governance Policy:</strong> Admin, HR, and Office Admin require explicit approval from{' '}
          <strong>Owner Shabib Siraj</strong> before attaching the official Company Seal or Owner Signature to any document.
        </div>
        <div>
          <div className="label">Document</div>
          <div className="font-semibold text-ink">{documentTitle || 'Untitled Document'}</div>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 font-medium cursor-pointer">
            <input type="checkbox" checked={reqSeal} onChange={e => setReqSeal(e.target.checked)} />
            <Stamp size={15} className="text-emerald-600" /> Company Seal
          </label>
          <label className="flex items-center gap-2 font-medium cursor-pointer">
            <input type="checkbox" checked={reqSig} onChange={e => setReqSig(e.target.checked)} />
            <PenTool size={15} className="text-amber-600" /> Owner Signature
          </label>
        </div>
        <div>
          <label className="label" htmlFor="seal-req-recipient">Recipient / Counterparty (optional)</label>
          <input
            id="seal-req-recipient"
            className="input"
            value={recipient}
            onChange={e => setRecipient(e.target.value)}
            placeholder="e.g. Dubai Land Department / Emaar Properties / Client Name"
          />
        </div>
        <div>
          <label className="label" htmlFor="seal-req-reason">Purpose &amp; Justification <span className="req">*</span></label>
          <textarea
            id="seal-req-reason"
            className="textarea"
            rows={3}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Explain why this document requires the SWK company seal and/or owner signature…"
          />
        </div>
      </div>
    </Modal>
  )

  if (compact) {
    return (
      <>
        <div className="flex flex-wrap items-center gap-2">
          {onToggleSeal && (
            <label
              className="swk-toggle text-xs"
              title={sealAllowed ? 'Attach SWK Company Seal' : 'Requires Owner Shabib Siraj approval'}
            >
              <input
                type="checkbox"
                checked={sealAllowed && includeSeal}
                disabled={!sealAllowed}
                onChange={e => onToggleSeal(e.target.checked)}
              />
              <span className="inline-flex items-center gap-1">
                {sealAllowed ? <Stamp size={13} className="text-emerald-600" /> : <Lock size={12} className="text-amber-600" />}
                Company Seal
              </span>
            </label>
          )}
          {onToggleSignature && (
            <label
              className="swk-toggle text-xs"
              title={sigAllowed ? 'Attach Owner Authorized Signature' : 'Requires Owner Shabib Siraj approval'}
            >
              <input
                type="checkbox"
                checked={sigAllowed && includeSignature}
                disabled={!sigAllowed}
                onChange={e => onToggleSignature(e.target.checked)}
              />
              <span className="inline-flex items-center gap-1">
                {sigAllowed ? <PenTool size={13} className="text-emerald-600" /> : <Lock size={12} className="text-amber-600" />}
                Owner Signature
              </span>
            </label>
          )}
          {!canDirect && !(sealAllowed && sigAllowed) && (
            st?.pending ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/12 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                <Clock3 size={12} /> Pending Owner Approval
              </span>
            ) : (
              <button
                type="button"
                className="btn outline sm"
                onClick={() => setModalOpen(true)}
              >
                <ShieldCheck size={13} /> Request Owner Approval
              </button>
            )
          )}
          {!canDirect && sealAllowed && sigAllowed && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/12 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 size={12} /> Approved by Owner
            </span>
          )}
        </div>
        {requestModal}
      </>
    )
  }

  return (
    <>
      <section className="card">
        <h3 className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-emerald-600" />
          Company Seal &amp; Signature
        </h3>

        {canDirect ? (
          <div className="grid gap-2 text-xs">
            <div className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1.5 font-semibold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 size={14} /> Direct Owner Authority
            </div>
            <div className="text-muted leading-relaxed">
              Signed in as Owner. You may attach the company seal and authorized signature directly when printing or exporting PDFs.
            </div>
            {(!hasSealImg || !hasSigImg) && (
              <div className="text-[11px] text-amber-700 dark:text-amber-300">
                {!hasSealImg && 'Company seal image not uploaded yet. '}
                {!hasSigImg && 'Owner signature image not uploaded yet. '}
                Configure in Settings → Document text.
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-2.5 text-xs">
            {sealAllowed || sigAllowed ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-emerald-800 dark:text-emerald-200">
                <div className="flex items-center gap-1.5 font-bold">
                  <CheckCircle2 size={14} /> Owner Approved
                </div>
                <div className="mt-1">
                  Authorized for:{' '}
                  <strong>{[sealAllowed && 'Company Seal', sigAllowed && 'Owner Signature'].filter(Boolean).join(' + ')}</strong>
                </div>
                {st?.latest?.expires_at && (
                  <div className="mt-0.5 opacity-80">Valid until {st.latest.expires_at.slice(0, 10)}</div>
                )}
              </div>
            ) : st?.pending ? (
              <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-2.5 text-amber-900 dark:text-amber-200">
                <div className="flex items-center gap-1.5 font-bold">
                  <Clock3 size={14} /> Awaiting Owner Approval
                </div>
                <div className="mt-1 opacity-90">
                  Requested {[st.pending.include_seal && 'Company Seal', st.pending.include_signature && 'Owner Signature'].filter(Boolean).join(' + ')} from Owner Shabib Siraj.
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-line bg-soft p-2.5 text-muted">
                <div className="flex items-center gap-1.5 font-semibold text-ink">
                  <Lock size={13} className="text-amber-600" /> Owner Approval Required
                </div>
                <div className="mt-1 leading-relaxed">
                  Admin, HR, and Office Admin require approval from Owner Shabib Siraj before applying the company seal or owner signature.
                </div>
              </div>
            )}

            {st?.latest?.status === 'Rejected' && !st.pending && !sealAllowed && !sigAllowed && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2 text-rose-800 dark:text-rose-200">
                <div className="flex items-center gap-1 font-semibold"><XCircle size={13} /> Last request declined</div>
                {st.latest.decision_note && <div className="mt-0.5">{st.latest.decision_note}</div>}
              </div>
            )}

            {!(sealAllowed && sigAllowed) && !st?.pending && (
              <button type="button" className="btn outline sm w-full justify-center" onClick={() => setModalOpen(true)}>
                <ShieldCheck size={14} /> Request Owner Seal &amp; Signature Approval
              </button>
            )}
          </div>
        )}
      </section>
      {requestModal}
    </>
  )
}
