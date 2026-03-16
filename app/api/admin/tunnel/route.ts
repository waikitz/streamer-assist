import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { readFile, writeFile, unlink, access } from "fs/promises";
import { homedir } from "os";
import path from "path";

export const dynamic = "force-dynamic";

const NGROK_API_PORT = 4041;
const NGROK_API = `http://localhost:${NGROK_API_PORT}`;
const APP_PORT = 3000;
const PID_FILE = path.join(process.cwd(), ".ngrok.pid");
const LOG_FILE = path.join(process.cwd(), ".ngrok.log");
const NGROK_BIN = "/opt/homebrew/bin/ngrok";
const NGROK_SYS_CONFIG = path.join(homedir(), "Library", "Application Support", "ngrok", "ngrok.yml");
const NGROK_APP_CONFIG = path.join(process.cwd(), "ngrok-app.yml");

interface NgrokTunnel {
  name: string;
  proto: string;
  public_url: string;
  config: { addr: string };
}

async function fileExists(p: string): Promise<boolean> {
  return access(p).then(() => true).catch(() => false);
}

async function getTunnelInfo(): Promise<{ running: boolean; url: string | null; tunnels: NgrokTunnel[] }> {
  try {
    const res = await fetch(`${NGROK_API}/api/tunnels`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { running: false, url: null, tunnels: [] };
    const data = (await res.json()) as { tunnels: NgrokTunnel[] };
    const tunnels: NgrokTunnel[] = data.tunnels ?? [];
    const https = tunnels.find((t) => t.proto === "https");
    return { running: true, url: https?.public_url ?? null, tunnels };
  } catch {
    return { running: false, url: null, tunnels: [] };
  }
}

// GET — current tunnel status
export async function GET() {
  const info = await getTunnelInfo();
  return NextResponse.json(info);
}

// POST — start ngrok tunnel
export async function POST() {
  const info = await getTunnelInfo();
  if (info.running) {
    return NextResponse.json({ error: "Tunnel 已在运行中" }, { status: 400 });
  }

  // Build args: merge system config (authtoken) + app config (web_addr)
  const args: string[] = ["http", String(APP_PORT)];
  if (await fileExists(NGROK_SYS_CONFIG)) {
    args.push("--config", NGROK_SYS_CONFIG);
  }
  if (await fileExists(NGROK_APP_CONFIG)) {
    args.push("--config", NGROK_APP_CONFIG);
  }
  args.push("--log", LOG_FILE, "--log-level", "info");

  try {
    const proc = spawn(NGROK_BIN, args, {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, HOME: homedir() },
    });
    proc.unref();

    if (proc.pid) {
      await writeFile(PID_FILE, String(proc.pid));
    }

    // Poll: check if tunnel is up OR process has already died with an error
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 1000));

      // Check if process is still alive
      let procAlive = true;
      if (proc.pid) {
        try { process.kill(proc.pid, 0); } catch { procAlive = false; }
      }

      const status = await getTunnelInfo();
      if (status.running) {
        return NextResponse.json({ success: true, url: status.url });
      }

      // Process died — read log immediately for the error reason
      if (!procAlive) {
        break;
      }
    }

    // Read log for a meaningful error message
    let errorMsg = "启动失败，请查看 .ngrok.log";
    try {
      const log = await readFile(LOG_FILE, "utf-8");
      const lines = log.split("\n").filter(Boolean);
      // Look for lines with lvl=eror or lvl=crit that have an err= field
      const errLine = [...lines].reverse().find((l) =>
        (l.includes("lvl=eror") || l.includes("lvl=crit")) && l.includes("err=")
      );
      if (errLine) {
        // Extract the err= value (may be quoted or unquoted)
        const match = errLine.match(/err="([\s\S]+?)"\s*$/);
        if (match) {
          // Trim and take first meaningful line of the error
          errorMsg = match[1].replace(/\\n/g, " ").split(/\r?\n/)[0].trim();
        } else {
          errorMsg = errLine.slice(0, 200);
        }
      }
    } catch { /* no log yet */ }

    return NextResponse.json({ success: false, url: null, error: errorMsg }, { status: 500 });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `无法启动 ngrok：${msg}` }, { status: 500 });
  }
}

// DELETE — stop ngrok tunnel
export async function DELETE() {
  try {
    const pidStr = await readFile(PID_FILE, "utf-8").catch(() => "");
    const pid = parseInt(pidStr.trim(), 10);
    if (!isNaN(pid) && pid > 0) {
      try { process.kill(pid, "SIGTERM"); } catch { /* already gone */ }
    }
  } catch { /* no pid file */ }

  await unlink(PID_FILE).catch(() => {});
  return NextResponse.json({ success: true });
}
