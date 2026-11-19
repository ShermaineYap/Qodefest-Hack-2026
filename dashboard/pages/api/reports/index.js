import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const REPORTS_DIR = process.env.REPORTS_DIR ?? "/reports";
const NAME_RE = /^(\d{4}-\d{2}-\d{2})\.md$/;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ detail: "method_not_allowed" });
  }

  let names;
  try {
    names = await readdir(REPORTS_DIR);
  } catch (err) {
    if (err.code === "ENOENT") return res.status(200).json({ reports: [] });
    console.error("reports: cannot read directory", err);
    return res.status(500).json({ detail: "reports_unavailable" });
  }

  const reports = [];
  for (const name of names) {
    const match = NAME_RE.exec(name);
    if (!match) continue;
    try {
      const info = await stat(path.join(REPORTS_DIR, name));
      if (!info.isFile()) continue;
      reports.push({
        date: match[1],
        bytes: info.size,
        modified_at: info.mtime.toISOString(),
      });
    } catch {
      // a report can be replaced between readdir and stat; skip it this round
    }
  }

  reports.sort((a, b) => b.date.localeCompare(a.date));
  return res.status(200).json({ reports });
}
