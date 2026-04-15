import { type Client } from "discord.js";

let mainClient: Client | null = null;

export function setMainClient(client: Client): void {
  mainClient = client;
}

export function getMainClient(): Client | null {
  return mainClient;
}
