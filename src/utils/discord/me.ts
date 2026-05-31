import { DiscordAuth, DiscordUser } from "@/types/discord.types";

export async function get_me({
  token,
  type,
}: DiscordAuth): Promise<DiscordUser | false> {
  const r = await fetch("https://discord.com/api/v10/users/@me", {
    method: "GET",
    headers: {
      Authorization: `${type} ${token}`,
    },
  });
  if (!r.ok) return false;
  const d = await r.json();
  return d as DiscordUser;
}
