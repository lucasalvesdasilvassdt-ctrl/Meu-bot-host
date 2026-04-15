import {
  type Client,
  REST,
  Routes,
  SlashCommandBuilder,
  Events,
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  Colors,
} from "discord.js";
import { getAntiRaidConfig, setAntiRaidConfig, isRaidMode } from "./anti-raid";
import { getAntiSpamConfig, setAntiSpamConfig } from "./anti-spam";
import { getAntiNukeConfig, setAntiNukeConfig } from "./anti-nuke";
import { listHostedBots, addHostedBot, removeHostedBot } from "./hosted-bots";
import { generateKey, listKeys, revokeKey, validateKey, consumeKey } from "./keys";
import { logger } from "../lib/logger";

async function isBotOwner(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const app = await interaction.client.application.fetch();
  const owner = app.owner;
  if (!owner) return false;
  if ("id" in owner) return owner.id === interaction.user.id;
  return owner.members?.has(interaction.user.id) ?? false;
}

const commands = [
  new SlashCommandBuilder()
    .setName("antiraid")
    .setDescription("Configura o sistema Anti-Raid")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub.setName("status").setDescription("Mostra o status atual do Anti-Raid"),
    )
    .addSubcommand((sub) =>
      sub.setName("enable").setDescription("Ativa o Anti-Raid"),
    )
    .addSubcommand((sub) =>
      sub.setName("disable").setDescription("Desativa o Anti-Raid"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("config")
        .setDescription("Configura o Anti-Raid")
        .addIntegerOption((o) =>
          o.setName("threshold").setDescription("Nº de entradas para disparar o alerta (padrão: 7)").setMinValue(2).setMaxValue(50),
        )
        .addIntegerOption((o) =>
          o.setName("window").setDescription("Janela de tempo em segundos (padrão: 10)").setMinValue(3).setMaxValue(60),
        )
        .addStringOption((o) =>
          o
            .setName("action")
            .setDescription("Ação ao detectar raid")
            .addChoices(
              { name: "Expulsar", value: "kick" },
              { name: "Banir", value: "ban" },
              { name: "Silenciar", value: "timeout" },
            ),
        )
        .addChannelOption((o) =>
          o.setName("logchannel").setDescription("Canal de logs do Anti-Raid"),
        ),
    ),

  new SlashCommandBuilder()
    .setName("antispam")
    .setDescription("Configura o sistema Anti-Spam")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub.setName("status").setDescription("Mostra o status atual do Anti-Spam"),
    )
    .addSubcommand((sub) =>
      sub.setName("enable").setDescription("Ativa o Anti-Spam"),
    )
    .addSubcommand((sub) =>
      sub.setName("disable").setDescription("Desativa o Anti-Spam"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("config")
        .setDescription("Configura o Anti-Spam")
        .addIntegerOption((o) =>
          o.setName("messages").setDescription("Nº de mensagens para disparar (padrão: 6)").setMinValue(2).setMaxValue(30),
        )
        .addIntegerOption((o) =>
          o.setName("window").setDescription("Janela de tempo em segundos (padrão: 5)").setMinValue(2).setMaxValue(30),
        )
        .addIntegerOption((o) =>
          o.setName("mentions").setDescription("Nº máximo de menções por mensagem (padrão: 5)").setMinValue(2).setMaxValue(20),
        )
        .addStringOption((o) =>
          o
            .setName("action")
            .setDescription("Ação ao detectar spam")
            .addChoices(
              { name: "Apagar", value: "delete" },
              { name: "Avisar", value: "warn" },
              { name: "Silenciar", value: "timeout" },
              { name: "Expulsar", value: "kick" },
            ),
        ),
    ),

  new SlashCommandBuilder()
    .setName("antinuke")
    .setDescription("Configura o sistema Anti-Nuke")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub.setName("status").setDescription("Mostra o status atual do Anti-Nuke"),
    )
    .addSubcommand((sub) =>
      sub.setName("enable").setDescription("Ativa o Anti-Nuke"),
    )
    .addSubcommand((sub) =>
      sub.setName("disable").setDescription("Desativa o Anti-Nuke"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("config")
        .setDescription("Configura o Anti-Nuke")
        .addIntegerOption((o) =>
          o.setName("channels").setDescription("Nº de deleções de canal para acionar (padrão: 3)").setMinValue(1).setMaxValue(20),
        )
        .addIntegerOption((o) =>
          o.setName("roles").setDescription("Nº de deleções de cargo para acionar (padrão: 3)").setMinValue(1).setMaxValue(20),
        )
        .addIntegerOption((o) =>
          o.setName("bans").setDescription("Nº de bans para acionar (padrão: 5)").setMinValue(2).setMaxValue(30),
        )
        .addStringOption((o) =>
          o
            .setName("action")
            .setDescription("Ação ao detectar nuke")
            .addChoices(
              { name: "Remover cargos", value: "derank" },
              { name: "Banir", value: "ban" },
            ),
        )
        .addChannelOption((o) =>
          o.setName("logchannel").setDescription("Canal de logs do Anti-Nuke"),
        ),
    ),

  new SlashCommandBuilder()
    .setName("hostbot")
    .setDescription("Gerencia bots hospedados")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommandGroup((group) =>
      group
        .setName("key")
        .setDescription("Gerencia chaves de hospedagem")
        .addSubcommand((sub) =>
          sub
            .setName("generate")
            .setDescription("Gera uma nova chave de hospedagem (apenas dono do bot)")
            .addStringOption((o) =>
              o.setName("label").setDescription("Identificador/nome para essa chave"),
            ),
        )
        .addSubcommand((sub) =>
          sub.setName("list").setDescription("Lista todas as chaves (apenas dono do bot)"),
        )
        .addSubcommand((sub) =>
          sub
            .setName("revoke")
            .setDescription("Revoga uma chave (apenas dono do bot)")
            .addStringOption((o) =>
              o.setName("key").setDescription("Chave a revogar").setRequired(true),
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Hospeda um novo bot usando uma chave válida")
        .addStringOption((o) =>
          o.setName("key").setDescription("Chave de hospedagem (obtenha com /hostbot key generate)").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("token").setDescription("Token do bot Discord").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("Lista todos os bots hospedados"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove um bot hospedado")
        .addStringOption((o) =>
          o.setName("id").setDescription("ID do bot hospedado").setRequired(true),
        ),
    ),
];

async function handleAntiRaid(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;

  if (sub === "status") {
    const config = getAntiRaidConfig(guildId);
    const inRaid = isRaidMode(guildId);
    const embed = new EmbedBuilder()
      .setTitle("🛡️ Anti-Raid — Status")
      .setColor(config.enabled ? Colors.Green : Colors.Red)
      .addFields(
        { name: "Status", value: config.enabled ? "✅ Ativo" : "❌ Inativo", inline: true },
        { name: "Modo Raid", value: inRaid ? "🚨 ATIVO" : "✅ Normal", inline: true },
        { name: "Limite de entradas", value: `${config.threshold} entradas`, inline: true },
        { name: "Janela de tempo", value: `${config.windowMs / 1000}s`, inline: true },
        { name: "Ação", value: config.action, inline: true },
      );
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } else if (sub === "enable") {
    setAntiRaidConfig(guildId, { enabled: true });
    await interaction.reply({ content: "✅ Anti-Raid **ativado**.", ephemeral: true });
  } else if (sub === "disable") {
    setAntiRaidConfig(guildId, { enabled: false });
    await interaction.reply({ content: "❌ Anti-Raid **desativado**.", ephemeral: true });
  } else if (sub === "config") {
    const threshold = interaction.options.getInteger("threshold");
    const window = interaction.options.getInteger("window");
    const action = interaction.options.getString("action") as "kick" | "ban" | "timeout" | null;
    const logChannel = interaction.options.getChannel("logchannel");

    setAntiRaidConfig(guildId, {
      ...(threshold !== null && { threshold }),
      ...(window !== null && { windowMs: window * 1000 }),
      ...(action !== null && { action }),
      ...(logChannel !== null && { logChannelId: logChannel.id }),
    });

    await interaction.reply({ content: "✅ Anti-Raid configurado com sucesso!", ephemeral: true });
  }
}

async function handleAntiSpam(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;

  if (sub === "status") {
    const config = getAntiSpamConfig(guildId);
    const embed = new EmbedBuilder()
      .setTitle("🔇 Anti-Spam — Status")
      .setColor(config.enabled ? Colors.Green : Colors.Red)
      .addFields(
        { name: "Status", value: config.enabled ? "✅ Ativo" : "❌ Inativo", inline: true },
        { name: "Limite de mensagens", value: `${config.messageThreshold}`, inline: true },
        { name: "Janela de tempo", value: `${config.windowMs / 1000}s`, inline: true },
        { name: "Limite de duplicatas", value: `${config.duplicateThreshold}`, inline: true },
        { name: "Limite de menções", value: `${config.mentionThreshold}`, inline: true },
        { name: "Ação", value: config.action, inline: true },
      );
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } else if (sub === "enable") {
    setAntiSpamConfig(guildId, { enabled: true });
    await interaction.reply({ content: "✅ Anti-Spam **ativado**.", ephemeral: true });
  } else if (sub === "disable") {
    setAntiSpamConfig(guildId, { enabled: false });
    await interaction.reply({ content: "❌ Anti-Spam **desativado**.", ephemeral: true });
  } else if (sub === "config") {
    const messages = interaction.options.getInteger("messages");
    const window = interaction.options.getInteger("window");
    const mentions = interaction.options.getInteger("mentions");
    const action = interaction.options.getString("action") as "delete" | "warn" | "timeout" | "kick" | null;

    setAntiSpamConfig(guildId, {
      ...(messages !== null && { messageThreshold: messages }),
      ...(window !== null && { windowMs: window * 1000 }),
      ...(mentions !== null && { mentionThreshold: mentions }),
      ...(action !== null && { action }),
    });

    await interaction.reply({ content: "✅ Anti-Spam configurado com sucesso!", ephemeral: true });
  }
}

async function handleAntiNuke(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;

  if (sub === "status") {
    const config = getAntiNukeConfig(guildId);
    const embed = new EmbedBuilder()
      .setTitle("💣 Anti-Nuke — Status")
      .setColor(config.enabled ? Colors.Green : Colors.Red)
      .addFields(
        { name: "Status", value: config.enabled ? "✅ Ativo" : "❌ Inativo", inline: true },
        { name: "Limite canal delete", value: `${config.channelDeleteThreshold}`, inline: true },
        { name: "Limite cargo delete", value: `${config.roleDeleteThreshold}`, inline: true },
        { name: "Limite de bans", value: `${config.banThreshold}`, inline: true },
        { name: "Janela de tempo", value: `${config.windowMs / 1000}s`, inline: true },
        { name: "Ação", value: config.action, inline: true },
      );
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } else if (sub === "enable") {
    setAntiNukeConfig(guildId, { enabled: true });
    await interaction.reply({ content: "✅ Anti-Nuke **ativado**.", ephemeral: true });
  } else if (sub === "disable") {
    setAntiNukeConfig(guildId, { enabled: false });
    await interaction.reply({ content: "❌ Anti-Nuke **desativado**.", ephemeral: true });
  } else if (sub === "config") {
    const channels = interaction.options.getInteger("channels");
    const roles = interaction.options.getInteger("roles");
    const bans = interaction.options.getInteger("bans");
    const action = interaction.options.getString("action") as "derank" | "ban" | null;
    const logChannel = interaction.options.getChannel("logchannel");

    setAntiNukeConfig(guildId, {
      ...(channels !== null && { channelDeleteThreshold: channels }),
      ...(roles !== null && { roleDeleteThreshold: roles }),
      ...(bans !== null && { banThreshold: bans }),
      ...(action !== null && { action }),
      ...(logChannel !== null && { logChannelId: logChannel.id }),
    });

    await interaction.reply({ content: "✅ Anti-Nuke configurado com sucesso!", ephemeral: true });
  }
}

async function handleHostBot(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const group = interaction.options.getSubcommandGroup();

  if (group === "key") {
    const isOwner = await isBotOwner(interaction);
    if (!isOwner) {
      await interaction.reply({
        content: "❌ Apenas o **dono do bot** pode gerenciar chaves de hospedagem.",
        ephemeral: true,
      });
      return;
    }

    if (sub === "generate") {
      const label = interaction.options.getString("label") ?? undefined;
      const entry = generateKey(interaction.user.id, label);

      const embed = new EmbedBuilder()
        .setTitle("🔑 Nova Chave de Hospedagem Gerada")
        .setColor(Colors.Gold)
        .addFields(
          { name: "Chave", value: `\`${entry.key}\``, inline: false },
          { name: "Label", value: entry.label ?? "—", inline: true },
          { name: "Criada em", value: `<t:${Math.floor(entry.createdAt.getTime() / 1000)}:R>`, inline: true },
        )
        .setFooter({ text: "Compartilhe apenas com pessoas de confiança. A chave é de uso único." });

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (sub === "list") {
      const all = listKeys();
      if (all.length === 0) {
        await interaction.reply({ content: "Nenhuma chave gerada até agora.", ephemeral: true });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle("🔑 Chaves de Hospedagem")
        .setColor(Colors.Gold)
        .setDescription(
          all
            .map(
              (k) =>
                `\`${k.key}\` ${k.label ? `**(${k.label})**` : ""} — ${k.used ? `✅ Usada por <@${k.usedBy}>` : "⏳ Disponível"}`,
            )
            .join("\n"),
        );

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (sub === "revoke") {
      const key = interaction.options.getString("key", true);
      const removed = revokeKey(key);
      if (removed) {
        await interaction.reply({ content: `✅ Chave \`${key}\` revogada com sucesso.`, ephemeral: true });
      } else {
        await interaction.reply({ content: `❌ Chave \`${key}\` não encontrada.`, ephemeral: true });
      }
    }
    return;
  }

  if (sub === "add") {
    const keyInput = interaction.options.getString("key", true);
    const token = interaction.options.getString("token", true);

    const entry = validateKey(keyInput);
    if (!entry) {
      await interaction.reply({
        content: "❌ Chave inválida ou já utilizada. Solicite uma nova chave com `/hostbot key generate`.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const bot = await addHostedBot(token);
      consumeKey(keyInput, interaction.user.id);

      const embed = new EmbedBuilder()
        .setTitle("🤖 Bot Hospedado com Sucesso!")
        .setColor(Colors.Green)
        .addFields(
          { name: "Bot", value: bot.tag ?? "Conectando...", inline: true },
          { name: "ID de Hospedagem", value: `\`${bot.id}\``, inline: true },
          { name: "Status", value: "🟢 Online", inline: true },
          { name: "Chave utilizada", value: `\`${keyInput}\``, inline: false },
        )
        .setFooter({ text: "Use /hostbot remove para desligar o bot." });

      await interaction.editReply({ embeds: [embed] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      await interaction.editReply(`❌ Erro ao hospedar bot: ${message}`);
    }
  } else if (sub === "list") {
    const bots = listHostedBots();
    if (bots.length === 0) {
      await interaction.reply({ content: "Nenhum bot hospedado no momento.", ephemeral: true });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("🤖 Bots Hospedados")
      .setColor(Colors.Blue)
      .setDescription(
        bots
          .map(
            (b) =>
              `**${b.tag ?? "Desconhecido"}** — \`${b.id}\` — ${
                b.status === "online"
                  ? "🟢 Online"
                  : b.status === "error"
                    ? "🔴 Erro"
                    : "🟡 Conectando"
              }`,
          )
          .join("\n"),
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } else if (sub === "remove") {
    const id = interaction.options.getString("id", true);
    const removed = removeHostedBot(id);
    if (removed) {
      await interaction.reply({ content: `✅ Bot \`${id}\` removido com sucesso.`, ephemeral: true });
    } else {
      await interaction.reply({ content: `❌ Bot \`${id}\` não encontrado.`, ephemeral: true });
    }
  }
}

export async function registerCommands(client: Client): Promise<void> {
  const token = process.env["DISCORD_TOKEN"];
  if (!token || !client.user) return;

  const rest = new REST().setToken(token);

  try {
    await rest.put(Routes.applicationCommands(client.user.id), {
      body: commands.map((c) => c.toJSON()),
    });
    logger.info("Slash commands registrados globalmente");
  } catch (err) {
    logger.error({ err }, "Erro ao registrar slash commands");
  }

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    try {
      if (interaction.commandName === "antiraid") await handleAntiRaid(interaction);
      else if (interaction.commandName === "antispam") await handleAntiSpam(interaction);
      else if (interaction.commandName === "antinuke") await handleAntiNuke(interaction);
      else if (interaction.commandName === "hostbot") await handleHostBot(interaction);
    } catch (err) {
      logger.error({ err, command: interaction.commandName }, "Erro ao executar comando");
      const msg = { content: "❌ Ocorreu um erro ao executar esse comando.", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply(msg).catch(() => null);
      } else {
        await interaction.reply(msg).catch(() => null);
      }
    }
  });
}
