/**
 * Command registry.
 *
 * Every document change a user (or plugin, or AI agent) can make is a named,
 * schema-validated command. Commands are the public editing API:
 *
 * - the UI dispatches them,
 * - history labels come from them,
 * - their zod schemas are exported as JSON Schema tool definitions for AI
 *   agents ({@link CommandRegistry.toolDefinitions}), so AI edits the
 *   structured design through exactly the same validated operations as a human.
 */
import { z } from 'zod';
import type { IdGenerator } from '../ids';
import type { Id } from '../model/types';
import type { Transaction } from '../store/store';
import type { TextMeasurer } from '../text/measurer';

export interface CommandContext {
  tx: Transaction;
  createId: IdGenerator;
  measurer: TextMeasurer | null;
}

export interface CommandResult {
  /** Node ids to select after the command. */
  select?: Id[];
  /** Page to show after the command. */
  pageId?: Id;
  /** Arbitrary return value. */
  value?: unknown;
}

export interface CommandDefinition<P = unknown> {
  id: string;
  /** Human-readable history label. */
  label: string | ((payload: P) => string);
  description?: string;
  schema: z.ZodType<P>;
  run(ctx: CommandContext, payload: P): CommandResult | undefined;
}

/** A command described for an AI agent's tool use. */
export interface CommandToolDefinition {
  /** Tool name (the command id with characters tool APIs reject replaced by `_`). */
  name: string;
  /** The command id to execute. */
  command: string;
  description: string;
  /** JSON Schema of the payload. */
  inputSchema: Record<string, unknown>;
}

export class CommandError extends Error {
  constructor(
    message: string,
    readonly commandId: string,
  ) {
    super(message);
    this.name = 'CommandError';
  }
}

export class CommandRegistry {
  private readonly commands = new Map<string, CommandDefinition<never>>();

  register<P>(definition: CommandDefinition<P>): this {
    if (this.commands.has(definition.id)) throw new Error(`Command ${definition.id} is already registered`);
    this.commands.set(definition.id, definition as unknown as CommandDefinition<never>);
    return this;
  }

  get(id: string): CommandDefinition<unknown> | undefined {
    return this.commands.get(id) as CommandDefinition<unknown> | undefined;
  }

  has(id: string): boolean {
    return this.commands.has(id);
  }

  list(): CommandDefinition<unknown>[] {
    return [...this.commands.values()] as unknown as CommandDefinition<unknown>[];
  }

  /** Validates a payload; throws a CommandError with readable issues. */
  parsePayload(id: string, payload: unknown): unknown {
    const command = this.get(id);
    if (!command) throw new CommandError(`Unknown command: ${id}`, id);
    const result = command.schema.safeParse(payload);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join('.') || '<payload>'}: ${i.message}`)
        .join('; ');
      throw new CommandError(`Invalid payload for ${id}: ${issues}`, id);
    }
    return result.data;
  }

  /** Every command as a tool definition with a JSON Schema for its payload. */
  toolDefinitions(): CommandToolDefinition[] {
    return this.list().map((command) => ({
      name: command.id.replace(/[^a-zA-Z0-9_-]/g, '_'),
      command: command.id,
      description: command.description ?? (typeof command.label === 'string' ? command.label : command.id),
      inputSchema: z.toJSONSchema(command.schema, { io: 'input', unrepresentable: 'any' }) as Record<
        string,
        unknown
      >,
    }));
  }

  label(id: string, payload: unknown): string {
    const command = this.get(id);
    if (!command) return id;
    return typeof command.label === 'function' ? command.label(payload) : command.label;
  }
}
