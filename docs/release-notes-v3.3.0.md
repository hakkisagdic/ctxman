# Release Notes - v3.3.0

**Release Date:** 2026-11-14

`ctxman v3.3.0` brings enterprise CI/CD security gates (OASIS SARIF v2.1.0), deterministic PR risk & confidence scoring with Mermaid impact graphs, `.ctxman/rules.json` scoped semantic rules, AI agent rules auto-discovery (`--include-rules`), direct remote Git repository packing (`--remote`), KVKK/BDDK PII compliance presets, usage metering & `iyzico` billing APIs, and full TypeScript + 19-tool MCP parity.

---

## 🚀 New Features

### 🛡️ OASIS SARIF v2.1.0 Security & Policy Output (`ctxman policy check --sarif`)

- **Standard SARIF v2.1.0 Output**: Convert policy validation errors (`CTXMAN001`), export policy violations (`CTXMAN002`), secret/PII detections (`CTXMAN003`), and custom PR rule violations (`CTXMAN004`) into OASIS SARIF v2.1.0 JSON via `buildSarifReport` / `formatPolicySarif` (`lib/policy/sarif.js`).
- **CLI, REST & MCP Support**:
  - CLI: `ctxman policy check --sarif` or `ctxman policy check --format sarif`
  - REST API: `GET /api/v1/policy?format=sarif`
  - MCP `check_policy`: `format: "sarif"`
- **Ready-to-Use CI Templates**:
  - GitHub Actions (`github/codeql-action/upload-sarif@v3` + sticky PR summary comment): `.github/workflows/ctxman-sarif-gate.yml`
  - GitLab CI (SAST & CodeQuality artifacts): `examples/gitlab-ci/ctxman-sarif-gate.gitlab-ci.yml`

### 🔍 PR Review Intelligence: Risk Score, Confidence Score & Mermaid Flowchart (`ctxman pr`)

- **Deterministic Risk & Confidence Scoring**: `buildPrContext` (`lib/pr/pr-intelligence.js`) computes `riskScore` (`0–100`), `confidenceScore` (`1–5`), and human-readable `riskFactors` across blast radius, hotspots, missing related tests, sensitive paths, and custom rule violations.
- **Scoped Semantic Rules (`.ctxman/rules.json`)**: Enforce path-scoped rules (`pathPattern`, `forbidPattern`, `requireTest`, `maxFileAdditions`, `severity`) during PR review (`ruleViolations`).
- **Automatic Mermaid Impact Diagram**: Generates a `flowchart LR` `mermaidDiagram` linking changed files, modified symbols, and impacted callers across Markdown, XML, and JSON outputs.

### 📜 Project Rules & AI Agent Instructions Auto-Discovery (`--include-rules`)

- **Automatic Discovery & Redaction**: `discoverProjectRules` / `discoverRulesFiles` (`lib/pack/rules-discovery.js`) automatically locates and secret-redacts `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.cursor/rules/*.mdc`, `.github/copilot-instructions.md`, and `.windsurfrules`.
- **End-to-End Integration**: Available via `ctxman pack --include-rules`, `ctxman task --include-rules`, `packWorkspace`, `POST /api/v1/pack`, `POST /api/v1/task`, `GET /api/v1/rules`, and MCP `pack_context` (`includeRules: true`).

### 🌐 Remote Git Repository Direct Analysis & Packing (`--remote <spec>`)

- **Zero-Setup Remote Analysis**: Analyze or pack any remote repository with `withRemoteRepo` / `withRemoteOrLocalRepo` (`lib/utils/remote-repo.js`) using `owner/repo`, `github:owner/repo`, `gitlab:owner/repo`, `https://...`, or `file://` URLs with shallow cloning (`--depth 1`) and automatic temp directory cleanup.
- **CLI, REST & MCP Support**:
  - CLI: `ctxman pack --remote <url-or-shorthand> [--branch <ref>]` and `ctxman map --remote <url-or-shorthand> [--branch <ref>]`
  - REST API: `POST /api/v1/pack` and `GET /api/v1/map` (`remote`, `branch`)
  - MCP `pack_context`: `remote` and `branch` parameters

### 🔒 KVKK & BDDK PII Redaction & Compliance Policy Presets

- **Deterministic PII Validators**: Added Turkish National ID (`TCKN` 10th/11th digit checksum via `isValidTCKN`), Turkish `TR` IBAN (`kvkk-tr-iban`), Luhn-validated credit/debit card (`isValidLuhn`, `bddk-credit-card`), email (`kvkk-email`), and Turkish mobile phone (`kvkk-tr-phone`) redaction in `lib/utils/secret-redactor.js`.
- **Compliance Presets**: Initialize compliant `.ctxman/policy.json` configurations with `ctxman policy init --preset kvkk-bddk` or `ctxman policy init --preset soc2`.

### 💳 Usage Metering, Plan Quotas, Invoices & `iyzico` Payment Provider (`lib/billing`)

- **SQLite-Backed Billing Store**: Added `PLANS` (`free`, `pro`, `team`, `enterprise`), `TOPUP_PACKS`, `BillingStore`, `QuotaExceededError` (HTTP `402`), and `IyzicoProvider` / `MockPaymentProvider`.
- **REST Billing & Knowledge Graph Endpoints**:
  - `GET /api/v1/billing/plans`, `GET /api/v1/billing/subscription`, `POST /api/v1/billing/checkout`, `POST /api/v1/billing/webhook`, `GET /api/v1/billing/usage`, `GET /api/v1/billing/invoices`
  - `GET /api/v1/graph` (`path`, `repos`, `file`, `query`, `depth`, `limit`, `refresh`) for full REST parity with MCP `query_knowledge_graph`

### 🖥️ Desktop Application & MCP Ecosystem

- **Electron Desktop UI**: Dark-themed desktop interface with visual project browser, real-time `FileWatcher` updates, built-in MCP client, resource browser, and parameterized prompt library.
- **Full TypeScript & 19-Tool MCP Parity**: Synchronized `index.d.ts` with all `v3.3.0` exports and types (`SarifLog`, `RulesDiscoveryResult`, `PrIntelligenceResult`, `RemoteRepoHandle`, etc.).

---

## 📦 Verification & Quality Gates

- **Test Suite**: 172 test files, 2,180 passing tests (`npm test`)
- **Strict Lint & Formatting**: `npm run lint:strict` (0 warnings) & `npm run format:check` (Prettier clean)
- **Documentation**: Bilingual (EN/TR) VitePress documentation (`npm run docs:build`)
