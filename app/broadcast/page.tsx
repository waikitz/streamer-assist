import { getContentsByCategory } from "@/lib/db";
import BroadcastClient from "./BroadcastClient";

export const dynamic = "force-dynamic";

export default function BroadcastPage() {
  const scripts = getContentsByCategory("口播稿", 100);
  return <BroadcastClient scripts={scripts} />;
}
