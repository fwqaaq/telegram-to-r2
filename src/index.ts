/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { webhookCallback } from "grammy";
import { TelegramBotBuilder } from "./bot";
import type { Env } from "./type";

// explore Env for grammy context
declare module "grammy" {
  interface Context {
    env: Env;
  }
}

export default {
  async fetch(request, env, _ctx): Promise<Response> {
    const bot = new TelegramBotBuilder(env.BOT_TOKEN, env)
      .with_authorization()
      .with_commands()
      .with_upload_handler()
      .with_builder();

    const handleUpdate = webhookCallback(bot, "cloudflare-mod", {
      secretToken: env.WEBHOOK_SECRET,
    });

    // Handle the request with the bot's webhook callback
    if (request.method === "POST") {
      // Handle the incoming update
      const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");

      if (secret !== env.WEBHOOK_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }

      return await handleUpdate(request);
    }

    if (request.method === "GET") {
      return new Response("Telegram Webhook is set up!", { status: 200 });
    }

    return new Response("Method Not Allowed", { status: 405 });
  },
} satisfies ExportedHandler<Env>;
