# OkangGroup — Treasure House Staging Activation UAT (Gate Check)

| Field | Value |
| --- | --- |
| Date | 2026-10-12 |
| Instruction | ACTIVATE ISOLATED TREASURE HOUSE STAGING |
| Production | **HOLD** |
| Live TH project `gmyhzxxqiokklybebzpf` | **Untouched** |
| OkangGroup project `prbgsnxpwyepdggdysnt` | **Untouched** |
| Shadow CMS | Preserved / not reconnected |
| Connection activated | **No** |

---

## Verdict

**STOPPED before project creation — security / account-access concern.**

The Owner authorised a separate Treasure House Staging Supabase project. Cursor attempted step 1 via the Supabase Management MCP and found that the authenticated account **does not contain** the Treasure House production project or the OkangGroup development project. Creating “Treasure House Staging” under the only visible organisation would place church staging infrastructure in the **wrong account**.

No paid project was created. No SQL was applied to any remote database. No vault secrets were stored. No shadow-to-staging connection was configured. C3-01 connection steps remain deferred until the correct account is available.

---

## 1. What the MCP account can see

| Item | Value |
| --- | --- |
| Organisations | **1** — `StarLiz Academy` (`xvrcsocshevuqnpzqvar`), plan **free** |
| Projects visible | **1** — `adjeteyokangj-hash's Project` (`vzgfvzzbgrlxvixejmdt`, eu-west-1) |
| Treasure House production `gmyhzxxqiokklybebzpf` | **Not visible** |
| OkangGroup development `prbgsnxpwyepdggdysnt` | **Not visible** (reachable only via project-scoped OkangGroup MCP) |

---

## 2. Cost check (visible org only)

| Item | Result |
| --- | --- |
| `get_cost` type=project, org=StarLiz Academy | **$0 / month** (free tier) |
| Unexpected charge | None indicated for this free org |
| Proceed to create under StarLiz Academy? | **No** — wrong organisation for Treasure House |

Creating under StarLiz Academy is refused even at $0 because isolation from production is not enough if the project is not under the correct Owner/client account boundary.

---

## 3. Steps completed vs blocked

| Step | Action | Result |
| --- | --- | --- |
| 1 | Create Supabase project `Treasure House Staging` | **Blocked** — correct org/account not accessible |
| 2 | Verify ref ≠ production | **N/A** (no project created) |
| 3 | Isolated auth/DB/storage | **Blocked** |
| 4 | Apply SQL 001–003 | **Blocked** |
| 5 | Verify synthetic seed / policies | **Blocked** |
| 6 | Deploy `/v1` bridge | **Blocked** (package remains local: `staging/treasure-house/`) |
| 7 | Verify denylist | **Local PASS** (`npm run th-staging:test`) — not yet against a remote staging host |
| 8 | Record C3-01 before connect | **Deferred** — connection not attempted; Owner staging approval noted, formal C3-01 record still required at connect time |
| 9 | Vault `dev/treasure-house-staging` | **Not done** |
| 10 | Connect Shadow CMS | **Not done** |
| 11 | Tests B–D | **Not done** |
| 12 | Permissions / audit / isolation | **Not done** |

---

## 4. Minimum Owner actions to unblock

1. Authenticate the Supabase Management MCP (or CLI) with the **account/organisation that should own Treasure House Staging** — preferably the same ownership boundary as Treasure House production **or** a dedicated OkangGroup client-staging org explicitly chosen by the Owner.  
2. Confirm which `organization_id` Cursor must use (do **not** use StarLiz Academy unless the Owner explicitly redirects TH staging there).  
3. Re-issue activation after that account is visible (`list_projects` should show the intended org; production `gmyhzxxqiokklybebzpf` should remain distinct and untouched).  
4. Confirm cost again for **that** organisation (free vs paid) before create.  
5. Record **C3-01** (Pilot 2 = Treasure House **staging** website CMS only) before step 10 connection.

Local package remains ready: `staging/treasure-house/` (SQL 001–003, `/v1` bridge, denylist, tests).

---

## 5. Explicit non-actions (compliance)

- Did not create a Supabase project under StarLiz Academy  
- Did not touch `gmyhzxxqiokklybebzpf`  
- Did not modify the live Treasure House application  
- Did not configure OkangGroup `cms_connections` for external TH  
- Did not bypass C3-01  

**Production remains HOLD.**

---

## 6. Follow-up — Environments panel (same session)

Owner showed Supabase MCP **Environments** with four connections:

| Environment | Status in UI |
| --- | --- |
| Local | Connected |
| Cloud — default | Connected |
| Cloud — okanggroup@gmail.com | Connected |
| Cloud — treasurehousebci@gmail.com | Connected |

Cursor re-checked Management MCP `list_organizations` / `list_projects` after that screenshot and after `mcp_auth`. The API still returns only **StarLiz Academy** / project `vzgfvzzbgrlxvixejmdt`.

**Interpretation:** the Treasure House account is saved in Environments, but the active Management MCP session is still **Cloud — default** (StarLiz), not `treasurehousebci@gmail.com`.

**Owner action required in that Environments UI:**

1. Make **Cloud — treasurehousebci@gmail.com** the active account for Supabase project-creation tools (or temporarily log out of Cloud — default if the UI only routes one cloud account to Management APIs).  
2. Press **Reload**, then **Done**.  
3. Tell Cursor to retry activation.

Until `list_projects` shows the Treasure House organisation / production project `gmyhzxxqiokklybebzpf` (read-only visibility is enough to confirm the right account), Cursor will not create “Treasure House Staging”.
