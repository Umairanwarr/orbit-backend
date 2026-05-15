import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { StoryType } from "../../../core/utils/enums";
import {
  StatusAiAnalysisResult,
  StatusAiModerationDecision,
  StatusAiSuggestionResult,
} from "./status_ai.types";

@Injectable()
export class StatusAiService {
  private readonly logger = new Logger(StatusAiService.name);

  constructor(private readonly config: ConfigService) {}

  private get enabled(): boolean {
    const v =
      this.config.get<string>("STATUS_AI_ENABLED") ??
      process.env.STATUS_AI_ENABLED ??
      "true";
    return v !== "false" && v !== "0";
  }

  private get openAiKey(): string {
    const key =
      this.config.get<string>("OPENAI_API_KEY") ?? process.env.OPENAI_API_KEY ?? "";
    // Strip surrounding quotes if env parser left them in
    return key.replace(/^"+|"+$/g, "").trim();
  }

  private get openAiModel(): string {
    return (
      this.config.get<string>("OPENAI_MODEL_STATUS_AI") ??
      process.env.OPENAI_MODEL_STATUS_AI ??
      "gpt-4o-mini"
    );
  }

  async generateCaption(input: {
    storyType: StoryType;
    text?: string;
    existingCaption?: string;
    mimeType?: string;
  }): Promise<{ caption: string; alternatives: string[] }> {
    if (!this.enabled) {
      return { caption: input.existingCaption || "", alternatives: [] };
    }

    const seed = (input.text || "").toString().trim();
    const existing = (input.existingCaption || "").toString().trim();

    // If user already wrote a caption, keep it and optionally suggest alternatives
    const base = existing || "";

    const fallback = this._fallbackCaption(input.storyType, seed, input.mimeType);
    const want = base || fallback;

    const ai = await this._openAiCaption(seed, input.storyType, input.mimeType);
    if (ai?.caption) {
      return {
        caption: base || ai.caption,
        alternatives: this._uniq([ai.caption, ...(ai.alternatives || []), fallback]).filter(
          (c) => c && c !== base,
        ),
      };
    }

    return {
      caption: want,
      alternatives: this._uniq([fallback]).filter((c) => c && c !== want),
    };
  }

  async analyze(input: {
    storyType: StoryType;
    text?: string;
    caption?: string;
    mimeType?: string;
  }): Promise<StatusAiAnalysisResult> {
    if (!this.enabled) {
      return {
        moderation: { allowed: true, reasons: [] },
        labels: [],
      };
    }

    const combined = [input.text, input.caption].filter(Boolean).join("\n").trim();
    const moderation = await this._moderateText(combined);
    const labels = this._simpleLabels(input.storyType, combined, input.mimeType);

    return { moderation, labels, language: this._guessLanguage(combined) };
  }

  async suggestions(input: {
    storyType: StoryType;
    text?: string;
    caption?: string;
    mimeType?: string;
    file?: Express.Multer.File;
  }): Promise<StatusAiSuggestionResult> {
    if (!this.enabled) {
      return { captions: [], hashtags: [], emojis: [], filters: [] };
    }

    const key = this.openAiKey;
    this.logger.log(`[suggestions] openAiKey set: ${!!key}, keyLength: ${key.length}`);

    const baseText = [input.caption, input.text].filter(Boolean).join(" ").trim();
    const quick = this._simpleSuggestions(input.storyType, baseText, input.mimeType);

    let base64Image: string | undefined = undefined;
    if (input.file && input.file.buffer) {
      const mime = input.file.mimetype || "image/jpeg";
      const base64Str = input.file.buffer.toString("base64");
      base64Image = `data:${mime};base64,${base64Str}`;
      this.logger.log(`[suggestions] image attached, size=${input.file.size}, mime=${mime}`);
    } else {
      this.logger.log(`[suggestions] no image file attached`);
    }

    const ai = await this._openAiSuggestions(baseText, input.storyType, input.mimeType, base64Image);
    this.logger.log(`[suggestions] ai result: ${ai ? "success" : "null (fallback to simple)"}`);
    if (ai) {
      return {
        captions: this._uniq([...(ai.captions || []), ...quick.captions]).slice(0, 8),
        hashtags: this._uniq([...(ai.hashtags || []), ...quick.hashtags]).slice(0, 12),
        emojis: this._uniq([...(ai.emojis || []), ...quick.emojis]).slice(0, 10),
        filters: this._uniq([...(ai.filters || []), ...quick.filters]).slice(0, 10),
      };
    }

    return quick;
  }

  /**
   * Pre-publish pipeline. Throws nothing; caller decides whether to block publish.
   */
  async processBeforePublish(input: {
    storyType: StoryType;
    text?: string;
    caption?: string;
    mimeType?: string;
  }): Promise<{
    analysis: StatusAiAnalysisResult;
    suggestedCaption?: string;
    suggestions: StatusAiSuggestionResult;
  }> {
    const analysis = await this.analyze(input);
    return {
      analysis,
      suggestions: { captions: [], hashtags: [], emojis: [], filters: [] },
    };
  }

  private _fallbackCaption(
    storyType: StoryType,
    text?: string,
    mimeType?: string,
  ): string {
    const t = (text || "").trim();
    if (t) return t.length > 120 ? `${t.slice(0, 117)}...` : t;
    if (storyType === StoryType.Image) return "New photo";
    if (storyType === StoryType.Video) return "New video";
    if (storyType === StoryType.Voice) return "New voice note";
    if (mimeType && mimeType.startsWith("image/")) return "New photo";
    if (mimeType && mimeType.startsWith("video/")) return "New video";
    return "New status";
  }

  private _simpleLabels(storyType: StoryType, text: string, mimeType?: string) {
    const labels: string[] = [];
    if (mimeType) labels.push(mimeType);
    labels.push(`type:${storyType}`);
    const lower = (text || "").toLowerCase();
    if (/\bparty|fun|weekend\b/.test(lower)) labels.push("mood:fun");
    if (/\bwork|office|meeting\b/.test(lower)) labels.push("topic:work");
    if (/\btravel|trip|airport|hotel\b/.test(lower)) labels.push("topic:travel");
    if (/\bfood|dinner|lunch|breakfast\b/.test(lower)) labels.push("topic:food");
    return this._uniq(labels);
  }

  private _simpleSuggestions(
    storyType: StoryType,
    text: string,
    mimeType?: string,
  ): StatusAiSuggestionResult {
    const captions: string[] = [];
    const hashtags: string[] = [];
    const emojis: string[] = [];
    const filters: string[] = [];

    if (storyType === StoryType.Image || (mimeType || "").startsWith("image/")) {
      filters.push("Vivid", "Warm", "Cool", "B&W", "Portrait");
      emojis.push("📸", "✨");
    } else if (storyType === StoryType.Video || (mimeType || "").startsWith("video/")) {
      filters.push("Cinematic", "Vivid", "Stabilize", "HDR");
      emojis.push("🎬", "🔥");
    } else if (storyType === StoryType.Text) {
      filters.push("Bold", "Minimal", "Neon");
      emojis.push("💬");
    }

    const t = (text || "").trim();
    if (t) {
      captions.push(t.length > 100 ? `${t.slice(0, 97)}...` : t);
      if (/\btravel|trip\b/i.test(t)) hashtags.push("#travel", "#trip");
      if (/\bfood|dinner|lunch\b/i.test(t)) hashtags.push("#food", "#yum");
      if (/\bwork|office\b/i.test(t)) hashtags.push("#work", "#hustle");
    } else {
      captions.push(this._fallbackCaption(storyType, "", mimeType));
    }

    return {
      captions: this._uniq(captions).slice(0, 6),
      hashtags: this._uniq(hashtags).slice(0, 10),
      emojis: this._uniq(emojis).slice(0, 8),
      filters: this._uniq(filters).slice(0, 8),
    };
  }

  private async _moderateText(text: string): Promise<StatusAiModerationDecision> {
    const t = (text || "").trim();
    if (!t) return { allowed: true, reasons: [] };

    // Local heuristic moderation (always available)
    const lower = t.toLowerCase();
    const reasons: string[] = [];
    const banned = ["child sexual", "terrorist", "kill yourself", "suicide", "bomb"];
    for (const w of banned) {
      if (lower.includes(w)) reasons.push(`contains:${w}`);
    }
    const localDecision: StatusAiModerationDecision = {
      allowed: reasons.length === 0,
      reasons,
    };

    // Optional OpenAI moderation if key provided
    if (!this.openAiKey) return localDecision;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const resp = await fetch("https://api.openai.com/v1/moderations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.openAiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input: t }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      const data: any = await resp.json().catch(() => ({}));
      const r = data?.results?.[0];
      if (!r) return localDecision;

      const flagged = !!r.flagged;
      const cats = r.categories || {};
      const scores = r.category_scores || {};
      const aiReasons = Object.keys(cats)
        .filter((k) => cats[k])
        .map((k) => `flag:${k}`);

      const decision: StatusAiModerationDecision = {
        allowed: !flagged,
        reasons: this._uniq([...localDecision.reasons, ...aiReasons]),
        categories: scores,
      };

      return decision;
    } catch (e: any) {
      this.logger.warn(`OpenAI moderation failed: ${e?.message}`);
      return localDecision;
    }
  }

  private async _openAiCaption(
    text: string,
    storyType: StoryType,
    mimeType?: string,
  ): Promise<{ caption: string; alternatives: string[] } | null> {
    if (!this.openAiKey) return null;
    const prompt = [
      "Generate a short WhatsApp-style status caption.",
      "Constraints:",
      "- 1 line, max 80 characters.",
      "- Natural, friendly, not cringe.",
      "- Do not include quotes.",
      "",
      `Context: storyType=${storyType}, mimeType=${mimeType || "unknown"}`,
      `User text/context: ${text || "(none)"}`,
      "",
      "Return JSON with keys: caption, alternatives (array).",
    ].join("\n");

    const json = await this._openAiJson(prompt);
    if (!json) return null;
    const caption = (json.caption || "").toString().trim();
    const alternatives: string[] = Array.isArray(json.alternatives)
      ? (json.alternatives as any[])
          .map((x: any) => (x || "").toString().trim())
          .filter(Boolean)
      : [];
    if (!caption) return null;
    return { caption, alternatives: this._uniq<string>(alternatives).slice(0, 5) };
  }

  private async _openAiSuggestions(
    text: string,
    storyType: StoryType,
    mimeType?: string,
    base64Image?: string,
  ): Promise<StatusAiSuggestionResult | null> {
    if (!this.openAiKey) return null;
    const prompt = [
      "You are helping enhance a WhatsApp status before publishing.",
      "Return suggestions as JSON with keys:",
      "- captions: string[] (max 6)",
      "- hashtags: string[] (max 10, include leading #)",
      "- emojis: string[] (max 8)",
      "- filters: string[] (max 6, e.g. Vivid, Warm, Cinematic)",
      "",
      `Context: storyType=${storyType}, mimeType=${mimeType || "unknown"}`,
      `Text/caption context: ${text || "(none)"}`,
    ].join("\n");

    const json = await this._openAiJson(prompt, base64Image);
    if (!json) return null;
    const normArr = (v: any) =>
      Array.isArray(v) ? v.map((x) => (x || "").toString().trim()).filter(Boolean) : [];
    return {
      captions: normArr(json.captions).slice(0, 6),
      hashtags: normArr(json.hashtags).slice(0, 10),
      emojis: normArr(json.emojis).slice(0, 8),
      filters: normArr(json.filters).slice(0, 6),
    };
  }

  private async _openAiJson(prompt: string, base64Image?: string): Promise<any | null> {
    const key = this.openAiKey;
    if (!key) {
      this.logger.warn("[_openAiJson] No OpenAI API key — skipping AI call");
      return null;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const userContent: any[] = [{ type: "text", text: prompt }];
      if (base64Image) {
        userContent.push({
          type: "image_url",
          image_url: { url: base64Image, detail: "low" },
        });
      }

      this.logger.log(`[_openAiJson] Calling OpenAI. hasImage=${!!base64Image}`);

      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.openAiModel,
          temperature: 0.6,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "You output ONLY valid JSON. No markdown, no code fences." },
            { role: "user", content: userContent },
          ],
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => "");
        this.logger.error(`[_openAiJson] OpenAI HTTP ${resp.status}: ${errBody.slice(0, 300)}`);
        return null;
      }

      const data: any = await resp.json().catch(() => ({}));
      const content = data?.choices?.[0]?.message?.content;
      this.logger.log(`[_openAiJson] raw content: ${String(content).slice(0, 200)}`);

      if (!content || typeof content !== "string") return null;

      // Strip markdown code fences if GPT wraps the JSON (e.g. ```json ... ```)
      const stripped = content
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();

      return JSON.parse(stripped);
    } catch (e: any) {
      this.logger.warn(`[_openAiJson] OpenAI call failed: ${e?.message}`);
      return null;
    }
  }

  private _guessLanguage(text: string): string | undefined {
    const t = (text || "").trim();
    if (!t) return undefined;
    // Very rough heuristic
    if (/[أ-ي]/.test(t)) return "ar";
    if (/[а-яА-Я]/.test(t)) return "ru";
    return "en";
  }

  private _uniq<T>(arr: T[]): T[] {
    return Array.from(new Set(arr));
  }
}
