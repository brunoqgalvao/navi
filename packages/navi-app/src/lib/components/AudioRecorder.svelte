<script lang="ts">
  import { api } from "../api";
  import Tooltip from "./Tooltip.svelte";

  interface Props {
    onTranscript: (text: string) => void;
    disabled?: boolean;
  }

  let { onTranscript, disabled = false }: Props = $props();

  type RecordingState = "idle" | "recording" | "processing";

  let recordingState: RecordingState = $state("idle");
  let mediaRecorder: MediaRecorder | null = null;
  let audioChunks: Blob[] = [];
  let recordingDuration = $state(0);
  let durationInterval: number | null = null;
  let error: string | null = $state(null);
  let stream: MediaStream | null = null;
  let lastAudioBlob: Blob | null = null;
  let hasApiKey: boolean | null = $state(null);
  let showApiKeyModal = $state(false);
  let apiKeyInput = $state("");
  let apiKeyError: string | null = $state(null);
  let savingKey = $state(false);

  async function checkApiKey() {
    try {
      console.log("[AudioRecorder] Checking API key...");
      const config = await api.config.get();
      console.log("[AudioRecorder] Config response:", config);
      hasApiKey = config.hasOpenAIKey;
      console.log("[AudioRecorder] hasApiKey set to:", hasApiKey);
    } catch (e) {
      console.error("[AudioRecorder] Failed to check API key:", e);
      hasApiKey = false;
    }
  }

  checkApiKey();

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  async function startRecording() {
    error = null;
    audioChunks = [];

    try {
      // Don't specify sampleRate as a hard constraint - many browsers/devices
      // don't support exactly 16kHz and will throw NotFoundError
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        }
      });
      
      mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") 
          ? "audio/webm;codecs=opus" 
          : "audio/webm"
      });
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunks.push(e.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        await processAudio(audioBlob);
      };
      
      mediaRecorder.onerror = (e) => {
        console.error("MediaRecorder error:", e);
        error = "Recording failed";
        stopRecording();
      };
      
      mediaRecorder.start(100);
      recordingState = "recording";
      recordingDuration = 0;
      durationInterval = window.setInterval(() => {
        recordingDuration++;
      }, 1000);
      
    } catch (e: any) {
      console.error("Failed to start recording:", e);
      if (e.name === "NotFoundError") {
        error = "No microphone found. Check your audio input device.";
      } else if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
        error = "Microphone access denied";
      } else {
        error = e.message || "Failed to access microphone";
      }
    }
  }

  function stopRecording() {
    if (durationInterval) {
      clearInterval(durationInterval);
      durationInterval = null;
    }
    
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
  }

  async function processAudio(audioBlob: Blob) {
    recordingState = "processing";
    lastAudioBlob = audioBlob;

    try {
      const result = await api.transcribe(audioBlob);

      if (result.text && result.text.trim()) {
        onTranscript(result.text.trim());
        lastAudioBlob = null; // Clear on success
        recordingState = "idle";
      } else {
        throw new Error("Empty transcription");
      }
    } catch (e: any) {
      console.error("Transcription failed:", e);
      error = e.message || "Transcription failed";

      const savedPath = await saveAudioBackup(audioBlob);
      if (savedPath) {
        // Show truncated path to keep tooltip manageable
        const filename = savedPath.split("/").pop() || savedPath;
        error = `Transcription failed. Audio saved as: ${filename}`;
      }

      recordingState = "idle";
    }
  }

  async function retryTranscription() {
    if (!lastAudioBlob) return;
    error = null;
    await processAudio(lastAudioBlob);
  }

  async function saveAudioBackup(audioBlob: Blob): Promise<string | null> {
    try {
      const result = await api.saveAudio(audioBlob);
      return result.path;
    } catch (e) {
      console.error("Failed to save audio backup:", e);
      return null;
    }
  }

  export function toggleRecording() {
    handleClick();
  }

  export function isRecording() {
    return recordingState === "recording";
  }

  function handleClick() {
    console.log("[AudioRecorder] handleClick - disabled:", disabled, "hasApiKey:", hasApiKey, "recordingState:", recordingState);
    if (disabled) return;

    if (hasApiKey === false || hasApiKey === null) {
      console.log("[AudioRecorder] Showing API key modal");
      showApiKeyModal = true;
      return;
    }

    if (recordingState === "idle") {
      startRecording();
    } else if (recordingState === "recording") {
      stopRecording();
    }
  }

  function handleCancel() {
    if (durationInterval) {
      clearInterval(durationInterval);
      durationInterval = null;
    }
    
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.ondataavailable = null;
      mediaRecorder.onstop = null;
      mediaRecorder.stop();
    }
    
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
    
    audioChunks = [];
    recordingState = "idle";
    error = null;
  }

  async function saveApiKey() {
    console.log("[AudioRecorder] saveApiKey called, input length:", apiKeyInput.length);
    if (!apiKeyInput.trim()) {
      apiKeyError = "Please enter an API key";
      return;
    }

    if (!apiKeyInput.startsWith("sk-")) {
      apiKeyError = "API key should start with 'sk-'";
      return;
    }

    savingKey = true;
    apiKeyError = null;

    try {
      console.log("[AudioRecorder] Calling api.config.setOpenAIKey...");
      await api.config.setOpenAIKey(apiKeyInput.trim());
      console.log("[AudioRecorder] API key saved successfully");
      hasApiKey = true;
      showApiKeyModal = false;
      apiKeyInput = "";
    } catch (e: any) {
      console.error("[AudioRecorder] Failed to save API key:", e);
      apiKeyError = e.message || "Failed to save API key";
    } finally {
      savingKey = false;
    }
  }

  function closeModal() {
    showApiKeyModal = false;
    apiKeyInput = "";
    apiKeyError = null;
  }
</script>

<div class="flex items-center gap-2 relative z-10">
  {#if recordingState === "recording"}
    <button
      onclick={handleCancel}
      class="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
      title="Cancel recording"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
    
    <span class="text-xs text-red-500 font-mono tabular-nums min-w-[40px]">
      {formatDuration(recordingDuration)}
    </span>
  {/if}
  
  <Tooltip text={hasApiKey === false || hasApiKey === null ? "Setup Voice Input" : recordingState === "idle" ? "Voice Input" : recordingState === "recording" ? "Stop Recording" : "Processing..."} position="top">
    <button
      onclick={handleClick}
      disabled={disabled || recordingState === "processing"}
      class={`relative p-2 rounded-lg transition-all cursor-pointer ${
        recordingState === "idle"
          ? hasApiKey === false || hasApiKey === null
            ? "text-amber-500 hover:text-amber-600 hover:bg-amber-50"
            : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          : recordingState === "recording"
          ? "text-white bg-red-500 hover:bg-red-600 animate-pulse"
          : "text-gray-400 bg-gray-100 cursor-wait"
      } disabled:opacity-30 disabled:cursor-not-allowed`}
    >
    {#if recordingState === "processing"}
      <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    {:else if recordingState === "recording"}
      <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <rect x="6" y="6" width="12" height="12" rx="2" />
      </svg>
    {:else}
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
      </svg>
    {/if}
    
    {#if (hasApiKey === false || hasApiKey === null) && recordingState === "idle"}
      <span class="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full border-2 border-white"></span>
    {/if}
  </button>
  </Tooltip>

  {#if error}
    <div class="absolute bottom-full right-0 mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 max-w-[280px]">
      <div class="break-words">{error}</div>
      <div class="flex items-center gap-2 mt-2 pt-2 border-t border-red-200">
        {#if lastAudioBlob}
          <button
            onclick={retryTranscription}
            disabled={recordingState === "processing"}
            class="flex items-center gap-1 px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs font-medium transition-colors disabled:opacity-50"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Retry
          </button>
        {/if}
        <button
          onclick={() => { error = null; lastAudioBlob = null; }}
          class="flex items-center gap-1 px-2 py-1 text-red-500 hover:text-red-700 text-xs transition-colors ml-auto"
          title="Dismiss"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Dismiss
        </button>
      </div>
    </div>
  {/if}
</div>

{#if showApiKeyModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/30">
    <div class="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
      <div class="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="p-2 bg-amber-100 rounded-lg">
            <svg class="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <h3 class="font-semibold text-base text-gray-900">Voice Input Setup</h3>
        </div>
        <button
          onclick={closeModal}
          class="p-1 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="p-6 space-y-4">
        <div class="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <svg class="w-5 h-5 text-amber-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div class="text-sm text-amber-800">
            <p class="font-medium">OpenAI API key required</p>
            <p class="text-amber-700 mt-0.5">Voice input uses OpenAI's Whisper for transcription. Add your API key below or set <code class="bg-amber-100 px-1 py-0.5 rounded text-xs">OPENAI_API_KEY</code> in your environment.</p>
          </div>
        </div>

        <div class="space-y-1.5">
          <label class="text-xs font-medium text-gray-700">OpenAI API Key</label>
          <input
            type="password"
            bind:value={apiKeyInput}
            placeholder="sk-..."
            class="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 font-mono focus:border-gray-900 focus:outline-none focus:ring-0 transition-colors placeholder:text-gray-400"
            onkeydown={(e) => e.key === "Enter" && saveApiKey()}
          />
        </div>

        {#if apiKeyError}
          <div class="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {apiKeyError}
          </div>
        {/if}

        <div class="flex gap-2">
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            class="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Get API Key
          </a>
        </div>

        <p class="text-xs text-gray-500 text-center">
          Key will be securely stored in Navi's database
        </p>
      </div>

      <div class="px-6 py-4 bg-gray-50 flex justify-end gap-3 border-t border-gray-100">
        <button
          onclick={closeModal}
          class="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={saveApiKey}
          disabled={savingKey || !apiKeyInput.trim()}
          class="px-4 py-2 text-sm font-medium bg-gray-900 hover:bg-black text-white rounded-lg shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {savingKey ? "Saving..." : "Save & Enable Voice"}
        </button>
      </div>
    </div>
  </div>
{/if}
