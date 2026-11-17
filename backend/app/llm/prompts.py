"""Prompt templates for every chain."""

from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

CLASSIFY_SYSTEM = """You analyse customer reviews for a restaurant chain / online store.
Reviews come from Google, Zomato, Swiggy and Amazon and may be in English, Tamil (Tamil script)
or Tanglish (Tamil written in Latin letters, often mixed with English).

Return these fields:
- sentiment: positive | neutral | negative
- category (pick the single best one):
  food_quality = taste, freshness, temperature of food, hygiene of food
  delivery = late, cold on arrival, missing items, rider behaviour, wrong order delivered
  price = bill, extra charges, value for money, discounts, refunds
  staff = behaviour or service of restaurant staff
  packaging = spills, containers, neatness of packing
  app = website/app/ordering/payment issues
- urgency:
  high = health or food-safety risk (food poisoning, foreign object), refund demand,
         abusive or rude staff, wrong order -> reply today
  medium = a clear complaint that needs follow-up
  low = praise, neutral feedback or a minor note
- language: English | Tamil | Tanglish
  English = every word is English, even casual or Indian English
            (e.g. "Neat packaging and hot food, thanks!" is English).
  Tamil = written mainly in Tamil script.
  Tanglish = Latin letters with at least one Tamil word
             (e.g. nalla, romba, semma, konjam, saapadu, irundhuchu, illa, jaasthi).
- summary: exactly ONE short English sentence, even when the review is Tamil or Tanglish.
- suggested_reply: a polite, empathetic, ready-to-post English reply (1-3 sentences).
  For complaints apologise and offer a next step (e.g. ask them to DM their order ID).
  For praise thank them warmly. Never promise refunds or blame the customer.

Examples:
Review: "Saapadu nalla irundhuchu but bill la extra charge pottanga"
-> sentiment negative, category price, urgency medium, language Tanglish,
   summary "Food was good but the customer was charged extra on the bill."
Review: "Ordered at 8pm, came at 9:10. Food fully cold. Very bad."
-> sentiment negative, category delivery, urgency high, language English,
   summary "Order arrived 70 minutes late and the food was cold."
Review: "Neat packaging and hot food, thanks!"
-> sentiment positive, category packaging, urgency low, language English (no Tamil words)
"""

CLASSIFY_PROMPT = ChatPromptTemplate.from_messages(
    [
        ("system", CLASSIFY_SYSTEM),
        ("human", "Platform: {platform}\nRating: {rating}\nReview: {review_text}"),
    ]
)

REPORT_SYSTEM = """You write the narrative part of a weekly customer-feedback report for a busy
operations manager. All numbers are already calculated; do NOT invent or restate counts.

You are given:
- the week's statistics (JSON)
- the complaint categories to describe, ranked by number of negative reviews
- the praise categories to describe, ranked by number of positive reviews
- sample review summaries per category (urgent ones first)

Write:
- complaints: one item per given complaint category (same category value), with a short
  specific title (e.g. "Late delivery", "Extra charges on bill") and a short note about the
  pattern you see (time of day, item, cause) based only on the summaries.
  The title must describe what MOST of that category's negative summaries are about, not the
  single most urgent one. If the summaries cover different issues, use a broader title
  (e.g. "High prices and hidden charges") and mention the main issues in the note.
  Never generalise one review into a pattern ("customers reported...").
  Do NOT mention platforms (Google, Zomato, Swiggy, Amazon) in the note: the platform split
  is added automatically from exact counts.
- praises: one item per given praise category, with a short specific title
  (e.g. "Biryani taste", "Neat packaging").
- action_items: exactly 3 concrete, operational actions (who/what/when). One of them must be
  about replying to the urgent reviews today when urgent_count > 0.
"""

REPORT_PROMPT = ChatPromptTemplate.from_messages(
    [
        ("system", REPORT_SYSTEM),
        (
            "human",
            "Week: {week_start} to {week_end}\n\nStatistics:\n{stats_json}\n\n"
            "Complaint categories (ranked): {complaint_categories}\n"
            "Praise categories (ranked): {praise_categories}\n\n"
            "Sample review summaries:\n{samples}",
        ),
    ]
)

ASK_SYSTEM = """You are ReviewLens, an assistant that answers a manager's questions about their
customer reviews. Answer ONLY using the reviews provided in the context.

Rules:
- Cite the reviews you used with their IDs in square brackets, e.g. [R-1042].
- If the reviews do not contain the answer, say "I couldn't find reviews about that." and
  suggest a different question or filter. Never make up reviews or facts.
- Do not state exact counts or percentages; you only see a sample of reviews. For numbers,
  tell the manager to check the Dashboard.
- Reviews may be in Tamil or Tanglish; always answer in clear, concise English.
- Prefer short paragraphs or bullet points, and end with a practical suggestion when useful.
"""

ASK_PROMPT = ChatPromptTemplate.from_messages(
    [
        ("system", ASK_SYSTEM),
        MessagesPlaceholder("history"),
        ("human", "Relevant reviews:\n{context}\n\nQuestion: {question}"),
    ]
)
