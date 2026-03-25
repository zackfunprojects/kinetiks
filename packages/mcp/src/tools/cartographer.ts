import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { post, postLong } from "../client.js";
import { formatCrawlResult, formatGeneric } from "../formatters.js";

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
      const exercises = result.exercises as Array<Record<string, unknown>>;
      if (!exercises || exercises.length === 0) {
        return { content: [{ type: "text", text: "No calibration exercises generated." }] };
      }

      const parts: string[] = [`${exercises.length} calibration exercise(s):`, ""];
      for (let i = 0; i < exercises.length; i++) {
        const ex = exercises[i];
        parts.push(`Exercise ${i + 1}: ${ex.exercise}`);
        parts.push(`Scenario: ${ex.scenario}`);
        parts.push(`  A: ${ex.optionA}`);
        parts.push(`  B: ${ex.optionB}`);
        parts.push(`  (dimension: ${ex.dimension})`);
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

    default:
      return { content: [{ type: "text", text: `Unknown cartographer tool: ${name}` }], isError: true };
  }
}
