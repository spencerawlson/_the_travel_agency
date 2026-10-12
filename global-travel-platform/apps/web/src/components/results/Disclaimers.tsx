import type { DisclaimerCode } from "@gtp/shared-types";
import { useTranslations } from "next-intl";

export function Disclaimers({ codes }: { codes: DisclaimerCode[] }) {
  const t = useTranslations("disclaimers");
  if (codes.length === 0) return null;
  return (
    <ul className="space-y-1.5 rounded-xl border border-line bg-surface-2 p-4 text-sm text-ink-muted">
      {codes.map((code) => (
        <li
          key={code}
          className={
            code === "demo_data" ? "font-semibold text-amber-900 dark:text-amber-200" : undefined
          }
        >
          {t(code)}
        </li>
      ))}
    </ul>
  );
}
