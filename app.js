// 检查登录状态，如果未登录则跳转到登录页
(function checkLoginStatus() {
    const user = JSON.parse(localStorage.getItem("loginUser"));
    if (!user) {
        window.location.href = "index.html";
    }
})();

// 亮度调节功能 - 弹出面板版本
(function initBrightness() {
    const brightnessBtn = document.getElementById('brightnessBtn');
    const brightnessPopup = document.getElementById('brightnessPopup');
    const slider = document.getElementById('brightnessSliderPopup');
    const valueDisplay = document.getElementById('brightnessValuePopup');

    // 读取保存的亮度设置
    const savedBrightness = localStorage.getItem('brightness');
    if (savedBrightness) {
        const brightness = parseInt(savedBrightness);
        slider.value = brightness;
        valueDisplay.textContent = brightness + '%';
        applyBrightness(brightness);
    }

    // 点击按钮切换弹出面板
    brightnessBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        brightnessPopup.classList.toggle('show');
    });

    // 点击页面其他地方关闭弹出面板
    document.addEventListener('click', function (e) {
        if (!brightnessPopup.contains(e.target) && e.target !== brightnessBtn) {
            brightnessPopup.classList.remove('show');
        }
    });

    // 监听滑块变化
    slider.addEventListener('input', function () {
        const brightness = this.value;
        valueDisplay.textContent = brightness + '%';
        applyBrightness(brightness);
        localStorage.setItem('brightness', brightness);
    });
})();

function applyBrightness(percentage) {
    const brightness = percentage / 100;
    document.body.style.filter = `brightness(${brightness})`;
}

// 基础配置与用户信息
function initUser() {
    const staffList = JSON.parse(localStorage.getItem("staffList") || "[]");
    const testUsers = {
        admin: { id: "admin001", name: "管理员", role: "admin" }
    };
    staffList.forEach(staff => {
        testUsers[staff.id] = {
            id: staff.id,
            name: staff.name,
            role: "staff",
            password: staff.password
        };
    });

    let user = JSON.parse(localStorage.getItem("loginUser"));
    if (!user) {
        localStorage.setItem("loginUser", JSON.stringify(testUsers.admin));
        user = testUsers.admin;
    }

    return { user, allUsers: testUsers };
}

let currentPage = "home";
let lastNoticePopupSignature = "";

const { user, allUsers } = initUser();
const isAdmin = user.role === "admin";
const isStaff = user.role === "staff";
document.body.classList.toggle("is-staff", isStaff);
document.body.classList.toggle("is-admin", isAdmin);
const mobileMQ = window.matchMedia("(max-width: 768px)");
function applyMobileFlag() {
    const isMobile = mobileMQ.matches;
    document.body.classList.toggle("is-mobile", isMobile);
    // 强制应用移动端样式类，确保即使在移动端也能正确显示
    if (isMobile) {
        document.body.classList.add("is-mobile");
    } else {
        document.body.classList.remove("is-mobile");
    }
}
applyMobileFlag();
if (mobileMQ.addEventListener) {
    mobileMQ.addEventListener("change", () => {
        applyMobileFlag();
        // 仅在叫醒页时重绘，避免不必要的刷新
        if (currentPage === "wake") loadOrders();
    });
} else if (mobileMQ.addListener) {
    mobileMQ.addListener(() => {
        applyMobileFlag();
        if (currentPage === "wake") loadOrders();
    });
}

// 初始化时强制检查并应用移动端状态
document.body.classList.toggle("is-staff", isStaff);
document.getElementById("userName").innerText = user.name;
const teamUserNameEl = document.getElementById("teamUserName");
if (teamUserNameEl) {
    teamUserNameEl.innerText = user.name;
}

// 设置导航栏文本：员工显示"个人中心"，管理员显示"团队管理"
const navTeamText = document.getElementById("navTeamText");
if (navTeamText) {
    navTeamText.innerText = isAdmin ? "团队管理" : "个人中心";
}

// 管理员入口尽早展示，避免等待 window.onload 导致菜单延迟出现
if (isAdmin) {
    const noticeSettingNav = document.getElementById("nav-notice-setting");
    if (noticeSettingNav) {
        noticeSettingNav.style.display = "flex";
    }
}

let parsedBatchOrders = [];
let originalOrders = [];

// 轻提示 Toast（替代 alert）
let toastTimer = null;
function renderLucideIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
    }
}

// 首屏尽早渲染静态图标，避免等到 window.onload 才显示
renderLucideIcons();

function showToast(message, type = "info") {
    const el = document.getElementById("toast");
    if (!el) return;

    el.textContent = message;
    el.classList.remove("show", "info", "success", "warning", "danger");
    el.classList.add("show", type);

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        el.classList.remove("show");
    }, 1800);
}

function logout() {
    if (!confirm("确定要退出登录吗？")) return;
    try {
        localStorage.removeItem("loginUser");
        localStorage.removeItem("staffList");
        // 不清除savedUid和savedPwd，这样下次还能记住账号密码
    } catch (e) {
        console.error(e);
    }
    window.location.href = "index.html";
}

function showPage(page) {
    currentPage = page;
    // 切换页面时自动收起下拉，避免遮挡底部导航点击
    closeSubMenu();

    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.getElementById(`page_${page}`).classList.add("active");

    document.querySelectorAll(".nav-item, .sub-item").forEach(el => el.classList.remove("active"));

    // 显示当前页面的公告（管理员和员工都显示）
    showPageNoticeOnPage(page);
    // 点击页面时统一检查是否需要弹出公告（已读逻辑保持不变）
    checkAndShowPageNotice(page);

    if (page === "team") {
        document.getElementById("nav-team").classList.add("active");
        const teamUserNameNode = document.getElementById("teamUserName");
        if (teamUserNameNode) {
            teamUserNameNode.innerText = user.name;
        }
        const teamPageTitle = document.getElementById("teamPageTitle");

        if (isAdmin) {
            if (teamPageTitle) {
                teamPageTitle.innerText = "团队管理";
            }
            document.getElementById("teamManagerArea").style.display = "block";
            document.getElementById("staffProfileArea").style.display = "none";
            renderTeamTable();
        } else {
            if (teamPageTitle) {
                teamPageTitle.innerText = "个人中心";
            }
            document.getElementById("teamManagerArea").style.display = "none";
            document.getElementById("staffProfileArea").style.display = "block";
            renderProfilePage();
        }
    } else if (page === "home") {
        document.getElementById("nav-home").classList.add("active");
    } else if (page === "wake") {
        document.getElementById("nav-taobao").classList.add("active");
        document.getElementById("sub-wake").classList.add("active");
        // 根据用户角色更新页面标题
        const wakePageTitle = document.getElementById("wakePageTitle");
        if (wakePageTitle) {
            wakePageTitle.innerText = isStaff ? "接单大厅" : "叫醒订单管理";
        }
        loadOrders();
    } else if (page === "noticeSetting") {
        document.getElementById("nav-notice-setting").classList.add("active");
        const noticeSettingUserName = document.getElementById("noticeSettingUserName");
        if (noticeSettingUserName) {
            noticeSettingUserName.innerText = user.name;
        }
        // 刷新公告预览
        loadNoticeSettingsPreview();
    }
}

// 在页面上显示公告（管理员和员工都显示）
function showPageNoticeOnPage(page) {
    const notice = localStorage.getItem(`pageNotice_${page}`);
    const contentEl = document.getElementById(`noticeContent_${page}`);
    const noticeSection = document.getElementById(`pageNotice_${page}`);

    if (noticeSection && contentEl) {
        if (notice) {
            contentEl.innerHTML = `<p>${escapeHtml(notice)}</p>`;
            noticeSection.style.display = 'none';
        } else {
            contentEl.innerHTML = '<p>暂无公告</p>';
            noticeSection.style.display = 'none';
        }
    }
}

// 页面基础（必须放在 currentPage 声明之后）
// 检查URL参数，决定显示哪个页面
const urlParams = new URLSearchParams(window.location.search);
const targetPage = urlParams.get('page') || "home";
showPage(targetPage);

if (isAdmin) {
    document.getElementById("adminUploadArea").style.display = "flex";
    document.getElementById("batchUploadArea").style.display = "flex";
    document.getElementById("adminButtons").style.display = "flex";
    document.getElementById("addStaffBtnContainer").style.display = "block";
} else if (isStaff) {
    document.getElementById("staffBatchTakeBtn").style.display = "flex";
}

window.onload = async function () {
    const now = new Date();
    const defaultTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, 0)}-${String(now.getDate()).padStart(2, 0)}T06:00`;
    const wakeTimeInput = document.getElementById("wakeTime");
    if (wakeTimeInput) wakeTimeInput.value = defaultTime;

    // 确保员工界面一定不会显示角色切换按钮
    const roleSwitchArea = document.getElementById("roleSwitchArea");
    if (roleSwitchArea) {
        if (isAdmin) {
            roleSwitchArea.style.display = "flex";
        } else {
            roleSwitchArea.style.display = "none";
            roleSwitchArea.style.visibility = "hidden";
            roleSwitchArea.style.opacity = "0";
            roleSwitchArea.style.height = "0";
            roleSwitchArea.style.margin = "0";
            roleSwitchArea.style.overflow = "hidden";
        }
    }

    // 为余额卡片添加点击事件
    const balanceCard = document.getElementById("balanceCard");
    if (balanceCard) {
        balanceCard.addEventListener("click", () => {
            openSalaryDetailModal(user.id);
        });
    }

    await checkExpiredOrders();
    setInterval(checkExpiredOrders, 60000);

    await cleanExpiredOrders();
    setInterval(cleanExpiredOrders, 3600000); // 每小时清理一次过期订单

    await initStaffData();

    if (isAdmin) {
        document.getElementById("navTeamText").innerText = "团队管理";
        // 管理员显示编辑按钮
        const editBtn = document.getElementById("noticeEditBtn");
        if (editBtn) {
            editBtn.style.display = "block";
        }
        // 管理员显示公告设置菜单
        const noticeSettingNav = document.getElementById("nav-notice-setting");
        if (noticeSettingNav) {
            noticeSettingNav.style.display = "flex";
        }
    } else {
        document.getElementById("navTeamText").innerText = "个人中心";
    }

    // 先从云端同步公告到本地（否则员工端只弹窗会读不到）
    await syncPageNoticesFromCloud();

    // 初始化公告
    initNotice();
    // 初始化公告设置页面预览
    loadNoticeSettingsPreview();
    renderLucideIcons();
};

async function switchUser(userId) {
    // 只有管理员可以切换角色
    if (!isAdmin) {
        showToast('只有管理员可以切换角色', 'warning');
        return;
    }

    try {
        const staffList = await getStaffList();
        const testUsers = {
            admin: { id: "admin001", name: "管理员", role: "admin" }
        };
        staffList.forEach(staff => {
            testUsers[staff.id] = {
                id: staff.id,
                name: staff.name,
                role: "staff",
                password: staff.password
            };
        });

        if (!testUsers[userId]) {
            alert("该用户不存在！");
            return;
        }

        localStorage.setItem("loginUser", JSON.stringify(testUsers[userId]));
        alert(`已切换为【${testUsers[userId].name}】，页面将刷新！`);
        window.location.reload();
    } catch (error) {
        console.error("切换用户失败：", error);
        alert("切换用户失败，请重试！");
    }
}

function closeSubMenu() {
    const sub = document.getElementById("subMenu");
    const arr = document.getElementById("arrow");
    if (sub) sub.style.display = "none";
    if (arr) arr.innerText = "▼";
}

function toggleSubMenu() {
    const sub = document.getElementById("subMenu");
    const arr = document.getElementById("arrow");
    const navItem = document.getElementById("nav-taobao");

    if (sub.style.display === "block") {
        closeSubMenu();
        // 如果当前就在叫醒/监督页，保持“淘宝监督项目”高亮
        if (currentPage !== "wake" && currentPage !== "supervise") {
            navItem.classList.remove("active");
        }
    } else {
        sub.style.display = "block";
        arr.innerText = "▲";
        navItem.classList.add("active");
    }
}

// 切换日期折叠框
function toggleDateCollapse(id) {
    const content = document.getElementById(`collapse-${id}`);
    const header = document.querySelector(`[onclick="toggleDateCollapse('${id}')"]`);
    const arrow = header.querySelector('.date-arrow');
    if (content && arrow) {
        if (content.style.display === 'block') {
            content.style.display = 'none';
            arrow.innerText = '▶';
        } else {
            content.style.display = 'block';
            arrow.innerText = '▼';
        }
    }
}

// ==================== 公告功能 ====================

// 初始化公告
function initNotice() {
    loadNotice();
}

// 加载公告
function loadNotice() {
    const savedNotice = localStorage.getItem('systemNotice');
    const savedTime = localStorage.getItem('noticeUpdateTime');

    const noticeContent =
        document.getElementById('noticeContent') || document.getElementById('pageNoticeContent');
    const noticeTime =
        document.getElementById('noticeTime') || document.getElementById('pageNoticeTime');

    if (savedNotice && noticeContent) {
        noticeContent.innerHTML = `<p>${escapeHtml(savedNotice)}</p>`;
    }

    if (savedTime && noticeTime) {
        noticeTime.innerText = `最后更新：${savedTime}`;
    }
}

// 打开编辑公告弹窗
function editNotice() {
    const savedNotice = localStorage.getItem('systemNotice');
    const textarea = document.getElementById('noticeTextarea');

    if (savedNotice) {
        textarea.value = savedNotice;
    } else {
        textarea.value = '';
    }

    document.getElementById('editNoticeModal').style.display = 'flex';
}

// 关闭编辑公告弹窗
function closeEditNoticeModal() {
    document.getElementById('editNoticeModal').style.display = 'none';
}

// 保存公告
function saveNotice() {
    const textarea = document.getElementById('noticeTextarea');
    const content = textarea.value.trim();

    if (!content) {
        showToast('公告内容不能为空！', 'warning');
        return;
    }

    // 保存到localStorage
    localStorage.setItem('systemNotice', content);

    // 更新时间
    const now = new Date();
    const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    localStorage.setItem('noticeUpdateTime', timeStr);

    // 刷新显示
    loadNotice();
    closeEditNoticeModal();
    showToast('公告保存成功！', 'success');
}

// 简单的HTML转义，防止XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/\n/g, '<br>');
}

// ==================== 多页面公告功能 ====================

const PAGE_NOTICE_TABLE = 'page_notices';

// 当前编辑的页面
let currentEditPage = '';

// 页面名称映射
const pageNames = {
    'home': '首页',
    'wake': '叫醒页面',
    'supervise': '监督页面',
    'team': '个人中心'
};

function formatNoticeTime(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '--';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 从 Supabase 同步公告到本地缓存（用于跨设备显示弹窗）
async function syncPageNoticesFromCloud() {
    try {
        const { data, error } = await supabaseClient
            .from(PAGE_NOTICE_TABLE)
            .select('page, content, updatedat');
        if (error || !Array.isArray(data)) return;

        let latest = '';
        data.forEach((row) => {
            if (!row || !row.page) return;
            localStorage.setItem(`pageNotice_${row.page}`, row.content || '');
            if (row.updatedat && (!latest || row.updatedat > latest)) {
                latest = row.updatedat;
            }
        });
        if (latest) {
            localStorage.setItem('noticeUpdateTime', formatNoticeTime(latest));
        }
    } catch (e) {
        console.error('同步云端公告失败：', e);
    }
}

// 加载公告设置预览
function loadNoticeSettingsPreview() {
    const pages = ['home', 'wake', 'supervise', 'team'];
    pages.forEach(page => {
        const preview = document.getElementById(`noticePreview_${page}`);
        if (preview) {
            const notice = localStorage.getItem(`pageNotice_${page}`);
            if (notice) {
                preview.textContent = '已设置';
                preview.style.color = '#22c55e';
                preview.style.fontWeight = '600';
            } else {
                preview.textContent = '未设置';
                preview.style.color = '#64748b';
                preview.style.fontWeight = '400';
            }
        }
    });
}

// 打开编辑页面公告弹窗
function openPageNoticeModal(page) {
    currentEditPage = page;
    const savedNotice = localStorage.getItem(`pageNotice_${page}`);
    const textarea = document.getElementById('pageNoticeTextarea');
    const title = document.getElementById('editPageNoticeTitle');

    if (title) {
        title.textContent = `编辑${pageNames[page]}公告`;
    }

    if (textarea) {
        textarea.value = savedNotice || '';
    }

    document.getElementById('editPageNoticeModal').style.display = 'flex';
}

// 关闭编辑页面公告弹窗
function closeEditPageNoticeModal() {
    document.getElementById('editPageNoticeModal').style.display = 'none';
    currentEditPage = '';
}

// 保存页面公告
function savePageNotice() {
    const textarea = document.getElementById('pageNoticeTextarea');
    const content = textarea.value.trim();

    if (!content) {
        showToast('公告内容不能为空！', 'warning');
        return;
    }

    // 保存到localStorage
    localStorage.setItem(`pageNotice_${currentEditPage}`, content);
    localStorage.setItem('noticeUpdateTime', formatNoticeTime(new Date().toISOString()));

    // 同步写入 Supabase（跨设备可见）
    supabaseClient
        .from(PAGE_NOTICE_TABLE)
        .upsert(
            {
                page: currentEditPage,
                content,
                updatedby: user?.id || 'unknown',
                updatedat: new Date().toISOString()
            },
            { onConflict: 'page' }
        )
        .then(({ error }) => {
            if (error) {
                console.error('保存云端公告失败：', error);
                showToast(`云端公告保存失败：${error.message || '请检查数据库权限'}`, 'danger');
            }
        });

    // 记录已读状态重置（让员工重新看到）
    localStorage.removeItem(`pageNoticeRead_${currentEditPage}_${user.id}`);

    // 刷新预览
    loadNoticeSettingsPreview();
    closeEditPageNoticeModal();

    // 如果当前就在对应的页面，自动更新公告显示
    if (currentEditPage === currentPage) {
        showPageNoticeOnPage(currentEditPage);
    }

    showToast(`${pageNames[currentEditPage]}公告保存成功！`, 'success');
}

// 清除页面公告
function clearPageNotice() {
    if (!confirm('确定要清除这个公告吗？')) {
        return;
    }

    localStorage.removeItem(`pageNotice_${currentEditPage}`);
    loadNoticeSettingsPreview();
    closeEditPageNoticeModal();

    // 如果当前就在对应的页面，自动更新公告显示
    if (currentEditPage === currentPage) {
        showPageNoticeOnPage(currentEditPage);
    }

    showToast('公告已清除！', 'success');
}

// 检查并显示页面公告（员工用）
function checkAndShowPageNotice(page) {
    const notice = localStorage.getItem(`pageNotice_${page}`);
    const skipTodayKey = `pageNoticeSkipToday_${page}_${user.id}`;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const skippedDate = localStorage.getItem(skipTodayKey);
    const skippedToday = skippedDate === todayStr;
    const noticeUpdateTime = localStorage.getItem('noticeUpdateTime') || '';
    const signature = `${page}|${todayStr}|${noticeUpdateTime}|${notice || ''}`;

    if (notice && !skippedToday) {
        // 防止初始化阶段重复触发（showPage + onload）导致同一公告连弹两次
        if (signature === lastNoticePopupSignature) {
            return;
        }
        lastNoticePopupSignature = signature;
        showPageNotice(page, notice);
    }
}

// 显示页面公告弹窗
function showPageNotice(page, content) {
    const noticePageNames = {
        home: '首页',
        wake: '叫醒页面',
        supervise: '监督页面',
        team: '个人中心'
    };
    const noticePageIcons = {
        home: 'house',
        wake: 'alarm-clock',
        supervise: 'eye',
        team: 'user-round'
    };

    const icon = document.getElementById('pageNoticeIcon');
    const title = document.getElementById('pageNoticeTitle');
    const tag = document.getElementById('pageNoticeTag');
    const time = document.getElementById('pageNoticeTime');
    const noticeContent = document.getElementById('pageNoticeContent');

    if (icon) {
        icon.innerHTML = `<i data-lucide="${noticePageIcons[page] || "megaphone"}"></i>`;
    }

    if (title) {
        title.textContent = `${noticePageNames[page] || '系统'}公告`;
    }

    if (tag) {
        tag.textContent = noticePageNames[page] || '系统公告';
    }

    if (time) {
        const savedTime = localStorage.getItem('noticeUpdateTime');
        time.textContent = `发布时间：${savedTime || '--'}`;
    }

    if (noticeContent) {
        noticeContent.innerHTML = escapeHtml(content);
    }

    renderLucideIcons();
    document.getElementById('pageNoticeModal').style.display = 'flex';
}

// 关闭页面公告弹窗
function closePageNoticeModal() {
    document.getElementById('pageNoticeModal').style.display = 'none';
}

// 今日不再显示（仅当天生效）
function skipPageNoticeForToday() {
    if (currentPage) {
        const skipTodayKey = `pageNoticeSkipToday_${currentPage}_${user.id}`;
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        localStorage.setItem(skipTodayKey, todayStr);
    }
    closePageNoticeModal();
}

// ==================== 账号管理功能 ====================

async function updateCurrentStaffProfile(patch) {
    const result = await updateStaffProfileById(user.id, patch);
    if (!result.ok || !result.data) {
        throw new Error(result.reason || "资料保存失败");
    }
}

// 打开账号管理弹窗
function openAccountSettings() {
    const modal = document.getElementById('accountSettingsModal');
    if (modal) {
        modal.style.display = 'flex';
    }
    // 加载用户数据
    loadAccountSettings();
}

// 关闭账号管理弹窗
function closeAccountSettingsModal() {
    const modal = document.getElementById('accountSettingsModal');
    if (modal) {
        modal.style.display = 'none';
    }
    // 清空输入框
    const oldPasswordInput = document.getElementById('oldPassword');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    if (oldPasswordInput) oldPasswordInput.value = '';
    if (newPasswordInput) newPasswordInput.value = '';
    if (confirmPasswordInput) confirmPasswordInput.value = '';
}

// 加载账号设置
async function loadAccountSettings() {
    // 优先从数据库读取，失败时函数内部会回退本地缓存
    const staffList = await getStaffList();
    const currentStaff = staffList.find(s => s.id === user.id);

    if (currentStaff) {
        // 加载手机号
        const userPhone = document.getElementById('userPhone');
        if (userPhone) {
            userPhone.value = currentStaff.phone || '';
        }

        // 加载薪资结算方式
        const salaryMethod = document.getElementById('salaryMethod');
        if (salaryMethod) {
            salaryMethod.value = currentStaff.salaryMethod || 'alipay';
        }

        // 加载薪资账号
        const salaryAccount = document.getElementById('salaryAccount');
        if (salaryAccount) {
            salaryAccount.value = currentStaff.salaryAccount || '';
        }
    }
}

// 修改密码
async function changePassword() {
    const oldPasswordInput = document.getElementById('oldPassword');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');

    const oldPwd = oldPasswordInput.value.trim();
    const newPwd = newPasswordInput.value.trim();
    const confirmPwd = confirmPasswordInput.value.trim();

    if (!oldPwd) {
        showToast('请输入旧密码！', 'warning');
        return;
    }
    if (!newPwd) {
        showToast('请输入新密码！', 'warning');
        return;
    }
    if (newPwd !== confirmPwd) {
        showToast('两次输入的新密码不一致！', 'warning');
        return;
    }
    if (newPwd.length < 4) {
        showToast('新密码至少4位！', 'warning');
        return;
    }

    // 验证旧密码
    const staffList = await getStaffList();
    const currentStaffIndex = staffList.findIndex(s => s.id === user.id);

    if (currentStaffIndex === -1) {
        showToast('用户不存在！', 'danger');
        return;
    }

    if (staffList[currentStaffIndex].password !== oldPwd) {
        showToast('旧密码错误！', 'danger');
        return;
    }

    // 更新密码
    staffList[currentStaffIndex].password = newPwd;
    await saveStaffList(staffList);

    // 清空输入框
    oldPasswordInput.value = '';
    newPasswordInput.value = '';
    confirmPasswordInput.value = '';

    showToast('密码修改成功！', 'success');
}

// 绑定手机号
async function bindPhone() {
    const userPhoneInput = document.getElementById('userPhone');
    const phone = userPhoneInput.value.trim();

    if (!phone) {
        showToast('请输入手机号！', 'warning');
        return;
    }

    if (!/^1[3-9]\d{9}$/.test(phone)) {
        showToast('请输入正确的手机号！', 'warning');
        return;
    }

    try {
        await updateCurrentStaffProfile({ phone });
        showToast('手机号绑定成功！', 'success');
    } catch (e) {
        showToast(`手机号绑定失败：${e.message}`, 'danger');
    }
}

// 保存薪资结算方式
async function saveSalaryMethod() {
    const salaryMethodInput = document.getElementById('salaryMethod');
    const salaryAccountInput = document.getElementById('salaryAccount');

    const method = salaryMethodInput.value;
    const account = salaryAccountInput.value.trim();

    if (!account) {
        showToast('请输入账号！', 'warning');
        return;
    }

    try {
        await updateCurrentStaffProfile({
            salaryMethod: method,
            salaryAccount: account
        });
        showToast('薪资结算方式保存成功！', 'success');
    } catch (e) {
        showToast(`薪资结算方式保存失败：${e.message}`, 'danger');
    }
}

// ==================== 小组件详情功能 ====================

// 显示小组件详情
function showWidgetDetail(widgetType) {
    const modal = document.getElementById('widgetDetailModal');
    const title = document.getElementById('widgetDetailTitle');
    const content = document.getElementById('widgetDetailContent');

    if (!modal || !title || !content) return;

    modal.style.display = 'flex';

    switch (widgetType) {
        case 'todayOrders':
            title.textContent = '今日接单详情';
            renderTodayOrdersDetail(content);
            break;
        case 'balance':
            title.textContent = '余额明细';
            renderBalanceDetail(content);
            break;
        case 'myOrders':
            title.textContent = '我的订单';
            renderMyOrdersDetail(content);
            break;
    }
}

// 关闭小组件详情弹窗
function closeWidgetDetailModal() {
    const modal = document.getElementById('widgetDetailModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// 渲染今日接单详情
async function renderTodayOrdersDetail(container) {
    const orders = await getOrders();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayOrders = orders.filter(item => {
        const orderDate = new Date(item.submittime);
        const isTodayOrder = orderDate >= todayStart && orderDate < todayEnd;
        if (!isTodayOrder) return false;
        if (item.status === "待接单") return true;
        return item.staffid === user.id;
    });

    if (todayOrders.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #94a3b8;">
                <div style="margin-bottom: 16px;"><i data-lucide="clipboard-list" style="width: 48px; height: 48px;"></i></div>
                <div>今日暂无订单</div>
            </div>
        `;
        renderLucideIcons();
        return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 12px;">';
    todayOrders.forEach(order => {
        html += `
            <div style="padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid rgba(148, 163, 184, 0.2);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-weight: 600; color: #1e293b;">${order.phone}</span>
                    <span style="font-size: 12px; padding: 4px 8px; border-radius: 4px; background: ${order.status === '已完成' ? '#dcfce7' : order.status === '待接单' ? '#fef3c7' : '#dbeafe'}; color: ${order.status === '已完成' ? '#166534' : order.status === '待接单' ? '#92400e' : '#1e40af'};">${order.status}</span>
                </div>
                <div style="font-size: 13px; color: #64748b;"><i data-lucide="alarm-clock" style="width: 14px; height: 14px; margin-right: 4px;"></i>${typeof formatWakeTimeForDisplay === 'function' ? formatWakeTimeForDisplay(order.waketime) : order.waketime}</div>
                ${order.note ? `<div style="font-size: 12px; color: #94a3b8; margin-top: 4px;"><i data-lucide="file-text" style="width: 13px; height: 13px; margin-right: 4px;"></i>${order.note}</div>` : ''}
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
    renderLucideIcons();
}

// ==================== 新账号管理功能 ====================

// 打开账号管理主界面
function openAccountManagement() {
    const modal = document.getElementById('accountManagementModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

// 关闭账号管理主界面
function closeAccountManagementModal() {
    const modal = document.getElementById('accountManagementModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// 打开修改密码弹窗
function openChangePasswordModal() {
    closeAccountManagementModal();
    const modal = document.getElementById('changePasswordModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

// 关闭修改密码弹窗
function closeChangePasswordModal() {
    const modal = document.getElementById('changePasswordModal');
    if (modal) {
        modal.style.display = 'none';
    }
    // 清空输入框
    document.getElementById('cpOldPassword').value = '';
    document.getElementById('cpNewPassword').value = '';
    document.getElementById('cpConfirmPassword').value = '';
}

// 提交修改密码
async function submitChangePassword() {
    const oldPwd = document.getElementById('cpOldPassword').value.trim();
    const newPwd = document.getElementById('cpNewPassword').value.trim();
    const confirmPwd = document.getElementById('cpConfirmPassword').value.trim();

    if (!oldPwd) {
        showToast('请输入旧密码！', 'warning');
        return;
    }
    if (!newPwd) {
        showToast('请输入新密码！', 'warning');
        return;
    }
    if (newPwd !== confirmPwd) {
        showToast('两次输入的新密码不一致！', 'warning');
        return;
    }
    if (newPwd.length < 4) {
        showToast('新密码至少4位！', 'warning');
        return;
    }

    // 验证旧密码
    const staffList = await getStaffList();
    const currentStaffIndex = staffList.findIndex(s => s.id === user.id);

    if (currentStaffIndex === -1) {
        showToast('用户不存在！', 'danger');
        return;
    }

    if (staffList[currentStaffIndex].password !== oldPwd) {
        showToast('旧密码错误！', 'danger');
        return;
    }

    try {
        await updateCurrentStaffProfile({ password: newPwd });
        closeChangePasswordModal();
        showToast('密码修改成功！', 'success');
    } catch (e) {
        showToast(`密码修改失败：${e.message}`, 'danger');
    }
}

// 打开绑定手机号弹窗
async function openBindPhoneModal() {
    closeAccountManagementModal();
    const modal = document.getElementById('bindPhoneModal');
    if (modal) {
        modal.style.display = 'flex';
    }
    // 加载已有手机号
    const staffList = await getStaffList();
    const currentStaff = staffList.find(s => s.id === user.id);
    if (currentStaff && currentStaff.phone) {
        document.getElementById('bpUserPhone').value = currentStaff.phone;
    }
}

// 关闭绑定手机号弹窗
function closeBindPhoneModal() {
    const modal = document.getElementById('bindPhoneModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// 提交绑定手机号
async function submitBindPhone() {
    const phone = document.getElementById('bpUserPhone').value.trim();

    if (!phone) {
        showToast('请输入手机号！', 'warning');
        return;
    }

    if (!/^1[3-9]\d{9}$/.test(phone)) {
        showToast('请输入正确的手机号！', 'warning');
        return;
    }

    try {
        await updateCurrentStaffProfile({ phone });
        closeBindPhoneModal();
        showToast('手机号绑定成功！', 'success');
    } catch (e) {
        showToast(`手机号绑定失败：${e.message}`, 'danger');
    }
}

// 打开薪资结算方式弹窗
async function openSalaryMethodModal() {
    closeAccountManagementModal();
    const modal = document.getElementById('salaryMethodModal');
    if (modal) {
        modal.style.display = 'flex';
    }
    // 加载已有账号
    const staffList = await getStaffList();
    const currentStaff = staffList.find(s => s.id === user.id);
    if (currentStaff && currentStaff.salaryAccount) {
        document.getElementById('smSalaryAccount').value = currentStaff.salaryAccount;
    }
}

// 关闭薪资结算方式弹窗
function closeSalaryMethodModal() {
    const modal = document.getElementById('salaryMethodModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// 提交薪资结算方式
async function submitSalaryMethod() {
    const account = document.getElementById('smSalaryAccount').value.trim();

    if (!account) {
        showToast('请输入支付宝账号！', 'warning');
        return;
    }

    try {
        await updateCurrentStaffProfile({
            salaryMethod: 'alipay',
            salaryAccount: account
        });
        closeSalaryMethodModal();
        showToast('薪资结算方式保存成功！', 'success');
    } catch (e) {
        showToast(`薪资结算方式保存失败：${e.message}`, 'danger');
    }
}

// 渲染余额明细
function renderBalanceDetail(container) {
    const salaryList = JSON.parse(localStorage.getItem("salaryList") || "[]");
    const userSalary = salaryList.find(s => s.staffId === user.id);

    if (!userSalary || !userSalary.records || userSalary.records.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #94a3b8;">
                <div style="margin-bottom: 16px;"><i data-lucide="wallet" style="width: 48px; height: 48px;"></i></div>
                <div>暂无余额变动记录</div>
            </div>
        `;
        renderLucideIcons();
        return;
    }

    let html = `
        <div style="margin-bottom: 16px; padding: 16px; background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%); border-radius: 12px;">
            <div style="font-size: 13px; color: #166534; margin-bottom: 4px;">当前余额</div>
            <div style="font-size: 28px; font-weight: 700; color: #166534;">${userSalary.balance.toFixed(2)} 元</div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
    `;

    userSalary.records.slice().reverse().forEach(record => {
        html += `
            <div style="padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid rgba(148, 163, 184, 0.2); display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-weight: 500; color: #1e293b;">${record.type}</div>
                    <div style="font-size: 12px; color: #94a3b8;">${record.date}</div>
                </div>
                <div style="font-weight: 600; color: ${record.amount >= 0 ? '#16a34a' : '#dc2626'};">${record.amount >= 0 ? '+' : ''}${record.amount.toFixed(2)}</div>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
    renderLucideIcons();
}

// 渲染我的订单详情
async function renderMyOrdersDetail(container) {
    const orders = await getOrders();
    const myOrders = orders.filter(item => item.staffid === user.id);

    if (myOrders.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #94a3b8;">
                <div style="margin-bottom: 16px;"><i data-lucide="file-text" style="width: 48px; height: 48px;"></i></div>
                <div>暂无订单记录</div>
            </div>
        `;
        renderLucideIcons();
        return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 12px;">';
    myOrders.forEach(order => {
        html += `
            <div style="padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid rgba(148, 163, 184, 0.2);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-weight: 600; color: #1e293b;">${order.phone}</span>
                    <span style="font-size: 12px; padding: 4px 8px; border-radius: 4px; background: ${order.status === '已完成' ? '#dcfce7' : order.status === '待接单' ? '#fef3c7' : '#dbeafe'}; color: ${order.status === '已完成' ? '#166534' : order.status === '待接单' ? '#92400e' : '#1e40af'};">${order.status}</span>
                </div>
                <div style="font-size: 13px; color: #64748b;"><i data-lucide="alarm-clock" style="width: 14px; height: 14px; margin-right: 4px;"></i>${typeof formatWakeTimeForDisplay === 'function' ? formatWakeTimeForDisplay(order.waketime) : order.waketime}</div>
                <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;"><i data-lucide="calendar-days" style="width: 13px; height: 13px; margin-right: 4px;"></i>${order.submittime}</div>
                ${order.note ? `<div style="font-size: 12px; color: #94a3b8; margin-top: 4px;"><i data-lucide="file-text" style="width: 13px; height: 13px; margin-right: 4px;"></i>${order.note}</div>` : ''}
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
    renderLucideIcons();
}

