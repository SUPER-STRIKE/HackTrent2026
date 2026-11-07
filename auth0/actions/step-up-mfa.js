/**
 * Auth0 Post-Login Action: require MFA when Tripwire asks for step-up.
 *
 * Setup (Auth0 dashboard):
 *  1. Security > Multi-factor Auth: enable at least one factor (e.g. One-time Password or Guardian push).
 *     Leave the MFA policy on "Never" so normal logins skip it.
 *  2. Actions > Library > Create Action > "Login / Post Login", paste this file, Deploy.
 *  3. Actions > Triggers > post-login: drag the Action into the flow, Apply.
 *
 * Tripwire sends acr_values=<multi-factor policy> when approving a risky action.
 * After MFA, Auth0 puts amr: ["mfa"] in the ID token, which the app checks.
 */
const MFA_ACR = "http://schemas.openid.net/pape/policies/2007/06/multi-factor";

exports.onExecutePostLogin = async (event, api) => {
  const requested = (event.transaction && event.transaction.acr_values) || [];
  if (requested.includes(MFA_ACR)) {
    api.multifactor.enable("any", { allowRememberBrowser: false });
  }
};
