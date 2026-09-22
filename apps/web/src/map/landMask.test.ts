import assert from 'node:assert/strict'
import test from 'node:test'
import { successfulCache } from './landMask'

test('humidity retries a failed request and a missing mask, then shares successful data', async () => {
  let calls = 0
  const field = { values: new Float32Array([1]) }
  const load = successfulCache(async () => {
    calls++
    if (calls === 1) throw new Error('offline')
    return calls === 2 ? null : field
  })
  await assert.rejects(load(), /offline/)
  assert.equal(await load(), null)
  const first = load(), second = load()
  assert.equal(first, second, 'share in-flight work')
  assert.equal(await first, field)
  assert.equal(await load(), field)
  assert.equal(calls, 3)
})
