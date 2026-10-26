// ======================== 数据库配置（宝塔 MySQL，经本机 /api/db） ========================
let supabaseClient = null;

function initSupabaseClient() {
    if (supabaseClient) return supabaseClient;
    if (typeof createBaotaDbClient === "function") {
        supabaseClient = createBaotaDbClient();
        return supabaseClient;
    }
    if (typeof supabase !== "undefined" && supabase?.createClient) {
        supabaseClient = supabase.createClient("local", "local");
        return supabaseClient;
    }
    return null;
}

async function ensureSupabaseClient(timeoutMs = 4000) {
    const ready = initSupabaseClient();
    if (ready) return ready;
    const start = Date.now();
    return new Promise((resolve) => {
        const timer = setInterval(() => {
            const client = initSupabaseClient();
            if (client || Date.now() - start >= timeoutMs) {
                clearInterval(timer);
                if (!client) {
                    console.error("数据库客户端未加载，请检查 db-client.js");
                }
                resolve(client);
            }
        }, 150);
    });
}

supabaseClient = initSupabaseClient();
// =====================================================================

// 价格规则
const PRICE_RULE = {
    "06:00-06:30": 0.8,
    "06:31-07:00": 0.7,
    "07:01-08:00": 0.6,
    "08:01-24:00": 0.5
};
