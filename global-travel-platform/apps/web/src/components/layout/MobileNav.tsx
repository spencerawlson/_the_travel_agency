"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Link } from "@/i18n/navigation";

export function MobileNav({ items }: { items: { href: string; label: string }[] }) {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="md:hidden">
      <button
        type="button"
        className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? t("close") : t("menu")}
      </button>
      {open && (
        <nav
          id={id}
          aria-label={t("primary")}
          className="absolute inset-x-0 top-full border-b border-line bg-surface-1 px-4 py-3 shadow-lg"
        >
          <ul className="flex flex-col gap-1">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-lg px-3 py-2 font-medium hover:bg-surface-2"
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
