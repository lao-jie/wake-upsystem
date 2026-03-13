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

const { user, allUsers } = initUser();
const isAdmin = user.role === "admin";
const isStaff = user.role === "staff";
document.body.classList.toggle("is-staff", isStaff);
const mobileMQ = window.matchMedia("(max-width: 768px)");
function applyMobileFlag() {
    const isMobile = mobileMQ.matches;
    console.log('移动端检测:', isMobile);
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
console.log('初始化时用户角色:', user.role, 'isStaff:', isStaff, 'isAdmin:', isAdmin);
document.body.classList.toggle("is-staff", isStaff);
console.log('body类:', document.body.className);
document.getElementById("userName").innerText = user.name;
document.getElementById("teamUserName").innerText = user.name;

let parsedBatchOrders = [];
let originalOrders = [];

// 轻提示 Toast（替代 alert）
let toastTimer = null;
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

function showPage(page) {
    currentPage = page;
    // 切换页面时自动收起下拉，避免遮挡底部导航点击
    closeSubMenu();

    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.getElementById(`page_${page}`).classList.add("active");

    document.querySelectorAll(".nav-item, .sub-item").forEach(el => el.classList.remove("active"));

    if (page === "team") {
        document.getElementById("nav-team").classList.add("active");
        document.getElementById("teamUserName").innerText = user.name;

        if (isAdmin) {
            document.getElementById("teamPageTitle").innerText = "团队管理";
            document.getElementById("teamManagerArea").style.display = "block";
            document.getElementById("staffProfileArea").style.display = "none";
            renderTeamTable();
        } else {
            document.getElementById("teamPageTitle").innerText = "个人中心";
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
    } else if (page === "supervise") {
        document.getElementById("nav-taobao").classList.add("active");
        document.getElementById("sub-supervise").classList.add("active");
    }
}

// 页面基础（必须放在 currentPage 声明之后）
showPage("home");

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

    document.getElementById("roleSwitchArea").style.display = isAdmin ? "flex" : "none";

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
    } else {
        document.getElementById("navTeamText").innerText = "个人中心";
    }
};

async function switchUser(userId) {
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
