import { DiscordAuth } from "@/types/discord.types";
import betterConsole, { tsflag } from "ts-better-console";

export async function exchange_code(
  code: string,
  redirect_uri: string,
): Promise<DiscordAuth | false> {
  const client_id = process.env.DISCORD_CLIENT_ID?.trim();
  const client_secret = process.env.DISCORD_CLIENT_SECRET?.trim();

  if (!client_id || !client_secret) {
    betterConsole.log(
      tsflag(
        "error",
        true,
        "utils > discord > auth: exchange_code | Missing DISCORD_CLIENT_ID or DISCORD_CLIENT_SECRET",
      ),
    );
    return false;
  }

  if (process.env.NODE_ENV === "development")
    betterConsole.log(
      tsflag(
        "debug",
        true,
        `utils > discord > auth: exchange_code | payload check:
          - client_id: ${client_id.substring(0, 5)}...${client_id.slice(-3)} (len: ${client_id.length})
          - client_secret: ${client_secret.substring(0, 3)}...${client_secret.slice(-3)} (len: ${client_secret.length})
          - redirect_uri: ${redirect_uri}
          - code: ${code.substring(0, 5)}...${code.slice(-3)} (len: ${code.length})`,
      ),
    );

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri,
    client_id,
    client_secret,
  });

  const r = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = await r.json();

  if (process.env.NODE_ENV === "development")
    betterConsole.log(
      tsflag(
        "debug",
        true,
        "utils > discord > auth: exchange_code | received fetch data \n",
        JSON.stringify(data, null, 2),
      ),
    );

  if (!r.ok || !data.access_token) return false;
  return { type: data?.token_type, token: data?.access_token };
}

export async function revoke_access_token(
  access_token: string,
): Promise<boolean> {
  const client_id = process.env.DISCORD_CLIENT_ID?.trim();
  const client_secret = process.env.DISCORD_CLIENT_SECRET?.trim();

  if (!client_id || !client_secret) return false;

  const params = new URLSearchParams({
    token: access_token,
    client_id,
    client_secret,
  });

  const r = await fetch("https://discord.com/api/v10/oauth2/token/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  return r.ok;
}
