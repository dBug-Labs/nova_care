from typing import Optional

NURSE_SYSTEM_PROMPT = """You are Nova, an empathetic AI health companion built into NovaCare. You act as a caring, knowledgeable nurse — not a doctor.

Your personality:
- Warm, gentle, and reassuring — like a trusted friend who happens to know a lot about health
- Ask one focused follow-up question at a time — never overwhelm the patient
- Use simple language — avoid complex medical jargon unless necessary, and always explain it
- Be culturally sensitive — many users are from India, ages 40–60, with conditions like Diabetes, BP, Heart disease
- Respond in the same language the patient uses (Hindi/English mix is fine)

What you DO:
- Listen actively and validate feelings ("That sounds difficult, let me help...")
- Ask about symptoms in a structured way (location, severity 1-10, duration, what makes it worse/better)
- Suggest evidence-based lifestyle changes (diet, exercise, sleep, stress management)
- Remind about medicines if the patient mentions forgetting
- Celebrate health wins ("Your BP has improved this week — great work!")
- Flag concerning patterns to the doctor dashboard

What you NEVER do:
- Prescribe or change medications
- Diagnose conditions
- Replace professional medical advice
- Panic the patient about symptoms

CRISIS PROTOCOL: If patient mentions chest pain + shortness of breath, or suicidal thoughts, or stroke symptoms (FAST) — immediately say:
"⚠️ This sounds urgent. Please call emergency services (112 in India) right now or ask someone nearby for help. Do not wait."

Patient context will be provided below when available.
"""


def build_nurse_messages(
    user_message: str,
    conversation_history: list,
    patient_context: Optional[dict] = None
) -> list:
    """Build the messages array for the nurse chat."""
    system = NURSE_SYSTEM_PROMPT

    # Inject patient context if available
    if patient_context:
        ctx_parts = []
        if patient_context.get("name"):
            ctx_parts.append(f"Patient name: {patient_context['name']}")
        if patient_context.get("age"):
            ctx_parts.append(f"Age: {patient_context['age']}")
        if patient_context.get("conditions"):
            ctx_parts.append(f"Chronic conditions: {', '.join(patient_context['conditions'])}")
        if patient_context.get("medicines"):
            ctx_parts.append(f"Current medicines: {', '.join(patient_context['medicines'])}")
        if patient_context.get("mood_score"):
            ctx_parts.append(f"Today's mood score: {patient_context['mood_score']}/5")
        if patient_context.get("latest_bp"):
            ctx_parts.append(f"Latest BP: {patient_context['latest_bp']}")
        if patient_context.get("latest_sugar"):
            ctx_parts.append(f"Latest blood sugar: {patient_context['latest_sugar']}")
        if patient_context.get("risk_level"):
            ctx_parts.append(f"Current risk level: {patient_context['risk_level']}")

        if ctx_parts:
            system += "\n\n--- PATIENT CONTEXT ---\n" + "\n".join(ctx_parts)

    messages = [{"role": "system", "content": system}]

    # Add conversation history (last 10 messages to save tokens)
    for msg in conversation_history[-10:]:
        messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({"role": "user", "content": user_message})
    return messages


SENTIMENT_PROMPT = """Analyze the emotional tone and health indicators in this patient message.
Return ONLY valid JSON — no explanation, no markdown.

{
  "mood_score": <1-5>,
  "primary_emotion": "<string>",
  "health_flags": ["<flag1>", "<flag2>"],
  "crisis_detected": <true|false>,
  "urgency": "<low|medium|high|critical>"
}

mood_score: 1=very negative/distressed, 5=very positive/happy
health_flags: any of ["chest_pain","breathlessness","high_sugar","high_bp","missed_medicine","pain","fever","dizziness","fatigue","anxiety","depression"]
crisis_detected: true if patient mentions self-harm, suicidal thoughts, or emergency symptoms

Message: """


ASSESSMENT_QUESTIONS = {
    "general": [
        "How have you been feeling overall this week on a scale of 1 to 10?",
        "Have you been taking all your medicines on time?",
        "How has your sleep been? How many hours per night roughly?",
        "How much water are you drinking daily?",
        "Have you been doing any physical activity this week?",
        "Any new pain or discomfort you'd like to tell me about?",
        "How has your appetite been? Any changes in your diet?",
        "How are you managing stress levels?",
    ],
    "diabetes": [
        "When did you last check your blood sugar? What was the reading?",
        "Have you had any episodes of feeling very shaky, sweaty, or dizzy? (low sugar signs)",
        "Are your feet feeling normal — no numbness or tingling?",
        "Have you been eating at regular meal times?",
        "How much sweet food or refined carbs have you had this week?",
    ],
    "hypertension": [
        "Have you checked your BP recently? What was the reading?",
        "Have you had any headaches, especially in the morning?",
        "How much salt are you consuming? Do you add extra salt to food?",
        "Are you feeling stressed or anxious more than usual?",
        "Have you been regular with your BP medicines?",
    ],
    "heart_disease": [
        "Any chest discomfort, tightness, or pressure recently?",
        "Do you get breathless when climbing stairs or walking?",
        "Have you noticed any swelling in your feet or ankles?",
        "Have you been doing your prescribed cardiac exercises?",
        "Any palpitations or irregular heartbeat sensations?",
    ],
}


def get_assessment_prompt(conditions: list, responses_so_far: list) -> str:
    """Generate next assessment question based on conditions and previous responses."""
    asked = len(responses_so_far)
    questions = ASSESSMENT_QUESTIONS["general"].copy()

    for condition in conditions:
        if condition in ASSESSMENT_QUESTIONS:
            questions.extend(ASSESSMENT_QUESTIONS[condition])

    if asked < len(questions):
        return questions[asked]
    return None  # Assessment complete


RECOMMENDATION_PROMPT = """Based on this patient's health data, generate 3 personalized, actionable wellness recommendations.

Patient data:
{patient_data}

Rules:
- Be specific and realistic — not generic advice
- Consider their conditions and current health metrics
- Make recommendations feel encouraging, not alarming
- Include one lifestyle change, one nutrition tip, one mental wellness tip

Return ONLY valid JSON array:
[
  {{"title": "...", "description": "...", "type": "lifestyle|nutrition|mental|exercise|medication", "priority": "high|medium|low"}},
  {{"title": "...", "description": "...", "type": "...", "priority": "..."}},
  {{"title": "...", "description": "...", "type": "...", "priority": "..."}}
]"""
