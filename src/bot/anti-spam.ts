import {
  type Client,
  type Message,
  PermissionFlagsBits,
  Events,
} from "discord.js";
import { logger } from "../lib/logger";

interface SpamConfig {
  enabled: boolean;
  messageThreshold: number;
  windowMs: number;
  duplicateThreshold: number;
  mentionThreshold: number;
  action: "delete" | "warn" | "timeout" | "kick";
  timeoutDurationMs: number;
}

const defaultConfig: SpamConfig = {
  enabled: true,
  messageThreshold: 6,
  windowMs: 5_000,
  duplicateThreshold: 3,
  mentionThreshold: 5,
  action: "timeout",
  timeoutDurationMs: 5 * 60 * 1000,
};

const messageTracker = new Map<string, Map<string, { messages: Message[]; warned: boolean }>>();
const guildConfig = new Map<string, SpamConfig>();

export function getAntiSpamConfig(guildId: string): SpamConfig {
  return guildConfig.get(guildId) ?? { ...defaultConfig };
}

export function setAntiSpamConfig(guildId: string, config: Partial<SpamConfig>): void {
  const current = getAntiSpamConfig(guildId);
  guildConfig.set(guildId, { ...current, ...config });
}

function getUserTracker(guildId: string, userId: string) {
  if (!messageTracker.has(guildId)) {
    messageTracker.set(guildId, new Map());
  }
  const guildTracker = messageTracker.get(guildId)!;
  if (!guildTracker.has(userId)) {
    guildTracker.set(userId, { messages: [], warned: false });
  }
  return guildTracker.get(userId)!;
}

async function applyAction(message: Message, config: SpamConfig, reason: string): Promise<void> {
  const member = message.member;
  if (!member) return;

  if (member.permissions.has(PermissionFlagsBits.Administrator)) return;
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

  try {
    const channel = message.channel;

    if (config.action === "delete" || config.action === "warn" || config.action === "timeout" || config.action === "kick") {
      const userEntry = getUserTracker(message.guildId!, member.id);
      const msgs = userEntry.messages.filter((m) => !m.deleted);
      await Promise.all(msgs.map((m) => m.delete().catch(() => null)));
    }

    if (config.action === "warn") {
      const warning = await channel.send(
        `⚠️ ${member}, pare de fazer spam! Próxima vez você será silenciado.`,
      ).catch(() => null);
      if (warning) setTimeout(() => warning.delete().catch(() => null), 5000);
    }

    if (config.action === "timeout") {
      await member.timeout(config.timeoutDurationMs, `Anti-Spam: ${reason}`).catch(() => null);
      const msg = await channel.send(`🔇 ${member} foi silenciado por spam.`).catch(() => null);
      if (msg) setTimeout(() => msg.delete().catch(() => null), 5000);
    }

    if (config.action === "kick") {
      await channel.send(`👢 ${member.user.tag} foi expulso por spam.`).catch(() => null);
      await member.kick(`Anti-Spam: ${reason}`).catch(() => null);
    }

    logger.warn({ userId: member.id, guildId: message.guildId, reason }, "ANTI-SPAM: Ação aplicada");
  } catch (err) {
    logger.error({ err }, "ANTI-SPAM: Erro ao aplicar ação");
  }
}

async function handleMessage(message: Message): Promise<void> {
  if (!message.guild || !message.guildId) return;
  if (message.author.bot) return;

  const config = getAntiSpamConfig(message.guildId);
  if (!config.enabled) return;

  const me = message.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageMessages)) return;

  const now = Date.now();
  const userEntry = getUserTracker(message.guildId, message.author.id);

  userEntry.messages = userEntry.messages.filter((m) => now - m.createdTimestamp < config.windowMs);
  userEntry.messages.push(message);

  if (userEntry.messages.length >= config.messageThreshold) {
    await applyAction(message, config, "mensagens em excesso");
    userEntry.messages = [];
    userEntry.warned = false;
    return;
  }

  const duplicates = userEntry.messages.filter((m) => m.content === message.content && m.content.length > 0);
  if (duplicates.length >= config.duplicateThreshold) {
    await applyAction(message, config, "mensagens duplicadas");
    userEntry.messages = [];
    userEntry.warned = false;
    return;
  }

  const mentionCount = message.mentions.users.size + message.mentions.roles.size;
  if (mentionCount >= config.mentionThreshold) {
    await applyAction(message, config, "spam de menções");
    userEntry.messages = [];
    userEntry.warned = false;
    return;
  }
}

export function registerAntiSpam(client: Client): void {
  client.on(Events.MessageCreate, async (message) => {
    await handleMessage(message);
  });

  logger.info("Anti-Spam registrado");
}
