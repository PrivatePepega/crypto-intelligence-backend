# AGENTS.md

## Project Overview

This repository contains a full-stack TypeScript AI-powered crypto/blockchain intelligence platform.

The application collects structured information from sources such as:

* Blockchain and indexing APIs
* Market/data APIs
* GitHub
* News and public web sources
* Authorized social APIs

Collected data is normalized, persisted, analyzed, and exposed through an AI-assisted interface.

The long-term goal is to provide reliable project intelligence: historical state, change detection, metrics, research, and AI-generated explanations.

Treat this as a serious production-oriented application, not a prototype.

---

## Core Architecture

Prefer this general data flow:

```text
External Sources
      ↓
Collection
      ↓
Normalization
      ↓
Database
      ↓
Deterministic Analysis
      ↓
AI Analysis
      ↓
Presentation
```

Keep responsibilities separated.

### Deterministic code should handle

* Data retrieval
* Parsing and normalization
* Calculations
* Aggregation
* Filtering
* Comparisons
* Change detection
* Validation
* Database operations
* Factual project state

### AI should primarily handle

* Interpretation
* Summarization
* Classification
* Reasoning over application data
* Natural-language explanations
* Research assistance

**The AI is not the source of truth for factual project data.**

If deterministic code or an API can reliably perform a task, prefer it over an LLM.

---

## General Development Rules

* Use TypeScript with strict type safety.
* Avoid `any` unless there is a strong, documented reason.
* Follow existing repository patterns before introducing new ones.
* Prefer simple solutions over unnecessary abstraction.
* Make focused changes.
* Do not perform unrelated refactors.
* Do not remove existing functionality unless explicitly requested.
* Avoid unnecessary dependencies.
* Do not assume an architecture when the repository can answer the question.
* Preserve existing behavior unless the requested change requires otherwise.
* Treat external data and AI output as untrusted input.

### Do Not Over-Engineer

Do not introduce infrastructure merely because it may become useful later.

Avoid adding things such as:

* Microservices
* Redis
* Kafka
* Complex queues
* CQRS
* Event sourcing
* Additional databases
* New abstraction layers

unless the current requirements actually justify them.

Prefer the simplest architecture that solves the current problem while leaving reasonable room to grow.

---

## Before Editing

Before making changes:

1. Inspect the relevant files.
2. Search for existing implementations, types, utilities, and patterns.
3. Understand the affected data flow.
4. Check existing tests.
5. Identify the smallest appropriate change.
6. Check `package.json` and existing project scripts before running commands.

Use repository search instead of guessing.

Do not overwrite, revert, or discard unrelated work already present in the working tree.

---

## Repository Structure

The repository may contain areas such as:

```text
app/
components/
lib/
server/
  collectors/
  services/
  ai/
  jobs/
prisma/
tests/
docs/
```

These are organizational guidelines, not requirements.

**Do not create directories simply because they appear above.**

Follow the actual repository structure and existing conventions.

---

## Frontend

The frontend uses Next.js and the App Router.

Prefer:

* Server Components by default.
* Client Components only when client-side behavior is required.
* Small, focused components.
* Existing styling and UI patterns.
* Business logic outside presentational components.
* Vertical feature slices where appropriate.

Never expose API keys, secrets, or server-only credentials to the client.

---

## Backend

Keep route handlers and controllers thin.

Prefer:

```text
Route / Controller
      ↓
Service / Domain Logic
      ↓
Repository / Database / External Provider
```

Use validation at application boundaries, preferably with the repository's existing Zod patterns.

External integrations should be isolated from core business logic.

Long-running or scheduled research/collection should use the project's job infrastructure once such infrastructure exists.

---

## Database

The database is the persistent source of truth for collected project intelligence.

Important principles:

* Preserve historical data where the product requires it.
* Avoid duplicating global project research for individual users.
* Keep user-specific data separate from global intelligence.
* Inspect existing schema and migrations before changing models.
* Follow existing relationship and naming conventions.
* Never reset, destroy, or wipe production data.
* Never commit credentials or secrets.

Historical snapshots and change detection are important parts of the platform and should not be casually replaced with only the latest state.

### Destructive Database Operations Require Explicit Permission

**Never issue a `DELETE`, `DROP`, `TRUNCATE`, or `ALTER` against the database without asking the user first and receiving an explicit yes.**

This holds even when:

* The statement sits inside a function the user asked to be written, such as a delete or reset helper.
* The rows appear to be scratch data, test data, or something the same script just created.
* The operation is scoped by an id, a date, or an intelligence set and therefore "only" touches one domain.
* The statement is wrapped in a transaction, a try/catch, or a dry-run flag.
* The user approved a similar operation earlier in the same conversation.

Permission is per operation. Approval to delete one set of rows is not approval to delete another, and approval earlier in a session does not carry forward.

This applies equally to *writing* a `DELETE` and to *running* one. Writing a helper that deletes is fine and often requested; invoking that helper against real data needs permission every time.

**When verifying code against the live database, prefer operations with no net effect:**

* Read-only checks: `SELECT`, `information_schema`, `pg_indexes`, `pg_constraint`.
* Writes against a scratch date, a scratch domain, or an obviously synthetic id.
* Insert, verify, then restore — with the original values captured *before* anything is written.
* If a write is genuinely necessary, state exactly what will be written or removed and get a yes first.

**Cleanup is not exempt.** Before removing anything written during a task, establish that it is safe to remove: a row that existed before the task began is not the task's to delete. When unsure, leave it and say so rather than tidying.

If something is deleted in error, say so immediately and unprompted, state exactly what was lost and what is still recoverable, and do not assert a connection between records that has not been verified.

---

## Global vs User Data

Keep these concepts separate.

### Global project intelligence

Examples:

* Project metadata
* Historical snapshots
* Market data
* GitHub activity
* Protocol metrics
* News
* AI-generated research derived from stored project data

### User-specific data

Examples:

* Watchlists
* Alerts
* Notes
* Preferences
* Saved research

Do not duplicate global intelligence for every user unless there is a specific product requirement.

---

## AI Development

AI integrations must be treated as probabilistic and untrusted.

Follow these principles:

* Prefer structured outputs.
* Validate AI responses before using them.
* Keep prompts/provider configuration separate from UI components.
* Centralize model/provider configuration where practical.
* Track token usage and costs where appropriate.
* Send only necessary context.
* Do not expose API keys to clients.
* Never blindly execute instructions returned by a model.
* Prefer deterministic application logic for factual operations.
* Give the AI access to project intelligence through application services/tools rather than allowing it to independently invent project state.

For AI features, consider:

* Failure cases
* Hallucination risk
* Context size
* Latency
* Cost
* Output validation
* Reproducibility
* Evaluation

---

## External Data Sources

Treat every external provider as a potentially changing dependency.

Before adding a provider, understand:

* Official API/documentation
* Authentication requirements
* Rate limits
* Pricing
* Usage restrictions
* Data licensing/terms
* Response structure
* Failure behavior

Isolate provider-specific logic inside collectors, clients, or adapters.

Do not assume an API is free, unlimited, or safe to scrape.

Only collect data through methods that are authorized and permitted by the relevant platform.

Discord and other community platforms are **not default data sources**. Any future integration must respect the platform's access model, authorization requirements, and terms.

---

## Testing

When changing behavior:

1. Determine whether existing tests cover the affected behavior.
2. Add or update tests when the change warrants them.
3. Prefer focused tests for the changed behavior.
4. Run the narrowest useful check first.
5. Run broader checks when appropriate.

Do not add tests solely to increase coverage numbers without testing meaningful behavior.

Use the repository's existing test framework and scripts.

---

## Verification

Before considering work complete, verify the appropriate parts of the system.

Depending on the change, this may include:

* Type checking
* Unit tests
* Integration tests
* Linting
* Build
* Relevant frontend/backend flows

Do not run expensive checks unnecessarily.

If a check cannot be run, say so.

**Never claim that tests, builds, or checks passed unless they were actually run.**

---

## Security

Follow secure-by-default practices.

* Never commit secrets or credentials.
* Never expose server credentials to clients.
* Do not weaken authentication or authorization to make a feature work.
* Validate untrusted input.
* Treat external API responses as untrusted.
* Treat user-provided content as untrusted.
* Treat AI output as untrusted.
* Avoid logging sensitive information.
* Avoid destructive commands unless required and explicitly justified.

For security-sensitive code, follow established security patterns and the relevant project skill when available.

---

## Major Architectural Changes

For changes affecting any of the following:

* Database architecture
* Authentication/authorization
* External providers
* Public APIs
* Infrastructure
* Core data flow
* Major AI architecture
* Significant dependencies

First understand the existing architecture and consider the tradeoffs.

Prefer incremental, reversible changes.

Do not introduce major architectural complexity without a concrete requirement.

---

## Documentation

Keep durable project knowledge in documentation rather than allowing it to exist only in chat history.

Useful documentation may include:

```text
README.md
docs/PROJECT.md
docs/ROADMAP.md
docs/ARCHITECTURE.md
docs/DECISIONS.md
```

Create documentation when it provides lasting value.

Do not create documentation merely for the sake of documentation.

`AGENTS.md` should contain operational instructions for agents; detailed product or architectural explanations belong in `docs/`.

---

## Git

Do not:

* Commit changes unless explicitly asked.
* Push changes unless explicitly asked.
* Rewrite git history unless explicitly asked.
* Reset or discard user changes.
* Force destructive git operations.

Before finishing, review the relevant diff and ensure changes are limited to the requested work.

---

## Definition of Done

A task is complete when:

* The requested behavior is implemented.
* Existing functionality is preserved.
* Relevant tests/checks have been run when appropriate.
* No unrelated changes were introduced.
* The implementation follows the repository's architecture and conventions.
* Security considerations have been addressed.
* Verification results are reported accurately.

For larger features, verify the complete affected flow across frontend, backend, database, external integrations, and AI components when practical.
