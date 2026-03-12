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

    let user = null;
    try {
        // 第一步：优先从 Supabase 查询
        const { data, error } = await supabaseClient
            .from('staff_list')
            .select('id, password, name')
            .eq('id', uid)
            .eq('password', pwd)
            .single();

        if (!error && data) {
            // Supabase 查询成功，组装用户信息
            user = {
                id: data.id,
                name: data.name,
                role: data.id === 'admin' ? 'admin' : 'staff'
            };
        }
    } catch (e) {
        console.log("Supabase 查询失败，使用本地账号兜底：", e);
    }

    // 第二步：Supabase 无数据/失败，用本地账号兜底
    if (!user) {
        // 支持输入"admin"或"admin001"作为管理员账号
        const adminUid = uid === 'admin' ? 'admin001' : uid;
        user = users.find(u => u.id === adminUid && u.pwd === pwd);
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