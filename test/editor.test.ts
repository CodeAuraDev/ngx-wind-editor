import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as Y from 'yjs';
import { parseHtml, safeUrl, serializeBlocks } from '../src/html.ts';
import { readBlocks, WindSession } from '../src/session.ts';
import { resolveToolbar } from '../src/toolbar.ts';

describe('html', () => {
  it('round-trips marks, lists, and headings', () => {
    const html = '<h1>Wind</h1><p>Hello <strong>bold</strong> and <em>italic</em> <a href="https://example.com">link</a></p><ul><li>One</li><li>Two</li></ul><pre><code>a < b</code></pre>';
    const again = serializeBlocks(parseHtml(html));
    assert.equal(again, html.replace('a < b', 'a < b'));
    assert.match(serializeBlocks(parseHtml(again)), /a < b/);
  });

  it('rejects unsafe urls', () => {
    assert.equal(safeUrl('javascript:alert(1)'), null);
    assert.equal(safeUrl('https://example.com/a'), 'https://example.com/a');
    const blocks = parseHtml('<p><a href="javascript:alert(1)">x</a></p>');
    assert.equal(serializeBlocks(blocks), '<p>x</p>');
  });

  it('keeps newlines inside code', () => {
    const html = '<pre><code>one\ntwo</code></pre>';
    assert.equal(serializeBlocks(parseHtml(html)), html);
  });
});

describe('session', () => {
  it('types, formats, splits, and undoes', () => {
    const doc = new Y.Doc();
    const session = new WindSession(doc);
    session.insertText('Hello');
    const id = readBlocks(doc)[0]?.id ?? '';
    session.select({ anchor: { blockId: id, offset: 0 }, head: { blockId: id, offset: 5 } });
    session.toggleMark('bold');
    assert.equal(session.html, '<p><strong>Hello</strong></p>');
    session.select({ anchor: { blockId: id, offset: 5 }, head: { blockId: id, offset: 5 } });
    session.split('enter');
    session.insertText('Next');
    assert.equal(readBlocks(doc).length, 2);
    assert.match(session.html, /Next/);
    session.undo();
    assert.equal(session.html.includes('Next'), false);
  });
});

describe('toolbar', () => {
  it('resolves presets and custom lists', () => {
    assert.deepEqual(resolveToolbar('minimal'), ['bold', 'italic', 'link']);
    assert.equal(resolveToolbar('writing').includes('quote'), true);
    assert.equal(resolveToolbar('writing').includes('image'), false);
    assert.equal(resolveToolbar('basic').includes('h1'), false);
    assert.deepEqual(resolveToolbar(['link', 'bold', 'nope', 'bold']), ['link', 'bold']);
    assert.deepEqual(resolveToolbar(undefined), resolveToolbar('full'));
    assert.equal(resolveToolbar('full').includes('source'), true);
  });
});
