import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getHeaderTitleForTab,
  getNavItemMeta,
  getNextWorkflowStep,
  NAV_GROUPS,
  NAV_ITEMS,
} from './navigation';

describe('navigation configuration', () => {
  it('organizes all 9 tabs across 4 logical workflow groups without duplicates', () => {
    assert.equal(NAV_GROUPS.length, 4);
    const groupedIds = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id));
    assert.equal(groupedIds.length, NAV_ITEMS.length);
    assert.equal(new Set(groupedIds).size, NAV_ITEMS.length);
  });

  it('returns consistent titles and next workflow transitions', () => {
    const meta = getNavItemMeta('kosztorys');
    assert.equal(meta.group, 'wycena');
    assert.ok(getHeaderTitleForTab('kosztorys').length > 5);

    assert.equal(getNextWorkflowStep('parametry')?.tab, 'kosztorys');
    assert.equal(getNextWorkflowStep('kosztorys')?.tab, 'raporty');
    assert.equal(getNextWorkflowStep('raporty')?.tab, 'oferta');
    assert.equal(getNextWorkflowStep('oferta'), null);
  });
});
