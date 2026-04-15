import { Client, GatewayIntentBits, Events } from "discord.js";
import { logger } from "../lib/logger";

export interface HostedBot {
  id: string;
  token: string;
  tag: string | null;
  status: "connecting" | "online" | "error" | "stopped";
  addedAt: Date;
  client: Client;
}

const hostedBots = new Map<string, HostedBot>();

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export async function addHostedBot(token: string): Promise<HostedBot> {
  for (const [, bot] of hostedBots) {
    if (bot.token === token) {
      throw new Error("Esse token já está sendo hospedado");
    }
  }

  const id = generateId();
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
    ],
  });

  const bot: HostedBot = {
    id,
    token,
    tag: null,
    status: "connecting",
    addedAt: new Date(),
    client,
  };

  hostedBots.set(id, bot);

  client.once(Events.ClientReady, (readyClient) => {
    bot.tag = readyClient.user.tag;
    bot.status = "online";
    logger.info({ id, tag: bot.tag }, "Bot hospedado conectado");
  });

  client.on(Events.Error, (err) => {
    bot.status = "error";
    logger.error({ err, id }, "Erro no bot hospedado");
  });

  try {
    await client.login(token);
  } catch (err) {
    bot.status = "error";
    logger.error({ err, id }, "Falha ao conectar bot hospedado");
    throw new Error("Token inválido ou bot sem permissão");
  }

  return bot;
}

export function removeHostedBot(id: string): boolean {
  const bot = hostedBots.get(id);
  if (!bot) return false;

  try {
    bot.client.destroy();
  } catch {}

  bot.status = "stopped";
  hostedBots.delete(id);
  logger.info({ id }, "Bot hospedado removido");
  return true;
}

export function listHostedBots(): Omit<HostedBot, "client" | "token">[] {
  return Array.from(hostedBots.values()).map(({ client: _client, token: _token, ...rest }) => rest);
}

export function getHostedBot(id: string): HostedBot | undefined {
  return hostedBots.get(id);
}
