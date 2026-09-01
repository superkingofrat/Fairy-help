import * as insightService from "../services/insightService";
import type { StoreInsightsOverview } from "@fairy/shared";

// FU-12：storeInsightTool——admin 在 chat 中直接询问店内运营数据。
// 复用 FU-11 的聚合服务，一次返回完整 overview；topic 切片与话术在 responseSynthesizer 侧完成。

export async function storeInsightTool(): Promise<{
  success: boolean;
  data?: StoreInsightsOverview;
  error?: string;
}> {
  try {
    const overview = await insightService.getStoreInsightsOverview();
    return { success: true, data: overview };
  } catch (error) {
    console.error("[storeInsightTool] aggregation failed:", error);
    return { success: false, error: "INSIGHT_UNAVAILABLE" };
  }
}
