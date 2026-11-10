import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { MealType, PrismaClient } from "../src/generated/prisma/client.js";

type MealSeed = {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  category: MealType;
  isVegetarian?: boolean;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  servings: number;
  finalWeightG: number;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  ingredients: Array<{ name: string; amountG: number }>;
  cookingSteps: Array<{
    stepNumber: number;
    title: string;
    instruction: string;
  }>;
};

const meals: MealSeed[] = [
  {
    id: "a0100000-0000-4000-8000-000000000001",
    name: "Phở gà",
    description:
      "Phở gà nước dùng thanh, thịt gà xé, bánh phở mềm và rau thơm. Định lượng cho một tô.",
    imageUrl:
      "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=900&q=80",
    category: MealType.BREAKFAST,
    prepTimeMinutes: 20,
    cookTimeMinutes: 35,
    servings: 1,
    finalWeightG: 550,
    caloriesPer100g: 82,
    proteinPer100g: 6.1,
    carbsPer100g: 11.5,
    fatPer100g: 1.2,
    ingredients: [
      { name: "Bánh phở tươi", amountG: 180 },
      { name: "Ức gà bỏ da", amountG: 100 },
      { name: "Nước dùng gà", amountG: 230 },
      { name: "Hành tây", amountG: 20 },
      { name: "Hành lá", amountG: 8 },
      { name: "Rau mùi", amountG: 5 },
      { name: "Gừng", amountG: 5 },
      { name: "Nước mắm", amountG: 2 },
    ],
    cookingSteps: [
      {
        stepNumber: 1,
        title: "Luộc gà",
        instruction:
          "Cho ức gà và gừng vào nồi nước dùng đang sôi nhẹ. Nấu đến khi gà chín hoàn toàn, vớt ra để nguội rồi xé sợi.",
      },
      {
        stepNumber: 2,
        title: "Nêm nước dùng",
        instruction:
          "Nêm nước dùng với nước mắm vừa ăn. Hạ lửa nhỏ và giữ nước dùng nóng.",
      },
      {
        stepNumber: 3,
        title: "Trụng bánh phở",
        instruction:
          "Trụng bánh phở trong nước sôi khoảng 20–30 giây, để ráo rồi cho vào tô.",
      },
      {
        stepNumber: 4,
        title: "Hoàn thiện tô phở",
        instruction:
          "Xếp gà, hành tây, hành lá và rau mùi lên bánh phở. Chan nước dùng nóng và dùng ngay.",
      },
    ],
  },
  {
    id: "a0100000-0000-4000-8000-000000000002",
    name: "Yến mạch sữa chua chuối",
    description:
      "Bữa sáng nhanh với yến mạch, sữa chua không đường, chuối và hạt chia.",
    imageUrl:
      "https://images.unsplash.com/photo-1517673132405-a56a62b18caf?auto=format&fit=crop&w=900&q=80",
    category: MealType.BREAKFAST,
    isVegetarian: true,
    prepTimeMinutes: 10,
    cookTimeMinutes: 0,
    servings: 1,
    finalWeightG: 340,
    caloriesPer100g: 112,
    proteinPer100g: 4.7,
    carbsPer100g: 18.2,
    fatPer100g: 2.5,
    ingredients: [
      { name: "Yến mạch cán dẹt", amountG: 50 },
      { name: "Sữa chua không đường", amountG: 100 },
      { name: "Chuối", amountG: 100 },
      { name: "Sữa tươi ít béo", amountG: 80 },
      { name: "Hạt chia", amountG: 8 },
      { name: "Mật ong", amountG: 5 },
    ],
    cookingSteps: [
      {
        stepNumber: 1,
        title: "Chuẩn bị yến mạch",
        instruction:
          "Trộn yến mạch với sữa tươi, để mềm khoảng 5 phút hoặc ngâm qua đêm trong tủ lạnh.",
      },
      {
        stepNumber: 2,
        title: "Sơ chế chuối",
        instruction: "Bóc vỏ chuối và cắt thành lát vừa ăn.",
      },
      {
        stepNumber: 3,
        title: "Xếp tô",
        instruction:
          "Cho yến mạch vào tô, thêm sữa chua và chuối. Rắc hạt chia, thêm mật ong rồi dùng lạnh.",
      },
    ],
  },
  {
    id: "a0100000-0000-4000-8000-000000000003",
    name: "Cơm gà áp chảo rau củ",
    description:
      "Ức gà áp chảo ăn cùng cơm gạo lứt, bông cải xanh và cà rốt cho bữa trưa cân bằng.",
    imageUrl:
      "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=80",
    category: MealType.LUNCH,
    prepTimeMinutes: 15,
    cookTimeMinutes: 25,
    servings: 1,
    finalWeightG: 430,
    caloriesPer100g: 143,
    proteinPer100g: 10.4,
    carbsPer100g: 17.1,
    fatPer100g: 3.5,
    ingredients: [
      { name: "Ức gà bỏ da", amountG: 140 },
      { name: "Cơm gạo lứt đã nấu", amountG: 150 },
      { name: "Bông cải xanh", amountG: 70 },
      { name: "Cà rốt", amountG: 40 },
      { name: "Dầu ô liu", amountG: 5 },
      { name: "Tỏi", amountG: 5 },
      { name: "Nước tương ít muối", amountG: 8 },
    ],
    cookingSteps: [
      {
        stepNumber: 1,
        title: "Ướp gà",
        instruction:
          "Thấm khô ức gà, ướp với nước tương, tỏi băm và một ít tiêu trong 10 phút.",
      },
      {
        stepNumber: 2,
        title: "Luộc rau củ",
        instruction:
          "Cắt bông cải và cà rốt vừa ăn, hấp hoặc luộc khoảng 4–6 phút đến khi chín tới.",
      },
      {
        stepNumber: 3,
        title: "Áp chảo gà",
        instruction:
          "Làm nóng dầu trên chảo, áp chảo gà mỗi mặt khoảng 5–7 phút đến khi chín hoàn toàn. Để nghỉ vài phút rồi thái lát.",
      },
      {
        stepNumber: 4,
        title: "Dọn cơm",
        instruction:
          "Cho cơm gạo lứt, gà và rau củ vào đĩa. Rưới phần nước tiết ra khi áp chảo nếu muốn.",
      },
    ],
  },
  {
    id: "a0100000-0000-4000-8000-000000000004",
    name: "Bún bò xào sả",
    description:
      "Bún tươi trộn thịt bò xào sả, rau sống và nước mắm chua ngọt.",
    imageUrl:
      "https://images.unsplash.com/photo-1559314809-0d155014e29e?auto=format&fit=crop&w=900&q=80",
    category: MealType.LUNCH,
    prepTimeMinutes: 20,
    cookTimeMinutes: 12,
    servings: 1,
    finalWeightG: 400,
    caloriesPer100g: 137,
    proteinPer100g: 9.5,
    carbsPer100g: 15.2,
    fatPer100g: 4.4,
    ingredients: [
      { name: "Bún tươi", amountG: 180 },
      { name: "Thịt bò nạc", amountG: 110 },
      { name: "Sả", amountG: 12 },
      { name: "Xà lách", amountG: 35 },
      { name: "Giá đỗ", amountG: 25 },
      { name: "Dưa leo", amountG: 25 },
      { name: "Đậu phộng rang", amountG: 8 },
      { name: "Dầu ăn", amountG: 4 },
      { name: "Nước mắm", amountG: 8 },
    ],
    cookingSteps: [
      {
        stepNumber: 1,
        title: "Sơ chế",
        instruction:
          "Thái bò thành lát mỏng, băm sả. Rửa sạch xà lách, giá và dưa leo; để ráo rồi cắt vừa ăn.",
      },
      {
        stepNumber: 2,
        title: "Xào thịt bò",
        instruction:
          "Làm nóng dầu, phi thơm sả rồi cho bò vào xào nhanh trên lửa lớn đến khi vừa chín. Nêm một phần nước mắm.",
      },
      {
        stepNumber: 3,
        title: "Pha nước trộn",
        instruction:
          "Khuấy phần nước mắm còn lại với một ít nước ấm và nước cốt chanh; điều chỉnh vị chua ngọt theo khẩu vị.",
      },
      {
        stepNumber: 4,
        title: "Trình bày",
        instruction:
          "Xếp bún và rau vào tô, thêm thịt bò, dưa leo, giá và đậu phộng. Chan nước trộn trước khi ăn.",
      },
    ],
  },
  {
    id: "a0100000-0000-4000-8000-000000000005",
    name: "Cá hồi áp chảo cơm gạo lứt",
    description:
      "Cá hồi áp chảo dùng với cơm gạo lứt, măng tây và chanh tươi.",
    imageUrl:
      "https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=900&q=80",
    category: MealType.DINNER,
    prepTimeMinutes: 12,
    cookTimeMinutes: 18,
    servings: 1,
    finalWeightG: 400,
    caloriesPer100g: 159,
    proteinPer100g: 10.8,
    carbsPer100g: 13.6,
    fatPer100g: 6.5,
    ingredients: [
      { name: "Phi lê cá hồi", amountG: 130 },
      { name: "Cơm gạo lứt đã nấu", amountG: 150 },
      { name: "Măng tây", amountG: 70 },
      { name: "Cà chua bi", amountG: 35 },
      { name: "Dầu ô liu", amountG: 5 },
      { name: "Nước cốt chanh", amountG: 8 },
      { name: "Tỏi", amountG: 2 },
    ],
    cookingSteps: [
      {
        stepNumber: 1,
        title: "Chuẩn bị cá và rau",
        instruction:
          "Thấm khô cá hồi, nêm nhẹ muối và tiêu. Rửa măng tây, bỏ phần gốc già và cắt đôi cà chua.",
      },
      {
        stepNumber: 2,
        title: "Áp chảo cá hồi",
        instruction:
          "Làm nóng chảo với dầu. Áp chảo cá hồi khoảng 3–4 phút mỗi mặt, điều chỉnh thời gian theo độ dày miếng cá.",
      },
      {
        stepNumber: 3,
        title: "Xào rau",
        instruction:
          "Dùng chảo vừa áp cá, xào tỏi và măng tây 3–4 phút; thêm cà chua bi và đảo đến khi nóng.",
      },
      {
        stepNumber: 4,
        title: "Hoàn thiện",
        instruction:
          "Dọn cá cùng cơm gạo lứt và rau. Vắt nước chanh lên cá ngay trước khi dùng.",
      },
    ],
  },
  {
    id: "a0100000-0000-4000-8000-000000000006",
    name: "Đậu hũ sốt cà chua",
    description:
      "Đậu hũ mềm sốt cà chua và nấm, dùng cùng cơm nóng cho bữa tối đơn giản.",
    imageUrl:
      "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=80",
    category: MealType.DINNER,
    isVegetarian: true,
    prepTimeMinutes: 15,
    cookTimeMinutes: 18,
    servings: 1,
    finalWeightG: 360,
    caloriesPer100g: 91,
    proteinPer100g: 6.2,
    carbsPer100g: 5.8,
    fatPer100g: 4.2,
    ingredients: [
      { name: "Đậu hũ trắng", amountG: 180 },
      { name: "Cà chua", amountG: 100 },
      { name: "Nấm đùi gà", amountG: 55 },
      { name: "Hành tím", amountG: 10 },
      { name: "Dầu ăn", amountG: 5 },
      { name: "Nước tương", amountG: 8 },
      { name: "Hành lá", amountG: 5 },
    ],
    cookingSteps: [
      {
        stepNumber: 1,
        title: "Sơ chế nguyên liệu",
        instruction:
          "Cắt đậu hũ thành miếng vuông, thái cà chua và nấm. Băm nhỏ hành tím, cắt hành lá.",
      },
      {
        stepNumber: 2,
        title: "Nấu sốt cà chua",
        instruction:
          "Phi thơm hành tím với dầu, cho cà chua vào đảo đến khi mềm. Thêm một ít nước và nước tương.",
      },
      {
        stepNumber: 3,
        title: "Om đậu hũ và nấm",
        instruction:
          "Cho nấm và đậu hũ vào chảo, đảo nhẹ để không vỡ. Đậy nắp om lửa nhỏ khoảng 8 phút.",
      },
      {
        stepNumber: 4,
        title: "Nêm và dọn món",
        instruction:
          "Nếm lại nước sốt, rắc hành lá rồi tắt bếp. Dùng nóng với cơm hoặc rau luộc.",
      },
    ],
  },
  {
    id: "a0100000-0000-4000-8000-000000000007",
    name: "Salad ức gà bơ",
    description:
      "Salad rau xanh với ức gà nướng, bơ và sốt chanh dầu ô liu.",
    imageUrl:
      "https://images.unsplash.com/photo-1546793665-c74683f339c1?auto=format&fit=crop&w=900&q=80",
    category: MealType.DINNER,
    prepTimeMinutes: 15,
    cookTimeMinutes: 12,
    servings: 1,
    finalWeightG: 350,
    caloriesPer100g: 132,
    proteinPer100g: 11.3,
    carbsPer100g: 6.8,
    fatPer100g: 6.1,
    ingredients: [
      { name: "Ức gà bỏ da", amountG: 110 },
      { name: "Bơ", amountG: 55 },
      { name: "Xà lách", amountG: 65 },
      { name: "Cà chua bi", amountG: 55 },
      { name: "Dưa leo", amountG: 40 },
      { name: "Dầu ô liu", amountG: 6 },
      { name: "Nước cốt chanh", amountG: 10 },
      { name: "Mù tạt", amountG: 4 },
    ],
    cookingSteps: [
      {
        stepNumber: 1,
        title: "Nướng ức gà",
        instruction:
          "Ướp gà với muối tiêu, nướng hoặc áp chảo đến khi chín hoàn toàn. Để nghỉ rồi thái lát.",
      },
      {
        stepNumber: 2,
        title: "Sơ chế rau",
        instruction:
          "Rửa sạch xà lách, cà chua và dưa leo. Cắt bơ và dưa leo thành miếng vừa ăn.",
      },
      {
        stepNumber: 3,
        title: "Pha sốt",
        instruction:
          "Trộn dầu ô liu, nước cốt chanh, mù tạt và một ít tiêu thành sốt.",
      },
      {
        stepNumber: 4,
        title: "Trộn salad",
        instruction:
          "Cho rau và cà chua vào tô, thêm gà và bơ. Rưới sốt ngay trước khi ăn.",
      },
    ],
  },
  {
    id: "a0100000-0000-4000-8000-000000000008",
    name: "Sữa chua trái cây hạt chia",
    description:
      "Món ăn nhẹ mát lạnh từ sữa chua không đường, xoài, dâu tây và hạt chia.",
    imageUrl:
      "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=900&q=80",
    category: MealType.SNACK,
    isVegetarian: true,
    prepTimeMinutes: 8,
    cookTimeMinutes: 0,
    servings: 1,
    finalWeightG: 250,
    caloriesPer100g: 89,
    proteinPer100g: 4.4,
    carbsPer100g: 13.4,
    fatPer100g: 2.1,
    ingredients: [
      { name: "Sữa chua không đường", amountG: 130 },
      { name: "Xoài chín", amountG: 55 },
      { name: "Dâu tây", amountG: 45 },
      { name: "Hạt chia", amountG: 8 },
      { name: "Mật ong", amountG: 5 },
    ],
    cookingSteps: [
      {
        stepNumber: 1,
        title: "Sơ chế trái cây",
        instruction:
          "Rửa dâu tây, bỏ cuống và cắt miếng. Gọt xoài, bỏ hạt rồi cắt hạt lựu.",
      },
      {
        stepNumber: 2,
        title: "Xếp món",
        instruction:
          "Cho sữa chua vào ly hoặc tô, thêm xoài và dâu tây. Rắc hạt chia, thêm mật ong và dùng lạnh.",
      },
    ],
  },
];

const main = async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to seed meal data");
  }

  const databaseHost = new URL(connectionString).hostname;
  const isLocalDatabase = ["localhost", "127.0.0.1", "::1"].includes(
    databaseHost,
  );
  if (!isLocalDatabase && process.env.ALLOW_NON_LOCAL_SEED !== "1") {
    throw new Error(
      `Refusing to seed non-local database host "${databaseHost}". Set ALLOW_NON_LOCAL_SEED=1 only when this is intentional.`,
    );
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    await prisma.$transaction(async (transaction) => {
      for (const meal of meals) {
        const { ingredients, cookingSteps, ...mealData } = meal;
        await transaction.meal.upsert({
          where: { id: meal.id },
          create: {
            ...mealData,
            ingredients: { create: ingredients },
            cookingSteps: { create: cookingSteps },
          },
          update: {
            ...mealData,
            ingredients: { deleteMany: {}, create: ingredients },
            cookingSteps: { deleteMany: {}, create: cookingSteps },
          },
        });
      }
    });

    console.log(`Seeded ${meals.length} meals with ingredients and cooking steps.`);
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error: unknown) => {
  console.error("Meal seed failed:", error);
  process.exitCode = 1;
});
