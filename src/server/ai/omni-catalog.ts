export type OmniLane = 'general' | 'reasoning' | 'fast' | 'vision' | 'translate' | 'search' | 'audio'
export type OmniTier = 'free' | 'tier1' | 'local'

export const OMNI_LANES: readonly OmniLane[] = ['general', 'reasoning', 'fast', 'vision', 'translate', 'search', 'audio']

export interface OmniPresetModel {
  id: string
  lanes: OmniLane[]
  notes?: string
}

export interface OmniPreset {
  key: string
  label: string
  baseUrl: string
  defaultModel: string
  models: OmniPresetModel[]
  lanes: OmniLane[]
  tier: OmniTier
  zeroRetentionDefault: boolean
  rpmLimitDefault: number
  rpdLimitDefault: number
  keyRequired: boolean
  quotaSummary: string
  notes: string
}

/**
 * Complete catalog of the 9 free-tier providers plus 6 Tier-1 / local reserve presets.
 * Model IDs remain editable per route in Admin -> Integrations -> Omni-Route without code changes.
 */
export const OMNI_PRESETS: readonly OmniPreset[] = [
  {
    key: 'gemini',
    label: 'Google Gemini (Free Tier)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    models: [
      { id: 'gemini-2.5-flash', lanes: ['general', 'reasoning', 'vision', 'translate', 'search'], notes: '1M ctx, reasoning & vision' },
      { id: 'gemini-2.5-flash-lite', lanes: ['general', 'fast', 'translate'], notes: 'Ultra-fast Q&A & drafts' },
      { id: 'gemini-2.0-flash', lanes: ['general', 'fast', 'vision'], notes: 'Legacy flash fallback' },
    ],
    lanes: ['general', 'reasoning', 'fast', 'vision', 'translate', 'search'],
    tier: 'free',
    zeroRetentionDefault: false,
    rpmLimitDefault: 15,
    rpdLimitDefault: 250,
    keyRequired: true,
    quotaSummary: '~10-15 RPM, 250-1,000 RPD per key',
    notes: 'Create a key at aistudio.google.com/apikey. PII Shield redaction ON by default.',
  },
  {
    key: 'groq',
    label: 'Groq (Free Tier)',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'openai/gpt-oss-20b',
    models: [
      { id: 'openai/gpt-oss-20b', lanes: ['general', 'fast'], notes: 'Fast low-latency default' },
      { id: 'openai/gpt-oss-120b', lanes: ['general', 'reasoning'], notes: 'Deep reasoning' },
      { id: 'llama-3.3-70b-versatile', lanes: ['general', 'fast', 'translate'], notes: 'Balanced multilingual' },
      { id: 'qwen/qwen3-32b', lanes: ['general', 'reasoning', 'translate'], notes: 'Multilingual & reasoning' },
      { id: 'whisper-large-v3-turbo', lanes: ['audio'], notes: 'Fast audio transcription' },
    ],
    lanes: ['general', 'reasoning', 'fast', 'translate', 'audio'],
    tier: 'free',
    zeroRetentionDefault: false,
    rpmLimitDefault: 30,
    rpdLimitDefault: 1000,
    keyRequired: true,
    quotaSummary: '~30 RPM, 1,000 RPD, 8K-12K TPM per key',
    notes: 'Create a key at console.groq.com. PII Shield redaction ON by default.',
  },
  {
    key: 'openrouter',
    label: 'OpenRouter (Free)',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openrouter/free',
    models: [
      { id: 'openrouter/free', lanes: ['general', 'reasoning', 'fast', 'translate', 'search'], notes: 'Auto-routed free pool' },
    ],
    lanes: ['general', 'reasoning', 'fast', 'translate', 'search'],
    tier: 'free',
    zeroRetentionDefault: false,
    rpmLimitDefault: 20,
    rpdLimitDefault: 50,
    keyRequired: true,
    quotaSummary: '~20 RPM, 50 RPD (1,000 RPD w/ $10 credit)',
    notes: 'Create a key at openrouter.ai/keys. Free models rotate; IDs are editable per route.',
  },
  {
    key: 'cloudflare',
    label: 'Cloudflare Workers AI',
    baseUrl: 'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1',
    defaultModel: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    models: [
      { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', lanes: ['general', 'fast', 'translate'], notes: 'Fast FP8 Llama 3.3' },
      { id: '@cf/qwen/qwq-32b', lanes: ['general', 'reasoning'], notes: 'Reasoning model' },
      { id: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', lanes: ['general', 'reasoning'], notes: 'DeepSeek R1 distilled' },
    ],
    lanes: ['general', 'reasoning', 'fast', 'translate'],
    tier: 'free',
    zeroRetentionDefault: true,
    rpmLimitDefault: 30,
    rpdLimitDefault: 1000,
    keyRequired: true,
    quotaSummary: '10,000 free Neurons/day',
    notes: 'Replace {ACCOUNT_ID} in the base URL. Zero-retention enabled by default.',
  },
  {
    key: 'cerebras',
    label: 'Cerebras (Free Tier)',
    baseUrl: 'https://api.cerebras.ai/v1',
    defaultModel: 'gpt-oss-120b',
    models: [
      { id: 'gpt-oss-120b', lanes: ['general', 'reasoning'], notes: 'Ultra-fast reasoning' },
      { id: 'llama-3.3-70b', lanes: ['general', 'fast', 'translate'], notes: 'High-speed Llama 3.3' },
      { id: 'qwen-3-32b', lanes: ['general', 'reasoning', 'translate'], notes: 'Multilingual Qwen 3' },
    ],
    lanes: ['general', 'reasoning', 'fast', 'translate'],
    tier: 'free',
    zeroRetentionDefault: false,
    rpmLimitDefault: 30,
    rpdLimitDefault: 1000,
    keyRequired: true,
    quotaSummary: 'Free developer tier limits',
    notes: 'Wafer-scale inference speeds. PII Shield redaction ON by default.',
  },
  {
    key: 'sambanova',
    label: 'SambaNova (Free Tier)',
    baseUrl: 'https://api.sambanova.ai/v1',
    defaultModel: 'DeepSeek-V3.1',
    models: [
      { id: 'DeepSeek-V3.1', lanes: ['general', 'reasoning', 'translate'], notes: 'DeepSeek V3.1' },
      { id: 'DeepSeek-R1-Distill-Llama-70B', lanes: ['general', 'reasoning'], notes: 'DeepSeek R1 70B' },
      { id: 'Meta-Llama-3.3-70B-Instruct', lanes: ['general', 'fast', 'translate'], notes: 'Llama 3.3 70B' },
    ],
    lanes: ['general', 'reasoning', 'fast', 'translate'],
    tier: 'free',
    zeroRetentionDefault: false,
    rpmLimitDefault: 20,
    rpdLimitDefault: 500,
    keyRequired: true,
    quotaSummary: 'Free trial / developer limits',
    notes: 'Create a key at cloud.sambanova.ai. PII Shield redaction ON by default.',
  },
  {
    key: 'mistral',
    label: 'Mistral AI (Experiment Tier)',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
    models: [
      { id: 'mistral-small-latest', lanes: ['general', 'fast', 'translate'], notes: 'Multilingual & fast' },
      { id: 'open-mistral-nemo', lanes: ['general', 'fast', 'translate'], notes: 'Compact multilingual' },
    ],
    lanes: ['general', 'fast', 'translate'],
    tier: 'free',
    zeroRetentionDefault: false,
    rpmLimitDefault: 20,
    rpdLimitDefault: 500,
    keyRequired: true,
    quotaSummary: 'Experiment tier limits',
    notes: 'Create a key at console.mistral.ai. PII Shield redaction ON by default.',
  },
  {
    key: 'github_models',
    label: 'GitHub Models (Free Tier)',
    baseUrl: 'https://models.inference.ai.azure.com',
    defaultModel: 'gpt-4o-mini',
    models: [
      { id: 'gpt-4o-mini', lanes: ['general', 'fast', 'vision', 'translate'], notes: 'Fast multimodal GPT-4o mini' },
      { id: 'DeepSeek-R1', lanes: ['general', 'reasoning'], notes: 'DeepSeek R1' },
      { id: 'Llama-3.3-70B-Instruct', lanes: ['general', 'fast', 'translate'], notes: 'Llama 3.3 70B' },
    ],
    lanes: ['general', 'reasoning', 'fast', 'vision', 'translate'],
    tier: 'free',
    zeroRetentionDefault: false,
    rpmLimitDefault: 15,
    rpdLimitDefault: 150,
    keyRequired: true,
    quotaSummary: 'GitHub PAT free limits',
    notes: 'Uses a fine-grained GitHub PAT with models:read scope. PII Shield redaction ON by default.',
  },
  {
    key: 'nvidia_nim',
    label: 'NVIDIA NIM (Free Credits)',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'nvidia/llama-3.3-nemotron-super-49b-v1',
    models: [
      { id: 'nvidia/llama-3.3-nemotron-super-49b-v1', lanes: ['general', 'reasoning', 'fast'], notes: 'Nemotron Super 49B' },
      { id: 'deepseek-ai/deepseek-r1', lanes: ['general', 'reasoning'], notes: 'DeepSeek R1' },
    ],
    lanes: ['general', 'reasoning', 'fast'],
    tier: 'free',
    zeroRetentionDefault: false,
    rpmLimitDefault: 30,
    rpdLimitDefault: 1000,
    keyRequired: true,
    quotaSummary: 'NVIDIA free developer credits',
    notes: 'Create a key at build.nvidia.com. PII Shield redaction ON by default.',
  },
  // ---------------- Tier-1 Paid & Local Reserve Presets ----------------
  {
    key: 'openai',
    label: 'OpenAI (Tier-1)',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: [
      { id: 'gpt-4o', lanes: ['general', 'reasoning', 'vision', 'translate', 'search'] },
      { id: 'o3-mini', lanes: ['general', 'reasoning'] },
      { id: 'gpt-4o-mini', lanes: ['general', 'fast', 'vision', 'translate'] },
    ],
    lanes: ['general', 'reasoning', 'fast', 'vision', 'translate', 'search'],
    tier: 'tier1',
    zeroRetentionDefault: true,
    rpmLimitDefault: 500,
    rpdLimitDefault: 10000,
    keyRequired: true,
    quotaSummary: 'Paid Tier-1 usage limits',
    notes: 'Zero data training on API traffic.',
  },
  {
    key: 'anthropic_via_or',
    label: 'Anthropic Claude (via OpenRouter Tier-1)',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'anthropic/claude-sonnet-4',
    models: [
      { id: 'anthropic/claude-sonnet-4', lanes: ['general', 'reasoning', 'vision', 'translate', 'search'] },
      { id: 'anthropic/claude-3.5-sonnet', lanes: ['general', 'reasoning', 'vision', 'translate'] },
    ],
    lanes: ['general', 'reasoning', 'fast', 'vision', 'translate', 'search'],
    tier: 'tier1',
    zeroRetentionDefault: true,
    rpmLimitDefault: 120,
    rpdLimitDefault: 5000,
    keyRequired: true,
    quotaSummary: 'Paid Tier-1 via OpenRouter',
    notes: 'Uses OpenRouter paid credits with zero-retention provider routing.',
  },
  {
    key: 'xai',
    label: 'xAI Grok (Tier-1)',
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-3-mini',
    models: [
      { id: 'grok-3-mini', lanes: ['general', 'reasoning', 'fast', 'search'] },
      { id: 'grok-3', lanes: ['general', 'reasoning', 'search'] },
    ],
    lanes: ['general', 'reasoning', 'fast', 'search'],
    tier: 'tier1',
    zeroRetentionDefault: true,
    rpmLimitDefault: 60,
    rpdLimitDefault: 5000,
    keyRequired: true,
    quotaSummary: 'Paid / promotional credits',
    notes: 'Create a key at console.x.ai.',
  },
  {
    key: 'deepseek',
    label: 'DeepSeek (Tier-1)',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-reasoner',
    models: [
      { id: 'deepseek-reasoner', lanes: ['general', 'reasoning'] },
      { id: 'deepseek-chat', lanes: ['general', 'fast', 'translate'] },
    ],
    lanes: ['general', 'reasoning', 'fast', 'translate'],
    tier: 'tier1',
    zeroRetentionDefault: true,
    rpmLimitDefault: 60,
    rpdLimitDefault: 5000,
    keyRequired: true,
    quotaSummary: 'Paid API tier',
    notes: 'Create a key at platform.deepseek.com.',
  },
  {
    key: 'ollama',
    label: 'Local Ollama (Self-Hosted)',
    baseUrl: 'http://127.0.0.1:11434/v1',
    defaultModel: 'qwen2.5:3b',
    models: [
      { id: 'qwen2.5:3b', lanes: ['general', 'fast', 'translate'] },
      { id: 'qwen3:8b', lanes: ['general', 'reasoning', 'translate'] },
      { id: 'llama3.2', lanes: ['general', 'fast'] },
    ],
    lanes: ['general', 'reasoning', 'fast', 'translate'],
    tier: 'local',
    zeroRetentionDefault: true,
    rpmLimitDefault: 1000,
    rpdLimitDefault: 100000,
    keyRequired: false,
    quotaSummary: 'Unlimited local hardware inference',
    notes: '100% private on-premise inference. No external data leaves the server.',
  },
  {
    key: 'custom',
    label: 'Custom OpenAI-Compatible Endpoint',
    baseUrl: '',
    defaultModel: '',
    models: [],
    lanes: ['general', 'reasoning', 'fast', 'vision', 'translate', 'search', 'audio'],
    tier: 'tier1',
    zeroRetentionDefault: true,
    rpmLimitDefault: 120,
    rpdLimitDefault: 10000,
    keyRequired: false,
    quotaSummary: 'Configured per endpoint',
    notes: 'Any OpenAI-compatible server exposing /chat/completions.',
  },
] as const

export const OMNI_PRESET_MAP: Record<string, OmniPreset> = Object.fromEntries(
  OMNI_PRESETS.map(p => [p.key, p]),
)

export function getOmniPreset(key: string | null | undefined): OmniPreset | undefined {
  if (!key) return undefined
  return OMNI_PRESET_MAP[String(key).trim().toLowerCase()]
}

export function normalizeLane(raw: string | null | undefined): OmniLane {
  const v = String(raw || 'general').trim().toLowerCase()
  if (v === 'auto' || v === '') return 'general'
  if ((OMNI_LANES as readonly string[]).includes(v)) return v as OmniLane
  return 'general'
}
