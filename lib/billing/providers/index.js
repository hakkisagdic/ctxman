/**
 * Payment Provider Abstraction (`iyzico` primary provider + offline/mock provider)
 *
 * Security Rules:
 * - Never hardcode, persist, or log API keys or secret keys.
 * - Read credentials exclusively from runtime options or environment variables
 *   (`IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_BASE_URL`).
 */

import crypto from 'crypto';
import { getPlan, TOPUP_PACKS } from '../plans.js';

export class PaymentProvider {
  constructor(name) {
    this.name = name;
  }

  async createCheckoutSession(_params) {
    throw new Error(`${this.name}: createCheckoutSession() not implemented`);
  }

  verifyWebhookSignature(_payload, _signature, _headers) {
    throw new Error(`${this.name}: verifyWebhookSignature() not implemented`);
  }
}

/**
 * iyzico Payment & Subscription Provider (TRY & USD)
 * Uses iyzico V2 HMAC-SHA256 authorization (`IYZWSv2`) and webhook signature verification
 * (`x-iyz-signature-v3`).
 */
export class IyzicoProvider extends PaymentProvider {
  /**
   * @param {object} [options]
   * @param {string} [options.apiKey]
   * @param {string} [options.secretKey]
   * @param {string} [options.baseUrl]
   * @param {typeof globalThis.fetch} [options.fetch]
   * @param {NodeJS.ProcessEnv} [options.env]
   */
  constructor(options = {}) {
    super('iyzico');
    const env = options.env || process.env;
    this.apiKey = options.apiKey || env.IYZICO_API_KEY || null;
    this.secretKey = options.secretKey || env.IYZICO_SECRET_KEY || null;
    this.baseUrl = (options.baseUrl || env.IYZICO_BASE_URL || 'https://api.iyzipay.com').replace(
      /\/+$/,
      ''
    );
    this.fetchImpl = options.fetch || globalThis.fetch;
  }

  isConfigured() {
    return Boolean(this.apiKey && this.secretKey);
  }

  /**
   * Compute iyzico IYZWSv2 authorization header value without logging secrets.
   * @param {string} uriPath - e.g. `/payment/iyzipos/checkoutform/initialize/auth/ecom`
   * @param {string} randomKey
   * @param {string} bodyString
   * @returns {string}
   */
  buildAuthorizationHeader(uriPath, randomKey, bodyString = '') {
    if (!this.isConfigured()) {
      throw new Error('iyzico provider is not configured (missing API key or secret key)');
    }
    const payload = `${randomKey}${uriPath}${bodyString}`;
    const signature = crypto
      .createHmac('sha256', this.secretKey)
      .update(payload, 'utf8')
      .digest('hex');
    const authParams = `apiKey:${this.apiKey}&randomKey:${randomKey}&signature:${signature}`;
    return `IYZWSv2 ${Buffer.from(authParams, 'utf8').toString('base64')}`;
  }

  /**
   * Initialize an iyzico checkout form session for a subscription plan or top-up pack.
   * Falls back to a deterministic offline checkout descriptor when `offlineFallback: true`
   * and no live network fetch is requested.
   */
  async createCheckoutSession({
    customer,
    planId,
    topupId,
    billingCycle = 'monthly',
    currency = 'TRY',
    callbackUrl = 'https://ctxman.dev/billing/callback',
    conversationId,
    offlineFallback = false,
  }) {
    const normalizedCurrency = String(currency || 'TRY').toUpperCase();
    if (normalizedCurrency !== 'TRY' && normalizedCurrency !== 'USD') {
      throw new Error(`Unsupported currency: ${currency} (expected TRY or USD)`);
    }

    let itemName;
    let amountMinor;
    let itemId;

    if (topupId) {
      const pack = TOPUP_PACKS[topupId];
      if (!pack) throw new Error(`Unknown top-up pack: ${topupId}`);
      itemName = pack.name;
      amountMinor = pack.pricing[normalizedCurrency];
      itemId = pack.id;
    } else {
      const plan = getPlan(planId);
      if (plan.id === 'community') {
        throw new Error('Community plan is free and does not require checkout');
      }
      const cycle = billingCycle === 'yearly' ? 'yearly' : 'monthly';
      itemName = `Ctxman ${plan.name} (${cycle})`;
      amountMinor = plan.pricing[normalizedCurrency][cycle];
      itemId = `${plan.id}-${cycle}`;
    }

    const priceDecimal = (amountMinor / 100).toFixed(2);
    const convId = conversationId || `ctx_${crypto.randomUUID()}`;
    const uriPath = '/payment/iyzipos/checkoutform/initialize/auth/ecom';

    const requestPayload = {
      locale: normalizedCurrency === 'TRY' ? 'tr' : 'en',
      conversationId: convId,
      price: priceDecimal,
      paidPrice: priceDecimal,
      currency: normalizedCurrency,
      basketId: `basket_${convId}`,
      paymentGroup: 'SUBSCRIPTION',
      callbackUrl,
      buyer: {
        id: String(customer?.id || 'cust_anonymous'),
        name: String(customer?.name || 'Ctxman').split(' ')[0] || 'Ctxman',
        surname:
          String(customer?.name || 'User')
            .split(' ')
            .slice(1)
            .join(' ') || 'User',
        email: String(customer?.email || 'billing@example.com'),
        identityNumber: String(customer?.taxId || '11111111111'),
        registrationAddress: String(customer?.address || 'Istanbul, Turkey'),
        city: String(customer?.city || 'Istanbul'),
        country: String(customer?.country || 'Turkey'),
      },
      basketItems: [
        {
          id: itemId,
          name: itemName,
          category1: 'Software',
          itemType: 'VIRTUAL',
          price: priceDecimal,
        },
      ],
    };

    if (!this.isConfigured() && offlineFallback) {
      return {
        provider: 'iyzico',
        mode: 'offline-prepared',
        conversationId: convId,
        token: `iyz_offline_${crypto.randomUUID()}`,
        amountMinor,
        currency: normalizedCurrency,
        itemId,
        itemName,
        checkoutFormUrl: `${this.baseUrl}/checkout/${convId}`,
      };
    }

    if (!this.isConfigured()) {
      throw new Error(
        'iyzico credentials are not configured (set IYZICO_API_KEY and IYZICO_SECRET_KEY)'
      );
    }

    const randomKey = crypto.randomBytes(16).toString('hex');
    const bodyString = JSON.stringify(requestPayload);
    const authorization = this.buildAuthorizationHeader(uriPath, randomKey, bodyString);

    const response = await this.fetchImpl(`${this.baseUrl}${uriPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authorization,
        'x-iyzi-rnd': randomKey,
      },
      body: bodyString,
    });

    const data = await response.json();
    if (!response.ok || data.status === 'failure') {
      throw new Error(
        `iyzico checkout initialization failed: ${data.errorMessage || response.statusText}`
      );
    }

    return {
      provider: 'iyzico',
      mode: 'live',
      conversationId: convId,
      token: data.token,
      amountMinor,
      currency: normalizedCurrency,
      itemId,
      itemName,
      checkoutFormContent: data.checkoutFormContent || null,
      checkoutFormUrl: data.paymentPageUrl || null,
    };
  }

  /**
   * Verify iyzico webhook HMAC-SHA256 signature (`x-iyz-signature-v3`).
   * Message format: `secretKey + iyziEventType + paymentId + paymentConversationId + status`
   * (or raw body HMAC fallback).
   * @param {object|string} payload
   * @param {string} signature
   * @returns {boolean}
   */
  verifyWebhookSignature(payload, signature) {
    if (!this.secretKey || !signature || typeof signature !== 'string') {
      return false;
    }
    const obj = typeof payload === 'string' ? JSON.parse(payload) : payload;
    const rawStr = typeof payload === 'string' ? payload : JSON.stringify(payload);

    // 1. Standard iyzico v3 webhook signature string
    const fields = [
      this.secretKey,
      obj?.iyziEventType ?? '',
      obj?.paymentId ?? obj?.iyziReferenceCode ?? '',
      obj?.paymentConversationId ?? '',
      obj?.status ?? '',
    ].join('');
    const expectedV3 = crypto
      .createHmac('sha256', this.secretKey)
      .update(fields, 'utf8')
      .digest('hex');

    const expectedRaw = crypto
      .createHmac('sha256', this.secretKey)
      .update(rawStr, 'utf8')
      .digest('hex');

    const safeEq = (a, b) => {
      const bufA = Buffer.from(String(a), 'utf8');
      const bufB = Buffer.from(String(b), 'utf8');
      return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
    };

    return safeEq(signature.trim(), expectedV3) || safeEq(signature.trim(), expectedRaw);
  }
}

/**
 * Deterministic Offline / Mock Payment Provider for local testing and air-gapped environments.
 */
export class MockPaymentProvider extends PaymentProvider {
  constructor() {
    super('mock');
  }

  async createCheckoutSession({
    planId,
    topupId,
    billingCycle = 'monthly',
    currency = 'TRY',
    conversationId,
  }) {
    const normalizedCurrency = String(currency || 'TRY').toUpperCase();
    let itemName;
    let amountMinor;
    let itemId;

    if (topupId) {
      const pack = TOPUP_PACKS[topupId];
      if (!pack) throw new Error(`Unknown top-up pack: ${topupId}`);
      itemName = pack.name;
      amountMinor = pack.pricing[normalizedCurrency];
      itemId = pack.id;
    } else {
      const plan = getPlan(planId);
      const cycle = billingCycle === 'yearly' ? 'yearly' : 'monthly';
      itemName = `Ctxman ${plan.name} (${cycle})`;
      amountMinor = plan.pricing[normalizedCurrency][cycle];
      itemId = `${plan.id}-${cycle}`;
    }

    const convId = conversationId || `mock_${crypto.randomUUID()}`;
    return {
      provider: 'mock',
      mode: 'mock',
      conversationId: convId,
      token: `mock_tok_${convId}`,
      amountMinor,
      currency: normalizedCurrency,
      itemId,
      itemName,
      checkoutFormUrl: `http://127.0.0.1:3000/mock-checkout/${convId}`,
    };
  }

  verifyWebhookSignature(_payload, signature) {
    return typeof signature === 'string' && signature.startsWith('mock_sig_');
  }
}

/**
 * Factory for creating payment providers (`iyzico` or `mock`).
 * @param {string} [providerName='iyzico']
 * @param {object} [options]
 */
export function createPaymentProvider(providerName = 'iyzico', options = {}) {
  const normalized = String(providerName || 'iyzico')
    .trim()
    .toLowerCase();
  if (normalized === 'iyzico') return new IyzicoProvider(options);
  if (normalized === 'mock' || normalized === 'offline') return new MockPaymentProvider();
  throw new Error(`Unknown payment provider: ${providerName}`);
}
