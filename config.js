// ======================== Supabase 配置 ========================
const supabaseUrl = "https://yhscpdalrsinigamhiht.supabase.co";
const supabaseKey = "sb_publishable_tMuL4ECibUBQHkpuE4BWNg_PetrZaNV";

let supabaseClient = null;

function initSupabaseClient() {
    if (supabaseClient) return supabaseClient;
    if (typeof supabase === "undefined" || !supabase?.createClient) {
        return null;
    }
    supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
    return supabaseClient;
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
                    console.error("Supabase SDK 未加载，请检查网络或 CDN");
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
