# Database Migration & Schema Architecture Guide

This document defines the production database migration strategy, zero-downtime deployment flow, and schema lifecycle for `alertbox-org-api`. It is designed to ensure zero downtime, complete rollback safety, and zero data loss.

---

## 1. Architectural Principles

### 1.1 Dual-Role Privilege Separation (Least Privilege)
We separate database access into two distinct accounts:
- **Application Runtime (`alertbox.org`)**: Limited strictly to DML (`SELECT`, `INSERT`, `UPDATE`). It cannot execute `ALTER`, `CREATE`, or `DROP`.
- **Migration Runner (`alertbox_migrator`)**: Granted DDL (`CREATE`, `ALTER`, `DROP`, `INDEX`, `REFERENCES`) and DML on `alertbox_org.*`. Used exclusively inside the temporary ArgoCD PreSync migration Job.
- **Environment Isolation**: Production (`alertbox_migrator` on `alertbox_org`) and Development (`alertbox_migrator_dev` on `alertbox_org_dev`) are completely separate credentials.

### 1.2 Automated Deployment Pipeline
```
[Developer]
    │  git push (schema.prisma + migration.sql)
    ▼
[Jenkins CI]
    │  1. Builds container image (bakes in prisma/, schema, and migrations)
    │  2. Updates image tag in GitOps repo (Ponlponl123/.gitops)
    ▼
[ArgoCD CD]
    │
    ├──► 1. PreSync Hook: Spawns K8s Job (alertbox-org-api-migration)
    │      Runs: bun run db:migrate:deploy (using alertbox_migrator)
    │      • If Migration Fails: Sync halts immediately; existing pods remain 100% online.
    │      • If Migration Succeeds: ArgoCD proceeds to step 2.
    │
    └──► 2. RollingUpdate: Deploys new alertbox-org-api Pods
           (maxSurge: 1, maxUnavailable: 0, /health readiness probe)
```

---

## 2. The Expand/Contract Pattern (Zero-Downtime Schema Changes)

Direct in-place schema changes (such as changing a column type or dropping a column) break rollback capability because older application code crashes when encountering unexpected data types or missing fields. We follow a 3-phase lifecycle:

### Phase 1: Expand (Release N)
1. Add the new column alongside the existing column using the `_next` suffix (e.g. `col_next`).
2. New columns must be **nullable** or have a `@default(...)` value.
3. Our Prisma client extension in `src/core/prisma.ts` automatically handles:
   - **Read Path**: If `col_next` is populated, it transparently returns `col_next`. Otherwise, it falls back to `col`.
   - **Write Path**: Writing to `col_next` automatically dual-writes to `col` for legacy backward compatibility.
4. Deploy Release N.

### Phase 2: Data Backfill
Populate existing records from `col` into `col_next`:
- **Small Tables (< 100,000 rows)**: Include the backfill SQL directly in `migration.sql`:
  ```sql
  UPDATE `User` SET `col_next` = `col` WHERE `col_next` IS NULL;
  ```
- **Large Tables (100,000+ rows)**: Run a batched script outside the migration lock to avoid Galera cluster flow control:
  ```sql
  UPDATE `User` SET `col_next` = `col` WHERE `col_next` IS NULL LIMIT 1000;
  ```

### Phase 3: Soak & Bake Window (Rollback Safety)
- Leave both `col` and `col_next` physically present in the database table.
- **Why?** This unused/legacy column is your safety net. If you discover a critical bug and downgrade the application image in ArgoCD (e.g., from `v5.2.7` to `v5.2.3`), the older application version will boot and run without errors because `col` is still in the database.
- **Hotfixes during the bake window**: You can ship multiple hotfixes (`5.2.4`, `5.2.5`, `5.2.6`). As long as you do not drop `col`, any hotfix or rollback to earlier versions remains 100% safe.

### Phase 4: Contract (Release N+1 — Scheduled Cleanup)
Once production has run stably and the rollback window has passed:
1. **Never drop columns in a hotfix (`x.x.Z`)**. Only drop columns in a scheduled minor/major release (e.g., `v5.3.0`).
2. Remove `col` from `schema.prisma` and expose `col_next` under the clean property name using `@map`:
   ```prisma
   col String @map("col_next")
   ```
3. Run `bun run db:migrate:dev --name drop_legacy_col`.
4. Deploy the release. The old column is dropped from MariaDB, freeing storage and completing the migration.

---

## 3. Rollback Rules of Thumb

| Scenario | Safety | Action / Behavior |
| :--- | :--- | :--- |
| **Immediate Rollback ($N \to N-1$)** | ✔ **100% Safe** | Revert image tag in ArgoCD WebUI. Old code works because schema is backward-compatible. |
| **Hotfix Rollback ($5.2.7 \to 5.2.3$)** | ✔ **Safe** | Works seamlessly as long as no hotfix executed a `DROP COLUMN`. |
| **Distant Rollback ($v5.x \to v2.x$)** | ❌ **Fatal Crash** | Columns dropped in $v3/v4$ are missing in DB. **Do not use ArgoCD WebUI rollback**. Revert the bad commits in Git and deploy a forward patch (`v5.2.8`). |

---

## 4. Developer Cheatsheet

### Adding a New Table or Nullable Column
1. Update `prisma/schema.prisma`.
2. Generate migration:
   ```bash
   bun run db:migrate:dev --name add_feature_field
   ```
3. Test locally: `bun test`.
4. Commit `prisma/` and push to `main`. CI/CD handles the rest automatically.

### Renaming a Column
- **Option A (Code-only, zero DB risk)**:
  ```prisma
  newPropertyName String @map("existing_db_column")
  ```
- **Option B (DB column rename)**:
  1. `bun run db:migrate:dev --create-only --name rename_col`
  2. Edit generated `migration.sql` to replace `DROP` + `ADD` with:
     ```sql
     ALTER TABLE `User` RENAME COLUMN `old_name` TO `new_name`;
     ```
  3. Apply: `bun run db:migrate:dev`

### Changing a Column Type
1. Add `new_field_next` in `prisma/schema.prisma`.
2. Generate migration: `bun run db:migrate:dev --name add_new_field_next`.
3. Add backfill SQL to copy data from `old_field` to `new_field_next`.
4. Deploy. After verification window, schedule cleanup migration to drop `old_field` and map `new_field_next`.
