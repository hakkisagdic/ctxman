import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { getPlan, TOPUP_PACKS } from './plans.js';

export class QuotaExceededError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'QuotaExceededError';
    this.statusCode = 402;
    this.details = details;
  }
}

/**
 * SQLite-backed Billing, Subscription, Usage Metering, Quota & Invoice Store
 */
export class BillingStore {
  /**
   * @param {string} rootPath - Workspace root directory or explicit DB path
   * @param {Object} [options]
   * @param {string} [options.dbPath]
   * @param {number} [options.vatRate] - Default 0.20 (20% KDV)
   */
  constructor(rootPath = process.cwd(), options = {}) {
    this.rootPath = rootPath;
    this.vatRate = typeof options.vatRate === 'number' ? options.vatRate : 0.2;
    this.dbPath = options.dbPath || path.join(rootPath, '.ctxman', 'billing', 'billing.sqlite');

    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this._initSchema();
  }

  _initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT,
        company TEXT,
        tax_id TEXT,
        tax_office TEXT,
        country TEXT DEFAULT 'TR',
        currency TEXT DEFAULT 'TRY',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        key_prefix TEXT NOT NULL,
        label TEXT,
        revoked INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      );

      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL UNIQUE,
        plan_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        billing_cycle TEXT NOT NULL DEFAULT 'monthly',
        seats INTEGER NOT NULL DEFAULT 1,
        extra_tokens INTEGER NOT NULL DEFAULT 0,
        extra_requests INTEGER NOT NULL DEFAULT 0,
        provider TEXT DEFAULT 'iyzico',
        provider_ref TEXT,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      );

      CREATE TABLE IF NOT EXISTS usage_events (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        repo TEXT,
        tokens_used INTEGER NOT NULL DEFAULT 0,
        metadata_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        invoice_number TEXT NOT NULL UNIQUE,
        customer_id TEXT NOT NULL,
        plan_id TEXT,
        currency TEXT NOT NULL DEFAULT 'TRY',
        subtotal REAL NOT NULL,
        vat_rate REAL NOT NULL,
        vat_amount REAL NOT NULL,
        total REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        provider TEXT,
        provider_payment_id TEXT,
        line_items_json TEXT NOT NULL,
        issued_at TEXT NOT NULL,
        paid_at TEXT
      );
    `);
  }

  static hashApiKey(rawKey) {
    return crypto.createHash('sha256').update(String(rawKey)).digest('hex');
  }

  static currentPeriodBounds(now = new Date()) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
    return {
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
    };
  }

  /**
   * Create or update a customer and initialize a subscription (defaults to community)
   */
  createCustomer({
    id,
    email,
    name = '',
    company = '',
    taxId = '',
    taxOffice = '',
    country = 'TR',
    currency = 'TRY',
    planId = 'community',
    seats = 1,
  }) {
    if (!email) {
      throw new Error('Customer email is required');
    }
    const existing = this.db.prepare('SELECT * FROM customers WHERE email = ?').get(email);
    if (existing) {
      return this.getCustomer(existing.id);
    }

    const customerId = id || `cus_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO customers (id, email, name, company, tax_id, tax_office, country, currency, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(customerId, email, name, company, taxId, taxOffice, country, currency, now);

    this.upsertSubscription({
      customerId,
      planId,
      seats,
      status: 'active',
    });

    return this.getCustomer(customerId);
  }

  getCustomer(customerId) {
    const customer = this.db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
    if (!customer) return null;
    const subscription = this.getSubscription(customerId);
    return {
      id: customer.id,
      email: customer.email,
      name: customer.name,
      company: customer.company,
      taxId: customer.tax_id,
      taxOffice: customer.tax_office,
      country: customer.country,
      currency: customer.currency,
      createdAt: customer.created_at,
      subscription,
    };
  }

  getSubscription(customerId) {
    const sub = this.db
      .prepare('SELECT * FROM subscriptions WHERE customer_id = ?')
      .get(customerId);
    if (!sub) return null;
    const plan = getPlan(sub.plan_id);
    return {
      id: sub.id,
      customerId: sub.customer_id,
      planId: sub.plan_id,
      planName: plan.name,
      status: sub.status,
      billingCycle: sub.billing_cycle,
      seats: sub.seats,
      extraTokens: sub.extra_tokens || 0,
      extraRequests: sub.extra_requests || 0,
      provider: sub.provider,
      providerRef: sub.provider_ref,
      periodStart: sub.period_start,
      periodEnd: sub.period_end,
      updatedAt: sub.updated_at,
      quotas: plan.quotas,
    };
  }

  upsertSubscription({
    customerId,
    planId = 'community',
    status = 'active',
    billingCycle = 'monthly',
    seats = 1,
    extraTokens = 0,
    extraRequests = 0,
    provider = 'iyzico',
    providerRef = null,
    periodStart,
    periodEnd,
  }) {
    const plan = getPlan(planId);
    const bounds = BillingStore.currentPeriodBounds();
    const start = periodStart || bounds.periodStart;
    const end = periodEnd || bounds.periodEnd;
    const now = new Date().toISOString();

    const existing = this.db
      .prepare('SELECT * FROM subscriptions WHERE customer_id = ?')
      .get(customerId);

    if (existing) {
      this.db
        .prepare(
          `UPDATE subscriptions
           SET plan_id = ?, status = ?, billing_cycle = ?, seats = ?, extra_tokens = ?, extra_requests = ?,
               provider = ?, provider_ref = COALESCE(?, provider_ref),
               period_start = ?, period_end = ?, updated_at = ?
           WHERE customer_id = ?`
        )
        .run(
          plan.id,
          status,
          billingCycle,
          Math.max(1, Number(seats) || 1),
          Number(extraTokens) || 0,
          Number(extraRequests) || 0,
          provider,
          providerRef,
          start,
          end,
          now,
          customerId
        );
    } else {
      const subId = `sub_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      this.db
        .prepare(
          `INSERT INTO subscriptions
           (id, customer_id, plan_id, status, billing_cycle, seats, extra_tokens, extra_requests, provider, provider_ref, period_start, period_end, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          subId,
          customerId,
          plan.id,
          status,
          billingCycle,
          Math.max(1, Number(seats) || 1),
          Number(extraTokens) || 0,
          Number(extraRequests) || 0,
          provider,
          providerRef,
          start,
          end,
          now
        );
    }

    return this.getSubscription(customerId);
  }

  /**
   * Apply a token/credit top-up pack to a customer's active subscription
   */
  applyTopup(customerId, topupId = 'tokens-100m') {
    const pack = TOPUP_PACKS[topupId];
    if (!pack) {
      throw new Error(`Unknown top-up pack: ${topupId}`);
    }
    const sub = this.getSubscription(customerId);
    if (!sub) {
      throw new Error(`No subscription found for customer: ${customerId}`);
    }
    const updatedExtraTokens = (sub.extraTokens || 0) + (pack.extraTokens || 0);
    const updatedExtraRequests = (sub.extraRequests || 0) + (pack.extraRequests || 0);
    this.db
      .prepare(
        'UPDATE subscriptions SET extra_tokens = ?, extra_requests = ?, updated_at = ? WHERE customer_id = ?'
      )
      .run(updatedExtraTokens, updatedExtraRequests, new Date().toISOString(), customerId);
    return this.getSubscription(customerId);
  }

  /**
   * Issue a new API key for a customer (returns plaintext key once; stores SHA-256 hash)
   */
  createApiKey(customerId, label = 'default') {
    const customer = this.getCustomer(customerId);
    if (!customer) {
      throw new Error(`Customer not found: ${customerId}`);
    }
    const rawRandom = crypto.randomBytes(24).toString('hex');
    const apiKey = `ctx_live_${rawRandom}`;
    const keyHash = BillingStore.hashApiKey(apiKey);
    const keyPrefix = apiKey.slice(0, 15);
    const id = `key_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO api_keys (id, customer_id, key_hash, key_prefix, label, revoked, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?)`
      )
      .run(id, customerId, keyHash, keyPrefix, label, now);

    return {
      id,
      customerId,
      apiKey,
      keyPrefix,
      label,
      createdAt: now,
    };
  }

  /**
   * Authenticate a raw API key and return customer + subscription details
   */
  authenticateApiKey(rawKey) {
    if (!rawKey) return null;
    const keyHash = BillingStore.hashApiKey(rawKey);
    const row = this.db
      .prepare('SELECT * FROM api_keys WHERE key_hash = ? AND revoked = 0')
      .get(keyHash);
    if (!row) return null;
    return this.getCustomer(row.customer_id);
  }

  /**
   * Check whether a customer has remaining quota for an operation, throwing QuotaExceededError if exceeded
   */
  checkQuota(customerId, { operation = 'pack', tokensRequested = 0, repoCount = 1 } = {}) {
    const usage = this.getUsageSummary(customerId);
    if (!usage) {
      throw new Error(`Customer not found: ${customerId}`);
    }

    const { quotas } = usage;
    if (quotas.maxRepos !== null && repoCount > quotas.maxRepos) {
      throw new QuotaExceededError(
        `Plan '${usage.planId}' allows up to ${quotas.maxRepos} repositories per workspace (requested ${repoCount}). Upgrade to Team or Enterprise.`,
        {
          reason: 'max_repos_exceeded',
          planId: usage.planId,
          limit: quotas.maxRepos,
          requested: repoCount,
        }
      );
    }

    if (
      quotas.effectiveTokenLimit !== null &&
      usage.tokensUsed + tokensRequested > quotas.effectiveTokenLimit
    ) {
      throw new QuotaExceededError(
        `Monthly token budget exceeded for plan '${usage.planId}' (${usage.tokensUsed + tokensRequested} / ${quotas.effectiveTokenLimit}). Purchase a top-up pack or upgrade your plan.`,
        {
          reason: 'monthly_tokens_exceeded',
          planId: usage.planId,
          limit: quotas.effectiveTokenLimit,
          used: usage.tokensUsed,
          requested: tokensRequested,
        }
      );
    }

    if (
      (operation === 'pack' || operation === 'task') &&
      quotas.effectiveRequestLimit !== null &&
      usage.packRequestsUsed + 1 > quotas.effectiveRequestLimit
    ) {
      throw new QuotaExceededError(
        `Monthly pack/task request quota exceeded for plan '${usage.planId}' (${usage.packRequestsUsed} / ${quotas.effectiveRequestLimit}).`,
        {
          reason: 'monthly_requests_exceeded',
          planId: usage.planId,
          limit: quotas.effectiveRequestLimit,
          used: usage.packRequestsUsed,
        }
      );
    }

    return usage;
  }

  /**
   * Record a metered usage event (`pack`, `task`, `search`, `intelligence`)
   */
  recordUsage({
    customerId,
    operation = 'pack',
    repo = 'default',
    tokensUsed = 0,
    metadata = {},
    enforceQuota = true,
  }) {
    const safeTokens = Math.max(0, Math.round(Number(tokensUsed) || 0));
    if (enforceQuota) {
      this.checkQuota(customerId, { operation, tokensRequested: safeTokens });
    }

    const id = `use_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO usage_events (id, customer_id, operation, repo, tokens_used, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, customerId, operation, repo, safeTokens, JSON.stringify(metadata || {}), now);

    return {
      id,
      customerId,
      operation,
      repo,
      tokensUsed: safeTokens,
      createdAt: now,
      summary: this.getUsageSummary(customerId),
    };
  }

  /**
   * Get current billing period usage summary for a customer
   */
  getUsageSummary(customerId) {
    const sub = this.getSubscription(customerId);
    if (!sub) return null;

    const totals = this.db
      .prepare(
        `SELECT
           COALESCE(SUM(tokens_used), 0) AS total_tokens,
           COUNT(*) AS total_events,
           SUM(CASE WHEN operation IN ('pack', 'task') THEN 1 ELSE 0 END) AS pack_requests
         FROM usage_events
         WHERE customer_id = ? AND created_at >= ? AND created_at < ?`
      )
      .get(customerId, sub.periodStart, sub.periodEnd);

    const byOperation = this.db
      .prepare(
        `SELECT operation, COUNT(*) AS count, COALESCE(SUM(tokens_used), 0) AS tokens
         FROM usage_events
         WHERE customer_id = ? AND created_at >= ? AND created_at < ?
         GROUP BY operation`
      )
      .all(customerId, sub.periodStart, sub.periodEnd);

    const baseTokens = sub.quotas.monthlyTokens;
    const effectiveTokenLimit = Number.isFinite(baseTokens)
      ? baseTokens + (sub.extraTokens || 0)
      : null;

    const baseRequests = sub.quotas.monthlyRequests;
    const effectiveRequestLimit = Number.isFinite(baseRequests)
      ? baseRequests + (sub.extraRequests || 0)
      : null;

    const maxRepos = Number.isFinite(sub.quotas.maxRepos) ? sub.quotas.maxRepos : null;

    const tokensUsed = Number(totals?.total_tokens || 0);
    const packRequestsUsed = Number(totals?.pack_requests || 0);

    return {
      customerId,
      planId: sub.planId,
      planName: sub.planName,
      status: sub.status,
      seats: sub.seats,
      periodStart: sub.periodStart,
      periodEnd: sub.periodEnd,
      tokensUsed,
      tokensRemaining:
        effectiveTokenLimit === null ? null : Math.max(0, effectiveTokenLimit - tokensUsed),
      packRequestsUsed,
      packRequestsRemaining:
        effectiveRequestLimit === null
          ? null
          : Math.max(0, effectiveRequestLimit - packRequestsUsed),
      totalEvents: Number(totals?.total_events || 0),
      quotas: {
        maxRepos,
        monthlyTokens: Number.isFinite(baseTokens) ? baseTokens : null,
        monthlyRequests: Number.isFinite(baseRequests) ? baseRequests : null,
        effectiveTokenLimit,
        effectiveRequestLimit,
        complianceShield: sub.quotas.complianceShield,
        sarifGate: sub.quotas.sarifGate,
      },
      byOperation: byOperation.map((row) => ({
        operation: row.operation,
        count: Number(row.count),
        tokens: Number(row.tokens),
      })),
    };
  }

  /**
   * Generate an e-Arşiv/invoice record with sequential CTX-YYYY-NNNNNN number and KDV calculation
   */
  createInvoice({
    customerId,
    planId = 'pro',
    billingCycle = 'monthly',
    seats = 1,
    currency = 'TRY',
    status = 'pending',
    provider = 'iyzico',
    providerPaymentId = null,
    customAmount = null,
    description = null,
  }) {
    const customer = this.getCustomer(customerId);
    if (!customer) {
      throw new Error(`Customer not found: ${customerId}`);
    }
    const plan = getPlan(planId);
    const cur = (currency || customer.currency || 'TRY').toUpperCase();
    const priceTable = plan.pricing[cur] || plan.pricing.TRY;
    const baseMinor = billingCycle === 'yearly' ? priceTable.yearly : priceTable.monthly;
    const baseMajor = baseMinor / 100;

    const requestedSeats = Math.max(1, Number(seats) || 1);
    const includedSeats = plan.quotas.includedSeats || 1;
    const extraSeats = Math.max(0, requestedSeats - includedSeats);
    const extraSeatMajor = ((priceTable.extraSeatMonthly || 0) / 100) * extraSeats;

    const subtotal =
      customAmount !== null
        ? Number(Number(customAmount).toFixed(2))
        : Number((baseMajor + extraSeatMajor).toFixed(2));
    const vatRate = cur === 'TRY' ? this.vatRate : 0;
    const vatAmount = Number((subtotal * vatRate).toFixed(2));
    const total = Number((subtotal + vatAmount).toFixed(2));

    const year = new Date().getUTCFullYear();
    const countRow = this.db.prepare('SELECT COUNT(*) AS cnt FROM invoices').get();
    const seq = String(Number(countRow?.cnt || 0) + 1).padStart(6, '0');
    const invoiceNumber = `CTX-${year}-${seq}`;
    const id = `inv_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();

    const lineItems = [
      {
        description: description || `CtxMan ${plan.name} Plan (${billingCycle})`,
        planId: plan.id,
        seats: requestedSeats,
        unitPrice: baseMajor,
        subtotal,
      },
    ];

    this.db
      .prepare(
        `INSERT INTO invoices
         (id, invoice_number, customer_id, plan_id, currency, subtotal, vat_rate, vat_amount, total, status, provider, provider_payment_id, line_items_json, issued_at, paid_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        invoiceNumber,
        customerId,
        plan.id,
        cur,
        subtotal,
        vatRate,
        vatAmount,
        total,
        status,
        provider,
        providerPaymentId,
        JSON.stringify(lineItems),
        now,
        status === 'paid' ? now : null
      );

    return this.getInvoice(id);
  }

  markInvoicePaid(invoiceId, providerPaymentId = null) {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE invoices
         SET status = 'paid', provider_payment_id = COALESCE(?, provider_payment_id), paid_at = ?
         WHERE id = ?`
      )
      .run(providerPaymentId, now, invoiceId);
    return this.getInvoice(invoiceId);
  }

  getInvoice(invoiceId) {
    const row = this.db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
    if (!row) return null;
    return this._formatInvoiceRow(row);
  }

  listInvoices(customerId) {
    const rows = customerId
      ? this.db
          .prepare('SELECT * FROM invoices WHERE customer_id = ? ORDER BY issued_at DESC')
          .all(customerId)
      : this.db.prepare('SELECT * FROM invoices ORDER BY issued_at DESC').all();
    return rows.map((r) => this._formatInvoiceRow(r));
  }

  _formatInvoiceRow(row) {
    return {
      id: row.id,
      invoiceNumber: row.invoice_number,
      customerId: row.customer_id,
      planId: row.plan_id,
      currency: row.currency,
      subtotal: row.subtotal,
      vatRate: row.vat_rate,
      vatAmount: row.vat_amount,
      total: row.total,
      status: row.status,
      provider: row.provider,
      providerPaymentId: row.provider_payment_id,
      lineItems: JSON.parse(row.line_items_json || '[]'),
      issuedAt: row.issued_at,
      paidAt: row.paid_at,
    };
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export default BillingStore;
