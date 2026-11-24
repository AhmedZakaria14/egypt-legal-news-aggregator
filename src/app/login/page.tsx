"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "فشل تسجيل الدخول.");
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل تسجيل الدخول.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-navy-950 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl"
      >
        <div className="mb-2 text-center text-4xl" aria-hidden>
          ⚖️
        </div>
        <h1 className="mb-1 text-center text-lg font-bold text-navy-900">
          مؤسسة عمرو منصور للمحاماة والاستشارات القانونية
        </h1>
        <p className="mb-6 text-center text-sm text-slate-500">
          لوحة مجمّع الأخبار القانونية — تسجيل الدخول
        </p>
        <label className="mb-2 block text-sm font-semibold text-slate-700" htmlFor="pw">
          كلمة المرور
        </label>
        <input
          id="pw"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-left focus:border-gold-500 focus:outline-none"
          dir="ltr"
          autoFocus
          required
        />
        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-navy-900 py-2.5 font-bold text-white transition hover:bg-navy-800 disabled:opacity-50"
        >
          {busy ? "جارٍ التحقق…" : "دخول"}
        </button>
      </form>
    </main>
  );
}
