export const teamMetrics = ['kills', 'gold', 'towers', 'dragons', 'barons', 'inhibitors', 'voidGrubs', 'riftHeralds'] as const;
export const playerMetrics = ['damageToChampions', 'kills', 'assists', 'largestKillingSpree', 'damageToObjectives'] as const;
export const postFields = ['winner', 'durationSeconds', 'earlyObjective', ...(['blue', 'red'] as const).flatMap(s => [
  ...teamMetrics.map(metric => `teams.${s}.${metric}`),
  ...Array.from({ length: 5 }, (_, index) => ['player', 'championId', ...playerMetrics].map(metric => `teams.${s}.players.${index}.${metric}`)).flat(),
])];
export const numericPostFields = postFields.filter(field => field === 'durationSeconds' || /\.(kills|gold|towers|dragons|barons|inhibitors|voidGrubs|riftHeralds|damageToChampions|assists|largestKillingSpree|damageToObjectives)$/.test(field));
