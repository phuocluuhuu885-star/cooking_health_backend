import assert from "node:assert/strict";
import test from "node:test";
import {
  getCommunityMealModerationOutcome,
  parseCommunityMealModerationDecision,
} from "./communityMealModerationService.js";

test("parses a confident approval decision", () => {
  assert.deepEqual(
    parseCommunityMealModerationDecision({
      decision: "APPROVE",
      confidence: 0.99,
      reason: "Công thức món ăn phù hợp.",
    }),
    {
      decision: "APPROVE",
      confidence: 0.99,
      reason: "Công thức món ăn phù hợp.",
    },
  );
});

test("rejects malformed or out-of-range moderation results", () => {
  assert.throws(() =>
    parseCommunityMealModerationDecision({
      decision: "APPROVE",
      confidence: 1.1,
      reason: "Không hợp lệ.",
    }),
  );
  assert.throws(() =>
    parseCommunityMealModerationDecision({
      decision: "DELETE",
      confidence: 0.99,
      reason: "Không hợp lệ.",
    }),
  );
});

test("keeps uncertain AI decisions in the manual review queue", () => {
  assert.equal(
    getCommunityMealModerationOutcome({
      decision: "APPROVE",
      confidence: 0.94,
      reason: "Chưa đủ chắc chắn.",
    }),
    "PENDING",
  );
  assert.equal(
    getCommunityMealModerationOutcome({
      decision: "REVIEW",
      confidence: 1,
      reason: "Cần admin kiểm tra.",
    }),
    "PENDING",
  );
});

test("automatically resolves only high-confidence approval or rejection", () => {
  assert.equal(
    getCommunityMealModerationOutcome({
      decision: "APPROVE",
      confidence: 0.95,
      reason: "Công thức phù hợp.",
    }),
    "APPROVED",
  );
  assert.equal(
    getCommunityMealModerationOutcome({
      decision: "REJECT",
      confidence: 0.99,
      reason: "Nội dung không phải công thức.",
    }),
    "REJECTED",
  );
});
