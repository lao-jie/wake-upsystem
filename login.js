// 原有本地账号（保留，作为兜底）
const users = [
    { id: "staff01", pwd: "123456", name: "员工1", role: "staff" },
    { id: "staff02", pwd: "123456", name: "员工2", role: "staff" },
    { id: "admin", pwd: "admin888", name: "管理员", role: "admin" }
];

// 页面加载时检查是否有保存的账号密码
window.addEventListener('DOMContentLoaded', function() {
    const savedUid = localStorage.getItem("savedUid");
    const savedPwd = localStorage.getItem("savedPwd");
    const rememberMe = localStorage.getItem("rememberMe");
    
    if (rememberMe === "true" && savedUid && savedPwd) {
        document.getElementById("uid").value = savedUid;
        document.getElementById("pwd").value = savedPwd;
        document.getElementById("rememberMe").checked = true;
    }
});

let loginInProgress = false;

// 改造 login 函数为异步，优先查本地账号，Supabase 仅作为兜底
async function login() {
    if (loginInProgress) return;

    const loginBtn = document.querySelector(".login-btn");
    const defaultBtnText = loginBtn ? loginBtn.textContent : "";

    let uid = document.getElementById("uid").value.trim();
    let pwd = document.getElementById("pwd").value.trim();
    const rememberMe = document.getElementById("rememberMe").checked;

    if (!uid || !pwd) {
        alert("请输入账号和密码！");
        return;
    }

    loginInProgress = true;
    if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.textContent = "登录中…";
    }

    // 先检查本地账号，快速响应
    const localUser = users.find(u => u.id === uid && u.pwd === pwd);

    if (localUser) {
        // 本地账号匹配成功，直接登录
        localStorage.setItem("loginUser", JSON.stringify(localUser));
        
        // 保存或清除账号密码
        if (rememberMe) {
            localStorage.setItem("savedUid", uid);
            localStorage.setItem("savedPwd", pwd);
            localStorage.setItem("rememberMe", "true");
        } else {
            localStorage.removeItem("savedUid");
            localStorage.removeItem("savedPwd");
            localStorage.removeItem("rememberMe");
        }
        
        location.href = "jiaoxing.html";
        return;
    }

    // 本地账号未匹配，尝试 Supabase 查询（使用超时控制）
    try {
        // 设置超时控制，避免 Supabase 查询过慢
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Supabase 查询超时')), 3000);
        });

        const supabasePromise = supabaseClient
            .from('staff_list')
            .select('id, password, name')
            .eq('id', uid)
            .eq('password', pwd)
            .single();

        // 使用 Promise.race 实现超时控制
        const { data, error } = await Promise.race([supabasePromise, timeoutPromise]);

        if (!error && data) {
            // Supabase 查询成功，组装用户信息
            const user = {
                id: data.id,
                name: data.name,
                role: data.id === 'admin' ? 'admin' : 'staff'
            };

            // 保存和跳转
            localStorage.setItem("loginUser", JSON.stringify(user));
            
            // 保存或清除账号密码
            if (rememberMe) {
                localStorage.setItem("savedUid", uid);
                localStorage.setItem("savedPwd", pwd);
                localStorage.setItem("rememberMe", "true");
            } else {
                localStorage.removeItem("savedUid");
                localStorage.removeItem("savedPwd");
                localStorage.removeItem("rememberMe");
            }
            
            location.href = "jiaoxing.html";
            return;
        }
    } catch (e) {
        console.log("Supabase 查询失败：", e);
    } finally {
        loginInProgress = false;
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.textContent = defaultBtnText;
        }
    }

    // 验证最终结果
    alert("账号或密码错误，请重试");
}

// 绑定按钮点击事件
document.querySelector('.login-btn').addEventListener('click', login);

// 额外优化：回车键触发登录
document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
        login();
    }
});
