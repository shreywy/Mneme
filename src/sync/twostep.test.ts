import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import { needsSecondStep } from './account'

const b64url = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const session = (aal: string, factors: { status: string }[]) =>
  ({ access_token: `x.${b64url({ sub: 'u', aal, n: '>>??' })}.sig`, user: { id: 'u', factors } }) as unknown as Session

describe('two-step sign-in', () => {
  it('asks for the code only when the account has an authenticator and this session has not used it', () => {
    expect(needsSecondStep(null)).toBe(false)
    expect(needsSecondStep(session('aal1', []))).toBe(false)
    expect(needsSecondStep(session('aal1', [{ status: 'unverified' }]))).toBe(false) // setup not finished
    expect(needsSecondStep(session('aal1', [{ status: 'verified' }]))).toBe(true)
    expect(needsSecondStep(session('aal2', [{ status: 'verified' }]))).toBe(false)
  })
  it('asks when the token can’t be read, rather than letting the session through', () => {
    const s = session('aal2', [{ status: 'verified' }])
    expect(needsSecondStep({ ...s, access_token: 'garbage' } as Session)).toBe(true)
  })
})
