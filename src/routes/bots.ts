import { Router } from "express";
import { addHostedBot, listHostedBots, removeHostedBot } from "../bot/hosted-bots";
import { generateKey, listKeys, revokeKey, validateKey, consumeKey } from "../bot/keys";

const router = Router();

router.get("/bots", (_req, res) => {
  const bots = listHostedBots();
  res.json({ bots });
});

router.post("/bots", async (req, res) => {
  const { token, key } = req.body as { token?: string; key?: string };

  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "Campo 'token' é obrigatório" });
    return;
  }

  if (!key || typeof key !== "string") {
    res.status(400).json({ error: "Campo 'key' é obrigatório. Gere uma chave com /hostbot key generate" });
    return;
  }

  const entry = validateKey(key);
  if (!entry) {
    res.status(403).json({ error: "Chave inválida ou já utilizada" });
    return;
  }

  try {
    const bot = await addHostedBot(token);
    consumeKey(key, "api");
    res.status(201).json({
      id: bot.id,
      tag: bot.tag,
      status: bot.status,
      addedAt: bot.addedAt,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    res.status(400).json({ error: message });
  }
});

router.delete("/bots/:id", (req, res) => {
  const { id } = req.params;
  const removed = removeHostedBot(id);

  if (!removed) {
    res.status(404).json({ error: "Bot não encontrado" });
    return;
  }

  res.json({ success: true });
});

router.get("/keys", (_req, res) => {
  const keys = listKeys().map(({ key, label, used, usedBy, createdAt }) => ({
    key,
    label,
    used,
    usedBy,
    createdAt,
  }));
  res.json({ keys });
});

router.post("/keys", (req, res) => {
  const { label } = req.body as { label?: string };
  const entry = generateKey("api", label);
  res.status(201).json({
    key: entry.key,
    label: entry.label,
    createdAt: entry.createdAt,
  });
});

router.delete("/keys/:key", (req, res) => {
  const removed = revokeKey(req.params.key);
  if (!removed) {
    res.status(404).json({ error: "Chave não encontrada" });
    return;
  }
  res.json({ success: true });
});

export default router;
