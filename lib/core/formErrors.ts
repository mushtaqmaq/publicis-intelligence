import { redirect } from "next/navigation";
import { ApprovalError } from "./approvals";
import { CoreError } from "./service";

const join = (path: string, k: string, v: string) => `${path}${path.includes("?") ? "&" : "?"}${k}=${encodeURIComponent(v)}`;

// Runs a form action. A validation problem (CoreError / ApprovalError) goes back to `backTo` as a visible message;
// anything else is a real error and is rethrown. On success it redirects to the path `fn` returns, or back to
// `backTo` (with an optional confirmation message).
export async function withMessage(backTo: string, fn: () => Promise<string | void>, okMessage?: string): Promise<never> {
  let next: string | void;
  try {
    next = await fn();
  } catch (e) {
    if (e instanceof CoreError || e instanceof ApprovalError) redirect(join(backTo, "error", e.message));
    throw e;
  }
  redirect(next ? next : okMessage ? join(backTo, "ok", okMessage) : backTo);
}
