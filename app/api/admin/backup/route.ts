import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

interface BackupContent {
  title: string;
  body: string;
  summary: string;
  category_name: string;
  tags: string;       // raw JSON string from DB
  source_filename: string;
  created_at: string;
}

interface BackupData {
  version: number;
  exported_at: string;
  contents: BackupContent[];
}

// GET — export entire database as a JSON backup file
export async function GET() {
  try {
    const db = getDb();

    const contents = db
      .prepare(
        `SELECT title, body, summary, category_name, tags, source_filename, created_at
         FROM contents ORDER BY id ASC`
      )
      .all() as BackupContent[];

    const backup: BackupData = {
      version: 1,
      exported_at: new Date().toISOString(),
      contents,
    };

    const json = JSON.stringify(backup, null, 2);
    const filename = `streamer-backup-${new Date().toISOString().slice(0, 10)}.json`;

    return new Response(json, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `备份失败：${msg}` }, { status: 500 });
  }
}

// POST — restore database from a JSON backup (replaces all existing data)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Partial<BackupData>;

    if (body.version !== 1 || !Array.isArray(body.contents)) {
      return NextResponse.json({ error: "备份文件格式不正确" }, { status: 400 });
    }

    const db = getDb();

    const doRestore = db.transaction(() => {
      // ── 1. Clear existing data (same approach as clearDatabase) ──
      db.prepare("DROP TRIGGER IF EXISTS contents_ai").run();
      db.prepare("DROP TRIGGER IF EXISTS contents_ad").run();
      db.prepare("DROP TRIGGER IF EXISTS contents_au").run();
      db.prepare("DROP TABLE IF EXISTS contents_fts").run();
      db.prepare("DELETE FROM contents").run();
      db.prepare("DELETE FROM categories").run();

      // ── 2. Recreate FTS table + triggers ──
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

      // ── 3. Re-insert contents ──
      const catCache = new Map<string, number>();

      const upsertCat = db.prepare(
        "INSERT OR IGNORE INTO categories (name, description, icon) VALUES (?, '', '📄')"
      );
      const getCatId = db.prepare(
        "SELECT id FROM categories WHERE name = ?"
      );
      const insertContent = db.prepare(
        `INSERT INTO contents (title, body, summary, category_id, category_name, tags, source_filename, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );

      let restoredCount = 0;
      for (const row of body.contents!) {
        if (!row.title) continue;

        const catName = (row.category_name || "").trim();
        let catId: number | null = null;

        if (catName) {
          if (!catCache.has(catName)) {
            upsertCat.run(catName);
            const cat = getCatId.get(catName) as { id: number };
            catCache.set(catName, cat.id);
          }
          catId = catCache.get(catName)!;
        }

        // Normalise tags: accept either a JSON string or a raw array
        let tagsStr: string;
        if (typeof row.tags === "string") {
          tagsStr = row.tags;
        } else if (Array.isArray(row.tags)) {
          tagsStr = JSON.stringify(row.tags);
        } else {
          tagsStr = "[]";
        }

        insertContent.run(
          row.title,
          row.body ?? "",
          row.summary ?? "",
          catId,
          catName,
          tagsStr,
          row.source_filename ?? "",
          row.created_at ?? new Date().toISOString()
        );
        restoredCount++;
      }

      return restoredCount;
    });

    const count = doRestore() as number;
    return NextResponse.json({ success: true, restoredCount: count });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `恢复失败：${msg}` }, { status: 500 });
  }
}
