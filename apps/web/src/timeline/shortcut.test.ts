import assert from 'node:assert/strict'
import test from 'node:test'
import { shortcut } from './shortcut'

const key = (key: string, extra = {}) => ({ key, repeat: false, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...extra })
const el = (tagName: string, type?: string) => ({ tagName, type })

test('Space plays or pauses, except where Space already means something', () => {
  for (const target of [null, el('BODY'), el('CANVAS'), el('DIV')]) assert.equal(shortcut(key(' '), target, false), 'toggle')
  assert.equal(shortcut(key(' '), el('CANVAS'), true), 'toggle', 'the map has no use for Space, however it was reached')
  for (const tag of ['BUTTON', 'A', 'SUMMARY', 'SELECT', 'TEXTAREA']) assert.equal(shortcut(key(' '), el(tag), false), null, tag)
  for (const type of ['range', 'checkbox']) assert.equal(shortcut(key(' '), el('INPUT', type), false), null, type)
  assert.equal(shortcut(key(' ', { repeat: true }), el('BODY'), false), null, 'holding Space must not flicker play/pause')
})

test('arrows step frames, except where arrows already move something', () => {
  for (const target of [null, el('BODY'), el('BUTTON'), el('CANVAS'), el('INPUT', 'checkbox')]) {
    assert.equal(shortcut(key('ArrowLeft'), target, false), 'prev')
    assert.equal(shortcut(key('ArrowRight', { repeat: true }), target, false), 'next') // holding an arrow scrubs
  }
  assert.equal(shortcut(key('ArrowLeft'), el('INPUT', 'range'), false), null, 'the slider steps itself')
  assert.equal(shortcut(key('ArrowRight'), el('SELECT'), false), null, 'the speed list changes itself')
  assert.equal(shortcut(key('ArrowLeft'), el('CANVAS'), true), null, 'a map reached by Tab pans with the arrows')
})

test('modified keys and other keys are left alone', () => {
  for (const mod of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
    assert.equal(shortcut(key('ArrowLeft', { [mod]: true }), el('BODY'), false), null, mod)
    assert.equal(shortcut(key(' ', { [mod]: true }), el('BODY'), false), null, mod)
  }
  for (const k of ['ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'a']) assert.equal(shortcut(key(k), el('BODY'), false), null, k)
})
