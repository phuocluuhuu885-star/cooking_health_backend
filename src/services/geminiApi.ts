export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
export const GEMINI_FALLBACK_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.8-flash",
] as const;
export const GEMINI_MODEL_TIMEOUT_MS = 5_000;
const GEMINI_RETRY_DELAYS_MS = [1_000, 2_000];

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export const fetchGeminiWithRetry = async (
  request: () => Promise<Response>,
  waitForRetry: (milliseconds: number) => Promise<void> = wait
): Promise<Response> => {
  for (let attempt = 0; ; attempt += 1) {
    const response = await request();
    const retryDelay = GEMINI_RETRY_DELAYS_MS[attempt];
    if (![429, 503].includes(response.status) || retryDelay === undefined) {
      return response;
    }

    await response.body?.cancel();
    await waitForRetry(retryDelay);
  }
};

export const fetchGeminiWithFallback = async (
  request: (model: string, signal: AbortSignal) => Promise<Response>,
  primaryModel: string,
  fallbackModels: readonly string[] = GEMINI_FALLBACK_MODELS,
  modelTimeoutMs = GEMINI_MODEL_TIMEOUT_MS
): Promise<{ model: string; response: Response }> => {
  const models = [...new Set([primaryModel, ...fallbackModels])];

  for (const [index, model] of models.entries()) {
    let response: Response;
    try {
      response = await request(model, AbortSignal.timeout(modelTimeoutMs));
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "TimeoutError")) {
        throw error;
      }
      if (index === models.length - 1) {
        throw new Error(
          `Gemini không phản hồi trong ${
            (models.length * modelTimeoutMs) / 1000
          } giây sau khi đã thử các model dự phòng.`,
          { cause: error }
        );
      }
      continue;
    }

    if (![429, 503].includes(response.status) || index === models.length - 1) {
      return { model, response };
    }
    await response.body?.cancel();
  }

  throw new Error(
    `Gemini không phản hồi trong ${
      (models.length * modelTimeoutMs) / 1000
    } giây sau khi đã thử các model dự phòng.`
  );
};

export const getGeminiModelName = (configuredModel: string | undefined) => {
  const model = configuredModel?.trim() || DEFAULT_GEMINI_MODEL;
  const normalizedModel = model.replace(/^models\//, "");
  if (normalizedModel === "gemini-2.5flash") {
    return DEFAULT_GEMINI_MODEL;
  }
  return normalizedModel;
};

export const getGeminiApiErrorMessage = async (
  response: Response,
  model: string
): Promise<string> => {
  let providerMessage = "";
  try {
    const payload: unknown = await response.json();
    if (typeof payload === "object" && payload !== null) {
      const error = (payload as { error?: { message?: unknown } }).error;
      if (typeof error?.message === "string") {
        providerMessage = error.message.trim();
      }
    }
  } catch {
    providerMessage = response.statusText;
  }

  const detail = providerMessage
    ? ` Google Gemini trả về: ${providerMessage}`
    : "";
  if (response.status === 404) {
    return `Gemini không thể sử dụng model "${model}" (HTTP 404). Kiểm tra GEMINI_MODEL ở backend.${detail}`;
  }
  if (response.status === 503) {
    return `Gemini đang quá tải tạm thời (HTTP 503). Vui lòng thử lại sau.${detail}`;
  }
  return `Gemini API trả về lỗi HTTP ${response.status}.${detail}`;
};
