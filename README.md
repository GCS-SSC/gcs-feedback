# Enable agency feedback

1. Include this folder under `extensions/` in the host build so Nuxt discovers the extension.
2. Sign in as an Agency Manager and enable **Feedback** for the agency in its extension settings.
3. Set `GCS_EXTENSION_SIDEBAR_AGENCY_ID` to the receiving agency ID and restart the app.
4. Ask testers to select **Give feedback** above their account menu.

The modal opens over the current page for active users without an agency role. Reports go to the configured agency.

Agency Managers can open submitted reports in **Feedback inbox**. The inbox reads recent audit and access events when a manager opens a report. The host's audit permissions and retention rules still apply. The extension shows up to 10 entries per source from the 30 minutes before submission, excluding restricted events, events with redacted content, and events outside the report’s agency. Trace summaries leave out SQL and SQL parameters, which the host routinely masks. The inbox stores reports and their references. It reads trace records from the audit APIs each time.

Run `bun run typecheck` and `bun run test:unit` from this folder after workspace installation.
Run `bun run test:audit` with the private tooling checkout available to verify the report table’s agency ownership.
