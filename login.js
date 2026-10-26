// 原有本地账号（保留，作为兜底）
const users = [
    { id: "staff01", pwd: "123456", name: "员工1", role: "staff" },
    { id: "staff02", pwd: "123456", name: "员工2", role: "staff" },
    { id: "admin", pwd: "admin888", name: "管理员", role: "admin" }
];

let loginInProgress = false;
let registerInProgress = false;
let sendCodeTimer = null;
let sendCodeLeft = 0;

window.addEventListener("DOMContentLoaded", function () {
    const savedUid = localStorage.getItem("savedUid");
    const savedPwd = localStorage.getItem("savedPwd");
    const rememberMe = localStorage.getItem("rememberMe");

    if (rememberMe === "true" && savedUid && savedPwd) {
        document.getElementById("uid").value = savedUid;
        document.getElementById("pwd").value = savedPwd;
        document.getElementById("rememberMe").checked = true;
    }

    const loginBtn = document.getElementById("loginBtn") || document.querySelector(".login-btn");
    if (loginBtn) loginBtn.addEventListener("click", login);
});

function switchAuthTab(tab) {
    const isLogin = tab === "login";
    const loginForm = document.getElementById("loginForm");
    const registerForm = document.getElementById("registerForm");
    const tabLogin = document.getElementById("tabLogin");
    const tabRegister = document.getElementById("tabRegister");
    if (loginForm) loginForm.style.display = isLogin ? "flex" : "none";
    if (registerForm) registerForm.style.display = isLogin ? "none" : "flex";
    if (tabLogin) tabLogin.classList.toggle("active", isLogin);
    if (tabRegister) tabRegister.classList.toggle("active", !isLogin);
}

async function login() {
    if (loginInProgress) return;

    const loginBtn = document.getElementById("loginBtn") || document.querySelector("#loginForm .login-btn");
    const defaultBtnText = loginBtn ? loginBtn.textContent : "";

    const uid = document.getElementById("uid").value.trim();
    const pwd = document.getElementById("pwd").value.trim();
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

    const localUser = users.find((u) => u.id === uid && u.pwd === pwd);
    if (localUser) {
        finishLogin(localUser, rememberMe, uid, pwd);
        return;
    }

    try {
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error("查询超时")), 5000);
        });
        const dbPromise = supabaseClient
            .from("staff_list")
            .select("id, password, name")
            .eq("id", uid)
            .eq("password", pwd)
            .single();
        const { data, error } = await Promise.race([dbPromise, timeoutPromise]);
        if (!error && data) {
            finishLogin(
                {
                    id: data.id,
                    name: data.name,
                    role: data.id === "admin" ? "admin" : "staff"
                },
                rememberMe,
                uid,
                pwd
            );
            return;
        }
    } catch (e) {
        console.log("登录查询失败：", e);
    } finally {
        loginInProgress = false;
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.textContent = defaultBtnText;
        }
    }

    alert("账号或密码错误，请重试");
}

function finishLogin(user, rememberMe, uid, pwd) {
    localStorage.setItem("loginUser", JSON.stringify(user));
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
}

function startSendCodeCountdown(sec) {
    const btn = document.getElementById("sendCodeBtn");
    sendCodeLeft = Math.max(1, Number(sec) || 60);
    if (sendCodeTimer) clearInterval(sendCodeTimer);
    const tick = () => {
        if (!btn) return;
        if (sendCodeLeft <= 0) {
            clearInterval(sendCodeTimer);
            sendCodeTimer = null;
            btn.disabled = false;
            btn.textContent = "获取验证码";
            return;
        }
        btn.disabled = true;
        btn.textContent = `${sendCodeLeft}s`;
        sendCodeLeft -= 1;
    };
    tick();
    sendCodeTimer = setInterval(tick, 1000);
}

async function sendRegisterCode() {
    const btn = document.getElementById("sendCodeBtn");
    if (btn && btn.disabled) return;
    const user = document.getElementById("regUser")?.value.trim() || "";
    if (!user) {
        alert("请先填写QQ账号");
        return;
    }
    if (!/^[1-9][0-9]{4,10}$/.test(user)) {
        alert("账号必须为QQ号");
        return;
    }
    if (btn) {
        btn.disabled = true;
        btn.textContent = "发送中…";
    }
    try {
        const res = await fetch("/api/auth/send-code", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user })
        });
        const json = await res.json().catch(() => ({}));
        if (json.code === 1) {
            alert(json.msg || "验证码已发送");
            startSendCodeCountdown(json.wait || 60);
            return;
        }
        alert(json.msg || "发送失败");
        if (json.wait) startSendCodeCountdown(json.wait);
        else if (btn) {
            btn.disabled = false;
            btn.textContent = "获取验证码";
        }
    } catch (e) {
        alert("发送失败：" + (e.message || e));
        if (btn) {
            btn.disabled = false;
            btn.textContent = "获取验证码";
        }
    }
}

async function submitRegister() {
    if (registerInProgress) return;
    const name = document.getElementById("regName")?.value.trim() || "";
    const user = document.getElementById("regUser")?.value.trim() || "";
    const pass = document.getElementById("regPass")?.value.trim() || "";
    const yqm = document.getElementById("regInvite")?.value.trim() || "";
    const code = document.getElementById("regCode")?.value.trim() || "";
    if (!name || !user || !pass || !yqm || !code) {
        alert("所有项目不能为空");
        return;
    }
    const btn = document.getElementById("registerBtn");
    registerInProgress = true;
    if (btn) {
        btn.disabled = true;
        btn.textContent = "注册中…";
    }
    try {
        const res = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, user, pass, yqm, code })
        });
        const json = await res.json().catch(() => ({}));
        if (json.code === 1) {
            alert(json.msg || "注册成功");
            document.getElementById("uid").value = user;
            document.getElementById("pwd").value = pass;
            switchAuthTab("login");
            return;
        }
        alert(json.msg || "注册失败");
    } catch (e) {
        alert("注册失败：" + (e.message || e));
    } finally {
        registerInProgress = false;
        if (btn) {
            btn.disabled = false;
            btn.textContent = "注册";
        }
    }
}

document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    const regVisible = document.getElementById("registerForm")?.style.display !== "none";
    if (regVisible) submitRegister();
    else login();
});
