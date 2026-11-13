import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, beforeEach, afterEach } from 'vitest';
import {
  PLANS,
  TOPUP_PACKS,
  getPlan,
  listPlans,
  BillingStore,
  QuotaExceededError,
  IyzicoProvider,
  MockPaymentProvider,
} from '../lib/billing/index.js';
import { APIServer } from '../lib/api/rest/server.js';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-billing-'));
}

describe('P0-1: Billing, Usage Metering, Quotas, Invoices & iyzico Provider', () => {
  let tmpDir;
  let store;

  beforeEach(() => {
    tmpDir = makeTempDir();
    store = new BillingStore(tmpDir);
  });

  afterEach(() => {
    if (store) store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exposes community, pro, team, and enterprise plans in TRY and USD', () => {
    const plans = listPlans();
    assert.equal(plans.length, 4);
    assert.equal(PLANS.pro.pricing.TRY.monthly, 690_00);
    assert.equal(PLANS.team.pricing.TRY.monthly, 2_990_00);
    assert.equal(PLANS.enterprise.pricing.TRY.monthly, 19_900_00);
    assert.equal(getPlan('pro').quotas.monthlyTokens, 25_000_000);
    assert.equal(TOPUP_PACKS['tokens-100m'].extraTokens, 100_000_000);
  });

  it('creates customers, issues hashed API keys, records usage, and enforces quotas', () => {
    const customer = store.createCustomer({
      email: 'dev@fintech.com.tr',
      name: 'Ayşe Yılmaz',
      company: 'Fintech A.Ş.',
      taxId: '1234567890',
      taxOffice: 'Maslak',
      planId: 'community',
    });

    assert.ok(customer.id.startsWith('cus_'));
    assert.equal(customer.subscription.planId, 'community');

    const issued = store.createApiKey(customer.id, 'ci-key');
    assert.ok(issued.apiKey.startsWith('ctx_live_'));
    const authenticated = store.authenticateApiKey(issued.apiKey);
    assert.equal(authenticated.id, customer.id);
    assert.equal(store.authenticateApiKey('ctx_live_invalid'), null);

    // Community plan allows max 1 repo and 500,000 monthly tokens
    assert.throws(
      () => store.checkQuota(customer.id, { operation: 'pack', repoCount: 2 }),
      (err) => err instanceof QuotaExceededError && err.details.reason === 'max_repos_exceeded'
    );

    store.recordUsage({
      customerId: customer.id,
      operation: 'pack',
      tokensUsed: 450_000,
    });

    const summary = store.getUsageSummary(customer.id);
    assert.equal(summary.tokensUsed, 450_000);
    assert.equal(summary.tokensRemaining, 50_000);

    // Exceeding 500k budget throws QuotaExceededError (402)
    assert.throws(
      () =>
        store.recordUsage({
          customerId: customer.id,
          operation: 'pack',
          tokensUsed: 60_000,
        }),
      (err) =>
        err instanceof QuotaExceededError &&
        err.statusCode === 402 &&
        err.details.reason === 'monthly_tokens_exceeded'
    );

    // Top-up pack adds 100,000,000 extra tokens
    store.applyTopup(customer.id, 'tokens-100m');
    const afterTopup = store.getUsageSummary(customer.id);
    assert.equal(afterTopup.quotas.effectiveTokenLimit, 100_500_000);
  });

  it('creates sequential invoices with 20% KDV for TRY and 0% for USD', () => {
    const customer = store.createCustomer({
      email: 'billing@holding.com.tr',
      currency: 'TRY',
      planId: 'team',
      seats: 5,
    });

    const invTry = store.createInvoice({
      customerId: customer.id,
      planId: 'team',
      billingCycle: 'monthly',
      seats: 5,
      currency: 'TRY',
    });

    assert.match(invTry.invoiceNumber, /^CTX-\d{4}-000001$/);
    assert.equal(invTry.subtotal, 2990);
    assert.equal(invTry.vatRate, 0.2);
    assert.equal(invTry.vatAmount, Number((2990 * 0.2).toFixed(2)));
    assert.equal(invTry.total, Number((2990 * 1.2).toFixed(2)));
    assert.equal(invTry.status, 'pending');

    const paid = store.markInvoicePaid(invTry.id, 'iyz_pay_999');
    assert.equal(paid.status, 'paid');
    assert.equal(paid.providerPaymentId, 'iyz_pay_999');
    assert.ok(paid.paidAt);

    const invUsd = store.createInvoice({
      customerId: customer.id,
      planId: 'pro',
      billingCycle: 'monthly',
      currency: 'USD',
    });
    assert.match(invUsd.invoiceNumber, /^CTX-\d{4}-000002$/);
    assert.equal(invUsd.vatRate, 0);
    assert.equal(invUsd.total, 19);
  });

  it('computes iyzico IYZWSv2 authorization headers and verifies webhook HMAC signatures', async () => {
    const provider = new IyzicoProvider({
      apiKey: 'sandbox-api-key',
      secretKey: 'whsec_test_123',
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          token: 'iyz_tok_123',
          paymentPageUrl: 'https://sandbox-cpp.iyzipay.com/checkout/iyz_tok_123',
        }),
      }),
    });

    const authHeader = provider.buildAuthorizationHeader(
      '/payment/iyzipos/checkoutform/initialize/auth/ecom',
      'rnd123',
      JSON.stringify({ locale: 'tr', price: '690.00' })
    );
    assert.ok(authHeader.startsWith('IYZWSv2 '));

    const session = await provider.createCheckoutSession({
      customer: { id: 'cus_1', email: 'user@example.com', name: 'Test User' },
      planId: 'pro',
      currency: 'TRY',
    });
    assert.equal(session.provider, 'iyzico');
    assert.equal(session.mode, 'live');
    assert.ok(session.checkoutFormUrl.includes('sandbox-cpp.iyzipay.com'));

    const payload = JSON.stringify({ status: 'SUCCESS', customerId: 'cus_1', planId: 'pro' });
    const validSig = crypto.createHmac('sha256', 'whsec_test_123').update(payload).digest('hex');
    assert.equal(provider.verifyWebhookSignature(payload, validSig), true);
    assert.equal(provider.verifyWebhookSignature(payload, 'bad_signature'), false);
  });

  it('serves REST API v1 billing endpoints and enforces 402 on quota overflow', async () => {
    fs.writeFileSync(path.join(tmpDir, 'index.js'), 'export const hello = () => "world";\n');

    const mockProvider = new MockPaymentProvider();
    const api = new APIServer({
      host: '127.0.0.1',
      port: 0,
      billingStore: store,
      paymentProvider: mockProvider,
    });

    await new Promise((resolve) => {
      api.server = api.server || null;
      api.start();
      api.server.once('listening', resolve);
    });

    const { port } = api.server.address();
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. GET /api/v1/billing/plans
      const plansRes = await fetch(`${baseUrl}/api/v1/billing/plans`);
      assert.equal(plansRes.status, 200);
      const plansJson = await plansRes.json();
      assert.equal(plansJson.plans.length, 4);

      // 2. POST /api/v1/billing/customers
      const custRes = await fetch(`${baseUrl}/api/v1/billing/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'cto@startup.io',
          name: 'Can Demir',
          company: 'Startup Teknoloji A.Ş.',
          planId: 'community',
          path: tmpDir,
        }),
      });
      assert.equal(custRes.status, 201);
      const custJson = await custRes.json();
      assert.ok(custJson.customer.id);
      assert.ok(custJson.apiKey.startsWith('ctx_live_'));

      // 3. POST /api/v1/billing/checkout
      const checkoutRes = await fetch(`${baseUrl}/api/v1/billing/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: custJson.customer.id,
          planId: 'pro',
          billingCycle: 'monthly',
          currency: 'TRY',
          path: tmpDir,
        }),
      });
      assert.equal(checkoutRes.status, 200);
      const checkoutJson = await checkoutRes.json();
      assert.equal(checkoutJson.invoice.status, 'pending');
      assert.equal(checkoutJson.invoice.total, Number((690 * 1.2).toFixed(2)));
      assert.ok(checkoutJson.checkout.checkoutFormUrl);

      // 4. POST /api/v1/billing/webhook/iyzico with invalid signature -> 401
      const webhookPayload = JSON.stringify({
        status: 'SUCCESS',
        customerId: custJson.customer.id,
        planId: 'pro',
        invoiceId: checkoutJson.invoice.id,
        paymentId: 'pay_iyz_001',
        path: tmpDir,
      });

      const badWebhookRes = await fetch(`${baseUrl}/api/v1/billing/webhook/iyzico`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-iyz-signature-v3': 'invalid_sig',
        },
        body: webhookPayload,
      });
      assert.equal(badWebhookRes.status, 401);

      // 5. POST /api/v1/billing/webhook/iyzico with valid signature -> upgrades plan & marks invoice paid
      const okWebhookRes = await fetch(`${baseUrl}/api/v1/billing/webhook/iyzico`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-iyz-signature-v3': 'mock_sig_valid',
        },
        body: webhookPayload,
      });
      assert.equal(okWebhookRes.status, 200);
      const okWebhookJson = await okWebhookRes.json();
      assert.equal(okWebhookJson.subscription.planId, 'pro');
      assert.equal(okWebhookJson.invoice.status, 'paid');

      // 6. GET /api/v1/billing/invoices
      const invRes = await fetch(
        `${baseUrl}/api/v1/billing/invoices?customerId=${custJson.customer.id}`
      );
      assert.equal(invRes.status, 200);
      const invJson = await invRes.json();
      assert.equal(invJson.total, 1);
      assert.equal(invJson.invoices[0].status, 'paid');

      // 7. Metered pack request with Bearer API key
      const packRes = await fetch(`${baseUrl}/api/v1/pack`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${custJson.apiKey}`,
        },
        body: JSON.stringify({ path: tmpDir, budget: 5000 }),
      });
      assert.equal(packRes.status, 200);

      // 8. GET /api/v1/billing/usage confirms metered event
      const usageRes = await fetch(
        `${baseUrl}/api/v1/billing/usage?customerId=${custJson.customer.id}`
      );
      assert.equal(usageRes.status, 200);
      const usageJson = await usageRes.json();
      assert.equal(usageJson.planId, 'pro');
      assert.equal(usageJson.packRequestsUsed, 1);
      assert.ok(usageJson.tokensUsed > 0);
    } finally {
      api.stop();
    }
  });
});
