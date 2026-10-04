import { describe, expect, it } from 'vitest';
import { migrationSql, requiredSchemaMarkers } from '../src/db/schema.js';

describe('database schema guardrails', () => {
  it('contains the production-critical tables and invariants for the studio gallery domain', () => {
    const sql = migrationSql.join('\n');

    for (const marker of requiredSchemaMarkers) {
      expect(sql).toContain(marker);
    }

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS studios');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS galleries');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS gallery_access');
    expect(sql).toContain('CHECK (workflow_status IN');
    expect(sql).toContain('CHECK (publication_status IN');
    expect(sql).toContain('UNIQUE (gallery_id, user_id)');
    expect(sql).toContain('CHECK (role IN');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_gallery_access_gallery_id');
    expect(sql).toContain('ON DELETE CASCADE');
    expect(sql).toContain('UNIQUE (gallery_id, photo_id)');
    expect(sql).toContain('CHECK (position >= 0)');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS photo_downloads');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS photo_processing_jobs');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS storage_cleanup_jobs');
    expect(sql).toContain('session_token_hash');
  });
});
