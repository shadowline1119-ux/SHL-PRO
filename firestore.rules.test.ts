import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const blueprintPath = path.resolve(process.cwd(), 'firebase-blueprint.json');
const rulesText = fs.readFileSync(rulesPath, 'utf8');
const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));

describe('firestore.rules structural & security invariants', () => {
  it('enforces rules_version = 2 and global default-deny catch-all', () => {
    assert.match(rulesText, /rules_version\s*=\s*'2'/);
    assert.match(rulesText, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;\s*\}/);
  });

  it('requires verified user & strict owner isolation on every collection in blueprint', () => {
    assert.match(rulesText, /request\.auth\.token\.email_verified\s*==\s*true/);
    assert.match(rulesText, /request\.auth\.uid\s*==\s*userId/);

    const collectionPaths = Object.keys(blueprint.firestore);
    assert.ok(collectionPaths.includes('/users/{userId}'));
    assert.ok(collectionPaths.includes('/users/{userId}/estimates/{estimateId}'));
    assert.ok(collectionPaths.includes('/users/{userId}/estimates/{estimateId}/items/{itemId}'));
    assert.ok(collectionPaths.includes('/users/{userId}/priceLists/{listId}'));
    assert.ok(collectionPaths.includes('/users/{userId}/settings/{settingId}'));
    assert.ok(collectionPaths.includes('/users/{userId}/changeHistory/{entryId}'));

    assert.match(rulesText, /match \/users\/\{userId\}/);
    assert.match(rulesText, /match \/estimates\/\{estimateId\}/);
    assert.match(rulesText, /match \/items\/\{itemId\}/);
    assert.match(rulesText, /match \/priceLists\/\{listId\}/);
    assert.match(rulesText, /match \/settings\/\{settingId\}/);
    assert.match(rulesText, /match \/changeHistory\/\{entryId\}/);
  });

  it('prevents shadow fields, ID poisoning, temporal spoofing, and orphan items', () => {
    assert.match(rulesText, /isValidId\(/);
    assert.match(rulesText, /keys\(\)\.hasAll\(/);
    assert.match(rulesText, /keys\(\)\.hasOnly\(/);
    assert.match(rulesText, /affectedKeys\(\)\.hasOnly\(/);
    assert.match(rulesText, /createdAt == request\.time/);
    assert.match(rulesText, /updatedAt == request\.time/);
    assert.match(rulesText, /existsAfter\(/);
    assert.match(rulesText, /match \/changeHistory\/\{entryId\}[\s\S]*allow update: if false;/);
  });
});
