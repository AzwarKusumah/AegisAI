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
      if (!response.ok) throw new Error(data.error === "invalid_credentials" ? "Username atau password salah." : "Login tidak dapat diproses.");
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.assign(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Login gagal.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="loginShell">
    <section className="loginCard">
      <div className="brand loginBrand"><span className="brandMark">A</span><span>AegisAI<small>SECURITY CONSOLE</small></span></div>
      <p className="eyebrow">SELF-HOSTED SECURITY PLATFORM</p>
      <h1>Welcome back</h1>
      <p className="subhead">Sign in to manage devices, inspection events, and endpoint policies.</p>
      <form onSubmit={submit} className="loginForm">
        <label>Username<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        {error && <p className="formError" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
      </form>
      <p className="loginFoot">Credentials are configured by the server administrator.</p>
    </section>
  </main>;
}
