import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const REPORTS_DIR = process.env.REPORTS_DIR ?? "/reports";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BYTES = 512 * 1024;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ detail: "method_not_allowed" });
  }

  const { date } = req.query;
  if (typeof date !== "string" || !DATE_RE.test(date)) {
    return res.status(400).json({ detail: "invalid_date" });
  }

  const file = path.join(REPORTS_DIR, `${date}.md`);
  try {
    const info = await stat(file);
    if (!info.isFile()) return res.status(404).json({ detail: "report_not_found" });
    if (info.size > MAX_BYTES) return res.status(413).json({ detail: "report_too_large" });
    const markdown = await readFile(file, "utf8");
    return res.status(200).json({ date, markdown });
  } catch (err) {
    if (err.code === "ENOENT") return res.status(404).json({ detail: "report_not_found" });
    console.error(`reports: cannot read ${date}`, err);
    return res.status(500).json({ detail: "reports_unavailable" });
  }
}
