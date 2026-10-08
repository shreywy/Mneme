import { expect, test } from 'vitest'
import { pageOf } from './FeedbackDialog'

test('feedback keeps the kind of page, not its id', () => {
  expect(pageOf('/write/3f2a-91')).toBe('/write/:id')
  expect(pageOf('/s/abc123')).toBe('/s/:id')
  expect(pageOf('/deck/d1/learn')).toBe('/deck/:id/learn')
  expect(pageOf('/settings')).toBe('/settings')
})
