import assert from "node:assert/strict";
import test from "node:test";
import {
  getMealChatIntent,
  isMealCraftQuestion,
  MEALCRAFT_CHAT_SCOPE_MESSAGE,
} from "./aiMealChatService.js";

test("accepts questions about today's meals and consumed nutrition", () => {
  assert.equal(isMealCraftQuestion("Hôm nay trưa tôi ăn gì?"), true);
  assert.equal(
    isMealCraftQuestion("Tôi đã tiêu thụ bao nhiêu calo hôm nay?"),
    true,
  );
  assert.equal(
    isMealCraftQuestion("Bữa tối còn món nào trong thực đơn?"),
    true,
  );
});

test("accepts MealCraft app help questions", () => {
  assert.equal(
    isMealCraftQuestion("Làm sao ghi nhận món đã ăn trong app?"),
    true,
  );
  assert.equal(isMealCraftQuestion("MealCraft có tính bước chân không?"), true);
});

test("rejects unrelated questions even when they mention eating", () => {
  assert.equal(
    isMealCraftQuestion("Hôm nay bên Mỹ ông tổng thống ăn gì?"),
    false,
  );
  assert.equal(isMealCraftQuestion("Messi hôm nay ăn gì?"), false);
  assert.equal(isMealCraftQuestion("Thời tiết Hà Nội hôm nay thế nào?"), false);
  assert.equal(isMealCraftQuestion("Viết giúp tôi một đoạn code."), false);
  assert.match(MEALCRAFT_CHAT_SCOPE_MESSAGE, /MealCraft/);
});

test("classifies fast database answers separately from recommendations", () => {
  assert.equal(
    getMealChatIntent("Tôi đã tiêu thụ bao nhiêu calo hôm nay?"),
    "INTAKE",
  );
  assert.equal(getMealChatIntent("Hôm nay tôi ăn bao nhiêu đạm?"), "INTAKE");
  assert.equal(getMealChatIntent("Hôm nay trưa tôi ăn gì?"), "RECOMMENDATION");
  assert.equal(
    getMealChatIntent("Bữa trưa hôm nay có món nào trong thực đơn?"),
    "TODAY_MENU",
  );
  assert.equal(
    getMealChatIntent("MealCraft có tính bước chân không?"),
    "GENERAL",
  );
});

test("classifies meal suggestions as recommendations within MealCraft scope", () => {
  for (const question of [
    "Hôm nay ăn gì?",
    "Hôm nay tôi nên ăn gì?",
    "Tôi ăn gì cho bữa trưa?",
    "Gợi ý món ăn tối phù hợp với tôi",
  ]) {
    assert.equal(isMealCraftQuestion(question), true);
    assert.equal(getMealChatIntent(question), "RECOMMENDATION");
  }
});
