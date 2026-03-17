import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "data", "streamer.db");

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    initSchema(_db);
  }
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      icon TEXT DEFAULT '📄',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      summary TEXT DEFAULT '',
      category_id INTEGER REFERENCES categories(id),
      category_name TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      source_filename TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS contents_fts USING fts5(
      title,
      body,
      summary,
      tags,
      content=contents,
      content_rowid=id
    );

    CREATE TRIGGER IF NOT EXISTS contents_ai AFTER INSERT ON contents BEGIN
      INSERT INTO contents_fts(rowid, title, body, summary, tags)
      VALUES (new.id, new.title, new.body, new.summary, new.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS contents_ad AFTER DELETE ON contents BEGIN
      INSERT INTO contents_fts(contents_fts, rowid, title, body, summary, tags)
      VALUES ('delete', old.id, old.title, old.body, old.summary, old.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS contents_au AFTER UPDATE ON contents BEGIN
      INSERT INTO contents_fts(contents_fts, rowid, title, body, summary, tags)
      VALUES ('delete', old.id, old.title, old.body, old.summary, old.tags);
      INSERT INTO contents_fts(rowid, title, body, summary, tags)
      VALUES (new.id, new.title, new.body, new.summary, new.tags);
    END;

    CREATE TABLE IF NOT EXISTS file_uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      md5 TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL,
      cached_path TEXT NOT NULL,
      entry_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS today_script (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id INTEGER NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export interface Content {
  id: number;
  title: string;
  body: string;
  summary: string;
  category_id: number | null;
  category_name: string;
  tags: string[];
  source_filename: string;
  created_at: string;
}

export interface Category {
  id: number;
  name: string;
  description: string;
  icon: string;
  count?: number;
  created_at: string;
}

export function insertContent(data: {
  title: string;
  body: string;
  summary: string;
  category_name: string;
  tags: string[];
  source_filename: string;
}): number {
  const db = getDb();

  // Upsert category
  let categoryId: number | null = null;
  if (data.category_name) {
    const existingCat = db
      .prepare("SELECT id FROM categories WHERE name = ?")
      .get(data.category_name) as { id: number } | undefined;

    if (existingCat) {
      categoryId = existingCat.id;
    } else {
      const result = db
        .prepare(
          "INSERT INTO categories (name, description, icon) VALUES (?, '', '📄')"
        )
        .run(data.category_name);
      categoryId = result.lastInsertRowid as number;
    }
  }

  const result = db
    .prepare(
      `INSERT INTO contents (title, body, summary, category_id, category_name, tags, source_filename)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      data.title,
      data.body,
      data.summary,
      categoryId,
      data.category_name,
      JSON.stringify(data.tags),
      data.source_filename
    );

  return result.lastInsertRowid as number;
}

export function searchContents(
  query: string,
  category?: string,
  limit = 20
): Content[] {
  const db = getDb();

  let sql: string;
  let params: unknown[];

  if (query && category) {
    sql = `
      SELECT c.*, bm25(contents_fts) AS rank
      FROM contents_fts
      JOIN contents c ON c.id = contents_fts.rowid
      WHERE contents_fts MATCH ? AND c.category_name = ?
      ORDER BY rank
      LIMIT ?
    `;
    params = [query + "*", category, limit];
  } else if (query) {
    sql = `
      SELECT c.*, bm25(contents_fts) AS rank
      FROM contents_fts
      JOIN contents c ON c.id = contents_fts.rowid
      WHERE contents_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `;
    params = [query + "*", limit];
  } else if (category) {
    sql = `
      SELECT * FROM contents WHERE category_name = ?
      ORDER BY created_at DESC LIMIT ?
    `;
    params = [category, limit];
  } else {
    sql = `SELECT * FROM contents ORDER BY created_at DESC LIMIT ?`;
    params = [limit];
  }

  const rows = db.prepare(sql).all(...params) as Content[];
  return rows.map((r) => ({
    ...r,
    tags: typeof r.tags === "string" ? JSON.parse(r.tags) : r.tags,
  }));
}

export function getContentById(id: number): Content | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM contents WHERE id = ?").get(id) as
    | Content
    | undefined;
  if (!row) return null;
  return {
    ...row,
    tags: typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags,
  };
}

export function getAllCategories(): (Category & { count: number })[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT cat.*, COUNT(c.id) as count
       FROM categories cat
       LEFT JOIN contents c ON c.category_id = cat.id
       GROUP BY cat.id
       ORDER BY count DESC, cat.name ASC`
    )
    .all() as (Category & { count: number })[];
}

/** Returns all contents grouped by category, ordered by category name then created_at. */
export function getAllContentsByCategory(): Record<string, Content[]> {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM contents ORDER BY category_name ASC, created_at DESC"
    )
    .all() as Content[];

  const grouped: Record<string, Content[]> = {};
  for (const r of rows) {
    const cat = r.category_name || "未分类";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({
      ...r,
      tags: typeof r.tags === "string" ? JSON.parse(r.tags) : r.tags,
    });
  }
  return grouped;
}

export function getContentsByCategory(
  categoryName: string,
  limit = 50
): Content[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM contents WHERE category_name = ? ORDER BY created_at DESC LIMIT ?"
    )
    .all(categoryName, limit) as Content[];
  return rows.map((r) => ({
    ...r,
    tags: typeof r.tags === "string" ? JSON.parse(r.tags) : r.tags,
  }));
}

export function clearDatabase(): { deletedContents: number; deletedCategories: number } {
  const db = getDb();
  const contentsInfo = db.prepare("SELECT COUNT(*) as count FROM contents").get() as { count: number };
  const categoriesInfo = db.prepare("SELECT COUNT(*) as count FROM categories").get() as { count: number };

  const doDelete = db.transaction(() => {
    // Drop triggers first to avoid FTS trigger conflicts
    db.prepare("DROP TRIGGER IF EXISTS contents_ai").run();
    db.prepare("DROP TRIGGER IF EXISTS contents_ad").run();
    db.prepare("DROP TRIGGER IF EXISTS contents_au").run();
    // Drop and recreate FTS virtual table — most reliable way to clear it
    db.prepare("DROP TABLE IF EXISTS contents_fts").run();
    // Delete main data
    db.prepare("DELETE FROM contents").run();
    db.prepare("DELETE FROM categories").run();
    // Recreate FTS table and triggers
    db.exec(`
      CREATE VIRTUAL TABLE contents_fts USING fts5(
        title, body, summary, tags,
        content=contents, content_rowid=id
      );
      CREATE TRIGGER contents_ai AFTER INSERT ON contents BEGIN
        INSERT INTO contents_fts(rowid, title, body, summary, tags)
        VALUES (new.id, new.title, new.body, new.summary, new.tags);
      END;
      CREATE TRIGGER contents_ad AFTER DELETE ON contents BEGIN
        INSERT INTO contents_fts(contents_fts, rowid, title, body, summary, tags)
        VALUES ('delete', old.id, old.title, old.body, old.summary, old.tags);
      END;
      CREATE TRIGGER contents_au AFTER UPDATE ON contents BEGIN
        INSERT INTO contents_fts(contents_fts, rowid, title, body, summary, tags)
        VALUES ('delete', old.id, old.title, old.body, old.summary, old.tags);
        INSERT INTO contents_fts(rowid, title, body, summary, tags)
        VALUES (new.id, new.title, new.body, new.summary, new.tags);
      END;
    `);
  });

  doDelete();

  return {
    deletedContents: contentsInfo.count,
    deletedCategories: categoriesInfo.count,
  };
}

export function renameCategory(
  oldName: string,
  newName: string
): { updated: number } {
  const db = getDb();

  const doRename = db.transaction(() => {
    // Check target name doesn't already exist (unless it's the same)
    if (oldName.trim().toLowerCase() !== newName.trim().toLowerCase()) {
      const conflict = db
        .prepare("SELECT id FROM categories WHERE LOWER(name) = LOWER(?)")
        .get(newName.trim()) as { id: number } | undefined;
      if (conflict) throw new Error(`分类"${newName}"已存在`);
    }

    // Update the categories table
    db.prepare("UPDATE categories SET name = ? WHERE name = ?").run(
      newName.trim(),
      oldName
    );

    // Update category_name on all related contents
    const info = db
      .prepare("UPDATE contents SET category_name = ? WHERE category_name = ?")
      .run(newName.trim(), oldName);

    return info.changes as number;
  });

  const updated = doRename() as number;
  return { updated };
}

export function clearFileCache(): { deletedFiles: number } {
  const db = getDb();
  const uploads = db.prepare("SELECT cached_path FROM file_uploads").all() as { cached_path: string }[];
  let deletedFiles = 0;
  for (const u of uploads) {
    try {
      fs.unlinkSync(u.cached_path);
      deletedFiles++;
    } catch { /* already gone */ }
  }
  db.prepare("DELETE FROM file_uploads").run();
  return { deletedFiles };
}

export function moveContents(ids: number[], newCategoryName: string): number {
  if (ids.length === 0) return 0;
  const db = getDb();

  const doMove = db.transaction(() => {
    // Upsert the target category
    let categoryId: number;
    const existingCat = db
      .prepare("SELECT id FROM categories WHERE name = ?")
      .get(newCategoryName) as { id: number } | undefined;
    if (existingCat) {
      categoryId = existingCat.id;
    } else {
      const r = db
        .prepare("INSERT INTO categories (name, description, icon) VALUES (?, '', '📄')")
        .run(newCategoryName);
      categoryId = r.lastInsertRowid as number;
    }

    // Update each content row
    const stmt = db.prepare(
      "UPDATE contents SET category_id = ?, category_name = ? WHERE id = ?"
    );
    let moved = 0;
    for (const id of ids) {
      const info = stmt.run(categoryId, newCategoryName, id);
      moved += info.changes;
    }

    // Clean up categories that now have zero contents
    db.prepare(
      `DELETE FROM categories WHERE id NOT IN (
         SELECT DISTINCT category_id FROM contents WHERE category_id IS NOT NULL
       )`
    ).run();

    return moved;
  });

  return doMove() as number;
}

export function deleteContents(ids: number[]): number {
  if (ids.length === 0) return 0;
  const db = getDb();
  // Delete in a transaction — FTS triggers handle index cleanup automatically
  const doDelete = db.transaction(() => {
    let deleted = 0;
    const stmt = db.prepare("DELETE FROM contents WHERE id = ?");
    for (const id of ids) {
      const info = stmt.run(id);
      deleted += info.changes;
    }
    // Remove any categories that now have zero contents
    db.prepare(
      `DELETE FROM categories WHERE id NOT IN (SELECT DISTINCT category_id FROM contents WHERE category_id IS NOT NULL)`
    ).run();
    return deleted;
  });
  return doDelete() as number;
}

function areTitlesSimilar(a: string, b: string): boolean {
  const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");
  const na = normalize(a);
  const nb = normalize(b);

  if (na === nb) return true;

  if (na.length >= 3 && nb.length >= 3) {
    if (na.includes(nb) || nb.includes(na)) return true;
  }

  // Character bigram Jaccard similarity
  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) {
      set.add(s.slice(i, i + 2));
    }
    return set;
  };
  const ba = bigrams(na);
  const bb = bigrams(nb);
  if (ba.size === 0 && bb.size === 0) return true;
  if (ba.size === 0 || bb.size === 0) return false;
  let intersection = 0;
  for (const g of ba) {
    if (bb.has(g)) intersection++;
  }
  const union = ba.size + bb.size - intersection;
  return intersection / union >= 0.5;
}

export function findSimilarContent(
  title: string,
  categoryName: string
): Content | null {
  const db = getDb();

  // 1. Exact case-insensitive title match in same category
  const exact = db
    .prepare(
      "SELECT * FROM contents WHERE LOWER(title) = LOWER(?) AND category_name = ?"
    )
    .get(title, categoryName) as Content | undefined;
  if (exact) {
    return {
      ...exact,
      tags: typeof exact.tags === "string" ? JSON.parse(exact.tags) : exact.tags,
    };
  }

  // 2. FTS search, filter by category, check title similarity
  let candidates: Content[] = [];
  try {
    const ftsQuery = title.replace(/["*]/g, " ").trim();
    if (ftsQuery) {
      candidates = db
        .prepare(
          `SELECT c.* FROM contents_fts
           JOIN contents c ON c.id = contents_fts.rowid
           WHERE contents_fts MATCH ? AND c.category_name = ?
           LIMIT 20`
        )
        .all(ftsQuery + "*", categoryName) as Content[];
    }
  } catch {
    // FTS query may fail for certain inputs; fall through with empty candidates
  }

  for (const row of candidates) {
    if (areTitlesSimilar(title, row.title)) {
      return {
        ...row,
        tags: typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags,
      };
    }
  }

  return null;
}

export function mergeContentBody(id: number, additionalBody: string): void {
  const db = getDb();
  const existing = db
    .prepare("SELECT body FROM contents WHERE id = ?")
    .get(id) as { body: string } | undefined;
  if (!existing) return;
  const newBody = existing.body + "\n\n---\n\n" + additionalBody;
  db.prepare("UPDATE contents SET body = ? WHERE id = ?").run(newBody, id);
}

export interface FileUpload {
  id: number;
  md5: string;
  original_name: string;
  cached_path: string;
  entry_count: number;
  created_at: string;
}

export function findUploadByMd5(md5: string): FileUpload | null {
  const db = getDb();
  return (db.prepare("SELECT * FROM file_uploads WHERE md5 = ?").get(md5) as FileUpload) ?? null;
}

export function recordUpload(data: {
  md5: string;
  original_name: string;
  cached_path: string;
  entry_count: number;
}): void {
  const db = getDb();
  db.prepare(
    "INSERT OR REPLACE INTO file_uploads (md5, original_name, cached_path, entry_count) VALUES (?, ?, ?, ?)"
  ).run(data.md5, data.original_name, data.cached_path, data.entry_count);
}

// ── Today's Script ──────────────────────────────────────────────────────────

export interface TodayScriptItem {
  id: number;          // today_script.id
  content_id: number;
  position: number;
  title: string;
  body: string;
  summary: string;
  category_name: string;
  tags: string[];
  source_filename: string;
}

export function getTodayScript(): TodayScriptItem[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT ts.id, ts.content_id, ts.position,
              c.title, c.body, c.summary, c.category_name, c.tags, c.source_filename
       FROM today_script ts
       JOIN contents c ON c.id = ts.content_id
       ORDER BY ts.position ASC, ts.id ASC`
    )
    .all() as (TodayScriptItem & { tags: string })[];
  return rows.map((r) => ({
    ...r,
    tags: typeof r.tags === "string" ? JSON.parse(r.tags) : r.tags,
  }));
}

/** Add content items to today's script. Skips duplicates. Returns number added. */
export function addToTodayScript(contentIds: number[]): number {
  if (contentIds.length === 0) return 0;
  const db = getDb();
  const doAdd = db.transaction(() => {
    const maxPos = (
      db.prepare("SELECT COALESCE(MAX(position), -1) as m FROM today_script").get() as { m: number }
    ).m;
    const already = new Set(
      (db.prepare("SELECT content_id FROM today_script").all() as { content_id: number }[]).map(
        (r) => r.content_id
      )
    );
    const stmt = db.prepare(
      "INSERT INTO today_script (content_id, position) VALUES (?, ?)"
    );
    let added = 0;
    let pos = maxPos + 1;
    for (const cid of contentIds) {
      if (already.has(cid)) continue;
      stmt.run(cid, pos++);
      added++;
    }
    return added;
  });
  return doAdd() as number;
}

/** Remove today_script entries by their own ids (not content_id). */
export function removeFromTodayScript(ids: number[]): number {
  if (ids.length === 0) return 0;
  const db = getDb();
  const stmt = db.prepare("DELETE FROM today_script WHERE id = ?");
  const doRemove = db.transaction(() => {
    let removed = 0;
    for (const id of ids) {
      removed += stmt.run(id).changes;
    }
    return removed;
  });
  return doRemove() as number;
}

/** Remove today_script entries by content_id (not today_script.id). */
export function removeFromTodayScriptByContentIds(contentIds: number[]): number {
  if (contentIds.length === 0) return 0;
  const db = getDb();
  const stmt = db.prepare("DELETE FROM today_script WHERE content_id = ?");
  const doRemove = db.transaction(() => {
    let removed = 0;
    for (const id of contentIds) {
      removed += stmt.run(id).changes;
    }
    return removed;
  });
  return doRemove() as number;
}

/** Return a Set of content_ids that are currently in today's script. */
export function getTodayScriptContentIds(): Set<number> {
  const db = getDb();
  const rows = db.prepare("SELECT content_id FROM today_script").all() as { content_id: number }[];
  return new Set(rows.map((r) => r.content_id));
}

/** Clear all entries from today's script. */
export function clearTodayScript(): number {
  const db = getDb();
  const count = (db.prepare("SELECT COUNT(*) as c FROM today_script").get() as { c: number }).c;
  db.prepare("DELETE FROM today_script").run();
  return count;
}

/** Reorder items by supplying ordered array of today_script ids. */
export function reorderTodayScript(orderedIds: number[]): void {
  const db = getDb();
  const stmt = db.prepare("UPDATE today_script SET position = ? WHERE id = ?");
  const doReorder = db.transaction(() => {
    orderedIds.forEach((id, idx) => stmt.run(idx, id));
  });
  doReorder();
}

export function getContentsBySourceMd5(md5: string): Content[] {
  const db = getDb();
  const upload = findUploadByMd5(md5);
  if (!upload) return [];
  const rows = db
    .prepare("SELECT * FROM contents WHERE source_filename = ? ORDER BY id ASC")
    .all(upload.original_name) as Content[];
  return rows.map((r) => ({
    ...r,
    tags: typeof r.tags === "string" ? JSON.parse(r.tags) : r.tags,
  }));
}
