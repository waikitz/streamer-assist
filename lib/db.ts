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
