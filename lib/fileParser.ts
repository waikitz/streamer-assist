import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

export async function parseFile(
  filePath: string,
  originalName: string
): Promise<string> {
  const ext = path.extname(originalName).toLowerCase();
  const buffer = fs.readFileSync(filePath);

  switch (ext) {
    case ".txt":
    case ".md":
      return buffer.toString("utf-8");

    case ".pdf": {
      const workerPath = path.join(process.cwd(), "lib", "pdf-worker.cjs");
      const result = spawnSync(process.execPath, [workerPath], {
        input: buffer,
        maxBuffer: 100 * 1024 * 1024,
        timeout: 30000,
      });
      if (result.status !== 0) {
        const errMsg = result.stderr?.toString() || "PDF 解析失败";
        throw new Error(errMsg);
      }
      return result.stdout.toString("utf-8");
    }

    case ".docx": {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }

    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}
