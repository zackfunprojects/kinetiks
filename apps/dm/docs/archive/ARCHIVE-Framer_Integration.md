> **SUPERSEDED — June 2026. Historical reference only. NEVER BUILD FROM THIS DOCUMENT.**
> Superseded by: specs/publishing.md (behind CMS abstraction)
> Authority and merge map: dark-madder-v2-doc-system.md (Dark Madder v2 Documentation System Plan)

# 06 - Framer Integration

## Server API Connection, CMS Structure & Publish Flow

**System:** Dark Madder
**Depends on:** 01-DATA-MODEL, 04-CONTENT-GENERATOR
**Depended on by:** 07-ANALYTICS-ADJUSTER (published URLs needed for tracking)

---

## 1. Purpose

The Framer Integration enables one-click publishing from Dark Madder to Framer CMS. When a user approves a draft, it can be pushed directly to Framer's CMS as a blog post, guide, or playbook, complete with all metadata, schema markup, and SEO fields. The user never has to copy-paste content between platforms.

---

## 2. Framer Server API Overview

Framer launched its Server API in open beta in February 2026. Key capabilities relevant to Dark Madder:

- **Programmatic CMS access:** Create, update, and delete CMS items from any server without opening Framer
- **Collection management:** Read collection structures, add items, update fields
- **Publish triggering:** Publish site changes after CMS updates
- **WebSocket-based:** Stateful connection, good for batch operations
- **npm package:** `framer-api` - install and use server-side

### 2.1 Authentication

Each Framer project generates an API key in site settings. This key is stored encrypted in the `framer_connections` table for each org.

### 2.2 Connection Setup Flow

1. User navigates to Org Settings > Framer Connection
2. User enters their Framer project ID and API key
3. Dark Madder connects via the Server API and fetches all CMS collections
4. User maps their collections: "Which collection is for blog posts? Which is for guides?"
5. Dark Madder reads the collection fields and auto-maps what it can (title > title, slug > slug, body > body)
6. User confirms or adjusts the field mappings
7. Connection status is verified and stored

---

## 3. CMS Collection Structure

### 3.1 Recommended Framer CMS Setup

For each org's Framer project, Dark Madder expects (and can help the user set up) these CMS collections:

**Blog Posts Collection:**

| Field Name | Field Type | Maps to Dark Madder |
|-----------|-----------|-------------------|
| Title | String | content_pieces.title |
| Slug | String | content_pieces.slug |
| Body | Rich Text | content_pieces.body_html |
| Meta Description | String | content_pieces.meta_description |
| Primary Keyword | String | content_pieces.primary_keyword |
| Author Name | String | content_pieces.author_name |
| Author Bio Link | String | content_pieces.author_bio_link |
| Publish Date | Date | content_pieces.published_at |
| Update Date | Date | content_pieces.updated_at |
| AI Transparency | String | content_pieces.ai_transparency_line |
| Key Takeaways | Rich Text | Rendered from content_pieces.key_takeaways |
| FAQ Question 1-6 | String | From content_pieces.faq_items[n].question |
| FAQ Answer 1-6 | String | From content_pieces.faq_items[n].answer |
| Category | Enum | Derived from pillar |
| Featured Image | Image | Placeholder or generated |
| Excerpt | String | First 200 characters of body or custom |

The same structure applies to Guides and Playbooks collections, with minor field additions (e.g., Playbooks may have a "Steps" rich text field).

### 3.2 Schema Markup Injection

Framer supports JSON-LD structured data via Custom Code on CMS detail pages. Dark Madder generates the schema and injects it through CMS variable references.

**Implementation approach:**

Dark Madder does not push raw JSON-LD to Framer. Instead, it pushes the data components (FAQ questions, answers, author info, dates) as CMS fields, and the Framer template references them using `{{field_name | json}}` syntax in the Custom Code section.

**Required schema types per content piece:**

1. **Article Schema** (all content types):
```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "{{Title | json}}",
  "author": {
    "@type": "Person",
    "name": "{{Author Name | json}}",
    "url": "{{Author Bio Link | json}}"
  },
  "datePublished": "{{Publish Date | json}}",
  "dateModified": "{{Update Date | json}}",
  "description": "{{Meta Description | json}}",
  "publisher": {
    "@type": "Organization",
    "name": "Org Name",
    "logo": { "@type": "ImageObject", "url": "logo-url" }
  }
}
```

2. **FAQPage Schema** (all pieces with FAQ sections):
```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "{{FAQ Question 1 | json}}",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "{{FAQ Answer 1 | json}}"
      }
    }
  ]
}
```

3. **HowTo Schema** (playbooks only):
Generated from the step structure, pushed as a separate CMS field.

4. **BreadcrumbList Schema** (all pages):
Generated from the URL structure and pillar hierarchy.

**Framer template setup (one-time):** The user (or Dark Madder's setup guide) adds the JSON-LD script blocks to the CMS detail page template's Custom Code section, referencing the CMS fields. This is done once per collection. After that, every new CMS item automatically gets proper schema from its field values.

**Note on Framer's 5k character limit for head scripts:** If the combined schema exceeds 5,000 characters, use a code override that appends the schema to the head dynamically via JavaScript. Dark Madder should generate schema that stays under this limit where possible by keeping FAQ answers concise.

---

## 4. The Publish Flow

### 4.1 One-Click Publish

When the user clicks "Publish" on an approved draft:

1. **Pre-publish validation:**
   - Verify Framer connection is active (test API key)
   - Verify target collection exists and field mappings are valid
   - Confirm no existing CMS item has the same slug (prevent duplicates)

2. **Content transformation:**
   - Convert body markdown to Framer-compatible rich text HTML
   - Render key takeaways as formatted HTML
   - Prepare FAQ fields (question/answer pairs mapped to individual CMS fields)
   - Prepare all metadata fields

3. **CMS push:**
   ```javascript
   import { framerAPI } from 'framer-api';
   
   const api = framerAPI({ projectId, apiKey });
   
   // Get the target collection
   const collection = await api.getCollection(collectionId);
   
   // Create new CMS item
   const item = await collection.addItem({
     slug: piece.slug,
     fieldData: {
       [fieldMappings.title]: piece.title,
       [fieldMappings.body]: piece.body_html,
       [fieldMappings.metaDescription]: piece.meta_description,
       [fieldMappings.authorName]: piece.author_name,
       [fieldMappings.publishDate]: piece.published_at,
       // ... all mapped fields
     }
   });
   ```

4. **Publish trigger:**
   ```javascript
   // Trigger site publish after CMS update
   await api.publishSite();
   ```

5. **Post-publish updates:**
   - Store the Framer CMS item ID on the content_pieces record
   - Set status to 'published'
   - Set published_at timestamp
   - Store the live URL (constructed from domain + slug pattern)
   - Begin analytics tracking for this piece

### 4.2 Content Updates

When a published piece needs updating (e.g., the analytics adjuster recommends a refresh, or the user manually edits):

1. Fetch the existing Framer CMS item by stored item ID
2. Update only the changed fields
3. Update the "Update Date" field
4. Trigger site republish

### 4.3 Batch Publishing

The user can select multiple approved drafts and publish them all at once. The system processes them sequentially through the Framer Server API (one WebSocket connection, multiple item creations), then triggers a single site publish at the end.

---

## 5. Framer Connection Health

### 5.1 Connection Monitoring

- Test the API connection weekly (automated)
- If the API key is revoked or the project is deleted, flag immediately
- Store last successful connection timestamp

### 5.2 Sync Status

For each org, maintain a sync dashboard showing:
- Total pieces in Dark Madder vs. total CMS items in Framer
- Any pieces that are approved but not yet published
- Any pieces that were published but have pending updates
- Last publish timestamp

---

## 6. Content Formatting for Framer

### 6.1 Rich Text Conversion

Framer's CMS rich text field supports: headings (H1-H6), paragraphs, bold, italic, links, images, tables, and lists. It also supports embedded Components (as of early 2026).

Dark Madder generates content in markdown internally. The conversion to Framer-compatible HTML must handle:

- Heading hierarchy (H2 for sections, H3 for subsections)
- Definition boxes: rendered as a styled blockquote or custom component
- Internal links: converted to absolute URLs using the org's domain
- Source citations: rendered as a formatted section at the bottom
- FAQ section: pushed as both body content (for visual rendering) and separate CMS fields (for schema)

### 6.2 Image Handling

v1 does not generate images. The "Featured Image" CMS field is left as a placeholder. The user adds images manually in Framer, or a future version integrates image generation.

Internal images referenced in content (diagrams, charts) are also outside v1 scope. The draft flags where an image would add value with a placeholder: `[IMAGE: Description of suggested image/diagram]`.

---

## 7. Multi-Org Framer Connections

Each org connects to its own Framer project independently. The user manages connections from each org's settings. There is no cross-org Framer access - each org is a clean, isolated CMS connection.

---

*Dark Madder Specification - 06 Framer Integration - March 2026*
