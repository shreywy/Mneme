import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { createSheet, getSheet } from '../data/sheets'
import { DEFAULT_PAPER } from './types'

describe('paper', () => {
  it('a new page uses the paper it is given, else the default', async () => {
    const plain = { ...DEFAULT_PAPER, lines: 'none' as const, spacing: 32 as const }
    expect((await getSheet(await createSheet({ paper: plain })))?.paper).toEqual(plain)
    expect((await getSheet(await createSheet()))?.paper).toEqual(DEFAULT_PAPER)
  })
})
