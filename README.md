# Enable system feedback

1. Include this folder under `extensions/` in the host build so Nuxt discovers the extension.
2. Open **Administration → Extensions** and enable **Feedback** with global System Contributor or Manager access.
3. Select **Give feedback** above the account menu. Every active signed-in user can send feedback.

System Managers can open submitted reports in the **Feedback inbox** on the Extensions page. The inbox loads recent system activity when a manager opens a report. The host audit and access permissions and retention rules apply. Feedback shows up to 10 entries per source from the 30 minutes before submission. It omits agency-attributed events, restricted events, and events with redacted content. Trace summaries omit SQL and its parameters. The inbox stores the report and its reference and requests activity from the audit APIs on demand.

Run `bun run typecheck` and `bun run test:unit` from this folder after workspace installation. Run `bun run test:audit` with the private tooling checkout available to verify the report table’s global audit ownership.
