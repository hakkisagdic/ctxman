/**
 * F13-2: Cryptographic Context Attestation & Chain Verifier
 * Signs and verifies packed context / compliance payloads with SHA-256 and HMAC-SHA256.
 */

import crypto from 'crypto';

function computePayloadHash(payload) {
  const canonical = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function computeHmac(data, secret) {
  return crypto
    .createHmac('sha256', String(secret || 'ctxman-default-attestation-key'))
    .update(data, 'utf8')
    .digest('hex');
}

/**
 * Sign a context pack or verify an existing signed envelope for tamper detection.
 *
 * @param {object} options
 * @param {string|object} options.payload
 * @param {string} [options.secret='ctxman-default-attestation-key']
 * @param {string} [options.previousDigest='0000000000000000000000000000000000000000000000000000000000000000']
 * @param {object} [options.envelopeToVerify]
 * @returns {object}
 */
export function signAndVerifyContextPack(options = {}) {
  const secret = options.secret || 'ctxman-default-attestation-key';
  const previousDigest =
    options.previousDigest || '0000000000000000000000000000000000000000000000000000000000000000';

  const payloadHash = computePayloadHash(options.payload);
  const chainInput = `${previousDigest}:${payloadHash}`;
  const chainDigest = crypto.createHash('sha256').update(chainInput, 'utf8').digest('hex');
  const signature = computeHmac(chainDigest, secret);

  const envelope = {
    algorithm: 'HMAC-SHA256',
    payloadHash,
    previousDigest,
    chainDigest,
    signature,
  };

  if (options.envelopeToVerify) {
    const candidate = options.envelopeToVerify;
    const expectedChain = crypto
      .createHash('sha256')
      .update(`${candidate.previousDigest}:${payloadHash}`, 'utf8')
      .digest('hex');
    const expectedSig = computeHmac(expectedChain, secret);
    const valid =
      candidate.payloadHash === payloadHash &&
      candidate.chainDigest === expectedChain &&
      candidate.signature === expectedSig;

    return {
      verified: valid,
      tampered: !valid,
      reason: valid ? null : 'Payload hash or HMAC-SHA256 signature mismatch.',
      envelope,
    };
  }

  return {
    verified: true,
    tampered: false,
    reason: null,
    envelope,
  };
}
