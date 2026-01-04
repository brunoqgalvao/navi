import { useState, useEffect } from "react";
import { api } from "~/lib/api";
import { Button } from "~/components/ui/Button";
import { Input } from "~/components/ui/Input";
import { Badge } from "~/components/ui/Badge";

interface AuthStatus {
  authenticated: boolean;
  authMethod: string | null;
  hasApiKey: boolean;
}

export function ApiKeysTab() {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [anthropicKey, setAnthropicKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    async function loadAuthStatus() {
      try {
        const status = await api.auth.status();
        setAuthStatus(status);
      } catch (error) {
        console.error("Failed to load auth status:", error);
      }
    }
    loadAuthStatus();
  }, []);

  const handleSaveApiKey = async () => {
    if (!anthropicKey.trim()) return;

    setIsSaving(true);
    setMessage(null);

    try {
      await api.auth.setApiKey(anthropicKey);
      setMessage({ type: "success", text: "API key saved successfully" });
      setAnthropicKey("");
      // Refresh auth status
      const status = await api.auth.status();
      setAuthStatus(status);
    } catch (error) {
      setMessage({ type: "error", text: "Failed to save API key" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Auth Status */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
        <h3 className="mb-3 text-sm font-medium text-zinc-200">
          Authentication Status
        </h3>
        {authStatus ? (
          <div className="flex items-center gap-2">
            <Badge variant={authStatus.authenticated ? "success" : "warning"}>
              {authStatus.authenticated ? "Authenticated" : "Not Authenticated"}
            </Badge>
            {authStatus.authMethod && (
              <span className="text-sm text-zinc-400">
                via {authStatus.authMethod}
              </span>
            )}
          </div>
        ) : (
          <span className="text-sm text-zinc-500">Loading...</span>
        )}
      </div>

      {/* Anthropic API Key */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-zinc-200">Anthropic API Key</h3>
        <p className="text-sm text-zinc-400">
          Enter your Anthropic API key to use Claude directly. You can get one
          from{" "}
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline"
          >
            console.anthropic.com
          </a>
        </p>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type={showKey ? "text" : "password"}
              placeholder="sk-ant-..."
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
            >
              {showKey ? (
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                  />
                </svg>
              ) : (
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
              )}
            </button>
          </div>
          <Button onClick={handleSaveApiKey} disabled={isSaving || !anthropicKey.trim()}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>

        {message && (
          <p
            className={`text-sm ${
              message.type === "success" ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {message.text}
          </p>
        )}
      </div>

      {/* OAuth Info */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
        <h3 className="mb-2 text-sm font-medium text-zinc-200">
          Using Claude CLI?
        </h3>
        <p className="text-sm text-zinc-400">
          If you have the Claude CLI installed and logged in, Navi will
          automatically use your existing authentication. Run{" "}
          <code className="rounded bg-zinc-700 px-1 py-0.5">claude login</code>{" "}
          in your terminal to authenticate.
        </p>
      </div>
    </div>
  );
}
