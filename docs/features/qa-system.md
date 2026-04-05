# Q&A System

## Questions
- Create, edit, delete questions with markdown body
- Tag system (create, browse, wiki pages per tag)
- Full-text search (PostgreSQL tsvector)
- Duplicate detection (as-you-type suggestions)
- Close/reopen voting with reasons (duplicate, off-topic, unclear, too-broad, opinion-based)
- Question templates for structured asking
- Related questions sidebar (tag overlap)
- Views counter, score tracking
- Bookmark questions
- Share button (native share + clipboard)
- Edit history with full audit trail
- RSS feed at `/feed.xml`
- Sitemap at `/sitemap.xml`

## Answers
- Markdown answers with syntax highlighting (highlight.js)
- Accept answer (question author only)
- Sort by votes, newest, oldest
- Edit with history tracking

## Voting
- Upvote/downvote on questions and answers
- Toggle votes (click again to undo)
- Reputation-gated: upvote at 15 rep, downvote at 125 rep
- Downvoting costs -1 rep (prevents abuse)

## Comments
- Inline comments on questions and answers
- Reputation-gated at 50 rep
- Markdown supported

## Tags
- Create tags on questions
- Tag wiki pages (editable descriptions)
- Trending tags API
- Auto-tag suggestion (keyword extraction)
- Browse by tag with question counts

## Search
- Universal search: questions + users + tags
- Keyword + tag filtering
- Sort by newest, votes, active, unanswered

## Moderation
- Flag content (spam, offensive, low-quality)
- Close vote system (5 votes to close, 5 to reopen)
- Edit others' posts (at 2000 rep)
