import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { createMindQuestApp } from '../server.ts';

async function runIntegrationSuite() {
  process.env.NODE_ENV = 'development';
  process.env.CLICK_SECRET_KEY = 'test_click_secret_key';
  process.env.PAYME_TEST_SECRET_KEY = 'test_payme_secret_key';

  const app = await createMindQuestApp({ skipVite: true });
  const server = http.createServer(app);

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  async function req(path: string, method = 'GET', body?: any, token?: string, extraHeaders?: Record<string, string>) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(extraHeaders || {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  }

  try {
    console.log('1. Testing Health & Public Plans...');
    const health = await req('/api/health');
    assert.equal(health.status, 200);
    const plansRes = await req('/api/billing/plans');
    assert.equal(plansRes.status, 200);
    assert.equal(plansRes.json.plans.length, 5);

    console.log('2. Testing Minor Parental Consent Protection...');
    const minorFail = await req('/api/auth/register', 'POST', {
      email: `minor_${Date.now()}@example.com`,
      password: 'Password123!',
      fullName: 'Young Learner',
      ageBracket: '13_17',
    });
    assert.equal(minorFail.status, 400);

    console.log('3. Testing Learner Registration & Email Verification...');
    const uniqueEmail = `learner_${Date.now()}@example.com`;
    const reg = await req('/api/auth/register', 'POST', {
      email: uniqueEmail,
      password: 'StrongPassword123!',
      fullName: 'Test Learner',
      cefrLevel: 'B2',
    });
    assert.equal(reg.status, 201);
    const learnerToken = reg.json.token;
    assert.ok(learnerToken);
    assert.equal(reg.json.user.plan.id, 'FREE');

    const verify = await req(
      '/api/auth/verify-email',
      'POST',
      { token: reg.json.verificationPreviewToken },
      learnerToken
    );
    assert.equal(verify.status, 200);
    assert.equal(verify.json.user.email_verified, 1);

    console.log('4. Testing Mood Mode, Simulator Start & Detective Case Validation...');
    const moodRes = await req('/api/learning/mood/content?mood=Curious', 'GET', undefined, learnerToken);
    assert.equal(moodRes.status, 200);
    assert.ok(moodRes.json.words.length > 0);

    const reviewRes = await req(
      '/api/learning/mood/review-word',
      'POST',
      { vocabularyId: moodRes.json.words[0].id, remembered: true },
      learnerToken
    );
    assert.equal(reviewRes.status, 200);
    assert.ok(reviewRes.json.user.profile.xp > 0);

    const simStart = await req(
      '/api/learning/simulator/start',
      'POST',
      { scenarioId: 'airport_transfer' },
      learnerToken
    );
    assert.equal(simStart.status, 201);
    assert.ok(simStart.json.conversationId);

    const detCases = await req('/api/learning/detective/cases', 'GET', undefined, learnerToken);
    assert.equal(detCases.status, 200);
    assert.ok(detCases.json.cases.length >= 3);
    assert.equal(detCases.json.cases[0].culprit_id, undefined); // Culprit kept server-secret!

    console.log('5. Testing Promo Code & Sandbox Payment Fulfillment...');
    const promo = await req('/api/billing/validate-promo', 'POST', { code: 'WELCOME20' }, learnerToken);
    assert.equal(promo.status, 200);
    assert.equal(promo.json.discount_percent, 20);

    const sandboxPay = await req(
      '/api/billing/checkout',
      'POST',
      { planId: 'PREMIUM', provider: 'payme', promoCode: 'WELCOME20', runSandboxSimulation: true },
      learnerToken
    );
    assert.equal(sandboxPay.status, 200);
    assert.equal(sandboxPay.json.user.plan.id, 'PREMIUM');

    console.log('6. Testing Click Uzbekistan MD5 Signature Rejects Forged Webhook...');
    const forgedClick = await req('/api/webhooks/click/prepare', 'POST', {
      click_trans_id: '1001',
      service_id: '2002',
      merchant_trans_id: 'fake',
      amount: '245000',
      action: '0',
      sign_time: '2026-11-04',
      sign_string: crypto.createHash('md5').update('wrong').digest('hex'),
    });
    assert.equal(forgedClick.json.error, -1);

    console.log('7. Testing RBAC Super Admin Protection & Bootstrap...');
    const forbiddenAdmin = await req('/api/admin/overview', 'GET', undefined, learnerToken);
    assert.equal(forbiddenAdmin.status, 403);

    const bootStatus = await req('/api/auth/admin-bootstrap-status');
    if (bootStatus.json.allowFirstRunBootstrap) {
      const adminBoot = await req('/api/auth/admin-bootstrap', 'POST', {
        email: `admin_${Date.now()}@mindquest.ai`,
        password: 'SuperSecureAdminPassword2026!',
        fullName: 'Chief Architect',
      });
      assert.equal(adminBoot.status, 201);
      const adminOverview = await req('/api/admin/overview', 'GET', undefined, adminBoot.json.token);
      assert.equal(adminOverview.status, 200);
      // Verify Sandbox volume is strictly separated from Live Collected Revenue!
      assert.equal(adminOverview.json.kpis.liveCollectedRevenueUsd, 0);
      assert.ok(adminOverview.json.kpis.sandboxSimulatedVolumeUsd > 0);
    }

    console.log('8. Testing Account Deletion...');
    const del = await req(
      '/api/auth/account',
      'DELETE',
      { confirmPassword: 'StrongPassword123!' },
      learnerToken
    );
    assert.equal(del.status, 200);

    console.log('ALL INTEGRATION TESTS PASSED!');
  } finally {
    server.close();
  }
}

runIntegrationSuite().catch((err) => {
  console.error('Integration test failure:', err);
  process.exit(1);
});
