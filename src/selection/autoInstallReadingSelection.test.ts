// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { autoInstallReadingSelection, discoverReadingSurfaces } from './autoInstallReadingSelection';

describe('reading selection bootstrap', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main data-dawn-reading-surface="book"><p>alpha beta</p></main>';
  });

  it('discovers the top-level reading surface and installs the warm selection controller', () => {
    expect(discoverReadingSurfaces(document)).toHaveLength(1);
    autoInstallReadingSelection(document);
    expect(document.querySelector('main')?.classList.contains('dawn-word-selection-surface')).toBe(true);
    expect(document.querySelector('#dawn-word-selection-style')).not.toBeNull();
  });
});
