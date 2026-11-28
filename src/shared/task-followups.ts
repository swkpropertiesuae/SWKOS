export interface TaskAttachmentItem {
  id: number
  file_name: string
  size: number
  mime: string | null
  category: string | null
  doc_version?: number
  expiry_date?: string | null
  note?: string | null
  created_at: string
  uploader_name?: string | null
  download_url: string
}

export const TASK_FOLLOWUP_CHANNELS = [
  'Call',
  'WhatsApp',
  'Email',
  'Site Visit',
  'Client Meeting',
  'Developer / Bank',
  'Internal Note',
] as const

export type TaskFollowUpChannel = (typeof TASK_FOLLOWUP_CHANNELS)[number]

export const TASK_FOLLOWUP_STAGES = [
  'To do',
  'In progress',
  'Waiting Client',
  'Waiting Owner',
  'Waiting Bank / Dev',
  'Blocked',
  'Done',
] as const

export type TaskFollowUpStage = (typeof TASK_FOLLOWUP_STAGES)[number]

export const TASK_FOLLOWUP_OUTCOMES = [
  'Reached — Moving Forward',
  'Documents / KYC Requested',
  'Waiting on Client Decision',
  'Waiting on Owner / Landlord',
  'Waiting on Bank / Developer / DLD',
  'No Answer — Retry Scheduled',
  'Rescheduled by Client',
  'Escalated to Leadership',
  'Completed & Verified',
] as const

export type TaskFollowUpOutcome = (typeof TASK_FOLLOWUP_OUTCOMES)[number]

export interface TaskFollowUpEntry {
  id: number
  task_id: number
  author_id: number
  author_name: string
  channel: TaskFollowUpChannel
  outcome: TaskFollowUpOutcome
  stage: TaskFollowUpStage
  note: string
  next_action: string | null
  next_followup_date: string | null
  next_followup_time: string | null
  contact_name: string | null
  contact_phone: string | null
  attachment_ids: number[]
  attachments: TaskAttachmentItem[]
  escalated: boolean
  reassigned_to_id: number | null
  created_at: string
}

export interface TaskFollowUpSummary {
  stage: TaskFollowUpStage
  followup_count: number
  attachment_count: number
  next_followup_date: string | null
  next_followup_time: string | null
  next_action: string | null
  last_followup: {
    id: number
    channel: string
    outcome: string
    stage: string
    note: string
    author_name: string
    created_at: string
  } | null
}

export const QUICK_FOLLOWUP_TEMPLATES: ReadonlyArray<{
  label: string
  channel: TaskFollowUpChannel
  outcome: TaskFollowUpOutcome
  stage: TaskFollowUpStage
  note: string
  next_action: string
}> = [
  {
    label: 'Client promised docs today',
    channel: 'WhatsApp',
    outcome: 'Documents / KYC Requested',
    stage: 'Waiting Client',
    note: 'Sent full document / KYC checklist on WhatsApp. Client confirmed they will share the signed copies today.',
    next_action: 'Verify received documents & upload to record',
  },
  {
    label: 'No answer — retry callback',
    channel: 'Call',
    outcome: 'No Answer — Retry Scheduled',
    stage: 'In progress',
    note: 'Called client — no answer. Sent a brief WhatsApp follow-up and scheduled next callback window.',
    next_action: 'Retry phone call at next scheduled slot',
  },
  {
    label: 'Chased Owner / Form A / NOC',
    channel: 'Call',
    outcome: 'Waiting on Owner / Landlord',
    stage: 'Waiting Owner',
    note: 'Spoke with property owner regarding signed Form A / NOC / pricing confirmation. Awaiting return copy.',
    next_action: 'Collect signed owner confirmation & attach copy',
  },
  {
    label: 'Followed up Bank / Developer / DLD',
    channel: 'Developer / Bank',
    outcome: 'Waiting on Bank / Developer / DLD',
    stage: 'Waiting Bank / Dev',
    note: 'Followed up with Bank RM / Developer / DLD Trustee desk on queue status. Awaiting formal written update.',
    next_action: 'Confirm approval / clearance receipt',
  },
  {
    label: 'Completed & verified',
    channel: 'Internal Note',
    outcome: 'Completed & Verified',
    stage: 'Done',
    note: 'All deliverables completed, verified, and filed cleanly. Task closed.',
    next_action: '',
  },
]

export function mapFollowUpStageToTaskStatus(stage: string): 'To do' | 'In progress' | 'Blocked' | 'Done' {
  if (stage === 'Done') return 'Done'
  if (stage === 'Blocked') return 'Blocked'
  if (stage === 'To do') return 'To do'
  return 'In progress'
}

export function formatAttachmentBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
