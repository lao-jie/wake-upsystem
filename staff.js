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

// 渲染团队管理表格
async function renderTeamTable() {
    const staffList = await getStaffList();
    const allOrders = await getOrders();

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

        const totalSalary = (staff.salary || 0).toFixed(2);

        const actionBtns = `
        <div class="action-btn-group">
            <button onclick="resetStaffPassword('${staff.id}')">重置密码</button>
            <button class="success" onclick="settleStaffSalary('${staff.id}')">结算</button>
            <button class="warning" onclick="rewardStaff('${staff.id}')">奖励</button>
            <button class="danger" onclick="punishStaff('${staff.id}')">惩罚</button>
            <button onclick="openSalaryDetailModal('${staff.id}')">余额明细</button>
        </div>`;

        html += `
        <tr>
            <td><input type="checkbox" class="staff-checkbox" value="${staff.id}"></td>
            <td>${staff.id}</td>
            <td>${staff.name}</td>
            <td>${staff.password}</td>
            <td>${todayCount}</td>
            <td>${totalSalary}</td>
            <td>${actionBtns}</td>
        </tr>`;
    });
    document.getElementById("teamTable").innerHTML = html;
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
        alert(`员工【${staffList[index].name}】密码已重置为：${newPwd}`);
    }
}

// 结算员工薪资
async function settleStaffSalary(staffId) {
    if (!confirm("确定要结算该员工薪资并清零余额吗？")) return;

    let staffList = await getStaffList();
    const index = staffList.findIndex(staff => staff.id === staffId);
    if (index !== -1) {
        const settledAmount = staffList[index].salary || 0;
        staffList[index].salary = 0;
        await saveStaffList(staffList);
        // 添加余额变动记录（结算为负数）
        await addSalaryDetail(staffId, -settledAmount, '结算', '管理员手动结算');
        renderTeamTable();
        alert(`已结算该员工薪资 ${settledAmount.toFixed(2)} 元，余额已清零！`);
    }
}

// 奖励员工
async function rewardStaff(staffId) {
    const rewardAmount = prompt("请输入奖励金额（元）：", "0");
    if (rewardAmount === null) return;
    const amount = parseFloat(rewardAmount);
    if (isNaN(amount) || amount < 0) {
        alert("请输入有效的正数金额！");
        return;
    }

    let staffList = await getStaffList();
    const index = staffList.findIndex(staff => staff.id === staffId);
    if (index !== -1) {
        staffList[index].salary = (staffList[index].salary || 0) + amount;
        await saveStaffList(staffList);
        // 添加余额变动记录
        await addSalaryDetail(staffId, amount, '奖励', '管理员手动奖励');
        renderTeamTable();
        alert(`已奖励该员工 ${amount.toFixed(2)} 元，当前余额：${staffList[index].salary.toFixed(2)} 元`);
    }
}

// 惩罚员工
async function punishStaff(staffId) {
    const punishAmount = prompt("请输入惩罚扣除金额（元）：", "0");
    if (punishAmount === null) return;
    const amount = parseFloat(punishAmount);
    if (isNaN(amount) || amount < 0) {
        alert("请输入有效的正数金额！");
        return;
    }

    let staffList = await getStaffList();
    const index = staffList.findIndex(staff => staff.id === staffId);
    if (index !== -1) {
        const currentSalary = staffList[index].salary || 0;
        if (amount > currentSalary) {
            if (!confirm(`该员工当前余额仅 ${currentSalary.toFixed(2)} 元，扣除金额超过余额，是否继续？`)) {
                return;
            }
        }

        staffList[index].salary = Math.max(0, currentSalary - amount);
        await saveStaffList(staffList);
        // 添加余额变动记录（惩罚为负数）
        await addSalaryDetail(staffId, -amount, '惩罚', '管理员手动惩罚');
        renderTeamTable();
        alert(`已扣除该员工 ${amount.toFixed(2)} 元，当前余额：${staffList[index].salary.toFixed(2)} 元`);
    }
}

// 渲染个人中心
async function renderProfilePage() {
    const allOrders = await getOrders();
    const myOrders = allOrders.filter(order => order.staffid === user.id);

    const today = new Date().toLocaleDateString();
    const todayCount = myOrders.filter(order =>
        new Date(order.submittime).toLocaleDateString() === today
    ).length;
    document.getElementById("todayOrderCount").innerText = todayCount;

    const staffList = await getStaffList();
    const myInfo = staffList.find(staff => staff.id === user.id) || { salary: 0 };
    document.getElementById("totalBalance").innerText = myInfo.salary.toFixed(2);

    // 无论是否为移动端，都尝试渲染订单
    try {
        if (isStaff && mobileMQ.matches) {
            renderProfileCards(myOrders);
        } else {
            // 按日期分组订单
            const ordersByDate = {};
            myOrders.forEach(order => {
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
                <tr class="date-collapse-header">
                    <td colspan="6" style="padding: 0;">
                        <div class="date-header" onclick="toggleDateCollapse('table-${date}')">
                            <span class="date-title">${date}（${dateOrders.length}单）</span>
                            <span class="date-arrow">▶</span>
                        </div>
                    </td>
                </tr>
                <tr class="date-collapse-content" id="collapse-table-${date}" style="display: none;">
                    <td colspan="6" style="padding: 0;">
                        <div style="padding: 12px;">
                            <table style="width: 100%; border-collapse: collapse;">
                                <thead>
                                    <tr>
                                        <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0; width: 60px;">序号</th>
                                        <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">叫醒时间</th>
                                        <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">电话</th>
                                        <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">金额（元）</th>
                                        <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">状态</th>
                                        <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">结算状态</th>
                                    </tr>
                                </thead>
                                <tbody>
                        `;

                dateOrders.forEach(order => {
                    const settleStatus = order.salarysettled ? "已结算" : "未结算";
                    html += `
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 12px; width: 60px;">${order.serialnumber}</td>
                        <td style="padding: 12px;">${order.waketime.split('T')[1]}</td>
                        <td style="padding: 12px;">${order.phone}</td>
                        <td style="padding: 12px;">${(order.amount || order.money).toFixed(2)}</td>
                        <td style="padding: 12px;"><span class="status-badge ${order.status === '待接单' ? 'status-pending' : order.status === '进行中' ? 'status-processing' : 'status-done'}">${order.status}</span></td>
                        <td style="padding: 12px;">${settleStatus}</td>
                    </tr>
                    `;
                });

                html += `
                                </tbody>
                            </table>
                        </div>
                    </td>
                </tr>
                `;
            });

            document.getElementById("profileOrderTable").innerHTML = html || `<tr><td colspan="6" style="text-align: center; padding: 20px; color: #64748b;">暂无订单</td></tr>`;
        }
    } catch (error) {
        console.error("渲染个人中心失败：", error);
        // 即使渲染失败，也要确保基本信息显示
        document.getElementById("todayOrderCount").innerText = todayCount;
        document.getElementById("totalBalance").innerText = myInfo.salary.toFixed(2);
    }
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
                        const showTime = order.waketime.includes('T') ? order.waketime.split('T')[1] : order.waketime;

                        html += `
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="padding: 12px; width: 60px;">${order.serialnumber}</td>
                            <td style="padding: 12px;">${showTime}</td>
                            <td style="padding: 12px;">${order.phone}</td>
                            <td style="padding: 12px;">${(order.amount || order.money).toFixed(2)}</td>
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
                const showTime = order.waketime.includes('T') ? order.waketime.split('T')[1] : order.waketime;

                html += `
                <div class="order-card">
                    <div class="order-card-header">
                        <div class="order-card-title">
                            <span class="serial-number">${order.serialnumber}</span>
                            <span class="time">${showTime}</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <span class="status-badge ${statusClass}">${order.status}</span>
                            <span class="order-money">${(order.amount || order.money).toFixed(2)} 元</span>
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
    let staffList = await getStaffList();
    const index = staffList.findIndex(staff => staff.id === staffId);
    if (index !== -1) {
        staffList[index].salary = (staffList[index].salary || 0) + amount;
        await saveStaffList(staffList);
        // 添加余额变动记录
        await addSalaryDetail(staffId, amount, '订单收入', '订单完成自动结算', completedTime);
    }
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
        balanceEl.innerText = (staff.salary || 0).toFixed(2);
    }

    // 获取余额明细
    const details = await getSalaryDetails();
    const staffDetails = details.filter(d => d.staffid === staffId);

    // 渲染明细表格
    let html = "";
    if (staffDetails.length > 0) {
        staffDetails.forEach(detail => {
            const amountClass = detail.amount >= 0 ? "color: #10b981; font-weight: 600;" : "color: #ef4444; font-weight: 600;";
            const amountText = detail.amount >= 0 ? `+${detail.amount.toFixed(2)}` : detail.amount.toFixed(2);

            let typeText = "";
            switch (detail.type) {
                case "订单收入": typeText = "订单收入"; break;
                case "奖励": typeText = "奖励"; break;
                case "惩罚": typeText = "惩罚"; break;
                case "结算": typeText = "结算"; break;
            }

            html += `
            <tr>
                <td>${formatTime(detail.createdat)}</td>
                <td>${typeText}</td>
                <td style="${amountClass}">${amountText}</td>
                <td>${detail.description}</td>
            </tr>
            `;
        });
    } else {
        html = `<tr><td colspan="4" style="text-align: center; padding: 20px; color: #64748b;">暂无余额变动记录</td></tr>`;
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
    alert(`员工【${name}】添加成功！账号：${id}，密码：${password}`);
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
