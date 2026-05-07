export type StatusAiModerationDecision = {
  allowed: boolean;
  reasons: string[];
  categories?: Record<string, number>;
};

export type StatusAiAnalysisResult = {
  moderation: StatusAiModerationDecision;
  labels: string[];
  language?: string;
};

export type StatusAiSuggestionResult = {
  captions: string[];
  hashtags: string[];
  emojis: string[];
  filters: string[];
};

