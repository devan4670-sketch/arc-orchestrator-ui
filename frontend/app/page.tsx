"use client";

import { useState, useEffect, useRef } from "react";

const MODELS = [
  { id: "claude-opus-4-6", label: "Claude Opus 4" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
];

interface LogEntry {
  id: number;
  type: "thinking" | "tool" | "result" | "payment" | "error" | "done";
  content: string;
  timestamp: string;
}

interface Transaction {
  id: string;
  description: string;
  amount: number;
  timestamp: string;
}

interface WalletState {
  balance_usdc: number;
  spent_this_session: number;
  max_per_task: number;
  transaction_count: number;
  transactions: Transaction[];
}

export default function Home() {
  const [task, setTask] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("claude-opus-4-6");
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [wallet, setWallet] = useState<WalletState>({
    balance_usdc: 10.0,
    spent_this_session: 0.0,
    max_per_task: 1.0,
    transaction_count: 0,
    transactions: [],
  });
  const [showSettings, setShowSettings] = useState(false);
  const [tempKey, setTempKey] = useState("");
  const [keyVisible, setKeyVisible] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const logCounter = useRef(0);

  useEffect(() => {
    const stored = localStorage.getItem("arc_api_key");
    if (stored) setApiKey(stored);
    const storedModel = localStorage.getItem("arc_model");
    if (storedModel) setModel(storedModel);
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const addLog = (type: LogEntry["type"], content: string) => {
    const now = new Date();
    const timestamp = now.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    setLogs((prev) => [
      ...prev,
      { id: logCounter.current++, type, content, timestamp },
    ]);
  };

  const saveSettings = () => {
    if (tempKey.startsWith("sk-ant-")) {
      setApiKey(tempKey);
      localStorage.setItem("arc_api_key", tempKey);
    }
    localStorage.setItem("arc_model", model);
    setShowSettings(false);
  };

  const runTask = async () => {
    if (!task.trim()) return;
    if (!apiKey) {
      setShowSettings(true);
      return;
    }

    setRunning(true);
    setLogs([]);
    addLog("thinking", "Initializing orchestrator...");

    try {
      const res = await fetch("/api/task", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Anthropic-Key": apiKey,
        },
        body: JSON.stringify({ task, model }),
      });

      if (!res.ok) {
        const err = await res.json();
        addLog("error", err.detail || "Request failed");
        setRunning(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") {
            setRunning(false);
            break;
          }

          try {
            const event = JSON.parse(data);
            if (event.type === "thinking") addLog("thinking", event.content);
            else if (event.type === "tool_call") addLog("tool", `${event.tool}: ${event.input}`);
            else if (event.type === "tool_result") addLog("result", event.content);
            else if (event.type === "payment") {
              addLog("payment", `${event.description} — $${event.amount_usdc.toFixed(6)} USDC`);
              setWallet((prev) => ({
                ...prev,
                spent_this_session: prev.spent_this_session + event.amount_usdc,
                balance_usdc: prev.balance_usdc - event.amount_usdc,
                transaction_count: prev.transaction_count + 1,
                transactions: [
                  {
                    id: Date.now().toString(),
                    description: event.description,
                    amount: event.amount_usdc,
                    timestamp: new Date().toLocaleTimeString(),
                  },
                  ...prev.transactions.slice(0, 9),
                ],
              }));
            } else if (event.type === "done") {
              addLog("done", event.result || "Task completed.");
              setRunning(false);
            } else if (event.type === "error") {
              addLog("error", event.message);
              setRunning(false);
            }
          } catch {}
        }
      }
    } catch (e: unknown) {
      addLog("error", e instanceof Error ? e.message : "Unknown error");
      setRunning(false);
    }
  };

  const logColor = (type: LogEntry["type"]) => {
    switch (type) {
      case "thinking": return "text-zinc-400";
      case "tool": return "text-blue-400";
      case "result": return "text-green-400";
      case "payment": return "text-orange-400";
      case "error": return "text-red-400";
      case "done": return "text-emerald-300";
      default: return "text-zinc-400";
    }
  };

  const logPrefix = (type: LogEntry["type"]) => {
    switch (type) {
      case "thinking": return "~";
      case "tool": return ">";
      case "result": return "<";
      case "payment": return "$";
      case "error": return "!";
      case "done": return "=";
      default: return " ";
    }
  };

  return (
    <>
      {/* Blob background */}
      <div className="blob-bg">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
      </div>
      <div className="noise" />

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-8 shadow-2xl">
            <h2 className="mb-6 text-xl font-semibold tracking-tight text-white">
              Configuration
            </h2>

            <div className="mb-5">
              <label className="mb-2 block text-xs font-medium uppercase tracking-widest text-zinc-500">
                Anthropic API Key
              </label>
              <div className="relative">
                <input
                  type={keyVisible ? "text" : "password"}
                  value={tempKey}
                  onChange={(e) => setTempKey(e.target.value)}
                  placeholder={apiKey ? "sk-ant-••••••••" : "sk-ant-api03-..."}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 pr-12 text-sm text-white placeholder-zinc-600 focus:border-orange-600 focus:outline-none"
                />
                <button
                  onClick={() => setKeyVisible(!keyVisible)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {keyVisible ? (
                      <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
                    ) : (
                      <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                    )}
                  </svg>
                </button>
              </div>
              <p className="mt-2 text-xs text-zinc-600">
                Your key is stored locally and never sent to our servers.
              </p>
            </div>

            <div className="mb-8">
              <label className="mb-2 block text-xs font-medium uppercase tracking-widest text-zinc-500">
                Model
              </label>
              <div className="grid gap-2">
                {MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setModel(m.id)}
                    className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-all ${
                      model === m.id
                        ? "border-orange-600 bg-orange-950/30 text-white"
                        : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <div className={`h-2 w-2 rounded-full ${model === m.id ? "bg-orange-500" : "bg-zinc-700"}`} />
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowSettings(false)}
                className="flex-1 rounded-lg border border-zinc-800 py-3 text-sm text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={saveSettings}
                className="flex-1 rounded-lg bg-orange-600 py-3 text-sm font-medium text-white transition-colors hover:bg-orange-500"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main layout */}
      <div className="relative z-10 flex h-screen flex-col">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-zinc-900 px-8 py-5">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-orange-500 pulse-dot" />
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
              Arc Testnet
            </span>
          </div>
          <h1 className="text-sm font-bold uppercase tracking-[0.3em] text-white">
            Orchestrate
          </h1>
          <button
            onClick={() => {
              setTempKey(apiKey);
              setShowSettings(true);
            }}
            className="flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-xs text-zinc-500 transition-colors hover:border-zinc-700 hover:text-white"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
            Settings
          </button>
        </header>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Main panel */}
          <div className="flex flex-1 flex-col overflow-hidden p-8">
            {/* Task input */}
            <div className="mb-6">
              <div className="flex items-end gap-4">
                <div className="flex-1">
                  <label className="mb-2 block text-xs font-medium uppercase tracking-widest text-zinc-600">
                    Task
                  </label>
                  <textarea
                    value={task}
                    onChange={(e) => setTask(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) runTask();
                    }}
                    placeholder="Describe what you want the agent to do..."
                    rows={3}
                    disabled={running}
                    className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950/80 px-5 py-4 text-sm text-white placeholder-zinc-700 backdrop-blur-sm focus:border-orange-800 focus:outline-none disabled:opacity-50"
                  />
                </div>
                <button
                  onClick={runTask}
                  disabled={running || !task.trim()}
                  className="mb-0.5 flex h-14 w-14 items-center justify-center rounded-xl bg-orange-600 text-white transition-all hover:bg-orange-500 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {running ? (
                    <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 11-6.219-8.56"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="22" y1="2" x2="11" y2="13"/>
                      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                  )}
                </button>
              </div>
              <p className="mt-2 text-xs text-zinc-700">
                {apiKey ? (
                  <span className="text-zinc-600">
                    Using {MODELS.find(m => m.id === model)?.label} — press Cmd+Enter to run
                  </span>
                ) : (
                  <button onClick={() => setShowSettings(true)} className="text-orange-600 hover:text-orange-500">
                    Add your Anthropic API key to get started
                  </button>
                )}
              </p>
            </div>

            {/* Log terminal */}
            <div className="flex-1 overflow-hidden rounded-xl border border-zinc-900 bg-zinc-950/60 backdrop-blur-sm">
              <div className="flex items-center gap-2 border-b border-zinc-900 px-5 py-3">
                <div className="h-2 w-2 rounded-full bg-zinc-800" />
                <span className="text-xs text-zinc-600 font-mono">agent.log</span>
                {running && (
                  <span className="ml-auto flex items-center gap-1.5 text-xs text-orange-500">
                    <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-orange-500" />
                    Running
                  </span>
                )}
              </div>
              <div
                ref={logRef}
                className="h-full overflow-y-auto p-5 font-mono text-xs"
                style={{ maxHeight: "calc(100% - 40px)" }}
              >
                {logs.length === 0 ? (
                  <p className="text-zinc-700 select-none">
                    Awaiting task...
                  </p>
                ) : (
                  logs.map((entry) => (
                    <div key={entry.id} className={`log-entry mb-1.5 flex gap-3 ${logColor(entry.type)}`}>
                      <span className="shrink-0 text-zinc-700">{entry.timestamp}</span>
                      <span className="shrink-0">{logPrefix(entry.type)}</span>
                      <span className="break-all">{entry.content}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Wallet sidebar */}
          <div className="w-72 shrink-0 border-l border-zinc-900 p-6 overflow-y-auto">
            <div className="mb-6">
              <p className="mb-1 text-xs font-medium uppercase tracking-widest text-zinc-600">
                Arc Wallet
              </p>
              <p className="text-2xl font-bold text-white">
                ${wallet.balance_usdc.toFixed(4)}
                <span className="ml-1 text-sm font-normal text-zinc-500">USDC</span>
              </p>
              <p className="mt-0.5 text-xs text-zinc-600">Testnet balance</p>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-zinc-900 bg-zinc-950/60 p-3">
                <p className="text-xs text-zinc-600 mb-1">Session</p>
                <p className="text-sm font-semibold text-orange-400">
                  ${wallet.spent_this_session.toFixed(6)}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-900 bg-zinc-950/60 p-3">
                <p className="text-xs text-zinc-600 mb-1">Txns</p>
                <p className="text-sm font-semibold text-white">
                  {wallet.transaction_count}
                </p>
              </div>
            </div>

            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-widest text-zinc-600">
                Transactions
              </p>
            </div>

            {wallet.transactions.length === 0 ? (
              <p className="text-xs text-zinc-700">No transactions yet</p>
            ) : (
              <div className="space-y-2">
                {wallet.transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="rounded-lg border border-zinc-900 bg-zinc-950/60 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-zinc-400 leading-snug">{tx.description}</p>
                      <p className="shrink-0 text-xs font-medium text-orange-400">
                        ${tx.amount.toFixed(6)}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-zinc-700">{tx.timestamp}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Network info */}
            <div className="mt-8 rounded-lg border border-zinc-900 bg-zinc-950/60 p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-widest text-zinc-600">
                Network
              </p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-600">Chain</span>
                  <span className="text-zinc-400">Arc Testnet</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-600">Token</span>
                  <span className="text-zinc-400">USDC</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-600">Min payment</span>
                  <span className="text-orange-400">$0.000001</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
