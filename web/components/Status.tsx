import { ui } from '~/lib/copy';
import type { Run } from '~/lib/data';

export function Status({ run, compact }: { run?: Run; compact?: boolean }) {
    const key = !run ? 'status.missing' : run.status === 'invalid_html' ? 'status.invalid_html' : 'status.failed';
    const cls = ['status', run ? 'status-failed' : 'status-missing', compact ? 'compact' : ''].filter(Boolean).join(' ');
    return (
        <div className={cls} title={run?.error ?? undefined}>
            {ui[key]}
        </div>
    );
}
