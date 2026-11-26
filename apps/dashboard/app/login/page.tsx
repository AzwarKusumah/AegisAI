"use client";

import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error === "invalid_credentials" ? "Username or password is incorrect." : "Sign-in could not be completed.");
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.assign(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="loginShell">
    <section className="loginCard">
      <a className="brand loginBrand" href="/"><span className="brandMark">A</span><span>AegisAI<small>Data protection</small></span></a>
      <p className="eyebrow">Administrator access</p>
      <h1>Sign in</h1>
      <p className="subhead">Manage endpoint activity, sensitive-data policies, and connected computers.</p>
      <form onSubmit={submit} className="loginForm">
        <label>Username<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        {error && <p className="formError" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className="loginFoot">Access is managed by your AegisAI server administrator.</p>
    </section>
  </main>;
}
