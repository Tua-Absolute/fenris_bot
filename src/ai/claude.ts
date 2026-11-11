import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { toAction, tools, type Action } from "./actions.js";

const SYSTEM = `You are Fenris, the resident bot of a Discord server, named after the great wolf of Norse myth.
You're friendly, sharp, and a little bit wolfish in flavor, but helpful first: answer questions, chat, brainstorm, and help run the server.

How to reply:
- This is Discord chat. Keep replies short (usually 1 to 4 sentences) unless someone asks for detail. Use Discord markdown sparingly. Never exceed 1800 characters.
- Address the person who pinged you. You can see recent channel messages for context.
- Don't invent facts about the server or its members. If you don't know, say so.

Server actions:
- When someone asks you to make an announcement, schedule an event, or start a poll, call the matching propose_ tool. A preview with a Confirm button is shown and nothing happens until they confirm, so go ahead and propose rather than asking for permission. Ask a short follow-up question instead only when something essential is missing (for example an event with no day at all).
- Fill in reasonable details yourself: a strong title, an engaging body, a sensible duration. Use the channel and time information provided.
- When you call a tool, add at most one short sentence of text, like "Here's a draft:".`;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
  return client;
}

// Server-side fallbacks re-run a declined request on another model. Only some models support them.
function supportsFallbacks(model: string): boolean {
  return /^claude-(opus-5|sonnet-5-5|fable-5)/.test(model);
}

export interface ChatResult {
  text: string;
  action: Action | null;
}

export async function askClaude(context: string): Promise<ChatResult> {
  const model = config.claudeModel();
  const fallback = supportsFallbacks(model);
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await getClient().beta.messages.create({
      model,
      max_tokens: 4000,
      system: SYSTEM,
      tools,
      output_config: { effort: "low" }, // chat doesn't need deep reasoning, and low effort keeps cost down
      messages: [{ role: "user", content: context }],
      ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("Claude: the ANTHROPIC_API_KEY in .env was rejected.");
      return { text: "My connection to Claude isn't set up right (the API key was rejected). Ask the server owner to check it.", action: null };
    }
    if (error instanceof Anthropic.RateLimitError) {
      return { text: "I'm getting a lot of requests right now. Give me a minute and try again.", action: null };
    }
    if (error instanceof Anthropic.APIError && error.status === 400 && /credit/i.test(error.message)) {
      console.error("Claude: out of API credit.", error.message);
      return { text: "I'm out of Claude credit for now. Ask the server owner to top it up.", action: null };
    }
    throw error;
  }

  if (response.stop_reason === "refusal") {
    return { text: "That's not something I can help with.", action: null };
  }

  let text = "";
  let action: Action | null = null;
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
    else if (block.type === "tool_use" && !action) action = toAction(block.name, block.input);
  }
  return { text: text.trim(), action };
}
