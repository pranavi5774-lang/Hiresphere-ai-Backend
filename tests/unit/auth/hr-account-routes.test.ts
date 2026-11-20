import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const dbMocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  updateUser: vi.fn(),
  deleteResetTokens: vi.fn(),
  transaction: vi.fn(),
  createAudit: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    user: {
      findUnique: dbMocks.findUser,
      update: dbMocks.updateUser,
    },
    passwordResetToken: { deleteMany: dbMocks.deleteResetTokens },
    auditLog: { create: dbMocks.createAudit },
    $transaction: dbMocks.transaction,
  },
}))

import { PATCH as updateProfile } from '@/app/api/auth/me/route'
import { POST as changePassword } from '@/app/api/auth/password/route'
import { hashPassword, signSession, verifyPassword } from '@/lib/auth'

let requestNumber = 0

async function authenticatedRequest(
  path: string,
  method: 'PATCH' | 'POST',
  body: Record<string, string>,
  role: 'HR' | 'ADMIN' | 'CANDIDATE' = 'HR',
) {
  requestNumber += 1
  const token = await signSession({
    sub: 'hr-user-1',
    email: 'hr@example.test',
    name: 'HR User',
    role,
  })
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-forwarded-for': `192.0.2.${requestNumber}`,
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.stubEnv('SESSION_SECRET', 'hr-account-test-secret-with-enough-entropy')
  dbMocks.findUser.mockReset()
  dbMocks.updateUser.mockReset()
  dbMocks.deleteResetTokens.mockReset()
  dbMocks.transaction.mockReset()
  dbMocks.createAudit.mockReset()
  dbMocks.createAudit.mockResolvedValue({})
  dbMocks.deleteResetTokens.mockResolvedValue({ count: 0 })
  dbMocks.transaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations))
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('HR account routes', () => {
  it('updates only the authenticated staff member profile and renews the session token', async () => {
    dbMocks.findUser.mockResolvedValue({ status: 'ACTIVE' })
    dbMocks.updateUser.mockResolvedValue({
      id: 'hr-user-1',
      email: 'hr@example.test',
      name: 'Updated HR',
      role: 'HR',
      phone: '+91 98765 43210',
      status: 'ACTIVE',
    })

    const request = await authenticatedRequest('/api/auth/me', 'PATCH', {
      name: 'Updated HR',
      phone: '+91 98765 43210',
    })
    const response = await updateProfile(request, { params: Promise.resolve({}) })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.data.user.name).toBe('Updated HR')
    expect(payload.data.token).toEqual(expect.any(String))
    expect(response.headers.get('set-cookie')).toContain('hs_token=')
    expect(dbMocks.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'hr-user-1' },
        data: { name: 'Updated HR', phone: '+91 98765 43210' },
      }),
    )
  })

  it('rejects profile changes from non-staff accounts', async () => {
    const request = await authenticatedRequest('/api/auth/me', 'PATCH', {
      name: 'Updated Candidate',
      phone: '',
    }, 'CANDIDATE')
    const response = await updateProfile(request, { params: Promise.resolve({}) })

    expect(response.status).toBe(403)
    expect(dbMocks.updateUser).not.toHaveBeenCalled()
  })

  it('does not change the password when the current password is incorrect', async () => {
    const passwordHash = await hashPassword('Correct-Password-123')
    dbMocks.findUser
      .mockResolvedValueOnce({ status: 'ACTIVE' })
      .mockResolvedValueOnce({ id: 'hr-user-1', passwordHash })

    const request = await authenticatedRequest('/api/auth/password', 'POST', {
      currentPassword: 'wrong-password',
      newPassword: 'New-Password-456',
    })
    const response = await changePassword(request, { params: Promise.resolve({}) })

    expect(response.status).toBe(400)
    expect(dbMocks.transaction).not.toHaveBeenCalled()
  })

  it('hashes a new password and invalidates outstanding reset tokens', async () => {
    const passwordHash = await hashPassword('Current-Password-123')
    dbMocks.findUser
      .mockResolvedValueOnce({ status: 'ACTIVE' })
      .mockResolvedValueOnce({ id: 'hr-user-1', passwordHash })
    dbMocks.updateUser.mockResolvedValue({})

    const request = await authenticatedRequest('/api/auth/password', 'POST', {
      currentPassword: 'Current-Password-123',
      newPassword: 'New-Password-456',
    })
    const response = await changePassword(request, { params: Promise.resolve({}) })
    const storedHash = dbMocks.updateUser.mock.calls[0][0].data.passwordHash as string

    expect(response.status).toBe(200)
    await expect(verifyPassword('New-Password-456', storedHash)).resolves.toBe(true)
    expect(dbMocks.deleteResetTokens).toHaveBeenCalledWith({
      where: { userId: 'hr-user-1', usedAt: null },
    })
  })
})
