import { Plus, Trash2, Upload, Download, Copy, ShieldCheck, ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PermissionRule, PermissionRuleAction, PermissionRulesScope } from '../../../shared/ipc-contracts'
import { emptyRule } from './permission-rules-editor-helpers'

const TOOL_SUGGESTIONS = ['*', 'bash', 'edit', 'write', 'read', 'grep'] as const
const TOOL_DATALIST_ID = 'permission-rule-tool-suggestions'

const RULE_ACTION_KEYS = {
  allow: 'permissionRules.action.allow',
  deny: 'permissionRules.action.deny',
} as const satisfies Record<PermissionRuleAction, string>

interface PermissionRulesEditorProps {
  rules: PermissionRule[]
  onChange: (rules: PermissionRule[]) => void
  onImport: () => void
  onExport: () => void
  scope: PermissionRulesScope
  workspaceExists: boolean
  onCopyFromGlobal: () => void
  onRemoveWorkspace: () => void
  workspaceOverride: boolean
  workspaceActive: boolean
  workspaceTrusted: boolean
  workspaceHasAllowRules: boolean
  onSetWorkspaceTrust: (trusted: boolean) => void
  loadError: string | null
  actionError: string | null
}

export function PermissionRulesEditor({
  rules,
  onChange,
  onImport,
  onExport,
  scope,
  workspaceExists,
  onCopyFromGlobal,
  onRemoveWorkspace,
  workspaceOverride,
  workspaceActive,
  workspaceTrusted,
  workspaceHasAllowRules,
  onSetWorkspaceTrust,
  loadError,
  actionError,
}: PermissionRulesEditorProps): React.JSX.Element {
  const { t } = useTranslation()
  const updateRule = (index: number, patch: Partial<PermissionRule>): void => {
    onChange(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)))
  }

  const removeRule = (index: number): void => {
    onChange(rules.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-dim">
          {t('permissionRules.legend')}
        </span>
        <div className="flex gap-1">
          {scope === 'workspace' && (
            <button
              type="button"
              onClick={onCopyFromGlobal}
              className="flex items-center gap-1 rounded-md border border-border-strong px-2 py-1 text-xs text-primary transition-colors hover:border-border-strong-hover"
              title={t('permissionRules.copyFromGlobalTitle')}
            >
              <Copy size={12} /> {t('permissionRules.copyFromGlobalButton')}
            </button>
          )}
          <button
            type="button"
            onClick={onImport}
            className="flex items-center gap-1 rounded-md border border-border-strong px-2 py-1 text-xs text-primary transition-colors hover:border-border-strong-hover"
            title={t('permissionRules.importTitle')}
          >
            <Upload size={12} /> {t('common.import')}
          </button>
          <button
            type="button"
            onClick={onExport}
            className="flex items-center gap-1 rounded-md border border-border-strong px-2 py-1 text-xs text-primary transition-colors hover:border-border-strong-hover"
            title={t('permissionRules.exportTitle')}
          >
            <Download size={12} /> {t('common.export')}
          </button>
        </div>
      </div>

      {scope === 'workspace' && workspaceActive && (
        <div className="flex flex-col gap-2">
          {workspaceTrusted ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-xs text-dim">
              <span className="flex items-center gap-1.5 text-primary">
                <ShieldCheck size={13} className="shrink-0" />
                {t('permissionRules.trustedMessage')}
              </span>
              <button
                type="button"
                onClick={() => onSetWorkspaceTrust(false)}
                className="shrink-0 rounded-md border border-border-strong px-2 py-1 text-primary transition-colors hover:border-border-strong-hover"
              >
                {t('permissionRules.revokeTrustButton')}
              </button>
            </div>
          ) : (
            <div
              className={`flex items-start justify-between gap-2 rounded-md border px-2 py-1.5 text-xs ${
                workspaceHasAllowRules
                  ? 'border-warning-bg bg-warning-bg text-warning'
                  : 'border-border-strong bg-surface text-dim'
              }`}
            >
              <span className="flex items-start gap-1.5">
                <ShieldAlert size={13} className="mt-0.5 shrink-0" />
                {workspaceHasAllowRules
                  ? t('permissionRules.untrustedWithAllowRulesMessage')
                  : t('permissionRules.untrustedMessage')}
              </span>
              <button
                type="button"
                onClick={() => onSetWorkspaceTrust(true)}
                className="shrink-0 rounded-md border border-border-strong bg-surface px-2 py-1 text-primary transition-colors hover:border-border-strong-hover"
              >
                {t('permissionRules.trustWorkspaceButton')}
              </button>
            </div>
          )}
          {workspaceExists && (
            <button
              type="button"
              onClick={onRemoveWorkspace}
              className="flex items-center gap-1 self-start rounded-md border border-error-bg px-2 py-1 text-xs text-error transition-colors hover:bg-error-bg"
              title={t('permissionRules.removeWorkspaceRulesTitle')}
            >
              <Trash2 size={12} /> {t('permissionRules.removeWorkspaceRulesButton')}
            </button>
          )}
        </div>
      )}

      {workspaceOverride && scope === 'global' && (
        <p className="rounded-md border border-border-strong bg-surface px-2 py-1.5 text-xs text-dim">
          {t('permissionRules.workspaceOverrideNotice')}
        </p>
      )}

      {loadError && (
        <p
          role="alert"
          className="rounded-md border border-error-bg bg-error-bg px-2 py-1.5 text-xs text-error"
        >
          {t('permissionRules.loadErrorMessage', { error: loadError })}
        </p>
      )}

      <datalist id={TOOL_DATALIST_ID}>
        {TOOL_SUGGESTIONS.map((tool) => (
          <option key={tool} value={tool} />
        ))}
      </datalist>

      {rules.length === 0 && (
        <p className="px-1 text-xs text-dim">{t('permissionRules.noRules')}</p>
      )}

      {rules.map((rule, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <select
            value={rule.action}
            onChange={(e) => updateRule(index, { action: e.target.value as PermissionRuleAction })}
            className="rounded-md border border-border-strong bg-surface px-1.5 py-1 text-xs text-primary"
            aria-label={t('permissionRules.rowActionAria', { index: index + 1 })}
          >
            <option value="allow">{t(RULE_ACTION_KEYS.allow)}</option>
            <option value="deny">{t(RULE_ACTION_KEYS.deny)}</option>
          </select>
          <input
            type="text"
            value={rule.tool}
            onChange={(e) => updateRule(index, { tool: e.target.value })}
            list={TOOL_DATALIST_ID}
            placeholder={t('permissionRules.toolPlaceholder')}
            className="w-28 rounded-md border border-border-strong bg-surface px-1.5 py-1 text-xs text-primary placeholder:text-dim"
            aria-label={t('permissionRules.rowToolAria', { index: index + 1 })}
          />
          <input
            type="text"
            value={rule.match ?? ''}
            onChange={(e) => updateRule(index, { match: e.target.value })}
            placeholder={t('permissionRules.patternPlaceholder')}
            className="min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-1.5 py-1 font-mono text-xs text-primary placeholder:text-dim"
            aria-label={t('permissionRules.rowPatternAria', { index: index + 1 })}
          />
          <button
            type="button"
            onClick={() => removeRule(index)}
            className="shrink-0 rounded-md p-1 text-dim transition-colors hover:text-error"
            title={t('permissionRules.removeRuleTitle')}
            aria-label={t('permissionRules.removeRuleAria', { index: index + 1 })}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...rules, emptyRule()])}
        className="flex items-center gap-1 rounded-md border border-dashed border-border-strong px-2 py-1 text-xs text-dim transition-colors hover:border-border-strong-hover hover:text-primary"
      >
        <Plus size={12} /> {t('permissionRules.addRuleButton')}
      </button>

      {actionError && (
        <p role="alert" className="text-xs text-error">
          {actionError}
        </p>
      )}
    </div>
  )
}
