import { test } from "node:test";
import assert from "node:assert/strict";
import { canView, isApprover } from "../src/lib/approvers.ts";

const user = (email: string, verified = true) => ({ sub: "auth0|1", email, email_verified: verified });
const withEnv = (env: Record<string, string | undefined>, fn: () => void) => {
  const old = { ...process.env };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try { fn(); } finally { process.env = old; }
};

test("without viewer mode only listed, verified approvers can see the console", () => {
  withEnv({ APPROVER_EMAILS: "me@x.com", VIEWER_MODE: undefined }, () => {
    assert.equal(canView(user("me@x.com")), true);
    assert.equal(canView(user("judge@x.com")), false);
    assert.equal(canView(user("me@x.com", false)), false);
  });
});

test("viewer mode lets any signed-in user read but never approve", () => {
  withEnv({ APPROVER_EMAILS: "me@x.com", VIEWER_MODE: "1" }, () => {
    assert.equal(canView(user("judge@x.com")), true);
    assert.equal(isApprover(user("judge@x.com")), false);
    assert.equal(isApprover(user("me@x.com")), true);
  });
});

test("viewer mode is off unless set to exactly 1", () => {
  for (const v of ["0", "true", "", "yes"])
    withEnv({ APPROVER_EMAILS: "me@x.com", VIEWER_MODE: v }, () => assert.equal(canView(user("judge@x.com")), false));
});
