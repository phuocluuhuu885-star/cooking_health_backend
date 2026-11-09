const OUT_OF_SCOPE_TERMS = [
  "tổng thống",
  "president",
  "chính trị",
  "bầu cử",
  "thủ tướng",
  "tin tức",
  "thời tiết",
  "bóng đá",
  "chứng khoán",
  "crypto",
  "bitcoin",
  "người nổi tiếng",
  "ca sĩ",
  "diễn viên",
  "messi",
  "taylor swift",
  "elon musk",
  "chiến tranh",
  "code",
  "lập trình",
  "viết truyện",
  "poem",
  "poetry",
  "presidential",
];

const MEAL_SCOPE_TERMS = [
  "ăn",
  "bữa",
  "món",
  "thực đơn",
  "calo",
  "kcal",
  "dinh dưỡng",
  "đạm",
  "chất đạm",
  "protein",
  "tinh bột",
  "chất béo",
  "nguyên liệu",
  "công thức",
  "đi chợ",
  "khẩu phần",
  "recipe",
  "meal",
  "food",
  "calorie",
  "nutrition",
];

const APP_SCOPE_TERMS = [
  "mealcraft",
  "ứng dụng",
  "app",
  "tài khoản",
  "hồ sơ sức khỏe",
  "thư viện món",
  "đi bộ",
  "bước chân",
  "gia đình",
  "bình chọn",
  "ghi nhận",
];

export type MealChatIntent =
  "INTAKE" | "TODAY_MENU" | "RECOMMENDATION" | "GENERAL";

export const getMealChatIntent = (question: string): MealChatIntent => {
  const normalized = question.toLocaleLowerCase("vi");
  if (
    /đã (ăn|tiêu thụ|ghi nhận)|đã nạp|lượng calo|bao nhiêu calo|bao nhiêu kcal/.test(
      normalized,
    ) ||
    (/bao nhiêu|tổng|đã ăn|đã nạp/.test(normalized) &&
      /calo|kcal|đạm|protein|tinh bột|chất béo|dinh dưỡng/.test(normalized))
  ) {
    return "INTAKE";
  }
  if (/nên ăn|gợi ý|đề xuất|món nào phù hợp|ăn gì|nên chọn/.test(normalized)) {
    return "RECOMMENDATION";
  }
  if (
    /thực đơn|đã lên kế hoạch|đã lên lịch|đã chọn món|có món nào/.test(
      normalized,
    )
  ) {
    return "TODAY_MENU";
  }
  return "GENERAL";
};

export const isMealCraftQuestion = (question: string): boolean => {
  const normalized = question.toLocaleLowerCase("vi");
  if (OUT_OF_SCOPE_TERMS.some((term) => normalized.includes(term))) {
    return false;
  }
  const mentionsMealData = MEAL_SCOPE_TERMS.some((term) =>
    normalized.includes(term),
  );
  const asksAboutOwnMeals =
    (normalized.includes("tôi") || normalized.includes("mình")) &&
    mentionsMealData;
  const asksAboutMealCraftFeature =
    APP_SCOPE_TERMS.some((term) => normalized.includes(term)) &&
    (mentionsMealData || normalized.includes("bước chân"));
  const asksAboutNutritionOrRecipes = [
    "calo",
    "kcal",
    "dinh dưỡng",
    "protein",
    "chất đạm",
    "tinh bột",
    "chất béo",
    "nguyên liệu",
    "công thức",
    "recipe",
    "nutrition",
    "calorie",
  ].some((term) => normalized.includes(term));
  const asksAboutMealPlan =
    normalized.includes("thực đơn") ||
    normalized.includes("trong thư viện") ||
    normalized.includes("gợi ý món") ||
    normalized.includes("gợi ý bữa");
  const asksForMealSuggestion =
    /ăn gì|nên chọn món|đề xuất món|gợi ý (?:món|bữa)/.test(normalized);

  return (
    asksAboutOwnMeals ||
    asksAboutMealCraftFeature ||
    asksAboutNutritionOrRecipes ||
    asksAboutMealPlan ||
    asksForMealSuggestion
  );
};

export const MEALCRAFT_CHAT_SCOPE_MESSAGE =
  "Mình chỉ hỗ trợ các nội dung trong MealCraft như món ăn trong thư viện, thực đơn, dinh dưỡng đã ghi nhận và cách dùng tính năng của ứng dụng. Bạn hãy thử hỏi về một trong các nội dung đó nhé.";
