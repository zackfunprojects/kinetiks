import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { get, post, patch, postLong } from "../client.js";
import { formatCrawlResult, formatGeneric, formatConfidence, type ConfidenceScores } from "../formatters.js";

export const cartographerTools: Tool[] = [
  {
    name: "crawl_website",
    description:
      "Crawl a website URL and extract business data into the Context Structure. Extracts org info, products, voice/copy style, brand colors/fonts, and social profiles. Creates Proposals that go through the Cortex evaluation pipeline. Rate limited to once per 5 minutes.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Website URL to crawl (e.g. example.com or https://example.com)" },
      },
      required: ["url"],
    },
  },
  {
    name: "analyze_content",
    description:
      "Analyze provided content (markdown or HTML) and extract context data. Unlike crawl_website, this works on content you already have - paste in a blog post, about page, or HTML source.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The content to analyze" },
        content_type: { type: "string", enum: ["markdown", "html"], description: "Format of the content" },
        source_url: { type: "string", description: "Optional source URL for attribution" },
        extract_layers: {
          type: "array",
          items: { type: "string", enum: ["org", "products", "voice", "customers", "narrative", "competitive", "market", "brand"] },
          description: "Specific layers to extract. Omit for all applicable layers.",
        },
      },
      required: ["content", "content_type"],
    },
  },
  {
    name: "submit_writing_sample",
    description:
      "Submit a writing sample to analyze and refine the voice layer. The sample should be the user's own writing (blog posts, emails, marketing copy) - at least 100 characters. Up to 3 samples can be stored.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Writing sample text (min 100 characters)" },
        source: { type: "string", description: "Where this sample came from (e.g. 'blog_post', 'email_newsletter')" },
      },
      required: ["text"],
    },
  },
  {
    name: "generate_calibration",
    description:
      "Generate voice calibration exercises. Returns A/B choice pairs where each option represents a different point on a voice dimension (formality, warmth, humor, authority). Present these to the user to calibrate their voice profile.",
    inputSchema: {
      type: "object",
      properties: {
        count: { type: "number", description: "Number of exercises to generate (1-6, default 4)" },
      },
      required: [],
    },
  },
  {
    name: "submit_calibration_choice",
    description:
      "Submit the user's choice for a voice calibration exercise. Pass back the exercise object from generate_calibration along with the user's choice of A or B.",
    inputSchema: {
      type: "object",
      properties: {
        exercise: { type: "object", description: "The full exercise object from generate_calibration" },
        choice: { type: "string", enum: ["A", "B"], description: "User's choice" },
      },
      required: ["exercise", "choice"],
    },
  },
  {
    name: "get_onboarding_question",
    description:
      "Get the next adaptive onboarding question from the Cartographer. Questions are tailored based on what data is already captured - they focus on gaps. Returns the question text, which layers it fills, and the current progress.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "submit_onboarding_answer",
    description:
      "Submit an answer to the current onboarding question. The Cartographer extracts structured data from the answer and creates Proposals for relevant context layers.",
    inputSchema: {
      type: "object",
      properties: {
        answer: { type: "string", description: "The user's answer to the current onboarding question" },
      },
      required: ["answer"],
    },
  },
  {
    name: "onboard_me",
    description:
      "Complete Kinetiks ID onboarding end-to-end from a website URL. Crawls the site, answers adaptive questions using crawl data, calibrates voice, optionally analyzes a writing sample, and marks onboarding complete. Returns a summary with confidence scores. This is the fastest way to set up a Kinetiks ID - one tool call, fully automated.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Website URL to crawl and learn from (e.g. example.com)" },
        writing_sample: { type: "string", description: "Optional writing sample (100+ chars) to refine voice analysis" },
      },
      required: ["url"],
    },
  },
];

export async function handleCartographerTool(
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  switch (name) {
    case "crawl_website": {
      const result = await postLong<Record<string, unknown>>("/api/cartographer/crawl", {
        url: args.url,
      });
      return { content: [{ type: "text", text: formatCrawlResult(result) }] };
    }

    case "analyze_content": {
      const result = await post<Record<string, unknown>>("/api/cartographer/analyze", {
        content: args.content,
        content_type: args.content_type,
        source_url: args.source_url,
        extract_layers: args.extract_layers,
      });
      return { content: [{ type: "text", text: formatCrawlResult(result) }] };
    }

    case "submit_writing_sample": {
      const result = await post<Record<string, unknown>>("/api/cartographer/writing-sample", {
        text: args.text,
        source: args.source,
      });
      return {
        content: [{
          type: "text",
          text: `Writing sample analyzed.\n${formatGeneric(result)}`,
        }],
      };
    }

    case "generate_calibration": {
      const result = await post<Record<string, unknown>>("/api/cartographer/calibrate", {
        action: "generate",
        count: args.count,
      });

      if (!Array.isArray(result.exercises) || result.exercises.length === 0) {
        return { content: [{ type: "text", text: "No calibration exercises generated." }] };
      }

      const exercises = result.exercises as Array<Record<string, unknown>>;
      const parts: string[] = [`${exercises.length} calibration exercise(s):`, ""];
      for (let i = 0; i < exercises.length; i++) {
        const ex = exercises[i];
        if (!ex || typeof ex !== "object") continue;
        parts.push(`Exercise ${i + 1}: ${ex.exercise ?? "<missing>"}`);
        parts.push(`Scenario: ${ex.scenario ?? "<missing>"}`);
        parts.push(`  A: ${ex.optionA ?? "<missing>"}`);
        parts.push(`  B: ${ex.optionB ?? "<missing>"}`);
        parts.push(`  (dimension: ${ex.dimension ?? "<unknown>"})`);
        parts.push("");
      }
      parts.push("Use submit_calibration_choice to submit the user's selection for each exercise.");
      parts.push(`\nRaw exercises for submit_calibration_choice:\n${JSON.stringify(exercises, null, 2)}`);
      return { content: [{ type: "text", text: parts.join("\n") }] };
    }

    case "submit_calibration_choice": {
      const result = await post<Record<string, unknown>>("/api/cartographer/calibrate", {
        action: "submit_choice",
        exercise: args.exercise,
        choice: args.choice,
      });
      return { content: [{ type: "text", text: `Calibration choice submitted.\n${formatGeneric(result)}` }] };
    }

    case "get_onboarding_question": {
      const result = await post<Record<string, unknown>>("/api/cartographer/conversation", {
        action: "next_question",
      });
      return { content: [{ type: "text", text: formatGeneric(result) }] };
    }

    case "submit_onboarding_answer": {
      const result = await post<Record<string, unknown>>("/api/cartographer/conversation", {
        action: "submit_answer",
        answer: args.answer,
      });
      return { content: [{ type: "text", text: formatGeneric(result) }] };
    }

    case "onboard_me": {
      return await runFullOnboarding(args);
    }

    default:
      return { content: [{ type: "text", text: `Unknown cartographer tool: ${name}` }], isError: true };
  }
}

/**
 * Full automated onboarding: crawl -> questions -> calibration -> writing sample -> complete.
 */
async function runFullOnboarding(
  args: Record<string, unknown>
): Promise<CallToolResult> {
  const parts: string[] = ["# Kinetiks ID Auto-Onboarding", ""];

  if (!args.url || typeof args.url !== "string" || args.url.trim() === "") {
    return {
      content: [{ type: "text", text: "Error: url is required and must be a non-empty string." }],
      isError: true,
    };
  }

  const url = args.url.trim();
  const writingSample =
    args.writing_sample && typeof args.writing_sample === "string"
      ? args.writing_sample
      : undefined;

  // Step 1: Crawl the website
  parts.push("## Step 1: Website Crawl");
  try {
    const crawlResult = await postLong<Record<string, unknown>>("/api/cartographer/crawl", { url });
    const proposalCount = Array.isArray(crawlResult.proposals_submitted)
      ? crawlResult.proposals_submitted.length
      : 0;
    parts.push(`Crawled ${url} - ${proposalCount} proposals submitted.`);

    const extractions = crawlResult.extractions as Record<string, unknown> | undefined;
    if (extractions) {
      const layers = Object.keys(extractions).filter((k) => extractions[k] != null);
      parts.push(`Extracted layers: ${layers.join(", ")}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    parts.push(`Crawl failed: ${msg} - continuing with other steps.`);
  }
  parts.push("");

  // Step 2: Adaptive questions (max 5 rounds)
  parts.push("## Step 2: Adaptive Questions");
  const questionHistory: string[] = [];
  let questionRound = 0;
  const maxRounds = 5;

  while (questionRound < maxRounds) {
    try {
      const qResult = await post<Record<string, unknown>>("/api/cartographer/conversation", {
        action: "next_question",
        questionHistory,
      });

      if (qResult.done) {
        parts.push(`Questions complete after ${questionRound} round(s).`);
        break;
      }

      const question = qResult.question as Record<string, unknown> | undefined;
      if (!question || !question.question) {
        parts.push("No more questions available.");
        break;
      }

      const questionText = question.question as string;
      questionHistory.push(questionText);

      // Auto-answer: tell the API to use what it knows from the crawl
      const autoAnswer = `Based on the website at ${url}, please use the data already extracted from the crawl to fill this in. I trust the crawled data.`;

      const aResult = await post<Record<string, unknown>>("/api/cartographer/conversation", {
        action: "submit_answer",
        question: questionText,
        answer: autoAnswer,
      });

      const result = aResult.result as Record<string, unknown> | undefined;
      const layersUpdated = result?.layersUpdated as string[] | undefined;
      parts.push(
        `Q${questionRound + 1}: ${questionText.slice(0, 80)}...` +
          (layersUpdated?.length ? ` -> updated: ${layersUpdated.join(", ")}` : "")
      );

      questionRound++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      parts.push(`Question round ${questionRound + 1} failed: ${msg}`);
      break;
    }
  }
  parts.push("");

  // Step 3: Voice calibration
  parts.push("## Step 3: Voice Calibration");
  try {
    const calResult = await post<Record<string, unknown>>("/api/cartographer/calibrate", {
      action: "generate",
      count: 4,
    });

    const exercises = calResult.exercises as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(exercises) && exercises.length > 0) {
      let submitted = 0;
      let failed = 0;
      for (const ex of exercises) {
        if (!ex || typeof ex !== "object") continue;
        // Pick the choice that leans toward professional/warm defaults
        // A simple heuristic: prefer option A (usually the more moderate/professional choice)
        const choice = ex.aDirection === "high" ? "A" : "B";
        try {
          await post("/api/cartographer/calibrate", {
            action: "submit_choice",
            exercise: ex,
            choice,
          });
          submitted++;
        } catch (e) {
          failed++;
          const msg = e instanceof Error ? e.message : String(e);
          process.stderr.write(`kinetiks-mcp: calibration submit failed: ${msg}\n`);
        }
      }
      parts.push(`Calibrated ${submitted}/${exercises.length} voice dimensions.`);
      if (failed > 0) {
        parts.push(`(${failed} submission(s) failed)`);
      }
    } else {
      parts.push("No calibration exercises generated.");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    parts.push(`Calibration failed: ${msg}`);
  }
  parts.push("");

  // Step 4: Writing sample (optional)
  if (writingSample && writingSample.length >= 100) {
    parts.push("## Step 4: Writing Sample");
    try {
      await post("/api/cartographer/writing-sample", {
        text: writingSample,
        source: "onboard_me_tool",
      });
      parts.push("Writing sample analyzed and voice profile refined.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      parts.push(`Writing sample analysis failed: ${msg}`);
    }
    parts.push("");
  }

  // Step 5: Mark onboarding complete
  parts.push("## Completing Onboarding");
  try {
    await patch("/api/account/onboarding-complete", {});
    parts.push("Onboarding marked complete.");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    parts.push(`Failed to mark onboarding complete: ${msg}`);
  }
  parts.push("");

  // Step 6: Report confidence scores
  parts.push("## Confidence Scores");
  try {
    const confidence = await get<ConfidenceScores>("/api/context/confidence");
    parts.push(formatConfidence(confidence));
  } catch {
    parts.push("Could not retrieve confidence scores.");
  }

  return { content: [{ type: "text", text: parts.join("\n") }] };
}
