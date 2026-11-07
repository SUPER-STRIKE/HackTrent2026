// Wraps agent tools so every call goes through Tripwire first. No framework dependency.
//
//   import { wrapTools } from "@tripwire/sdk/tools";
//   const tools = wrapTools(tw, { sessionId }, myTools);
//
// Works with any tool that exposes its implementation as one of these functions, called with the tool input
// as the first argument:
//   execute(input, ...)   Vercel AI SDK tools
//   func(input, ...)      LangChain JS DynamicTool and DynamicStructuredTool
//   invoke(input, ...)    plain objects and LangChain Runnables
// Accepts a single tool, an array of tools, or a record of name -> tool. The tool objects are patched in
// place, so class instances keep working.

const METHODS = ["execute", "func", "invoke"];

function describeTarget(input) {
  if (typeof input === "string") return input.slice(0, 500);
  if (input && typeof input === "object") {
    for (const k of ["command", "cmd", "path", "file_path", "url", "query", "sql", "to"]) if (typeof input[k] === "string") return input[k].slice(0, 500);
    try { return JSON.stringify(input).slice(0, 500); } catch { return undefined; }
  }
  return undefined;
}

export function wrapTool(tw, ctx, tool, name = tool?.name ?? "tool") {
  const method = METHODS.find((m) => typeof tool?.[m] === "function");
  if (!method) throw new Error(`Tripwire: cannot wrap tool "${name}": it has none of ${METHODS.join(", ")}`);
  if (tool[method].__tripwire) return tool;
  const original = tool[method];
  const wrapped = function (input, ...rest) {
    const sessionId = typeof ctx.sessionId === "function" ? ctx.sessionId() : ctx.sessionId;
    const action = {
      sessionId,
      actionType: ctx.actionType?.(name, input) ?? `tool.${name}`,
      target: ctx.target?.(name, input) ?? describeTarget(input),
      payload: ctx.payload?.(name, input) ?? { input },
    };
    return tw.guard(action, () => original.call(this ?? tool, input, ...rest), ctx.guardOptions);
  };
  wrapped.__tripwire = true;
  tool[method] = wrapped;
  return tool;
}

export function wrapTools(tw, ctx, tools) {
  if (Array.isArray(tools)) return tools.map((t) => wrapTool(tw, ctx, t));
  if (METHODS.some((m) => typeof tools?.[m] === "function")) return wrapTool(tw, ctx, tools);
  for (const [name, tool] of Object.entries(tools)) wrapTool(tw, ctx, tool, name);
  return tools;
}
