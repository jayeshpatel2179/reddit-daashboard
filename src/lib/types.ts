export type Post = {
  id: string; // e.g. "1wsr7cw" (without the t3_ prefix)
  subreddit: string;
  title: string;
  author: string;
  permalink: string;
  published: string; // ISO date
  body: string; // selftext converted to plain text ("" for link posts)
  linkUrl?: string; // external link for link/image posts
  topRank?: number; // position in the "top" feed (1 = most upvoted), undefined if only seen in "new"
};

export type Comment = {
  id: string;
  author: string;
  body: string;
  published: string;
};

export type Link = { url: string; label: string; postId: string };

export type Usage = {
  promptTokens: number;
  completionTokens: number;
  cost: number; // USD, as reported by OpenRouter
  calls: number;
};

export type ThreadAI = {
  question: string;
  type: "question" | "discussion" | "news" | "help" | "showcase" | "rant" | "meme" | "other";
  summary: string;
  keyAnswers: { point: string; support: "many" | "some" | "one" }[];
  bestAnswer: string;
  consensus: "agreed" | "mixed" | "disputed" | "no answers";
  sentiment: "positive" | "neutral" | "negative";
  importance: number; // 1-10
  importanceReason: string;
  tags: string[];
  detailedSummary: { viewpoint: string; detail: string; share: "most" | "many" | "some" | "few" | "one" }[];
  peopleConclusion: string; // what the commenters as a group concluded
  aiConclusion: string; // the AI's own assessment
};

export type Thread = {
  post: Post;
  comments: Comment[]; // kept only in the browser tab, used by "Ask" mode
  commentCount: number;
  links: Link[];
  ai: ThreadAI | null;
  aiError?: string;
};

export type Overview = {
  headline: string;
  overview: string;
  topics: { name: string; summary: string; threadIds: string[] }[];
  trending: { term: string; context: string }[];
  importantThreads: { threadId: string; why: string }[];
  recurringProblems: string[];
  mood: string;
};

export type AnalyzeParams = {
  sub: string;
  hours: number;
  limit: number;
  threadModel: string;
  overviewModel: string;
};

export type StreamEvent =
  | { type: "status"; message: string; progress?: { done: number; total: number } }
  | { type: "posts"; posts: Post[]; totalInWindow: number }
  | { type: "thread"; thread: Thread }
  | { type: "overview"; overview: Overview }
  | { type: "usage"; usage: Usage }
  | { type: "error"; message: string }
  | { type: "done"; cached: boolean; finishedAt: string };
