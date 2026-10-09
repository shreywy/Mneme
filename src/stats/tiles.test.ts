import { expect, test } from 'vitest'
import { compact, tilesSvg } from './tiles'

test('compact numbers', () => {
  expect([0, 999, 1000, 1234, 12_345, 999_999, 2_500_000].map(compact)).toEqual(['0', '999', '1k', '1.2k', '12k', '999k', '2.5M'])
})

test('tiles draw the numbers, and say so when offline', () => {
  const svg = tilesSvg({ accounts: 1234, accounts_7d: 5, studied_today: 2, studied_7d: 9, answers: 40_000, answers_7d: 812, decks: 30, cards: 2100, pages: 44 })
  for (const s of ['1.2k', '+5 this week', '812', '40k all time', '2.1k', '30 decks · 44 pages']) expect(svg).toContain(s)
  expect(tilesSvg(null)).toContain('stats are offline')
})
