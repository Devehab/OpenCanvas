import type { IdGenerator } from '../ids';
import type { RecordsDiff } from '../store/diff';
import type { ChangeSource, DocumentStore } from '../store/store';
import type { TextMeasurer } from '../text/measurer';
import { CommandError, type CommandRegistry, type CommandResult } from './registry';

export interface ExecuteDeps {
  createId: IdGenerator;
  measurer?: TextMeasurer | null;
  source?: ChangeSource;
}

/** Validates the payload and runs a command in one atomic transaction. */
export function executeCommand(
  store: DocumentStore,
  registry: CommandRegistry,
  id: string,
  payload: unknown,
  deps: ExecuteDeps,
): { result: CommandResult; diff: RecordsDiff; label: string } {
  const command = registry.get(id);
  if (!command) throw new CommandError(`Unknown command: ${id}`, id);
  const parsed = registry.parsePayload(id, payload);
  const label = registry.label(id, parsed);
  const { result, diff } = store.transact(
    (tx) => command.run({ tx, createId: deps.createId, measurer: deps.measurer ?? null }, parsed) ?? {},
    { source: deps.source ?? 'user', label },
  );
  return { result, diff, label };
}
