// 初始化员工数据
async function initStaffData() {
    const defaultStaff = [
        { id: "staff01", name: "员工1", password: "123456", salary: 0 },
        { id: "staff02", name: "员工2", password: "123456", salary: 0 }
    ];
    let staffList = await getStaffList();
    if (staffList.length === 0) {
        await saveStaffList(defaultStaff);
    }
}

let teamSearchKeyword = "";
let teamSearchRawKeyword = "";
let teamSearchDebounceTimer = null;

function handleTeamSearch(keyword) {
    teamSearchRawKeyword = String(keyword || "").trim();
    teamSearchKeyword = teamSearchRawKeyword.toLowerCase();
    if (teamSearchDebounceTimer) clearTimeout(teamSearchDebounceTimer);
    teamSearchDebounceTimer = setTimeout(() => {
        renderTeamTable();
    }, 260);
}

function submitTeamSearch() {
    const input = document.getElementById("teamSearchInput");
    if (!input) return;
    if (teamSearchDebounceTimer) clearTimeout(teamSearchDebounceTimer);
    teamSearchRawKeyword = String(input.value || "").trim();
    teamSearchKeyword = teamSearchRawKeyword.toLowerCase();
    renderTeamTable();
}

function clearTeamSearch() {
    const input = document.getElementById("teamSearchInput");
    if (!input) return;
    input.value = "";
    if (teamSearchDebounceTimer) clearTimeout(teamSearchDebounceTimer);
    teamSearchRawKeyword = "";
    teamSearchKeyword = "";
    renderTeamTable();
}

function handleTeamSearchKeydown(event) {
    if (event.key === "Enter") {
        event.preventDefault();
        submitTeamSearch();
    }
}

function getSelectedTeamStaffIds() {
    return Array.from(document.querySelectorAll(".staff-checkbox:checked"))
        .map((checkbox) => checkbox.value);
}

function selectAllTeamStaff() {
    const checkboxes = document.querySelectorAll(".staff-checkbox");
    checkboxes.forEach((checkbox) => {
        checkbox.checked = true;
    });
}

function clearSelectedTeamStaff() {
    const checkboxes = document.querySelectorAll(".staff-checkbox");
    checkboxes.forEach((checkbox) => {
        checkbox.checked = false;
    });
}

function invertSelectedTeamStaff() {
    const checkboxes = document.querySelectorAll(".staff-checkbox");
    checkboxes.forEach((checkbox) => {
        checkbox.checked = !checkbox.checked;
    });
}

async function settleSelectedTeamStaff() {
    const selectedIds = getSelectedTeamStaffIds();
    if (selectedIds.length === 0) {
        showToast("请先选中要结算的员工。", "warning");
        return;
    }

    if (!confirm(`确定一键结算已选中的 ${selectedIds.length} 位员工吗？结算后余额会清零。`)) {
        return;
    }

    let staffList = await getStaffList();
    let settledCount = 0;
    let settledAmount = 0;

    for (const staffId of selectedIds) {
        const index = staffList.findIndex(staff => staff.id === staffId);
        if (index === -1) continue;

        const amount = parseFloat(staffList[index].salary || 0);
        if (!Number.isFinite(amount) || amount <= 0) continue;

        staffList[index].salary = 0;
        settledCount++;
        settledAmount += amount;

        // 添加余额变动记录（结算为负数）
        const actionKey = `batch_settle:${staffId}:${Math.round(amount * 100)}:${Math.floor(Date.now() / 1000)}`;
        await addSalaryDetail(staffId, -amount, '结算', '管理员批量结算', new Date(), { settleKey: actionKey });
    }

    await saveStaffList(staffList);
    renderTeamTable();

    if (settledCount === 0) {
        showToast("已选员工暂无可结算余额。", "warning");
        return;
    }

    showToast(`批量结算完成：${settledCount} 人，合计 ${settledAmount.toFixed(2)} 元。`, "success");
}

async function rewardSelectedTeamStaff() {
    const selectedIds = getSelectedTeamStaffIds();
    if (selectedIds.length === 0) {
        showToast("请先选中要奖励的员工。", "warning");
        return;
    }

    const rewardAmount = prompt("请输入每位已选员工的奖励金额（元）：", "10");
    if (rewardAmount === null) return;

    const amount = parseFloat(rewardAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
        showToast("请输入有效的正数金额。", "warning");
        return;
    }

    let staffList = await getStaffList();
    let rewardCount = 0;
    let totalReward = 0;

    for (const staffId of selectedIds) {
        const index = staffList.findIndex(staff => staff.id === staffId);
        if (index === -1) continue;

        staffList[index].salary = parseFloat(staffList[index].salary || 0) + amount;
        rewardCount++;
        totalReward += amount;

        const actionKey = `batch_reward:${staffId}:${Math.round(amount * 100)}:${Math.floor(Date.now() / 1000)}`;
        await addSalaryDetail(staffId, amount, '奖励', '管理员批量奖励', new Date(), { settleKey: actionKey });
    }

    await saveStaffList(staffList);
    renderTeamTable();

    if (rewardCount === 0) {
        showToast("未找到可奖励员工。", "warning");
        return;
    }

    showToast(`批量奖励完成：${rewardCount} 人，合计 ${totalReward.toFixed(2)} 元。`, "success");
}

// 渲染团队管理表格
async function renderTeamTable() {
    const staffList = await getStaffList();
    const allOrders = await getOrders();
    const localStaffList = JSON.parse(localStorage.getItem("staffList") || "[]");
    const localStaffMap = new Map(localStaffList.map(staff => [staff.id, staff]));

    let html = "";
    staffList.forEach(staff => {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

        const todayOrders = allOrders.filter(order =>
            order.staffid === staff.id &&
            new Date(order.submittime) >= todayStart &&
            new Date(order.submittime) < todayEnd
        );
        const todayCount = todayOrders.length;

        const totalSalary = Number.parseFloat(staff.salary);
        const totalSalaryText = (Number.isFinite(totalSalary) ? totalSalary : 0).toFixed(2);
        const localStaff = localStaffMap.get(staff.id) || {};
        const phone = (staff.phone || localStaff.phone || "").trim();
        const salaryAccount = (staff.salaryAccount || localStaff.salaryAccount || "").trim();
        const phoneText = phone || "未绑定";
        const salaryAccountText = salaryAccount || "未绑定";
        const searchText = `${staff.id} ${staff.name} ${phoneText} ${salaryAccountText}`.toLowerCase();
        if (teamSearchKeyword && !searchText.includes(teamSearchKeyword)) {
            return;
        }

        const safeId = String(staff.id).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        const actionBtns = `
        <div class="action-btn-group">
            <button type="button" onclick="resetStaffPassword('${safeId}')">重置密码</button>
            <button type="button" class="success" onclick="settleStaffSalary('${safeId}')">结算</button>
            <button type="button" class="warning" onclick="rewardStaff('${safeId}')">奖励</button>
            <button type="button" class="danger" onclick="punishStaff('${safeId}')">惩罚</button>
            <button type="button" onclick="openSalaryDetailModal('${safeId}')">余额明细</button>
        </div>`;

        html += `
        <tr>
            <td><input type="checkbox" class="staff-checkbox" value="${staff.id}"></td>
            <td>${staff.id}</td>
            <td>${staff.name}</td>
            <td>${phoneText}</td>
            <td>${salaryAccountText}</td>
            <td>${todayCount}</td>
            <td>${totalSalaryText}</td>
            <td>${actionBtns}</td>
        </tr>`;
    });
    document.getElementById("teamTable").innerHTML = html || `
        <tr>
            <td colspan="8" style="text-align:center; color:#64748b; padding:20px;">未匹配到员工数据</td>
        </tr>
    `;
    const kw = String(teamSearchRawKeyword || "").trim();
    if (kw && typeof highlightKeyword === "function") {
        highlightKeyword(document.getElementById("teamTable"), kw);
    }
}

// 重置员工密码
async function resetStaffPassword(staffId) {
    let staffList = await getStaffList();
    const index = staffList.findIndex(staff => staff.id === staffId);
    if (index !== -1) {
        const newPwd = prompt("请输入新密码（默认123456）：", "123456");
        if (newPwd === null) return;
        staffList[index].password = newPwd;
        await saveStaffList(staffList);
        renderTeamTable();
        showToast(`已重置员工「${staffList[index].name}」的登录密码，请通过安全渠道告知对方。`, "success");
    }
}

// 结算员工薪资
async function settleStaffSalary(staffId) {
    if (!confirm("确定要结算该员工薪资并清零余额吗？")) return;

    let staffList = await getStaffList();
    const index = staffList.findIndex(staff => staff.id === staffId);
    if (index !== -1) {
        const settledAmount = Number(staffList[index].salary || 0);
        if (!Number.isFinite(settledAmount) || settledAmount <= 0) {
            showToast("该员工当前无可结算余额。", "warning");
            return;
        }
        staffList[index].salary = 0;
        await saveStaffList(staffList);
        const actionKey = `manual_settle:${staffId}:${Math.round(settledAmount * 100)}:${Math.floor(Date.now() / 1000)}`;
        // 添加余额变动记录（结算为负数）
        await addSalaryDetail(staffId, -settledAmount, '结算', '管理员手动结算', new Date(), { settleKey: actionKey });
        renderTeamTable();
        alert(`已结算该员工薪资 ${settledAmount.toFixed(2)} 元，余额已清零！`);
    }
}

// 奖励员工
async function rewardStaff(staffId) {
    const rewardAmount = prompt("请输入奖励金额（元）：", "0");
    if (rewardAmount === null) return;
    const amount = parseFloat(rewardAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
        alert("请输入有效的正数金额！");
        return;
    }

    let staffList = await getStaffList();
    const index = staffList.findIndex(staff => staff.id === staffId);
    if (index !== -1) {
        const baseSal = Number.parseFloat(staffList[index].salary || 0);
        staffList[index].salary = (Number.isFinite(baseSal) ? baseSal : 0) + amount;
        await saveStaffList(staffList);
        const actionKey = `manual_reward:${staffId}:${Math.round(amount * 100)}:${Math.floor(Date.now() / 1000)}`;
        // 添加余额变动记录
        await addSalaryDetail(staffId, amount, '奖励', '管理员手动奖励', new Date(), { settleKey: actionKey });
        renderTeamTable();
        alert(`已奖励该员工 ${amount.toFixed(2)} 元，当前余额：${formatMoneyDisplay(staffList[index].salary)} 元`);
    }
}

// 惩罚员工
async function punishStaff(staffId) {
    const punishAmount = prompt("请输入惩罚扣除金额（元）：", "0");
    if (punishAmount === null) return;
    const amount = parseFloat(punishAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
        alert("请输入有效的正数金额！");
        return;
    }

    let staffList = await getStaffList();
    const index = staffList.findIndex(staff => staff.id === staffId);
    if (index !== -1) {
        const currentSalary = Number.parseFloat(staffList[index].salary || 0);
        const safeCurrentSalary = Number.isFinite(currentSalary) ? currentSalary : 0;
        if (amount > safeCurrentSalary) {
            if (!confirm(`该员工当前余额仅 ${safeCurrentSalary.toFixed(2)} 元，扣除金额超过余额，是否继续？`)) {
                return;
            }
        }

        staffList[index].salary = Math.max(0, safeCurrentSalary - amount);
        await saveStaffList(staffList);
        const actionKey = `manual_punish:${staffId}:${Math.round(amount * 100)}:${Math.floor(Date.now() / 1000)}`;
        // 添加余额变动记录（惩罚为负数）
        await addSalaryDetail(staffId, -amount, '惩罚', '管理员手动惩罚', new Date(), { settleKey: actionKey });
        renderTeamTable();
        alert(`已扣除该员工 ${amount.toFixed(2)} 元，当前余额：${formatMoneyDisplay(staffList[index].salary)} 元`);
    }
}

// 渲染个人中心
async function renderProfilePage() {
    const allOrders = await getOrders();
    const myOrders = allOrders.filter(order => order.staffid === user.id);

    // 设置用户姓名
    const profileUserName = document.getElementById("profileUserName");
    if (profileUserName) {
        profileUserName.innerText = user.name;
    }

    // 获取员工列表
    const staffList = await getStaffList();
    const myInfo = staffList.find(staff => staff.id === user.id) || { salary: 0 };

    // 设置用户手机号
    const profileUserPhone = document.getElementById("profileUserPhone");
    if (profileUserPhone) {
        if (myInfo.phone) {
            profileUserPhone.innerText = myInfo.phone;
        } else {
            profileUserPhone.innerText = "未绑定手机号";
        }
    }

    const today = new Date().toLocaleDateString();
    const todayCount = myOrders.filter(order =>
        new Date(order.submittime).toLocaleDateString() === today
    ).length;
    document.getElementById("todayOrderCount").innerText = todayCount;

    const profileBal = Number.parseFloat(myInfo.salary);
    document.getElementById("totalBalance").innerText = (Number.isFinite(profileBal) ? profileBal : 0).toFixed(2);
}

// 渲染个人中心卡片（移动端）
function renderProfileCards(orders) {
    try {
        const container = document.getElementById("profileOrderCards");
        if (!container) {
            // 如果没有找到容器，尝试使用表格容器
            const tableContainer = document.getElementById("profileOrderTable");
            if (tableContainer) {
                // 渲染简单的订单列表
                let html = "";
                if (orders.length > 0) {
                    html += `
                    <tr>
                        <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0; width: 60px;">序号</th>
                        <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">叫醒时间</th>
                        <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">电话</th>
                        <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">金额（元）</th>
                        <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">状态</th>
                        <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">结算状态</th>
                    </tr>
                    `;
                    orders.forEach(order => {
                        const settleStatus = order.salarysettled ? "已结算" : "未结算";
                        const showTime = typeof formatWakeTimeForDisplay === "function"
                            ? formatWakeTimeForDisplay(order.waketime)
                            : (order.waketime.includes('T') ? order.waketime.split('T')[1] : order.waketime);

                        html += `
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="padding: 12px; width: 60px;">${order.serialnumber}</td>
                            <td style="padding: 12px;">${showTime}</td>
                            <td style="padding: 12px;">${order.phone}</td>
                            <td style="padding: 12px;">${formatMoneyDisplay(order.amount ?? order.money)}</td>
                            <td style="padding: 12px;">${order.status}</td>
                            <td style="padding: 12px;">${settleStatus}</td>
                        </tr>
                        `;
                    });
                } else {
                    html = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: #64748b;">暂无订单</td></tr>`;
                }
                tableContainer.innerHTML = html;
            }
            return;
        }

        // 按日期分组订单
        const ordersByDate = {};
        orders.forEach(order => {
            const orderDate = new Date(order.submittime).toLocaleDateString();
            if (!ordersByDate[orderDate]) {
                ordersByDate[orderDate] = [];
            }
            ordersByDate[orderDate].push(order);
        });

        let html = "";
        // 按日期倒序排列
        const dates = Object.keys(ordersByDate).sort((a, b) => new Date(b) - new Date(a));

        dates.forEach(date => {
            const dateOrders = ordersByDate[date];
            html += `
            <div class="date-collapse">
                <div class="date-header" onclick="toggleDateCollapse('${date}')">
                    <span class="date-title">${date}（${dateOrders.length}单）</span>
                    <span class="date-arrow">▶</span>
                </div>
                <div class="date-content" id="collapse-${date}" style="display: none;">
            `;

            dateOrders.forEach(order => {
                let statusClass = "";
                switch (order.status) {
                    case "待接单": statusClass = "status-pending"; break;
                    case "进行中": statusClass = "status-processing"; break;
                    case "已完成": statusClass = "status-done"; break;
                }

                const settleStatus = order.salarysettled ? "已结算" : "未结算";
                const showTime = typeof formatWakeTimeForDisplay === "function"
                    ? formatWakeTimeForDisplay(order.waketime)
                    : (order.waketime.includes('T') ? order.waketime.split('T')[1] : order.waketime);

                html += `
                <div class="order-card">
                    <div class="order-card-header">
                        <div class="order-card-title">
                            <span class="serial-number">${order.serialnumber}</span>
                            <span class="time">${showTime}</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <span class="status-badge ${statusClass}">${order.status}</span>
                            <span class="order-money">${formatMoneyDisplay(order.amount ?? order.money)} 元</span>
                        </div>
                    </div>
                    <div class="order-card-body">
                        <div class="order-kv">
                            <div class="k">电话</div>
                            <div class="v">${order.phone}</div>
                        </div>
                        <div class="order-kv">
                            <div class="k">结算状态</div>
                            <div class="v">${settleStatus}</div>
                        </div>
                    </div>
                </div>
                `;
            });

            html += `
                </div>
            </div>
            `;
        });

        container.innerHTML = html || `<div style="color:#64748b;font-size:14px;padding:12px;">暂无订单</div>`;
    } catch (error) {
        console.error("渲染个人中心卡片失败：", error);
    }
}

// 添加薪资
async function addSalary(staffId, amount, completedTime = new Date()) {
    // 使用原子性更好的余额更新函数
    const ok = await addStaffSalary(staffId, amount);
    if (ok) {
        // 保护：这里是旧函数，没有订单上下文（无 order.id / settle_key），
        // 避免写入“订单收入自动结算”的脏明细（会出现 order_id/settle_key 为空）
        await addSalaryDetail(staffId, amount, '奖励', '余额调整', completedTime, {
            settleKey: `salary_adjust:${String(staffId || "").trim()}:${Math.round(Number(amount || 0) * 100)}:${Math.floor(Date.now() / 1000)}`
        });
    }
}

// ==============================
// 幂等订单结算（防止凌晨多端重复结算）
// - 先写入 salary_details（带 settle_key 唯一约束）
// - 只有写入成功才给员工余额加钱
// ==============================
function getOrderSettleKey(order) {
    // 严格模式：没有订单 id 就不允许结算（不写明细、不加余额）
    if (order && order.id !== undefined && order.id !== null && order.id !== "") {
        return `order_income:${order.id}`;
    }
    return "";
}

async function settleOrderIncomeOnce(order, completedTime = new Date()) {
    if (!order) return { settled: false, reason: "no_order" };
    if (!order.staffid) return { settled: false, reason: "no_staff" };

    const amount = parseFloat(order.amount || order.money || 0);
    if (!Number.isFinite(amount) || amount === 0) {
        return { settled: false, reason: "bad_amount" };
    }

    const settleKey = getOrderSettleKey(order);
    if (!settleKey) return { settled: false, reason: "missing_order_id" };
    const orderId = order.id;

    // 1) 先插入结算明细（幂等关键）
    const detailRes = await addSalaryDetail(
        order.staffid,
        amount,
        "订单收入",
        "订单完成自动结算",
        completedTime,
        { settleKey, orderId }
    );

    // 已存在（唯一冲突）→ 认为已结算过，不再加余额
    if (!detailRes.inserted && detailRes.reason === "duplicate") {
        return { settled: false, reason: "already_settled" };
    }

    // 2) 只有“明细写入成功”才更新员工余额
    const ok = await addStaffSalary(order.staffid, amount);
    if (!ok) {
        // 余额更新失败时不回滚明细（前端无法原子事务），但至少避免重复加钱
        return { settled: false, reason: "balance_update_failed" };
    }

    return { settled: true };
}

// 打开余额明细弹窗
async function openSalaryDetailModal(staffId) {
    const modal = document.getElementById("salaryDetailModal");
    const title = document.getElementById("salaryDetailTitle");
    const balanceEl = document.getElementById("currentBalance");
    const tableBody = document.getElementById("salaryDetailTable");

    // 获取员工信息
    const staffList = await getStaffList();
    const staff = staffList.find(s => s.id === staffId);
    if (staff) {
        title.innerText = `${staff.name}的余额明细`;
        const latestBalance = Number(staff.salary || 0);
        balanceEl.innerText = latestBalance.toFixed(2);
        // 员工本人打开明细时，同步刷新个人中心上的累计余额，避免两个区域显示不同步
        if (String(staffId || "").trim() === String(user?.id || "").trim()) {
            const totalBalanceEl = document.getElementById("totalBalance");
            if (totalBalanceEl) {
                totalBalanceEl.innerText = latestBalance.toFixed(2);
            }
        }
    }

    // 获取余额明细
    const details = await getSalaryDetails();
    const normalizedStaffId = String(staffId || "").trim();
    const staffDetails = details.filter((d) => String(d?.staffid || "").trim() === normalizedStaffId);

    // 渲染明细表格
    let html = "";
    if (staffDetails.length > 0) {
        staffDetails.forEach(detail => {
            const amount = Number.parseFloat(detail.amount);
            const amountSafe = Number.isFinite(amount) ? amount : 0;
            const amountClass = amountSafe >= 0 ? "salary-amount salary-amount--pos" : "salary-amount salary-amount--neg";
            const amountText = amountSafe >= 0 ? `+${formatMoneyDisplay(amountSafe)}` : formatMoneyDisplay(amountSafe);

            let typeText = "";
            switch (detail.type) {
                case "订单收入": typeText = "订单收入"; break;
                case "奖励": typeText = "奖励"; break;
                case "惩罚": typeText = "惩罚"; break;
                case "结算": typeText = "结算"; break;
                default: typeText = detail.type || "其他"; break;
            }

            html += `
            <tr>
                <td>${formatTime(detail.createdat)}</td>
                <td>${typeText}</td>
                <td class="${amountClass}">${amountText}</td>
                <td>${detail.description}</td>
            </tr>
            `;
        });
    } else {
        html = `<tr><td colspan="4" class="salary-empty-cell">暂无余额变动记录</td></tr>`;
    }

    tableBody.innerHTML = html;
    modal.style.display = "flex";
}

// 关闭余额明细弹窗
function closeSalaryDetailModal() {
    document.getElementById("salaryDetailModal").style.display = "none";
}

// 新增员工
async function saveNewStaff() {
    const name = document.getElementById("newStaffName").value.trim();
    const id = document.getElementById("newStaffId").value.trim();
    const password = document.getElementById("newStaffPwd").value.trim();

    if (!name || !id || !password) {
        alert("员工姓名、账号、密码不能为空！");
        return;
    }

    const staffList = await getStaffList();
    const isExist = staffList.some(staff => staff.id === id);
    if (isExist) {
        alert("该员工账号已存在，请更换！");
        return;
    }

    const newStaff = {
        id: id,
        name: name,
        password: password,
        salary: 0
    };
    staffList.push(newStaff);
    await saveStaffList(staffList);

    closeAddStaffModal();
    renderTeamTable();
    showToast(`员工「${name}」已添加（账号：${id}）。请通过安全渠道将初始密码告知本人，勿在公开场合展示。`, "success");
}

// 打开添加员工弹窗
function openAddStaffModal() {
    document.getElementById("addStaffModal").style.display = "flex";
    document.getElementById("newStaffName").value = "";
    document.getElementById("newStaffId").value = "";
    document.getElementById("newStaffPwd").value = "";
}

// 关闭添加员工弹窗
function closeAddStaffModal() {
    document.getElementById("addStaffModal").style.display = "none";
}
