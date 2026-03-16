// pdf-parse v2 uses a class-based API
const { PDFParse } = require("pdf-parse");

const chunks = [];
process.stdin.resume();
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", async () => {
  try {
    const buffer = Buffer.concat(chunks);
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    process.stdout.write(result.text || "");
  } catch (err) {
    process.stderr.write(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
});
