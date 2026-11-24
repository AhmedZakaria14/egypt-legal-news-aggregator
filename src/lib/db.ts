// طبقة الوصول إلى البيانات (Repository layer)
// قاعدة البيانات: SQLite مدمجة في Node.js نفسه عبر node:sqlite — بدون أي محركات خارجية.
// كل الوصول إلى البيانات يمر من هنا فقط، لذا يمكن استبدال التنفيذ لاحقاً
// بقاعدة بيانات مستضافة دون تغيير صفحات أو API التطبيق.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export const CATEGORIES = [
  "قضية رأي عام",
  "حكم محكمة",
  "قانون جديد",
  "قرار رسمي",
  "تريند",
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface Story {
  id: number;
  dedupeKey: string;
  title: string;
  link: string;
  description: string;
  sourceName: string;
  publishedAt: string | null;
  fetchedAt: string;
  legalScore: number;
  category: string;
  isLegal: boolean;
  legalAngle: string;
  isTrending: boolean;
  scored: boolean;
}

export interface Draft {
  id: number;
  type: "post" | "script";
  storyId: number | null;
  storyTitle: string;
  text: string;
  status: "draft" | "used";
  createdAt: string;
  updatedAt: string;
}

interface StoryRow {
  id: number;
  dedupeKey: string;
  title: string;
  link: string;
  description: string;
  sourceName: string;
  publishedAt: string | null;
  fetchedAt: string;
  legalScore: number;
  category: string;
  isLegal: number;
  legalAngle: string;
  isTrending: number;
  scored: number;
}

interface DraftRow {
  id: number;
  type: string;
  storyId: number | null;
  storyTitle: string;
  text: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const globalForDb = globalThis as unknown as { __elnDb?: DatabaseSync };

function initDb(): DatabaseSync {
  const file =
    process.env.DATABASE_FILE || path.join(process.cwd(), "data", "app.db");
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS stories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dedupeKey TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      link TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      sourceName TEXT NOT NULL,
      publishedAt TEXT,
      fetchedAt TEXT NOT NULL,
      legalScore INTEGER NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT 'تريند',
      isLegal INTEGER NOT NULL DEFAULT 0,
      legalAngle TEXT NOT NULL DEFAULT '',
      isTrending INTEGER NOT NULL DEFAULT 0,
      scored INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('post','script')),
      storyId INTEGER REFERENCES stories(id),
      storyTitle TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','used')),
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

export function getDb(): DatabaseSync {
  if (!globalForDb.__elnDb) globalForDb.__elnDb = initDb();
  return globalForDb.__elnDb;
}

const now = () => new Date().toISOString();

function toStory(r: StoryRow): Story {
  // node:sqlite تُرجع كائنات بلا prototype — نحوّلها لكائنات عادية
  return {
    id: Number(r.id),
    dedupeKey: String(r.dedupeKey),
    title: String(r.title),
    link: String(r.link),
    description: String(r.description ?? ""),
    sourceName: String(r.sourceName),
    publishedAt: r.publishedAt ? String(r.publishedAt) : null,
    fetchedAt: String(r.fetchedAt),
    legalScore: Number(r.legalScore),
    category: String(r.category),
    isLegal: Number(r.isLegal) === 1,
    legalAngle: String(r.legalAngle ?? ""),
    isTrending: Number(r.isTrending) === 1,
    scored: Number(r.scored) === 1,
  };
}

function toDraft(r: DraftRow): Draft {
  return {
    id: Number(r.id),
    type: r.type === "script" ? "script" : "post",
    storyId: r.storyId == null ? null : Number(r.storyId),
    storyTitle: String(r.storyTitle ?? ""),
    text: String(r.text),
    status: r.status === "used" ? "used" : "draft",
    createdAt: String(r.createdAt),
    updatedAt: String(r.updatedAt),
  };
}

// ---------- Stories ----------

export interface NewStoryInput {
  dedupeKey: string;
  title: string;
  link: string;
  description: string;
  sourceName: string;
  publishedAt: string | null;
}

/** يُدخل خبراً جديداً إن لم يكن موجوداً (حسب dedupeKey). يعيد true عند الإدخال. */
export function insertStoryIfNew(s: NewStoryInput): boolean {
  const info = getDb()
    .prepare(
      `INSERT OR IGNORE INTO stories
       (dedupeKey, title, link, description, sourceName, publishedAt, fetchedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(s.dedupeKey, s.title, s.link, s.description, s.sourceName, s.publishedAt, now());
  return Number(info.changes) > 0;
}

export function listUnscoredStories(limit = 60): Story[] {
  const rows = getDb()
    .prepare("SELECT * FROM stories WHERE scored = 0 ORDER BY fetchedAt DESC, id DESC LIMIT ?")
    .all(limit) as unknown as StoryRow[];
  return rows.map(toStory);
}

export interface ScoreUpdate {
  id: number;
  legalScore: number;
  category: string;
  isLegal: boolean;
  legalAngle: string;
  isTrending: boolean;
}

export function applyScore(u: ScoreUpdate): void {
  getDb()
    .prepare(
      `UPDATE stories SET legalScore = ?, category = ?, isLegal = ?, legalAngle = ?, isTrending = ?, scored = 1
       WHERE id = ?`
    )
    .run(
      Math.max(0, Math.min(100, Math.round(u.legalScore))),
      CATEGORIES.includes(u.category as Category) ? u.category : "تريند",
      u.isLegal ? 1 : 0,
      u.legalAngle || "",
      u.isTrending ? 1 : 0,
      u.id
    );
}

/** يعلّم خبراً كرائج (تريند) عند مطابقته لعناوين Google Trends. */
export function markTrending(id: number): void {
  getDb().prepare("UPDATE stories SET isTrending = 1 WHERE id = ?").run(id);
}

export function listStories(): Story[] {
  const rows = getDb()
    .prepare("SELECT * FROM stories ORDER BY legalScore DESC, fetchedAt DESC, id DESC LIMIT 300")
    .all() as unknown as StoryRow[];
  return rows.map(toStory);
}

export function getStoryById(id: number): Story | undefined {
  const row = getDb().prepare("SELECT * FROM stories WHERE id = ?").get(id) as unknown as
    | StoryRow
    | undefined;
  return row ? toStory(row) : undefined;
}

export function countStories(): number {
  const row = getDb().prepare("SELECT COUNT(*) AS c FROM stories").get() as unknown as { c: number };
  return Number(row.c);
}

// ---------- Drafts ----------

export function createDraft(data: {
  type: "post" | "script";
  storyId: number | null;
  storyTitle: string;
  text: string;
}): Draft {
  const t = now();
  const info = getDb()
    .prepare(
      "INSERT INTO drafts (type, storyId, storyTitle, text, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'draft', ?, ?)"
    )
    .run(data.type, data.storyId, data.storyTitle, data.text, t, t);
  return getDraftById(Number(info.lastInsertRowid))!;
}

export function getDraftById(id: number): Draft | undefined {
  const row = getDb().prepare("SELECT * FROM drafts WHERE id = ?").get(id) as unknown as
    | DraftRow
    | undefined;
  return row ? toDraft(row) : undefined;
}

export function listDrafts(): Draft[] {
  const rows = getDb()
    .prepare("SELECT * FROM drafts ORDER BY createdAt DESC, id DESC")
    .all() as unknown as DraftRow[];
  return rows.map(toDraft);
}

export function updateDraft(
  id: number,
  patch: { text?: string; status?: "draft" | "used" }
): Draft | undefined {
  const existing = getDraftById(id);
  if (!existing) return undefined;
  getDb()
    .prepare("UPDATE drafts SET text = ?, status = ?, updatedAt = ? WHERE id = ?")
    .run(patch.text ?? existing.text, patch.status ?? existing.status, now(), id);
  return getDraftById(id);
}

export function deleteDraft(id: number): boolean {
  const info = getDb().prepare("DELETE FROM drafts WHERE id = ?").run(id);
  return Number(info.changes) > 0;
}

// ---------- Meta ----------

export function getMeta(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM meta WHERE key = ?").get(key) as unknown as
    | { value: string }
    | undefined;
  return row ? String(row.value) : null;
}

export function setMeta(key: string, value: string): void {
  getDb()
    .prepare(
      "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .run(key, value);
}

export function getLastRefreshAt(): string | null {
  return getMeta("last_refresh_at");
}

export function setLastRefreshAt(iso: string): void {
  setMeta("last_refresh_at", iso);
}
