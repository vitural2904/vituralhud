import type { PostMatchEarlyObjective, PostMatchOverviewMetric } from "./types";

export const postMatchOverviewCoreMetrics: PostMatchOverviewMetric[] = [
  "gold",
  "towers",
  "dragons",
  "barons",
  "inhibitors",
];

export function getPostMatchOverviewMetrics(earlyObjective: PostMatchEarlyObjective): PostMatchOverviewMetric[] {
  return [...postMatchOverviewCoreMetrics, earlyObjective];
}
