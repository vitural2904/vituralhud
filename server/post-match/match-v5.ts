import type { PostMatchData, PostMatchPlayer } from "../../src/domain/types";

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
  riotIdGameName?: string;
  summonerName?: string;
  teamPosition?: string;
};
type RiotMatch = {
  metadata?: { matchId?: string };
  info?: {
    gameDuration?: number;
    participants?: RiotParticipant[];
    teams?: RiotTeam[];
  };
};
const roleOrder: Record<string, number> = { TOP: 0, JUNGLE: 1, MIDDLE: 2, BOTTOM: 3, UTILITY: 4 };
const objectiveKills = (team: RiotTeam | undefined, key: string) => Math.max(0, Math.round(team?.objectives?.[key]?.kills ?? 0));
const hasNumber = (value: unknown) => Number.isFinite(value);

export function collectMatchV5Warnings(match: RiotMatch) {
  const participants = match.info?.participants ?? [];
  const teams = match.info?.teams ?? [];
  const warnings: string[] = [];

  if (!hasNumber(match.info?.gameDuration)) warnings.push("Thiếu thời lượng trận. Đã đặt 00:00. Kiểm tra và nhập tay nếu cần.");
  if ([100, 200].some((teamId) => participants.filter((participant) => participant.teamId === teamId).length < 5)) {
    warnings.push("Thiếu người chơi của một hoặc cả hai đội. Slot thiếu đã được đặt về 0.");
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
  if (missingObjectives.length) warnings.push(`Thiếu dữ liệu mục tiêu: ${missingObjectives.join(", ")}. Đã đặt 0–0. Kiểm tra và nhập tay nếu cần.`);

  const hasCompleteEarlyObjective = ["horde", "riftHerald"]
    .some((key) => teams.length >= 2 && teams.every((team) => hasNumber(team.objectives?.[key]?.kills)));
  if (!hasCompleteEarlyObjective) warnings.push("Thiếu dữ liệu Sâu hư không/Sứ giả. Đã đặt 0–0. Kiểm tra và nhập tay nếu cần.");

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
  if (missingPlayerFields.length) warnings.push(`Thiếu chỉ số người chơi: ${missingPlayerFields.join(", ")}. Giá trị thiếu đã được đặt 0.`);

  return warnings;
}

function normalizePlayers(participants: RiotParticipant[], teamId: number): PostMatchPlayer[] {
  const players = participants
    .filter((participant) => participant.teamId === teamId)
    .sort((a, b) => (roleOrder[a.teamPosition ?? ""] ?? 99) - (roleOrder[b.teamPosition ?? ""] ?? 99) || (a.participantId ?? 99) - (b.participantId ?? 99))
    .slice(0, 5)
    .map((participant) => ({
      player: participant.riotIdGameName || participant.summonerName || `Player ${participant.participantId ?? ""}`.trim(),
      championId: participant.championName || null,
      damageToChampions: Math.max(0, Math.round(participant.totalDamageDealtToChampions ?? 0)),
      kills: Math.max(0, Math.round(participant.kills ?? 0)),
      assists: Math.max(0, Math.round(participant.assists ?? 0)),
      largestKillingSpree: Math.max(0, Math.round(participant.largestKillingSpree ?? 0)),
      damageToObjectives: Math.max(0, Math.round(participant.damageDealtToObjectives ?? 0)),
    }));
  while (players.length < 5) players.push({
    player: `Player ${players.length + 1}`,
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
  const participants = match.info?.participants ?? [];
  const riotTeams = match.info?.teams ?? [];
  const blueTeam = riotTeams.find((team) => team.teamId === 100);
  const redTeam = riotTeams.find((team) => team.teamId === 200);
  if (!blueTeam || !redTeam || participants.length < 2) throw new Error("Match-V5 không có đủ dữ liệu hai đội");
  if (Boolean(blueTeam.win) === Boolean(redTeam.win)) throw new Error("Match-V5 không xác định được đội thắng");

  const supportsVoidGrubs = Object.prototype.hasOwnProperty.call(blueTeam.objectives ?? {}, "horde")
    || Object.prototype.hasOwnProperty.call(redTeam.objectives ?? {}, "horde");
  const voidGrubKills = objectiveKills(blueTeam, "horde") + objectiveKills(redTeam, "horde");
  const riftHeraldKills = objectiveKills(blueTeam, "riftHerald") + objectiveKills(redTeam, "riftHerald");
  const durationRaw = Math.max(0, match.info?.gameDuration ?? 0);
  const durationSeconds = Math.round(durationRaw > 86_400 ? durationRaw / 1_000 : durationRaw);

  const makeTeam = (team: RiotTeam, teamId: number) => {
    const members = participants.filter((participant) => participant.teamId === teamId);
    return {
      kills: members.reduce((sum, participant) => sum + (participant.kills ?? 0), 0),
      gold: members.reduce((sum, participant) => sum + (participant.goldEarned ?? 0), 0),
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
}) {
  const cleanMatchId = matchId.trim().toUpperCase();
  if (!/^[A-Z0-9]+_\d+$/.test(cleanMatchId)) throw new Error("Match ID không đúng dạng. Ví dụ: VN2_123456789");
  if (!options.apiKey) throw new Error("Thiếu RIOT_API_KEY trên server");
  const route = options.regionalRoute || regionalRouteForMatch(cleanMatchId);
  const request = options.fetchImpl ?? fetch;
  const base = `https://${route}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(cleanMatchId)}`;
  const headers = { "X-Riot-Token": options.apiKey };
  const match = await readRiotJson<RiotMatch>(await request(base, { headers }), "kết quả trận");
  return {
    matchId: match.metadata?.matchId || cleanMatchId,
    data: normalizeMatchV5(match),
    warnings: collectMatchV5Warnings(match),
  };
}
