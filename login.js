// 原有本地账号（保留，作为兜底）
const users = [
    { id: "staff01", pwd: "123456", name: "员工1", role: "staff" },
    { id: "staff02", pwd: "123456", name: "员工2", role: "staff" },
    { id: "admin001", pwd: "admin888", name: "管理员", role: "admin" }
];

// 改造 login 函数为异步，优先查 Supabase
async function login() {
    let uid = document.getElementById("uid").value.trim();
    let pwd = document.getElementById("pwd").value.trim();

    if (!uid || !pwd) {
        alert("请输入账号和密码！");
        return;
    }


    // 添加加载状态
    const loginBtn = document.querySelector('.login-btn');
    const originalText = loginBtn.textContent;
    loginBtn.textContent = "登录中...";
    loginBtn.disabled = true;

    let user = null;

    try {
        // 并行处理：同时进行 Supabase 查询和本地账号检查
        const [supabaseResult, localResult] = await Promise.all([
            // Supabase 查询
            (async () => {
                try {
                    const result = await supabaseClient
                        .from('staff_list')
                        .select('id, password, name')
                        .eq('id', uid)
                        .eq('password', pwd)
                        .single();
                    return result;
                } catch (err) {
                    console.log("Supabase 查询失败，使用本地账号兜底：", err);
                    return { data: null, error: err };
                }
            })(),
            // 本地账号检查（立即执行）
            Promise.resolve(() => {
                const adminUid = uid === 'admin' ? 'admin001' : uid;
                return users.find(u => u.id === adminUid && u.pwd === pwd);
            })()
        ]);

        // 优先使用 Supabase 结果
        if (supabaseResult.data) {
            user = {
                id: supabaseResult.data.id,
                name: supabaseResult.data.name,
                role: supabaseResult.data.id === 'admin' ? 'admin' : 'staff'
            };
        } else if (localResult) {
            // Supabase 无数据，使用本地账号
            user = localResult;
        }
    } catch (e) {
        console.log("登录过程出错：", e);
        // 出错时尝试本地账号
        const adminUid = uid === 'admin' ? 'admin001' : uid;
        user = users.find(u => u.id === adminUid && u.pwd === pwd);
    } finally {
        // 恢复按钮状态
        loginBtn.textContent = originalText;
        loginBtn.disabled = false;
    }

    // 验证最终结果
    if (!user) {
        alert("账号或密码错误，请重试");
        return;
    }

    // 原有保存和跳转逻辑（完全不变）
    localStorage.setItem("loginUser", JSON.stringify(user));
    location.href = "jiaoxing.html";
}

// 绑定按钮点击事件
document.querySelector('.login-btn').addEventListener('click', login);

// 额外优化：回车键触发登录
document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
        login();
    }
});
