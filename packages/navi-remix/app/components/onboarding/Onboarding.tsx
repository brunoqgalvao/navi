import { useState, useEffect, useCallback } from "react";
import { useSettingsStore } from "~/stores/settingsStore";
import { api } from "~/lib/api";

type Step =
  | "intro-1"
  | "intro-2"
  | "intro-3"
  | "checking"
  | "setup"
  | "choose-auth"
  | "api-key"
  | "terminal-login"
  | "no-account"
  | "complete";

interface AuthStatus {
  claudeInstalled: boolean;
  claudePath: string;
  authenticated: boolean;
  authMethod: "oauth" | "api_key" | null;
  hasApiKey: boolean;
  hasOAuth: boolean;
  preferredAuth: "oauth" | "api_key" | null;
}

export function Onboarding() {
  const [step, setStep] = useState<Step>("intro-1");
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [settingPreferred, setSettingPreferred] = useState(false);
  const completeOnboarding = useSettingsStore((s) => s.completeOnboarding);

  const introSteps = ["intro-1", "intro-2", "intro-3"];

  const checkAuthStatus = async () => {
    setStep("checking");
    try {
      const status = await api.auth.status();
      setAuthStatus(status);
      if (status.hasApiKey && status.hasOAuth) {
        setStep("choose-auth");
      } else if (status.authenticated) {
        setStep("complete");
      } else {
        setStep("setup");
      }
    } catch {
      setStep("setup");
      setAuthStatus({
        claudeInstalled: false,
        claudePath: "",
        authenticated: false,
        authMethod: null,
        hasApiKey: false,
        hasOAuth: false,
        preferredAuth: null,
      });
    }
  };

  const setPreferredAuth = async (method: "oauth" | "api_key") => {
    setSettingPreferred(true);
    try {
      await api.auth.setPreferred(method);
      if (authStatus) {
        setAuthStatus({ ...authStatus, authMethod: method, preferredAuth: method });
      }
      setStep("complete");
    } catch (e) {
      console.error("Failed to set preferred auth:", e);
    } finally {
      setSettingPreferred(false);
    }
  };

  const submitApiKey = async () => {
    if (!apiKey.trim()) {
      setError("Please enter an API key");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      await api.auth.setApiKey(apiKey.trim());
      const status = await api.auth.status();
      setAuthStatus(status);
      if (status.authenticated) {
        if (status.hasOAuth) {
          setStep("choose-auth");
        } else {
          setStep("complete");
        }
      } else {
        setError("API key saved but authentication failed. Please check your key.");
      }
    } catch (e: any) {
      setError(e.message || "Failed to save API key");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuthComplete = async () => {
    setIsLoading(true);
    try {
      const status = await api.auth.status();
      setAuthStatus(status);
      if (status.hasOAuth) {
        if (status.hasApiKey) {
          setStep("choose-auth");
        } else {
          setStep("complete");
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const nextIntro = useCallback(() => {
    if (step === "intro-1") setStep("intro-2");
    else if (step === "intro-2") setStep("intro-3");
    else if (step === "intro-3") checkAuthStatus();
  }, [step]);

  const prevIntro = useCallback(() => {
    if (step === "intro-2") setStep("intro-1");
    else if (step === "intro-3") setStep("intro-2");
  }, [step]);

  const handleKeydown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isLoading) {
      if (step === "api-key") {
        submitApiKey();
      } else if (step.startsWith("intro-")) {
        nextIntro();
      }
    }
  };

  const handleComplete = () => {
    completeOnboarding();
  };

  // Keyboard navigation for intro steps
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (introSteps.includes(step)) {
        if (e.key === "ArrowRight" || e.key === " ") {
          e.preventDefault();
          nextIntro();
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          prevIntro();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [step, nextIntro, prevIntro]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-white flex items-center justify-center">
      <div className="max-w-lg w-full mx-6">
        {/* Intro 1 - Welcome */}
        {step === "intro-1" && (
          <div className="text-center space-y-8">
            <div className="w-20 h-20 mx-auto bg-gray-900 rounded-2xl flex items-center justify-center">
              <svg
                width="40"
                height="32"
                viewBox="0 0 160 120"
                stroke="white"
                strokeWidth="12"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              >
                <path d="M 35 30 L 10 60 L 35 90" />
                <path d="M 70 95 L 90 25" />
                <path d="M 125 30 L 150 60 L 125 90" />
              </svg>
            </div>

            <div className="space-y-3">
              <h1 className="text-2xl font-semibold text-gray-900">Welcome to Navi</h1>
              <p className="text-gray-500 leading-relaxed">
                Your local AI coding assistant. Navi runs entirely on your machine, keeping your
                code private while giving you the full power of Claude.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-all ${
                    i === 0 ? "bg-gray-900" : "bg-gray-200"
                  }`}
                />
              ))}
            </div>

            <button
              onClick={nextIntro}
              className="bg-gray-900 hover:bg-gray-800 text-white px-8 py-3 rounded-xl text-sm font-medium transition-colors"
            >
              Get Started
            </button>

            <p className="text-xs text-gray-400">Press Enter or use arrow keys to navigate</p>
          </div>
        )}

        {/* Intro 2 - Features */}
        {step === "intro-2" && (
          <div className="text-center space-y-8">
            <div className="w-20 h-20 mx-auto bg-indigo-50 rounded-2xl flex items-center justify-center">
              <svg
                className="w-10 h-10 text-indigo-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl font-semibold text-gray-900">What Navi Can Do</h2>
              <p className="text-gray-500 leading-relaxed">
                Edit multiple files at once, run terminal commands, search the web, and navigate
                your codebase - all through natural conversation.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-left max-w-sm mx-auto">
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="text-sm font-medium text-gray-900">Multi-file editing</div>
                <div className="text-xs text-gray-500 mt-0.5">Refactor across your entire project</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="text-sm font-medium text-gray-900">Terminal access</div>
                <div className="text-xs text-gray-500 mt-0.5">Run commands, tests, and builds</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="text-sm font-medium text-gray-900">Web search</div>
                <div className="text-xs text-gray-500 mt-0.5">Find docs and solutions online</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="text-sm font-medium text-gray-900">File preview</div>
                <div className="text-xs text-gray-500 mt-0.5">See changes as they happen</div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-all ${
                    i === 1 ? "bg-gray-900" : "bg-gray-200"
                  }`}
                />
              ))}
            </div>

            <div className="flex justify-center gap-3">
              <button
                onClick={prevIntro}
                className="text-gray-500 hover:text-gray-700 px-4 py-2 text-sm font-medium transition-colors"
              >
                Back
              </button>
              <button
                onClick={nextIntro}
                className="bg-gray-900 hover:bg-gray-800 text-white px-8 py-3 rounded-xl text-sm font-medium transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Intro 3 - Privacy */}
        {step === "intro-3" && (
          <div className="text-center space-y-8">
            <div className="w-20 h-20 mx-auto bg-amber-50 rounded-2xl flex items-center justify-center">
              <svg
                className="w-10 h-10 text-amber-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl font-semibold text-gray-900">Private & Secure</h2>
              <p className="text-gray-500 leading-relaxed">
                Your code stays on your machine. Navi communicates directly with Anthropic's API -
                no middleman, no data storage, no tracking.
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 text-left max-w-sm mx-auto space-y-3">
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-green-600 mt-0.5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <div className="text-sm text-gray-600">
                  Code processed locally, sent only to Anthropic
                </div>
              </div>
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-green-600 mt-0.5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <div className="text-sm text-gray-600">
                  Credentials stored locally in your home directory
                </div>
              </div>
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-green-600 mt-0.5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <div className="text-sm text-gray-600">Open source - inspect the code yourself</div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-all ${
                    i === 2 ? "bg-gray-900" : "bg-gray-200"
                  }`}
                />
              ))}
            </div>

            <div className="flex justify-center gap-3">
              <button
                onClick={prevIntro}
                className="text-gray-500 hover:text-gray-700 px-4 py-2 text-sm font-medium transition-colors"
              >
                Back
              </button>
              <button
                onClick={nextIntro}
                className="bg-gray-900 hover:bg-gray-800 text-white px-8 py-3 rounded-xl text-sm font-medium transition-colors"
              >
                Set Up Authentication
              </button>
            </div>
          </div>
        )}

        {/* Checking */}
        {step === "checking" && (
          <div className="text-center space-y-4">
            <div className="w-10 h-10 mx-auto">
              <div className="w-full h-full rounded-full border-2 border-gray-200 border-t-gray-900 animate-spin" />
            </div>
            <p className="text-sm text-gray-500">Checking setup...</p>
          </div>
        )}

        {/* Choose Auth (when both OAuth and API key exist) */}
        {step === "choose-auth" && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <svg
                  className="w-6 h-6 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900">Choose Auth Method</h2>
              <p className="text-sm text-gray-500">You have both OAuth and API key configured</p>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => setPreferredAuth("oauth")}
                disabled={settingPreferred}
                className="w-full bg-white border border-gray-200 hover:border-gray-300 rounded-xl p-4 text-left transition-all disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center shrink-0">
                    <svg
                      className="w-5 h-5 text-green-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm">Anthropic OAuth</div>
                    <div className="text-xs text-gray-500">Use your subscription</div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setPreferredAuth("api_key")}
                disabled={settingPreferred}
                className="w-full bg-white border border-gray-200 hover:border-gray-300 rounded-xl p-4 text-left transition-all disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                    <svg
                      className="w-5 h-5 text-blue-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                      />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm">API Key</div>
                    <div className="text-xs text-gray-500">Pay as you go</div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Setup */}
        {step === "setup" && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold text-gray-900">Connect to Claude</h2>
              <p className="text-sm text-gray-500">Choose how to authenticate</p>
            </div>

            <div className="space-y-2">
              {authStatus?.claudeInstalled && (
                <button
                  onClick={() => setStep("terminal-login")}
                  className="w-full bg-white border border-gray-200 hover:border-gray-300 rounded-xl p-4 text-left transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center shrink-0">
                      <svg
                        className="w-5 h-5 text-green-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 text-sm">Login with Anthropic</div>
                      <div className="text-xs text-gray-500">Use your account subscription</div>
                    </div>
                    <svg
                      className="w-4 h-4 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </button>
              )}

              <button
                onClick={() => setStep("api-key")}
                className="w-full bg-white border border-gray-200 hover:border-gray-300 rounded-xl p-4 text-left transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                    <svg
                      className="w-5 h-5 text-blue-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                      />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm">Use API Key</div>
                    <div className="text-xs text-gray-500">Pay as you go pricing</div>
                  </div>
                  <svg
                    className="w-4 h-4 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </button>

              <button
                onClick={() => setStep("no-account")}
                className="w-full bg-white border border-gray-200 hover:border-gray-300 rounded-xl p-4 text-left transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
                    <svg
                      className="w-5 h-5 text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                      />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm">I need an account</div>
                    <div className="text-xs text-gray-500">Get started with Anthropic</div>
                  </div>
                  <svg
                    className="w-4 h-4 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </button>
            </div>

            <button
              onClick={handleComplete}
              className="w-full text-sm text-gray-400 hover:text-gray-600"
            >
              Skip for now
            </button>
          </div>
        )}

        {/* No Account */}
        {step === "no-account" && (
          <div className="space-y-6">
            <button
              onClick={() => setStep("setup")}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back
            </button>

            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-gray-900">Get Started</h2>
              <p className="text-sm text-gray-500">Sign up for Claude access</p>
            </div>

            <div className="space-y-2">
              <a
                href="https://claude.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-white border border-gray-200 hover:border-gray-300 rounded-xl p-4 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center shrink-0">
                    <span className="text-orange-600 font-bold">C</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm">Claude Pro - $20/mo</div>
                    <div className="text-xs text-gray-500">Includes Claude Code access</div>
                  </div>
                  <svg
                    className="w-4 h-4 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </div>
              </a>

              <a
                href="https://console.anthropic.com"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-white border border-gray-200 hover:border-gray-300 rounded-xl p-4 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                    <svg
                      className="w-5 h-5 text-blue-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                      />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm">API Access</div>
                    <div className="text-xs text-gray-500">Pay as you go</div>
                  </div>
                  <svg
                    className="w-4 h-4 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </div>
              </a>
            </div>

            <button
              onClick={() => checkAuthStatus()}
              className="w-full bg-gray-900 hover:bg-gray-800 text-white py-3 rounded-xl text-sm font-medium transition-colors"
            >
              I've signed up
            </button>
          </div>
        )}

        {/* API Key */}
        {step === "api-key" && (
          <div className="space-y-6">
            <button
              onClick={() => setStep("setup")}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back
            </button>

            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-gray-900">Enter API Key</h2>
              <p className="text-sm text-gray-500">
                Get yours at{" "}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  console.anthropic.com
                </a>
              </p>
            </div>

            <div className="space-y-3">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onKeyDown={handleKeydown}
                placeholder="sk-ant-..."
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono focus:border-gray-400 focus:outline-none"
              />

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                onClick={submitApiKey}
                disabled={isLoading || !apiKey.trim()}
                className="w-full bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 text-white py-3 rounded-xl text-sm font-medium transition-colors"
              >
                {isLoading ? "Saving..." : "Continue"}
              </button>
            </div>

            <p className="text-xs text-gray-400 text-center">Stored locally, never shared</p>
          </div>
        )}

        {/* Terminal Login */}
        {step === "terminal-login" && (
          <div className="space-y-6">
            <button
              onClick={() => setStep("setup")}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back
            </button>

            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-gray-900">Login with Anthropic</h2>
              <p className="text-sm text-gray-500">Run this in your terminal:</p>
            </div>

            <div className="bg-gray-900 rounded-xl p-4 font-mono text-sm">
              <div className="flex items-center justify-between">
                <code className="text-green-400">claude login</code>
                <button
                  onClick={() => copyToClipboard("claude login")}
                  className="text-gray-500 hover:text-white p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                </button>
              </div>
            </div>

            <button
              onClick={handleOAuthComplete}
              disabled={isLoading}
              className="w-full bg-gray-900 hover:bg-gray-800 text-white py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isLoading ? "Checking..." : "I've logged in"}
            </button>
          </div>
        )}

        {/* Complete */}
        {step === "complete" && (
          <div className="text-center space-y-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <svg
                className="w-8 h-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-gray-900">You're all set!</h2>
              <p className="text-sm text-gray-500">
                {authStatus?.authMethod === "oauth"
                  ? "Connected via Anthropic"
                  : "API key configured"}
              </p>
            </div>

            <button
              onClick={handleComplete}
              className="bg-gray-900 hover:bg-gray-800 text-white px-8 py-3 rounded-xl text-sm font-medium transition-colors"
            >
              Start using Navi
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
