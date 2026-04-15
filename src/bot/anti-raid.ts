import {
  type Client,
  type GuildMember,
  PermissionFlagsBits,
  Events,
} from "discord.js";
import { logger } from "../lib/logger";

interface RaidConfig {
  enabled: boolean;
  threshold: number;
  windowMs: number;
  action: "kick" | "ban" | "timeout";
  logChannelId?: string;
}

const defaultConfig: RaidConfig = {
  enabled: true,
  threshold: 7,
  windowMs: 10_000,
  action: "kick",
};

const joinTracker = new Map<string, number[]>();
const raidMode = new Map<string, boolean>();
const guildConfig = new Map<string, RaidConfig>();

export function getAntiRaidConfig(guildId: string): RaidConfig {
  return guildConfig.get(guildId) ?? { ...defaultConfig };
}

export function setAntiRaidConfig(guildId: string, config: Partial<RaidConfig>): void {
  const current = getAntiRaidConfig(guildId);
  guildConfig.set(guildId, { ...current, ...config });
}

export function isRaidMode(guildId: string): boolean {
  return raidMode.get(guildId) ?? false;
}

async function activateRaidMode(member: GuildMember, config: RaidConfig): Promise<void> {
  const guild = member.guild;
  if (raidMode.get(guild.id)) return;

  raidMode.set(guild.id, true);
  logger.warn({ guildId: guild.id, guildName: guild.name }, "ANTI-RAID: Modo raid ativado");

  try {
    const channels = guild.channels.cache.filter(
      (c) => c.isTextBased() && c.permissionsFor(guild.roles.everyone)?.has(PermissionFlagsBits.SendMessages),
    );

    for (const [, channel] of channels) {
      if ("permissionOverwrites" in channel) {
        await channel.permissionOverwrites.edit(guild.roles.everyone, {
          SendMessages: false,
        }).catch(() => null);
      }
    }

    const logChannelId = config.logChannelId;
    if (logChannelId) {
      const logChannel = guild.channels.cache.get(logChannelId);
      if (logChannel?.isTextBased() && "send" in logChannel) {
        await logChannel.send(
          `🚨 **MODO RAID ATIVADO** — Detectei uma entrada em massa de usuários. Todos os canais foram bloqueados.\nUsarei o comando \`/antiraid disable\` para desativar.`,
        );
      }
    }
  } catch (err) {
    logger.error({ err }, "ANTI-RAID: Erro ao ativar modo raid");
  }

  setTimeout(() => {
    raidMode.delete(guild.id);
    logger.info({ guildId: guild.id }, "ANTI-RAID: Modo raid desativado automaticamente");
  }, 60_000);
}

async function handleNewMember(member: GuildMember, config: RaidConfig): Promise<void> {
  const guildId = member.guild.id;
  const now = Date.now();

  const joins = joinTracker.get(guildId) ?? [];
  const recentJoins = joins.filter((t) => now - t < config.windowMs);
  recentJoins.push(now);
  joinTracker.set(guildId, recentJoins);

  if (recentJoins.length >= config.threshold) {
    await activateRaidMode(member, config);

    try {
      if (config.action === "kick") {
        await member.kick("Anti-Raid: entrada em massa detectada").catch(() => null);
      } else if (config.action === "ban") {
        await member.ban({ reason: "Anti-Raid: entrada em massa detectada" }).catch(() => null);
      } else if (config.action === "timeout") {
        await member.timeout(10 * 60 * 1000, "Anti-Raid: entrada em massa detectada").catch(() => null);
      }
    } catch (err) {
      logger.error({ err, memberId: member.id }, "ANTI-RAID: Erro ao aplicar ação");
    }
  }
}

export function registerAntiRaid(client: Client): void {
  client.on(Events.GuildMemberAdd, async (member) => {
    const config = getAntiRaidConfig(member.guild.id);
    if (!config.enabled) return;

    const me = member.guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.KickMembers)) return;

    await handleNewMember(member, config);
  });

  logger.info("Anti-Raid registrado");
}
