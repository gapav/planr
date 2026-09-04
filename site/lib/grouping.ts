import type { PlayerGroup, TeamPlayer } from "./types";

export function shufflePlayers(players: TeamPlayer[], random = Math.random) {
  const shuffled = [...players];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return shuffled;
}

export function makeTeams(players: TeamPlayer[], requestedTeamCount: number, random = Math.random): PlayerGroup[] {
  if (players.length < 2) return [];
  const teamCount = Math.min(players.length, Math.max(2, Math.floor(requestedTeamCount)));
  const groups = Array.from({ length: teamCount }, (_, index) => ({ id: `team-${index + 1}`, label: `Lag ${index + 1}`, playerIds: [] as string[] }));
  shufflePlayers(players, random).forEach((player, index) => groups[index % teamCount].playerIds.push(player.id));
  return groups;
}

export function makePairs(players: TeamPlayer[], random = Math.random): PlayerGroup[] {
  if (players.length < 2) return [];
  const shuffled = shufflePlayers(players, random);
  const groups: PlayerGroup[] = [];
  for (let index = 0; index < shuffled.length; index += 2) {
    const remaining = shuffled.length - index;
    if (remaining === 3) {
      groups.push({ id: `pair-${groups.length + 1}`, label: `Trio ${groups.length + 1}`, playerIds: shuffled.slice(index).map((player) => player.id) });
      break;
    }
    groups.push({ id: `pair-${groups.length + 1}`, label: `Par ${groups.length + 1}`, playerIds: shuffled.slice(index, index + 2).map((player) => player.id) });
  }
  return groups;
}

// Coaches adjust a generated draw by hand: the player leaves whichever group
// currently holds them and joins the target, keeping every other group intact.
// Returns the original array when nothing would change, so callers can skip a
// pointless save.
export function movePlayerToGroup(groups: PlayerGroup[], playerId: string, targetGroupId: string): PlayerGroup[] {
  const target = groups.find((group) => group.id === targetGroupId);
  if (!target || target.playerIds.includes(playerId)) return groups;
  return groups.map((group) =>
    group.id === targetGroupId
      ? { ...group, playerIds: [...group.playerIds, playerId] }
      : group.playerIds.includes(playerId)
        ? { ...group, playerIds: group.playerIds.filter((id) => id !== playerId) }
        : group);
}
