import type { Tripwire, GuardOptions } from "../tripwire.mjs";

export interface WrapContext {
  sessionId: string | (() => string);
  actionType?: (toolName: string, input: unknown) => string;
  target?: (toolName: string, input: unknown) => string | undefined;
  payload?: (toolName: string, input: unknown) => Record<string, unknown>;
  guardOptions?: GuardOptions;
}

export function wrapTool<T>(tw: Tripwire, ctx: WrapContext, tool: T, name?: string): T;
export function wrapTools<T>(tw: Tripwire, ctx: WrapContext, tools: T): T;
