import { describe, expect, it, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ||
    'postgresql://slimbooks:slimbooks@localhost:5432/slimbooks?sslmode=disable';
});

import { authConfig } from '../../../server/config/index.js';

vi.mock('../../../server/services/AuthService.js', () => ({
  authService: {
    getUserById: vi.fn(),
    isAccountLocked: vi.fn(() => false)
  }
}));

vi.mock('../../../server/services/TenantService.js', () => ({
  tenantService: {
    isTenantActive: vi.fn(() => Promise.resolve(true))
  }
}));

vi.mock('../../../server/core/DatabaseService.js', () => ({
  databaseService: {
    getOne: vi.fn()
  }
}));

import { authService } from '../../../server/services/AuthService.js';
import { databaseService } from '../../../server/core/DatabaseService.js';
import { refreshToken } from '../../../server/controllers/authController.js';

const mockRes = () => {
  const res: {
    statusCode: number;
    body: unknown;
    status: (code: number) => typeof res;
    json: (payload: unknown) => typeof res;
  } = {
    statusCode: 200,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    }
  };
  return res;
};

const runRefreshHandler = async (
  handler: typeof refreshToken,
  req: Parameters<typeof refreshToken>[0],
  res: ReturnType<typeof mockRes>
): Promise<{ error?: Error }> => {
  return new Promise((resolve) => {
    const next = (err?: unknown) => {
      resolve({ error: err instanceof Error ? err : err ? new Error(String(err)) : undefined });
    };
    const originalJson = res.json.bind(res);
    res.json = (payload: unknown) => {
      originalJson(payload);
      resolve({});
      return res;
    };
    handler(req, res as unknown as Parameters<typeof refreshToken>[1], next);
  });
};

describe('refreshToken security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects forged tokens that only decode without valid signature', async () => {
    const forged = jwt.sign(
      { userId: 999, email: 'attacker@example.test', role: 'admin', type: 'access', tokenVersion: 0 },
      'wrong-secret',
      { algorithm: 'HS256', expiresIn: '7d' }
    );

    const req = { body: { token: forged }, headers: {} } as Parameters<typeof refreshToken>[0];
    const res = mockRes();

    const { error } = await runRefreshHandler(refreshToken, req, res);

    expect(error).toBeTruthy();
    expect(String(error?.message)).toMatch(/invalid token/i);
    expect(authService.getUserById).not.toHaveBeenCalled();
  });

  it('rejects tokens after token_version bump', async () => {
    const token = jwt.sign(
      { userId: 1, email: 'user@example.test', role: 'admin', type: 'access', tokenVersion: 0 },
      authConfig.jwtSecret,
      { algorithm: 'HS256', expiresIn: '7d' }
    );

    (databaseService.getOne as ReturnType<typeof vi.fn>).mockResolvedValue({ token_version: 2 });
    (authService.getUserById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1,
      email: 'user@example.test',
      role: 'admin',
      tenant_id: 1
    });

    const req = { body: { token }, headers: {} } as Parameters<typeof refreshToken>[0];
    const res = mockRes();

    const { error } = await runRefreshHandler(refreshToken, req, res);

    expect(error).toBeTruthy();
    expect(String(error?.message)).toMatch(/invalidated/i);
  });

  it('issues a new token for valid refresh requests', async () => {
    const token = jwt.sign(
      { userId: 1, email: 'user@example.test', role: 'admin', type: 'access', tokenVersion: 1 },
      authConfig.jwtSecret,
      { algorithm: 'HS256', expiresIn: '7d' }
    );

    (databaseService.getOne as ReturnType<typeof vi.fn>).mockResolvedValue({ token_version: 1 });
    (authService.getUserById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1,
      email: 'user@example.test',
      role: 'admin',
      tenant_id: 1,
      token_version: 1,
      password_hash: 'hash'
    });

    const req = { body: { token }, headers: {} } as Parameters<typeof refreshToken>[0];
    const res = mockRes();

    const { error } = await runRefreshHandler(refreshToken, req, res);

    expect(error).toBeUndefined();
    expect(res.body).toMatchObject({
      success: true,
      data: {
        token: expect.any(String)
      }
    });
  });
});
