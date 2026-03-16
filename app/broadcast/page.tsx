import { getTodayScript } from "@/lib/db";
import BroadcastClient from "./BroadcastClient";

export const dynamic = "force-dynamic";

export default function BroadcastPage() {
  const items = getTodayScript();
  return <BroadcastClient initialItems={items} />;
}
