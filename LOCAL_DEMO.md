# Local demo: Tripwire (3 phút)

Hướng dẫn chạy demo trên máy local. Phần **Nói** là lời thuyết trình bằng tiếng Anh cho ban giám khảo. Phần còn lại là ghi chú cho bạn.

## 1. Chuẩn bị (làm trước khi lên, khoảng 10 phút)

Cần có sẵn trong `.env.local`: biến Auth0, `DATABASE_URL`, `AUTH0_AUDIENCE`, `AUTH0_AGENT_CLIENT_IDS`, `APPROVER_EMAILS`, `AGENT_CLIENT_ID`, `AGENT_CLIENT_SECRET`.

Thêm hai dòng này để demo giống nhau mỗi lần và không phụ thuộc hạn mức Gemini:

```
RISK_MODEL=off
DEMO_MODE=0
```

Rồi chạy theo thứ tự:

```bash
npm run db:migrate
npm run db:seed
```

Mở **hai terminal**:

Terminal A, chạy app và để yên:

```bash
npm run dev
```

Terminal B, dành cho agent giả (chưa chạy lúc này):

```bash
npm run simulate
```

Checklist cuối:
- [ ] Đã đăng nhập tại `http://localhost:3000` bằng email có trong `APPROVER_EMAILS`.
- [ ] App Authenticator trên điện thoại đã đăng ký và mở sẵn.
- [ ] `/policies` **không còn** policy nào (xoá hoặc tắt policy cũ; xoá policy chặn cần MFA).
- [ ] Mở sẵn các tab theo thứ tự: `/dashboard`, `/approvals`, `/policies`, `/incidents`, `/investigator`.
- [ ] Terminal B hiển thị cạnh trình duyệt để ban giám khảo thấy agent chạy.
- [ ] Đã tập một vòng đầy đủ và có video dự phòng.

## 2. Kịch bản 3 phút

### Cảnh 1: Mở đầu (15 giây)
**Màn hình:** `/dashboard`.

**Nói:** "AI agents can now delete databases and move money. Tripwire is a flight recorder and a seatbelt for them: every action is scored, risky ones wait for a human with MFA, and everything is logged."

### Cảnh 2: Agent chạy việc bình thường (30 giây)
**Làm:** ở Terminal B chạy

```bash
npm run simulate
```

**Màn hình:** terminal agent bên cạnh `/dashboard`. Các dòng `-> allowed` và `ran:` hiện lần lượt, biểu đồ tự cập nhật.

**Nói:** "This is an agent doing normal work. Each action is sent to Tripwire before it runs. Safe ones pass instantly, and the dashboard updates live from Tiger Data."

### Cảnh 3: Hành động nguy hiểm bị giữ lại, duyệt bằng MFA (60 giây)
Sau khoảng 30 giây, agent gửi `db.execute` với `DROP TABLE customers` và terminal in `waiting for a human to approve with MFA...`.

**Làm:**
1. Mở `/approvals`. Hành động đang chờ hiện ra.
2. Bấm **Why this score** để mở các yếu tố tạo nên điểm.
3. Bấm **Approve with MFA**, đăng nhập lại, nhập mã OTP từ điện thoại.
4. Quay về `/approvals`, bấm **MFA verified: confirm approval**.

**Màn hình:** terminal agent chạy tiếp ngay (`ran: db.execute`).

**Nói:** "The agent tried to drop a production table and Tripwire stopped it. Here is why it scored critical. To approve, I need a fresh MFA login from Auth0, and that MFA works once, for this one approval. The moment I confirm, the agent continues."

### Cảnh 4: Đội ngũ tự đặt luật (30 giây)
**Làm:** mở `/policies`, điền form:

| Ô | Giá trị |
| --- | --- |
| Name | `No outbound calls` |
| Pattern | `http\.get` |
| Match on | Action type |
| What happens | Block at once |
| Reason | `Outbound network calls are off limits` |
| Only for one agent | **để trống** |

Bấm **Create policy**, rồi ở Terminal B chạy lại (cờ `FAST` rút ngắn thời gian chờ):

```powershell
$env:FAST=1; npm run simulate
```

**Màn hình:** tới bước `http.get`, terminal in `denied` rồi `BLOCKED: ... Outbound network calls are off limits`. Các bước khác vẫn chạy. Bạn có thể bấm duyệt hoặc bỏ qua hành động `DROP TABLE` ở lượt này.

**Nói:** "Teams write their own rules, and they run before the AI model. This one blocks outbound calls instantly, with no model call and a clear reason."

### Cảnh 5: Điều tra sau sự cố (30 giây)
**Làm:**
1. Mở `/incidents`, chọn sự kiện `http.get` vừa bị chặn. Dòng đầu của **Why this score** ghi tên policy.
2. Mở `/investigator`, hỏi: `Which actions were blocked and why?`

**Nói:** "Everything is recorded. The Investigator, powered by Gemini, answers questions about what the agents did and why each action was held or blocked."

Nếu Gemini báo `unavailable` (hết hạn mức), nói: "The Investigator is Gemini-powered and works when the API quota allows" rồi chuyển sang cảnh 6.

### Cảnh 6: Kết (15 giây)
**Nói:** "Auth0 handles login and step-up MFA. Tiger Data stores every event and powers the live charts. Gemini powers the Investigator and summaries. It is deployed on Vercel, and the whole build was recorded with Entire. Tripwire plugs into agents people already use through an SDK, an MCP proxy and a Claude Code hook."

## 3. Cảnh tùy chọn: agent thật qua Claude Code hook

Chỉ làm nếu còn thời gian. Cần credential của agent. Đặt các biến này trong shell trước khi mở Claude Code:

```powershell
$env:TRIPWIRE_URL="http://localhost:3000"
$env:TRIPWIRE_AUTH0_DOMAIN="<AUTH0_DOMAIN>"
$env:TRIPWIRE_AUDIENCE="<AUTH0_AUDIENCE>"
$env:TRIPWIRE_CLIENT_ID="<AGENT_CLIENT_ID>"
$env:TRIPWIRE_CLIENT_SECRET="<AGENT_CLIENT_SECRET>"
```

Thêm vào `.claude/settings.json`:

```json
{ "hooks": { "PreToolUse": [ { "matcher": ".*", "hooks": [
  { "type": "command", "command": "node sdk/adapters/claude-code-hook.mjs", "timeout": 600 } ] } ] } }
```

Làm: nhờ Claude Code chạy `ls` (hiện allowed trên dashboard), rồi nhờ chạy `git push --force` (bị giữ ở `/approvals`, bấm Deny, Claude Code báo `Blocked by Tripwire`).

## 4. Reset giữa các lần tập

```bash
npm run db:seed
```

Rồi xoá policy ở `/policies`. Lưu ý lệnh seed xoá các dòng demo cũ (session bắt đầu bằng `seed-`) nhưng không xoá sự kiện do agent thật gửi.

## 5. Nếu có sự cố

| Triệu chứng | Cách xử lý |
| --- | --- |
| Bấm duyệt mà cứ bắt đăng nhập lại | Đọc dòng cảnh báo vàng trên `/approvals`. `amr: none` nghĩa là Auth0 Action chưa gắn vào luồng post-login |
| Mỗi hành động đều bị giữ, thấy "scoring unavailable" | Gemini hết hạn mức. Đặt `RISK_MODEL=off` rồi khởi động lại `npm run dev` |
| `simulate` báo lỗi lấy token | Kiểm tra `AGENT_CLIENT_ID` và `AGENT_CLIENT_SECRET`, và client id đó có trong `AUTH0_AGENT_CLIENT_IDS` |
| Policy không chặn | Xem `/policies`: policy phải đang bật, Match on đúng, ô "Only for one agent" để trống |
| Terminal agent đứng im | Nó đang chờ duyệt, mở `/approvals` |
| Mạng hỏng giữa chừng | Mở video dự phòng của cảnh 3 và 4 |

## 6. Nói gì với ban giám khảo về tính năng (một câu mỗi mục)

- **Chặn thật:** hành động rủi ro không chạy cho tới khi con người duyệt.
- **MFA mỗi lần duyệt:** mỗi lần xác thực chỉ dùng cho một lần duyệt, không dùng lại được.
- **Giải thích điểm:** mỗi điểm rủi ro đều chỉ ra nguồn: luật có sẵn, Gemini, baseline của agent, quyết định trước đó của con người, hoặc policy.
- **An toàn khi sự cố:** nếu Tripwire không liên lạc được, agent mặc định bị chặn (fail-closed).
- **Cắm vào agent có sẵn:** SDK JS và Python, MCP proxy, hook cho Claude Code.
