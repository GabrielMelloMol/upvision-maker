import { CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

const ICONS = { warn: TriangleAlert, error: TriangleAlert, info: Info, ok: CircleCheck };

export default function Alert({ kind, children }: { kind: keyof typeof ICONS; children: ReactNode }) {
  const Icon = ICONS[kind];
  return (
    <div className={`alert ${kind}`} role={kind === "error" ? "alert" : "status"}>
      <Icon aria-hidden />
      <div>{children}</div>
    </div>
  );
}
