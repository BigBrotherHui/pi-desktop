import type { Translate } from '../../../shared/i18n'
import type { PiProcessStatus } from '../../../shared/ipc-contracts'

/**
 * The label for an agent process status, shared by every surface that shows
 * one. The translator parameter is named `t` so `i18next-cli` finds the keys.
 */
export function processStatusLabel(status: PiProcessStatus, t: Translate): string {
  switch (status) {
    case 'running':
      return t('status.processStatus.running')
    case 'starting':
      return t('status.processStatus.starting')
    case 'error':
      return t('status.processStatus.error')
    case 'stopped':
      return t('status.processStatus.stopped')
  }
}
