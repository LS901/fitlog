"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { requestPersistentStorage } from "@/lib/backup";
import { seedIfEmpty } from "@/lib/seed";
import { RestTimer } from "./RestTimer";
import { ToastBar } from "./Toast";

const NAV = [
  { href: "/", label: "Home", icon: "◉" },
  { href: "/workouts", label: "Train", icon: "▲" },
  { href: "/body", label: "Body", icon: "◐" },
  { href: "/nutrition", label: "Food", icon: "◔" },
  { href: "/vitals", label: "Vitals", icon: "♥" },
  { href: "/photos", label: "Photos", icon: "▣" },
];

// All data lives in the browser (IndexedDB), so page content renders client-side only.
const noop = () => () => {};
const useIsClient = () =>
  useSyncExternalStore(noop, () => true, () => false);

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const isClient = useIsClient();

  useEffect(() => {
    seedIfEmpty();
    // all data is on-device, so ask the browser not to evict it
    requestPersistentStorage();
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col">
      <header className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          fit<span className="text-emerald-400">log</span>
        </Link>
        <Link
          href="/settings"
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          Settings
        </Link>
      </header>

      <main className="flex-1 px-5 pb-28">{isClient ? children : null}</main>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-800 bg-zinc-950/90 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        {isClient && <ToastBar />}
        {isClient && <RestTimer />}
        <ul className="mx-auto flex max-w-xl">
          {NAV.map((n) => {
            const active =
              n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <li key={n.href} className="flex-1">
                <Link
                  href={n.href}
                  className={`flex flex-col items-center gap-0.5 py-2.5 text-xs ${
                    active ? "text-emerald-400" : "text-zinc-500"
                  }`}
                >
                  <span className="text-base leading-none">{n.icon}</span>
                  {n.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
