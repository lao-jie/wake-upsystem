// ======================== Supabase 配置 ========================
// 前端使用固定配置，后端使用环境变量
const supabaseUrl = "https://yhscpdalrsinigamhiht.supabase.co";
const supabaseKey = "sb_publishable_tMuL4ECibUBQHkpuE4BWNg_PetrZaNV";
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
// =====================================================================

// 价格规则
const PRICE_RULE = {
    "06:00-06:30": 0.8,
    "06:31-07:00": 0.7,
    "07:01-08:00": 0.6,
    "08:01-24:00": 0.5
};
