# Quản lý món ăn

Dashboard quản trị được phục vụ tại `/admin` bởi backend. Tài khoản đăng nhập dùng chung API đăng nhập MealCraft; các API quản trị chỉ cấp quyền cho địa chỉ email trong `ADMIN_EMAILS`.

## Cấu hình quyền quản trị

Thêm danh sách email quản trị vào secret/environment của backend, phân cách bằng dấu phẩy:

```env
ADMIN_EMAILS=admin@example.com,content@example.com
```

Email được so sánh không phân biệt chữ hoa/thường. Nếu biến chưa được đặt, API quản trị trả `503`; người dùng đăng nhập bình thường nhưng không nằm trong danh sách sẽ nhận `403`. Không đưa token hoặc mật khẩu quản trị vào mã nguồn hay frontend.

## Cập nhật cơ sở dữ liệu

Migration `20261110110000_add_meal_publishing` thêm cột `Meal.isPublished`, mặc định `true` để giữ nguyên khả năng hiển thị của các món đã có. Kiểm tra môi trường và trạng thái migration trước khi áp dụng trong từng môi trường:

```sh
npx prisma migrate deploy
```

Không cần chạy seed để bật tính năng này. Migration chỉ tạo cột, không thêm, sửa hoặc xóa món.

## Tính năng dashboard

- Tìm món theo tên, mô tả và nguyên liệu; lọc theo loại bữa, món chay và trạng thái hiển thị.
- Tạo và cập nhật mô tả, ảnh, dinh dưỡng trên 100 g, thời gian, khẩu phần, nguyên liệu và các bước nấu.
- Ẩn/hiện món. Ẩn món không xóa dữ liệu hoặc lịch sử gắn với món đó.
- Tìm kiếm và phân trang danh sách người dùng; xem email, tên, ngày tạo và trạng thái hoàn thành hồ sơ (không hiển thị dữ liệu sức khỏe chi tiết).
- Khóa/mở khóa tài khoản. Tài khoản bị khóa không thể đăng nhập; token đang hoạt động cũng bị từ chối ở API.
- API được bảo vệ bằng JWT hiện có và kiểm tra `ADMIN_EMAILS` ở backend.

Migration `20261110140000_add_user_account_status` thêm trạng thái tài khoản, mặc định hoạt động để giữ nguyên quyền truy cập của người dùng hiện có.

Các API quản trị nằm dưới `/api/admin/meals` và `/api/admin/users`. Tạo/cập nhật món yêu cầu toàn bộ trường món; endpoint đổi trạng thái món nhận boolean `isPublished`, endpoint đổi trạng thái người dùng nhận boolean `isActive`.
