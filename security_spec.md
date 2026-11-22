# Security Specification — SHADOW-LINE Kosztorys Cloud Sync

## 1. Data Invariants
1. **Default Deny**: All unspecified Firestore document paths are blocked (`allow read, write: if false`).
2. **Strict Owner & Verified Identity Isolation**: Every user document (`/users/{userId}` and subcollections) is accessible (`get`, `list`, `create`, `update`, `delete` where permitted) ONLY when:
   - `request.auth != null`
   - `request.auth.token.email_verified == true`
   - `request.auth.uid == userId`
   - `resource.data.ownerId == request.auth.uid` (for queries/list enforcement).
3. **Anti-Update-Gap & Immutable Keys**:
   - Every write validates full document shape via `isValid*(incoming())` with strict `keys().hasAll(...)` and `keys().hasOnly(...)` allowlists.
   - `createdAt` (`== request.time` on create) and `ownerId`/`uid` MUST never change on update.
   - `updatedAt` MUST equal `request.time` on every write.
   - Every update uses explicit action branches guarded by `incoming().diff(existing()).affectedKeys().hasOnly(...)`.
4. **Master Gate Relational Integrity**:
   - Creating or modifying `/users/{userId}/estimates/{estimateId}/items/{itemId}` checks `exists(/databases/$(database)/documents/users/$(userId)/estimates/$(estimateId))` or `existsAfter(...)` for atomic batch writes, and verifies `incoming().estimateId == estimateId`.
5. **No Secret / Credential Persistence**:
   - Neither Firestore nor SQLite nor disk JSON files store plaintext passwords, refresh tokens, access tokens, or OAuth secrets.
6. **Immutable Change History**:
   - Entries in `/users/{userId}/changeHistory/{entryId}` are append-only (`allow update: if false`).

## 2. "Dirty Dozen" Attack Payloads (Must All Be Rejected)
1. **Unauthenticated Read/Write**: `request.auth == null` reading `/users/u1/estimates/e1`.
2. **Unverified Email Write**: `request.auth.uid == 'u1'` with `email_verified: false` creating `/users/u1/estimates/e1`.
3. **Cross-Tenant Read/Get**: `request.auth.uid == 'attacker'` reading `/users/victim/estimates/e1`.
4. **Cross-Tenant Query/List**: `request.auth.uid == 'attacker'` listing `/users/victim/estimates`.
5. **Identity Spoofing on Create**: `u1` creating `/users/u1/estimates/e1` with `ownerId: 'u2'`.
6. **Ghost / Shadow Field Injection**: `u1` creating estimate with extra undocumented key `isAdmin: true`.
7. **ID Poisoning**: Document ID > 128 chars or containing `../` / invalid symbols.
8. **Temporal Integrity Tampering**: Supplying client-forged `createdAt` or `updatedAt != request.time`.
9. **Immutable Field Mutation**: Updating `createdAt` or `ownerId` on existing estimate.
10. **Denial-of-Wallet Oversized String**: Injecting 50KB string into `name` or `versionTag`.
11. **Orphan Line Item**: Creating `/users/u1/estimates/missing_id/items/item1` without parent estimate doc existing (or in batch).
12. **History Tampering**: Trying `update` on `/users/u1/changeHistory/h1`.
