const tokenStorageKey = "mealcraft-admin-token";
const pageSize = 20;
const state = {
  token: sessionStorage.getItem(tokenStorageKey),
  currentUserId: sessionStorage.getItem("mealcraft-admin-user-id"),
  page: 1,
  totalPages: 0,
  totalItems: 0,
  meals: [],
  userPage: 1,
  userTotalPages: 0,
  userTotalItems: 0,
  users: [],
  activeView: "meals",
  editingId: null,
  loading: false,
  loadingUsers: false,
};

const loginView = document.getElementById("login-view");
const dashboardView = document.getElementById("dashboard-view");
const loginForm = document.getElementById("login-form");
const loginMessage = document.getElementById("login-message");
const dashboardMessage = document.getElementById("dashboard-message");
const logoutButton = document.getElementById("logout-button");
const adminNav = document.getElementById("admin-nav");
const mealDialog = document.getElementById("meal-dialog");
const mealForm = document.getElementById("meal-form");
const formMessage = document.getElementById("form-message");
const saveMealButton = document.getElementById("save-meal");
const mealRows = document.getElementById("meal-rows");
const ingredientsList = document.getElementById("ingredients-list");
const stepsList = document.getElementById("steps-list");

const categoryLabels = {
  BREAKFAST: "Bữa sáng",
  LUNCH: "Bữa trưa",
  DINNER: "Bữa tối",
  SNACK: "Ăn nhẹ",
};

function showNotice(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("hidden", !message);
  element.classList.toggle("error", isError);
}

function setAuthenticated(isAuthenticated) {
  loginView.classList.toggle("hidden", isAuthenticated);
  dashboardView.classList.toggle("hidden", !isAuthenticated);
  logoutButton.classList.toggle("hidden", !isAuthenticated);
  adminNav.classList.toggle("hidden", !isAuthenticated);
}

async function requestApi(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (options.body) headers["Content-Type"] = "application/json";
  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => null);
  if (response.status === 401) {
    state.token = null;
    sessionStorage.removeItem(tokenStorageKey);
    setAuthenticated(false);
  }
  if (!response.ok) {
    throw new Error(payload?.message || `Yêu cầu thất bại (${response.status}).`);
  }
  return payload;
}

async function submitLogin(event) {
  event.preventDefault();
  showNotice(loginMessage, "");
  const fields = new FormData(loginForm);
  const submitButton = loginForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    const result = await requestApi("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: fields.get("email"),
        password: fields.get("password"),
      }),
    });
    state.token = result?.data?.user?.accessToken;
    if (!state.token) throw new Error("Đăng nhập không trả về phiên hợp lệ.");
    state.currentUserId = result.data.user.id;
    sessionStorage.setItem(tokenStorageKey, state.token);
    sessionStorage.setItem("mealcraft-admin-user-id", state.currentUserId);
    setAuthenticated(true);
    await loadMeals();
  } catch (error) {
    showNotice(loginMessage, error.message, true);
  } finally {
    submitButton.disabled = false;
  }
}

function logout() {
  state.token = null;
  state.currentUserId = null;
  sessionStorage.removeItem(tokenStorageKey);
  sessionStorage.removeItem("mealcraft-admin-user-id");
  setAuthenticated(false);
  loginForm.reset();
  showNotice(loginMessage, "");
}

function getFilters() {
  const params = new URLSearchParams({
    page: String(state.page),
    limit: String(pageSize),
    search: document.getElementById("search-input").value.trim(),
    category: document.getElementById("category-filter").value,
    vegetarian: document.getElementById("vegetarian-filter").value,
    published: document.getElementById("published-filter").value,
  });
  return params;
}

async function loadMeals() {
  if (!state.token || state.loading) return;
  state.loading = true;
  showNotice(dashboardMessage, "");
  try {
    const result = await requestApi(`/api/admin/meals?${getFilters()}`);
    state.meals = result.data;
    state.totalItems = result.pagination.totalItems;
    state.totalPages = result.pagination.totalPages;
    renderMeals();
  } catch (error) {
    showNotice(dashboardMessage, error.message, true);
  } finally {
    state.loading = false;
  }
}

function getUserFilters() {
  return new URLSearchParams({
    page: String(state.userPage),
    limit: String(pageSize),
    search: document.getElementById("user-search-input").value.trim(),
    status: document.getElementById("user-status-filter").value,
  });
}

async function loadUsers() {
  if (!state.token || state.loadingUsers) return;
  state.loadingUsers = true;
  showNotice(document.getElementById("users-message"), "");
  try {
    const result = await requestApi(`/api/admin/users?${getUserFilters()}`);
    state.users = result.data;
    state.userTotalItems = result.pagination.totalItems;
    state.userTotalPages = result.pagination.totalPages;
    renderUsers();
  } catch (error) {
    showNotice(document.getElementById("users-message"), error.message, true);
  } finally {
    state.loadingUsers = false;
  }
}

function formatCreatedAt(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Không rõ"
    : new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" }).format(date);
}

function createUserRow(user) {
  const row = document.createElement("tr");
  const accountCell = document.createElement("td");
  const account = document.createElement("div");
  account.className = "user-account";
  const fullName = document.createElement("strong");
  fullName.textContent = user.fullName || "Chưa cập nhật tên";
  const email = document.createElement("small");
  email.textContent = user.email;
  account.append(fullName, email);
  accountCell.append(account);

  const createdCell = document.createElement("td");
  createdCell.textContent = formatCreatedAt(user.createdAt);
  const profileCell = document.createElement("td");
  profileCell.append(
    createBadge(
      user.healthProfileCompleted ? "Đã hoàn thành" : "Chưa hoàn thành",
      user.healthProfileCompleted,
    ),
  );
  const statusCell = document.createElement("td");
  statusCell.append(
    createBadge(user.isActive ? "Đang hoạt động" : "Đã khóa", user.isActive),
  );

  const actionCell = document.createElement("td");
  const action = document.createElement("button");
  action.type = "button";
  action.className = "small-button";
  action.textContent = user.isActive ? "Khóa tài khoản" : "Mở khóa";
  action.disabled = user.id === state.currentUserId;
  if (action.disabled) action.title = "Không thể tự khóa tài khoản đang đăng nhập.";
  action.addEventListener("click", () => toggleUserStatus(user));
  actionCell.append(action);
  row.append(accountCell, createdCell, profileCell, statusCell, actionCell);
  return row;
}

function renderUsers() {
  const rows = state.users.map(createUserRow);
  if (rows.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.className = "muted";
    cell.textContent = "Không tìm thấy người dùng phù hợp.";
    row.append(cell);
    rows.push(row);
  }
  document.getElementById("user-rows").replaceChildren(...rows);
  document.getElementById("user-result-count").textContent =
    `${state.userTotalItems} người dùng`;
  document.getElementById("users-page-label").textContent =
    `Trang ${state.userPage} / ${Math.max(1, state.userTotalPages)}`;
  document.getElementById("previous-users-page").disabled = state.userPage <= 1;
  document.getElementById("next-users-page").disabled =
    state.userPage >= state.userTotalPages;
}

async function toggleUserStatus(user) {
  const isActive = !user.isActive;
  const action = isActive ? "mở khóa" : "khóa";
  const message = isActive
    ? `Mở khóa tài khoản ${user.email}? Người dùng sẽ có thể đăng nhập và sử dụng ứng dụng.`
    : `Khóa tài khoản ${user.email}? Các phiên đăng nhập hiện tại sẽ mất hiệu lực.`;
  if (!window.confirm(message)) return;
  try {
    await requestApi(`/api/admin/users/${encodeURIComponent(user.id)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ isActive }),
    });
    await loadUsers();
    showNotice(
      document.getElementById("users-message"),
      `Đã ${action} tài khoản ${user.email}.`,
    );
  } catch (error) {
    showNotice(document.getElementById("users-message"), error.message, true);
  }
}

function showAdminView(view) {
  state.activeView = view;
  document.getElementById("meals-page").classList.toggle("hidden", view !== "meals");
  document.getElementById("users-page").classList.toggle("hidden", view !== "users");
  adminNav.querySelectorAll("[data-admin-view]").forEach((button) => {
    const isActive = button.dataset.adminView === view;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  if (view === "users") loadUsers();
}

function handleAdminNavClick(event) {
  const button = event.target.closest("[data-admin-view]");
  if (button) showAdminView(button.dataset.adminView);
}

function createBadge(text, green) {
  const badge = document.createElement("span");
  badge.className = `badge${green ? " badge-green" : " badge-muted"}`;
  badge.textContent = text;
  return badge;
}

function createMealRow(meal) {
  const row = document.createElement("tr");
  const nameCell = document.createElement("td");
  const nameWrap = document.createElement("div");
  nameWrap.className = "meal-name";
  const thumb = document.createElement("div");
  thumb.className = "meal-thumb";
  if (meal.imageUrl) {
    const image = document.createElement("img");
    image.src = meal.imageUrl;
    image.alt = "";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => {
      thumb.textContent = "MC";
    }, { once: true });
    thumb.append(image);
  } else {
    thumb.textContent = "MC";
  }
  const nameText = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = meal.name;
  const subtitle = document.createElement("small");
  subtitle.textContent = meal.isVegetarian ? "Món chay" : "Món ăn";
  nameText.append(name, subtitle);
  nameWrap.append(thumb, nameText);
  nameCell.append(nameWrap);

  const categoryCell = document.createElement("td");
  categoryCell.textContent = categoryLabels[meal.category] || meal.category;
  const servingsCell = document.createElement("td");
  servingsCell.textContent = `${meal.servings} người`;
  const statusCell = document.createElement("td");
  statusCell.append(createBadge(meal.isPublished ? "Đang hiển thị" : "Đang ẩn", meal.isPublished));
  const actionsCell = document.createElement("td");
  const actions = document.createElement("div");
  actions.className = "row-actions";
  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "small-button";
  editButton.textContent = "Sửa";
  editButton.addEventListener("click", () => openMealDialog(meal));
  const publishButton = document.createElement("button");
  publishButton.type = "button";
  publishButton.className = "small-button";
  publishButton.textContent = meal.isPublished ? "Ẩn món" : "Hiện món";
  publishButton.addEventListener("click", () => togglePublished(meal));
  actions.append(editButton, publishButton);
  actionsCell.append(actions);
  row.append(nameCell, categoryCell, servingsCell, statusCell, actionsCell);
  return row;
}

function renderMeals() {
  mealRows.replaceChildren(...state.meals.map(createMealRow));
  document.getElementById("result-count").textContent = `${state.totalItems} món`;
  document.getElementById("page-label").textContent = `Trang ${state.page} / ${Math.max(1, state.totalPages)}`;
  document.getElementById("previous-page").disabled = state.page <= 1;
  document.getElementById("next-page").disabled = state.page >= state.totalPages;
  if (!state.meals.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.className = "muted";
    cell.textContent = "Không tìm thấy món ăn phù hợp.";
    row.append(cell);
    mealRows.append(row);
  }
}

function addIngredientRow(ingredient = { name: "", amountG: "" }) {
  const row = document.createElement("div");
  row.className = "repeat-row";
  row.innerHTML = '<label>Tên nguyên liệu<input data-field="name" maxlength="120" required></label><label>Khối lượng (g)<input data-field="amountG" type="number" min="0.1" step="0.1" required></label>';
  row.querySelector('[data-field="name"]').value = ingredient.name || "";
  row.querySelector('[data-field="amountG"]').value = ingredient.amountG ?? "";
  addRemoveButton(row);
  ingredientsList.append(row);
}

function addStepRow(step = { title: "", instruction: "", imageUrl: "" }) {
  const row = document.createElement("div");
  row.className = "step-row";
  row.innerHTML = '<label>Tiêu đề<input data-field="title" maxlength="120" required></label><label>Hướng dẫn<textarea data-field="instruction" rows="2" maxlength="2000" required></textarea></label><label>Ảnh bước nấu<input data-field="imageUrl" type="url" maxlength="2048"></label>';
  row.querySelector('[data-field="title"]').value = step.title || "";
  row.querySelector('[data-field="instruction"]').value = step.instruction || "";
  row.querySelector('[data-field="imageUrl"]').value = step.imageUrl || "";
  addRemoveButton(row);
  stepsList.append(row);
}

function addRemoveButton(row) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "remove-button";
  button.setAttribute("aria-label", "Xóa dòng");
  button.textContent = "×";
  button.addEventListener("click", () => row.remove());
  row.append(button);
}

function resetFormLists() {
  ingredientsList.replaceChildren();
  stepsList.replaceChildren();
  addIngredientRow();
  addStepRow();
}

function setFormValue(name, value) {
  const field = mealForm.elements.namedItem(name);
  if (field.type === "checkbox") field.checked = Boolean(value);
  else field.value = value ?? "";
}

function openMealDialog(meal = null) {
  state.editingId = meal?.id || null;
  mealForm.reset();
  resetFormLists();
  showNotice(formMessage, "");
  document.getElementById("dialog-title").textContent = meal ? "Chỉnh sửa món" : "Thêm món ăn";
  document.getElementById("save-meal").textContent = meal ? "Lưu thay đổi" : "Tạo món";
  setFormValue("category", meal?.category || "BREAKFAST");
  setFormValue("servings", meal?.servings ?? 1);
  setFormValue("prepTimeMinutes", meal?.prepTimeMinutes ?? 15);
  setFormValue("cookTimeMinutes", meal?.cookTimeMinutes ?? 20);
  setFormValue("caloriesPer100g", meal?.caloriesPer100g ?? "");
  setFormValue("proteinPer100g", meal?.proteinPer100g ?? "");
  setFormValue("carbsPer100g", meal?.carbsPer100g ?? "");
  setFormValue("fatPer100g", meal?.fatPer100g ?? "");
  setFormValue("isVegetarian", meal?.isVegetarian ?? false);
  if (meal) {
    for (const [field, value] of Object.entries(meal)) {
      if (["name", "description", "imageUrl", "finalWeightG"].includes(field)) setFormValue(field, value);
    }
    ingredientsList.replaceChildren();
    stepsList.replaceChildren();
    meal.ingredients.forEach(addIngredientRow);
    meal.cookingSteps.forEach(addStepRow);
  }
  mealDialog.showModal();
}

function getNumber(formData, name) {
  const value = formData.get(name);
  return value === "" ? null : Number(value);
}

function collectMealPayload() {
  const values = new FormData(mealForm);
  return {
    name: values.get("name"),
    description: values.get("description"),
    imageUrl: values.get("imageUrl"),
    category: values.get("category"),
    isVegetarian: values.has("isVegetarian"),
    prepTimeMinutes: getNumber(values, "prepTimeMinutes"),
    cookTimeMinutes: getNumber(values, "cookTimeMinutes"),
    servings: getNumber(values, "servings"),
    finalWeightG: getNumber(values, "finalWeightG"),
    caloriesPer100g: getNumber(values, "caloriesPer100g"),
    proteinPer100g: getNumber(values, "proteinPer100g"),
    carbsPer100g: getNumber(values, "carbsPer100g"),
    fatPer100g: getNumber(values, "fatPer100g"),
    ingredients: [...ingredientsList.querySelectorAll(".repeat-row")].map((row) => ({
      name: row.querySelector('[data-field="name"]').value,
      amountG: Number(row.querySelector('[data-field="amountG"]').value),
    })),
    cookingSteps: [...stepsList.querySelectorAll(".step-row")].map((row) => ({
      title: row.querySelector('[data-field="title"]').value,
      instruction: row.querySelector('[data-field="instruction"]').value,
      imageUrl: row.querySelector('[data-field="imageUrl"]').value,
    })),
  };
}

async function submitMeal(event) {
  event.preventDefault();
  showNotice(formMessage, "");
  saveMealButton.disabled = true;
  const isEditing = Boolean(state.editingId);
  try {
    const path = isEditing ? `/api/admin/meals/${encodeURIComponent(state.editingId)}` : "/api/admin/meals";
    await requestApi(path, {
      method: isEditing ? "PUT" : "POST",
      body: JSON.stringify(collectMealPayload()),
    });
    mealDialog.close();
    await loadMeals();
    showNotice(dashboardMessage, isEditing ? "Món ăn đã được cập nhật." : "Món ăn đã được tạo.");
  } catch (error) {
    showNotice(formMessage, error.message, true);
  } finally {
    saveMealButton.disabled = false;
  }
}

async function togglePublished(meal) {
  const action = meal.isPublished ? "ẩn" : "hiện";
  if (!window.confirm(`Bạn muốn ${action} món “${meal.name}”?`)) return;
  try {
    await requestApi(`/api/admin/meals/${encodeURIComponent(meal.id)}/published`, {
      method: "PATCH",
      body: JSON.stringify({ isPublished: !meal.isPublished }),
    });
    await loadMeals();
    showNotice(dashboardMessage, `Đã ${action} món ăn.`);
  } catch (error) {
    showNotice(dashboardMessage, error.message, true);
  }
}

function handleFilterChange() {
  state.page = 1;
  loadMeals();
}

function goToPreviousPage() {
  if (state.page <= 1) return;
  state.page -= 1;
  loadMeals();
}

function goToNextPage() {
  if (state.page >= state.totalPages) return;
  state.page += 1;
  loadMeals();
}

let searchTimer;
function handleSearchInput() {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(handleFilterChange, 250);
}

function handleUserFiltersChange() {
  state.userPage = 1;
  loadUsers();
}

let userSearchTimer;
function handleUserSearchInput() {
  window.clearTimeout(userSearchTimer);
  userSearchTimer = window.setTimeout(handleUserFiltersChange, 250);
}

function goToPreviousUsersPage() {
  if (state.userPage <= 1) return;
  state.userPage -= 1;
  loadUsers();
}

function goToNextUsersPage() {
  if (state.userPage >= state.userTotalPages) return;
  state.userPage += 1;
  loadUsers();
}

loginForm.addEventListener("submit", submitLogin);
logoutButton.addEventListener("click", logout);
adminNav.addEventListener("click", handleAdminNavClick);
document.getElementById("create-button").addEventListener("click", () => openMealDialog());
document.getElementById("close-dialog").addEventListener("click", () => mealDialog.close());
document.getElementById("cancel-dialog").addEventListener("click", () => mealDialog.close());
mealForm.addEventListener("submit", submitMeal);
document.getElementById("add-ingredient").addEventListener("click", () => addIngredientRow());
document.getElementById("add-step").addEventListener("click", () => addStepRow());
document.getElementById("category-filter").addEventListener("change", handleFilterChange);
document.getElementById("vegetarian-filter").addEventListener("change", handleFilterChange);
document.getElementById("published-filter").addEventListener("change", handleFilterChange);
document.getElementById("search-input").addEventListener("input", handleSearchInput);
document.getElementById("previous-page").addEventListener("click", goToPreviousPage);
document.getElementById("next-page").addEventListener("click", goToNextPage);
document.getElementById("user-search-input").addEventListener("input", handleUserSearchInput);
document.getElementById("user-status-filter").addEventListener("change", handleUserFiltersChange);
document.getElementById("previous-users-page").addEventListener("click", goToPreviousUsersPage);
document.getElementById("next-users-page").addEventListener("click", goToNextUsersPage);

setAuthenticated(Boolean(state.token));
if (state.token) loadMeals();
