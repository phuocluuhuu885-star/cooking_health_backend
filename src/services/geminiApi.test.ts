import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_GEMINI_MODEL,
  fetchGeminiWithFallback,
  fetchGeminiWithRetry,
  getGeminiApiErrorMessage,
  getGeminiModelName,
} from "./geminiApi.js";

test("falls back to a secondary model when the configured model is overloaded", async () => {
  const requestedModels: string[] = [];
  const result = await fetchGeminiWithFallback(
    async (model) => {
      requestedModels.push(model);
      return new Response(null, {
        status: model === "primary-model" ? 503 : 200,
      });
    },
    "primary-model",
    ["fallback-model"]
  );

  assert.deepEqual(requestedModels, ["primary-model", "fallback-model"]);
  assert.equal(result.model, "fallback-model");
  assert.equal(result.response.status, 200);
});

test("switches to the next model when a model request times out", async () => {
  const requestedModels: string[] = [];
  const result = await fetchGeminiWithFallback(
    async (model) => {
      requestedModels.push(model);
      if (model === "primary-model") {
        throw new DOMException("Request timed out", "TimeoutError");
      }
      return new Response(null, { status: 200 });
    },
    "primary-model",
    ["fallback-model"],
    10
  );

  assert.deepEqual(requestedModels, ["primary-model", "fallback-model"]);
  assert.equal(result.model, "fallback-model");
  assert.equal(result.response.status, 200);
});

test("reports a bounded timeout after every model times out", async () => {
  await assert.rejects(
    fetchGeminiWithFallback(
      async () => {
        throw new DOMException("Request timed out", "TimeoutError");
      },
      "primary-model",
      ["fallback-model"],
      10
    ),
    /Gemini không phản hồi trong 0\.02 giây/
  );
});

test("does not switch models for non-overload errors", async () => {
  const requestedModels: string[] = [];
  const result = await fetchGeminiWithFallback(
    async (model) => {
      requestedModels.push(model);
      return new Response(null, { status: 400 });
    },
    "primary-model",
    ["fallback-model"]
  );

  assert.deepEqual(requestedModels, ["primary-model"]);
  assert.equal(result.model, "primary-model");
  assert.equal(result.response.status, 400);
});

test("uses a supported default model and normalizes a resource name", () => {
  assert.equal(DEFAULT_GEMINI_MODEL, "gemini-3.5-flash-lite");
  assert.equal(getGeminiModelName(undefined), "gemini-3.5-flash-lite");
  assert.equal(getGeminiModelName("  gemini-3.8-flash  "), "gemini-3.8-flash");
  assert.equal(
    getGeminiModelName("models/gemini-3.8-flash"),
    "gemini-3.8-flash"
  );
  assert.equal(
    getGeminiModelName("gemini-2.5flash"),
    "gemini-3.5-flash-lite"
  );
});

test("explains model-not-found responses with Gemini's error message", async () => {
  const error = await getGeminiApiErrorMessage(
    new Response(
      JSON.stringify({
        error: {
          message:
            "This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash.",
        },
      }),
      { status: 404 }
    ),
    "gemini-2.5-flash"
  );
  assert.match(error, /không thể sử dụng model/);
  assert.match(error, /no longer available to new users/);
  assert.match(error, /models\/gemini-3\.8-flash/);
});

test("reports other Gemini HTTP errors without masking provider details", async () => {
  const error = await getGeminiApiErrorMessage(
    new Response(JSON.stringify({ error: { message: "Quota exceeded" } }), {
      status: 429,
    }),
    "gemini-2.5-flash"
  );
  assert.match(error, /HTTP 429/);
  assert.match(error, /Quota exceeded/);
});

test("retries temporary overload responses before returning success", async () => {
  const statuses = [503, 503, 200];
  const delays: number[] = [];
  let attempts = 0;
  const response = await fetchGeminiWithRetry(
    async () => new Response(null, { status: statuses[attempts++] ?? 503 }),
    async (milliseconds) => {
      delays.push(milliseconds);
    }
  );

  assert.equal(response.status, 200);
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [1_000, 2_000]);
});

test("does not retry non-transient Gemini errors", async () => {
  let attempts = 0;
  const response = await fetchGeminiWithRetry(async () => {
    attempts += 1;
    return new Response(null, { status: 400 });
  });

  assert.equal(response.status, 400);
  assert.equal(attempts, 1);
});

test("explains Gemini overload after bounded retries are exhausted", async () => {
  let attempts = 0;
  const response = await fetchGeminiWithRetry(
    async () => {
      attempts += 1;
      return new Response(
        JSON.stringify({
          error: {
            message: "This model is currently experiencing high demand.",
          },
        }),
        { status: 503 }
      );
    },
    async () => {}
  );
  const error = await getGeminiApiErrorMessage(response, "gemini-3.8-flash");

  assert.equal(attempts, 3);
  assert.match(error, /quá tải tạm thời/);
  assert.match(error, /high demand/);
});
