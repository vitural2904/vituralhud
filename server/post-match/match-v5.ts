import type { PostMatchData, PostMatchPlayer } from "../../src/domain/types";
import { champions } from '../../src/domain/catalog';
import { playerMetrics } from '../../src/domain/validation';

type RiotObjective = { first?: boolean; kills?: number };
type RiotTeam = {
  teamId?: number;
  win?: boolean;
  objectives?: Record<string, RiotObjective | undefined>;
};
type RiotParticipant = {
  participantId?: number;
  teamId?: number;
  kills?: number;
  assists?: number;
  largestKillingSpree?: number;
  goldEarned?: number;
  totalDamageDealtToChampions?: number;
  damageDealtToObjectives?: number;
  championName?: string;
  championId?: number;
  riotIdGameName?: string;
  summonerName?: string;
  teamPosition?: string;
};
type RiotMatch = {
  metadata?: { matchId?: string };
  info?: {
    gameDuration?: number;
    gameVersion?: string;
    gameEndTimestamp?: number;
    participants?: RiotParticipant[];
    teams?: RiotTeam[];
  };
};
const roleOrder: Record<string, number> = { TOP: 0, JUNGLE: 1, MIDDLE: 2, BOTTOM: 3, UTILITY: 4 };
const hasNumber = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const numeric = (value: unknown) => hasNumber(value) ? Number(value) : 0;
const objectiveKills = (team: RiotTeam | undefined, key: string) => numeric(team?.objectives?.[key]?.kills);
const canonicalChampion = (participant: RiotParticipant) => champions.find(champ => champ.numericId === participant.championId)?.id
  ?? champions.find(champ => champ.id.toLowerCase() === participant.championName?.toLowerCase())?.id ?? null;
const ordered = (participants: RiotParticipant[], teamId: number) => participants.filter(p => p.teamId === teamId).sort((a, b) => (roleOrder[a.teamPosition ?? ''] ?? 99) - (roleOrder[b.teamPosition ?? ''] ?? 99) || (a.participantId ?? 99) - (b.participantId ?? 99)).slice(0, 5);
function durationOf(match: RiotMatch): number {
  const info = match.info;
  if (!hasNumber(info?.gameDuration)) return 0;
  if (hasNumber(info?.gameEndTimestamp)) return Number(info?.gameDuration);
  const version = info?.gameVersion?.match(/^(\d+)\.(\d+)/);
  if (!version) return 0;
  const legacy = Number(version[1]) < 11 || (Number(version[1]) === 11 && Number(version[2]) < 20);
  return Math.round(Number(info?.gameDuration) / (legacy ? 1000 : 1));
}

export function collectMatchV5Warnings(match: RiotMatch) {
  const participants = match.info?.participants ?? [];
  const teams = match.info?.teams ?? [];
  const warnings: string[] = [];

  if (!durationOf(match)) warnings.push("Thiếu thời lượng hoặc đơn vị thời lượng chưa rõ. Cần nhập thời lượng trước khi duyệt.");
  if ([100, 200].some((teamId) => participants.filter((participant) => participant.teamId === teamId).length < 5)) {
    warnings.push("Thiếu người chơi của một hoặc cả hai đội. Slot thiếu cần điền trước khi duyệt.");
  }

  const objectiveLabels: Array<[string, string]> = [
    ["tower", "Trụ"],
    ["dragon", "Rồng"],
    ["baron", "Baron"],
    ["inhibitor", "Nhà lính"],
  ];
  const missingObjectives = objectiveLabels
    .filter(([key]) => teams.some((team) => !hasNumber(team.objectives?.[key]?.kills)))
    .map(([, label]) => label);
  if (missingObjectives.length) warnings.push(`Thiếu dữ liệu mục tiêu: ${missingObjectives.join(", ")}. Cần điền hoặc xác nhận số 0 trước khi duyệt.`);

  const hasCompleteEarlyObjective = ["horde", "riftHerald"]
    .some((key) => teams.length >= 2 && teams.every((team) => hasNumber(team.objectives?.[key]?.kills)));
  if (!hasCompleteEarlyObjective) warnings.push("Thiếu dữ liệu Sâu hư không/Sứ giả. Cần điền hoặc xác nhận số 0 trước khi duyệt.");

  const playerFields: Array<[keyof RiotParticipant, string]> = [
    ["kills", "kill"],
    ["assists", "assist"],
    ["goldEarned", "gold"],
    ["totalDamageDealtToChampions", "damage tướng"],
    ["largestKillingSpree", "killing spree"],
    ["damageDealtToObjectives", "damage mục tiêu"],
  ];
  const missingPlayerFields = playerFields
    .filter(([key]) => participants.some((participant) => !hasNumber(participant[key])))
    .map(([, label]) => label);
  if (missingPlayerFields.length) warnings.push(`Thiếu chỉ số người chơi: ${missingPlayerFields.join(", ")}. Cần điền hoặc xác nhận số 0 trước khi duyệt.`);

  return warnings;
}

function normalizePlayers(participants: RiotParticipant[], teamId: number): PostMatchPlayer[] {
  const players = ordered(participants, teamId)
    .map((participant) => ({
      player: (participant.riotIdGameName || participant.summonerName || '').slice(0, 24),
      championId: canonicalChampion(participant),
      damageToChampions: numeric(participant.totalDamageDealtToChampions),
      kills: numeric(participant.kills), assists: numeric(participant.assists),
      largestKillingSpree: numeric(participant.largestKillingSpree), damageToObjectives: numeric(participant.damageDealtToObjectives),
    }));
  while (players.length < 5) players.push({
    player: '',
    championId: null,
    damageToChampions: 0,
    kills: 0,
    assists: 0,
    largestKillingSpree: 0,
    damageToObjectives: 0,
  });
  return players;
}

export function normalizeMatchV5(match: RiotMatch): PostMatchData {
  if (!match || !Array.isArray(match.info?.participants) || !Array.isArray(match.info?.teams)) throw new Error('Match-V5 có cấu trúc không hợp lệ.');
  const participants = match.info?.participants ?? [];
  const riotTeams = match.info?.teams ?? [];
  const blueTeam = riotTeams.find((team) => team.teamId === 100);
  const redTeam = riotTeams.find((team) => team.teamId === 200);
  if (!blueTeam || !redTeam || participants.length < 2) throw new Error("Match-V5 không có đủ dữ liệu hai đội");
  if (typeof blueTeam.win !== 'boolean' || typeof redTeam.win !== 'boolean' || blueTeam.win === redTeam.win) throw new Error("Match-V5 không xác định được đội thắng");

  const supportsVoidGrubs = Object.prototype.hasOwnProperty.call(blueTeam.objectives ?? {}, "horde")
    || Object.prototype.hasOwnProperty.call(redTeam.objectives ?? {}, "horde");
  const voidGrubKills = objectiveKills(blueTeam, "horde") + objectiveKills(redTeam, "horde");
  const riftHeraldKills = objectiveKills(blueTeam, "riftHerald") + objectiveKills(redTeam, "riftHerald");
  const durationSeconds = durationOf(match);

  const makeTeam = (team: RiotTeam, teamId: number) => {
    const members = participants.filter((participant) => participant.teamId === teamId);
    return {
      kills: members.reduce((sum, participant) => sum + numeric(participant.kills), 0),
      gold: members.reduce((sum, participant) => sum + numeric(participant.goldEarned), 0),
      towers: objectiveKills(team, "tower"),
      dragons: objectiveKills(team, "dragon"),
      barons: objectiveKills(team, "baron"),
      inhibitors: objectiveKills(team, "inhibitor"),
      voidGrubs: objectiveKills(team, "horde"),
      riftHeralds: objectiveKills(team, "riftHerald"),
      players: normalizePlayers(participants, teamId),
    };
  };

  return {
    winner: blueTeam.win ? "blue" : "red",
    durationSeconds,
    earlyObjective: voidGrubKills > 0 || (supportsVoidGrubs && riftHeraldKills === 0) ? "voidGrubs" : "riftHeralds",
    teams: {
      blue: makeTeam(blueTeam, 100),
      red: makeTeam(redTeam, 200),
    },
  };
}

export function collectMatchV5MissingFields(match: RiotMatch, data = normalizeMatchV5(match)) {
  const missing: string[] = [];
  if (!durationOf(match)) missing.push('durationSeconds');
  const playerKeys = { damageToChampions: 'totalDamageDealtToChampions', kills: 'kills', assists: 'assists', largestKillingSpree: 'largestKillingSpree', damageToObjectives: 'damageDealtToObjectives' } as const;
  const objectiveKeys = { towers: 'tower', dragons: 'dragon', barons: 'baron', inhibitors: 'inhibitor', voidGrubs: 'horde', riftHeralds: 'riftHerald' } as const;
  for (const [side, teamId] of [['blue', 100], ['red', 200]] as const) {
    const players = ordered(match.info?.participants ?? [], teamId);
    const team = match.info?.teams?.find(item => item.teamId === teamId);
    if (players.length !== 5 || players.some(p => !hasNumber(p.kills))) missing.push(`teams.${side}.kills`);
    if (players.length !== 5 || players.some(p => !hasNumber(p.goldEarned))) missing.push(`teams.${side}.gold`);
    for (const [field, key] of Object.entries(objectiveKeys)) {
      if (['voidGrubs', 'riftHeralds'].includes(field) && field !== data.earlyObjective) continue;
      if (!hasNumber(team?.objectives?.[key]?.kills)) missing.push(`teams.${side}.${field}`);
    }
    for (let index = 0; index < 5; index++) {
      const p = players[index]; const base = `teams.${side}.players.${index}`;
      if (!p || !(p.riotIdGameName || p.summonerName)) missing.push(`${base}.player`);
      if (!p || !canonicalChampion(p)) missing.push(`${base}.championId`);
      for (const metric of playerMetrics) if (!p || !hasNumber(p[playerKeys[metric]])) missing.push(`${base}.${metric}`);
    }
  }
  return missing;
}

export function regionalRouteForMatch(matchId: string) {
  const platform = matchId.split("_")[0]?.toUpperCase();
  if (["VN2", "PH2", "SG2", "TH2", "TW2", "OC1"].includes(platform)) return "sea";
  if (["KR", "JP1"].includes(platform)) return "asia";
  if (["EUW1", "EUN1", "TR1", "RU"].includes(platform)) return "europe";
  return "americas";
}

async function readRiotJson<T>(response: Response, label: string): Promise<T> {
  if (response.ok) return response.json() as Promise<T>;
  if (response.status === 401 || response.status === 403) throw new Error("Riot API key không hợp lệ hoặc hết hạn");
  if (response.status === 404) throw new Error(`Không tìm thấy ${label}`);
  if (response.status === 429) throw new Error("Riot API đang giới hạn request. Thử lại sau");
  throw new Error(`Riot API lỗi ${response.status} khi lấy ${label}`);
}

export async function fetchMatchV5(matchId: string, options: {
  apiKey: string;
  regionalRoute?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}) {
  const cleanMatchId = matchId.trim().toUpperCase();
  if (!/^[A-Z0-9]+_\d+$/.test(cleanMatchId)) throw new Error("Match ID không đúng dạng. Ví dụ: VN2_123456789");
  if (!options.apiKey) throw new Error("Thiếu RIOT_API_KEY trên server");
  const route = options.regionalRoute || regionalRouteForMatch(cleanMatchId);
  if (!['sea', 'asia', 'europe', 'americas'].includes(route)) throw new Error('Riot regional route không hợp lệ.');
  const request = options.fetchImpl ?? fetch;
  const base = `https://${route}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(cleanMatchId)}`;
  const headers = { "X-Riot-Token": options.apiKey };
  const deadline = AbortSignal.timeout(options.timeoutMs ?? 10000);
  const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
  const match = await readRiotJson<RiotMatch>(await request(base, { headers, signal }), "kết quả trận");
  const data = normalizeMatchV5(match);
  return {
    matchId: match.metadata?.matchId || cleanMatchId,
    data,
    missingFields: collectMatchV5MissingFields(match, data),
    warnings: collectMatchV5Warnings(match),
  };
}
