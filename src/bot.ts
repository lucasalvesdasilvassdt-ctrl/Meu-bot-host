import {
  Client,
  GatewayIntentBits,
  Events,
  ActivityType,
} from "discord.js";
import { logger } from "./lib/logger";
import { registerAntiRaid } from "./bot/anti-raid";
import { registerAntiSpam } from "./bot/anti-spam";
import { registerAntiNuke } from "./bot/anti-nuke";
import { registerCommands } from "./bot/commands";
import { setMainClient } from "./bot/index";

const token = process.env["DISCORD_TOKEN"];

if (!token) {
  throw new Error("DISCORD_TOKEN environment variable is required but was not provided.");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildWebhooks,
  ],
});

setMainClient(client);

registerAntiRaid(client);
registerAntiSpam(client);
registerAntiNuke(client);

client.once(Events.ClientReady, async (readyClient) => {
  logger.info({ tag: readyClient.user.tag }, "Bot do Discord conectado");
  readyClient.user.setActivity("🛡️ Protegendo o servidor", { type: ActivityType.Watching });
  await registerCommands(client);
});

client.on(Events.Error, (err) => {
  logger.error({ err }, "Erro no cliente do Discord");
});

export function startBot(): void {
  client.login(token).catch((err) => {
    logger.error({ err }, "Falha ao conectar o bot do Discord");
    process.exit(1);
  });
}

export { client };
