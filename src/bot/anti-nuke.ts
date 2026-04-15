import {
  type Client,
  Events,
  AuditLogEvent,
  PermissionFlagsBits,
} from "discord.js";
import { logger } from "../lib/logger";

interface NukeConfig {
  enabled: boolean;
  channelDeleteThreshold: number;
  roleDeleteThreshold: number;
  banThreshold: number;
  webhookThreshold: number;
  windowMs: number;
  action: "derank" | "ban";
  logChannelId?: string;
}

const defaultConfig: NukeConfig = {
  enabled: true,
  channelDeleteThreshold: 3,
  roleDeleteThreshold: 3,
  banThreshold: 5,
  webhookThreshold: 3,
  windowMs: 10_000,
  action: "derank",
};

const guildConfig = new Map<string, NukeConfig>();

type ActionType = "channelDelete" | "roleDelete" | "ban" | "webhookCreate";

const actionTracker = new Map<string, Map<string, Map<ActionType, number[]>>>();

export function getAntiNukeConfig(guildId: string): NukeConfig {
  return guildConfig.get(guildId) ?? { ...defaultConfig };
}

export function setAntiNukeConfig(guildId: string, config: Partial<NukeConfig>): void {
  const current = getAntiNukeConfig(guildId);
  guildConfig.set(guildId, { ...current, ...config });
}

function trackAction(guildId: string, executorId: string, type: ActionType, windowMs: number): number {
  if (!actionTracker.has(guildId)) actionTracker.set(guildId, new Map());
  const guildMap = actionTracker.get(guildId)!;

  if (!guildMap.has(executorId)) guildMap.set(executorId, new Map());
  const userMap = guildMap.get(executorId)!;

  if (!userMap.has(type)) userMap.set(type, []);
  const times = userMap.get(type)!;

  const now = Date.now();
  const recent = times.filter((t) => now - t < windowMs);
  recent.push(now);
  userMap.set(type, recent);
  return recent.length;
}

async function punishExecutor(
  guildId: string,
  executorId: string,
  config: NukeConfig,
  reason: string,
): Promise<void> {
  const guild = (await import("./index")).getMainClient()?.guilds.cache.get(guildId);
  if (!guild) return;

  try {
    const member = await guild.members.fetch(executorId).catch(() => null);
    if (!member) return;

    if (member.permissions.has(PermissionFlagsBits.Administrator) && guild.ownerId === executorId) {
      logger.warn({ executorId }, "ANTI-NUKE: Proprietário do servidor ignorado");
      return;
    }

    if (config.action === "derank") {
      const roles = member.roles.cache.filter(
        (r) => r.id !== guild.id && r.editable,
      );
      await member.roles.remove(roles, `Anti-Nuke: ${reason}`).catch(() => null);
      logger.warn({ executorId, guildId, reason }, "ANTI-NUKE: Cargos removidos");
    } else if (config.action === "ban") {
      await guild.members.ban(executorId, { reason: `Anti-Nuke: ${reason}` }).catch(() => null);
      logger.warn({ executorId, guildId, reason }, "ANTI-NUKE: Usuário banido");
    }

    const logChannelId = config.logChannelId;
    if (logChannelId) {
      const logChannel = guild.channels.cache.get(logChannelId);
      if (logChannel?.isTextBased() && "send" in logChannel) {
        await logChannel.send(
          `🛡️ **ANTI-NUKE** — <@${executorId}> foi punido por: **${reason}**\nAção aplicada: **${config.action}**`,
        ).catch(() => null);
      }
    }
  } catch (err) {
    logger.error({ err }, "ANTI-NUKE: Erro ao punir executor");
  }
}

export function registerAntiNuke(client: Client): void {
  client.on(Events.GuildAuditLogEntryCreate, async (entry, guild) => {
    const config = getAntiNukeConfig(guild.id);
    if (!config.enabled) return;

    const executorId = entry.executorId;
    if (!executorId) return;

    const me = guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.Administrator)) return;

    if (executorId === client.user?.id) return;

    switch (entry.action) {
      case AuditLogEvent.ChannelDelete: {
        const count = trackAction(guild.id, executorId, "channelDelete", config.windowMs);
        if (count >= config.channelDeleteThreshold) {
          await punishExecutor(guild.id, executorId, config, `deletou ${count} canais em poucos segundos`);
        }
        break;
      }
      case AuditLogEvent.RoleDelete: {
        const count = trackAction(guild.id, executorId, "roleDelete", config.windowMs);
        if (count >= config.roleDeleteThreshold) {
          await punishExecutor(guild.id, executorId, config, `deletou ${count} cargos em poucos segundos`);
        }
        break;
      }
      case AuditLogEvent.MemberBanAdd: {
        const count = trackAction(guild.id, executorId, "ban", config.windowMs);
        if (count >= config.banThreshold) {
          await punishExecutor(guild.id, executorId, config, `baniu ${count} membros em poucos segundos`);
        }
        break;
      }
      case AuditLogEvent.WebhookCreate: {
        const count = trackAction(guild.id, executorId, "webhookCreate", config.windowMs);
        if (count >= config.webhookThreshold) {
          await punishExecutor(guild.id, executorId, config, `criou ${count} webhooks em poucos segundos`);
        }
        break;
      }
    }
  });

  logger.info("Anti-Nuke registrado");
}
