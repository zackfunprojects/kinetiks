# SERP Optimization

## Featured Snippet Targeting

Featured snippets appear above the first organic result (position zero). Three main formats:

**Definition snippets:** Direct answer in 40-60 words. Place the definition in the first 150 words of the page, formatted as: "[Keyword] is [definition]." Keep it concise and factual. The surrounding content should expand on the definition.

**List snippets:** Numbered or bulleted steps. Use an H2 for the question, immediately followed by an ordered or unordered list. Keep each list item to one concise line. Google pulls lists with 3-8 items most frequently.

**Table snippets:** Structured comparison data. Use actual HTML tables with clear column headers. Keep cell content concise. Tables comparing 3-5 options across 4-8 attributes perform well.

**General rules:**
- Answer the query directly and early -- do not bury the answer
- Match the format currently winning the snippet (check the SERP)
- The page does not need to be rank 1 to win the snippet; pages ranking 2-5 frequently win
- Use the exact phrasing of the query in a header, then answer immediately below

---

## People Also Ask (PAA)

PAA boxes reveal the exact questions searchers ask around a topic. They are a direct window into search intent.

**Extraction:** Search the target keyword and all PAA questions shown. Expand each PAA to trigger second-level questions. Search 2-3 keyword variations to surface additional PAA questions.

**Integration into content:**
- High-signal PAA questions become H2 sections with full treatment
- Lower-signal PAA questions go in an FAQ section
- Answer each PAA question directly in 40-60 words (Featured Snippet format), then expand with depth
- Use the exact PAA phrasing in headers -- it matches how people search

**PAA as content strategy:** If a PAA answer from existing results is thin or unhelpful, that is a ranking opportunity. Provide a substantially better answer.

---

## Schema Markup

Structured data helps search engines understand content type and can enable rich results.

**Article JSON-LD** (required for blog posts and articles):
```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Page title",
  "description": "Meta description",
  "author": {
    "@type": "Person",
    "name": "Author Name"
  },
  "datePublished": "YYYY-MM-DD",
  "dateModified": "YYYY-MM-DD",
  "publisher": {
    "@type": "Organization",
    "name": "Brand Name"
  },
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "https://example.com/page-url"
  }
}
```

**FAQ JSON-LD** (for pages with FAQ sections):
```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Question text here?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Answer text here."
      }
    }
  ]
}
```

**HowTo JSON-LD** (for tutorial/how-to content):
```json
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "How to title",
  "description": "Brief description",
  "step": [
    {
      "@type": "HowToStep",
      "name": "Step title",
      "text": "Step description"
    }
  ]
}
```

Include schema as JSON-LD in a `<script type="application/ld+json">` tag in the page head. One schema block per type. Validate with Google's Rich Results Test before publishing.

---

## Meta Descriptions

140-155 characters. One unique meta description per page.

**Format:** [Direct answer to query]. [Proof or credibility]. [CTA or hook].

**Example:** "AI marketing tools automate 60-80% of repetitive tasks. We tested 23 tools over 6 months. See which 10 actually deliver."

**Rules:**
- Include the primary keyword (Google bolds matching terms in results)
- Make it compelling enough to click -- this is ad copy for organic search
- Match what the content actually delivers (mismatches increase bounce rate)
- Action-oriented language: "See," "Learn," "Get," "Compare"
- Do not duplicate meta descriptions across pages
- If Google rewrites your meta description, it usually means the original did not match the query well enough
