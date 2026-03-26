import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { WeeklyStats, EvaluationReport, MetricComparison } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

function calculateScore(stats: WeeklyStats): number {
  const accuracyScore = 100 - stats.error_rate;
  const typingScore = Math.min(100, Math.max(0, stats.typing_speed_wpm + 20));
  const structureScore = stats.structure_score;
  const reasoningScore = stats.clinical_reasoning_score;
  const clarityScore = stats.error_rate > 15 ? 90 - (stats.error_rate - 15) * 2 : 90;

  return (accuracyScore * 0.25) + (typingScore * 0.20) + (structureScore * 0.20) + (reasoningScore * 0.25) + (clarityScore * 0.10);
}

function getTrend(current: number, previous: number): 'Improving' | 'Declining' | 'Stable' {
  if (previous === 0) return 'Stable';
  const change = ((current - previous) / previous) * 100;
  if (change >= 5) return 'Improving';
  if (change <= -5) return 'Declining';
  return 'Stable';
}

export async function generateEvaluation(current: WeeklyStats, previous?: WeeklyStats): Promise<EvaluationReport> {
  const finalScore = calculateScore(current);
  const prevScore = previous ? calculateScore(previous) : finalScore;
  const performanceTrend = getTrend(finalScore, prevScore);

  const comparisons: MetricComparison[] = [
    {
      metric: 'Accuracy',
      thisWeek: 100 - current.error_rate,
      lastWeek: previous ? 100 - previous.error_rate : 100 - current.error_rate,
      change: previous ? (100 - current.error_rate) - (100 - previous.error_rate) : 0,
      trend: previous ? getTrend(100 - current.error_rate, 100 - previous.error_rate) : 'Stable'
    },
    {
      metric: 'Typing Speed',
      thisWeek: current.typing_speed_wpm,
      lastWeek: previous ? previous.typing_speed_wpm : current.typing_speed_wpm,
      change: previous ? current.typing_speed_wpm - previous.typing_speed_wpm : 0,
      trend: previous ? getTrend(current.typing_speed_wpm, previous.typing_speed_wpm) : 'Stable'
    },
    {
      metric: 'Structure',
      thisWeek: current.structure_score,
      lastWeek: previous ? previous.structure_score : current.structure_score,
      change: previous ? current.structure_score - previous.structure_score : 0,
      trend: previous ? getTrend(current.structure_score, previous.structure_score) : 'Stable'
    },
    {
      metric: 'Clinical Reasoning',
      thisWeek: current.clinical_reasoning_score,
      lastWeek: previous ? previous.clinical_reasoning_score : current.clinical_reasoning_score,
      change: previous ? current.clinical_reasoning_score - previous.clinical_reasoning_score : 0,
      trend: previous ? getTrend(current.clinical_reasoning_score, previous.clinical_reasoning_score) : 'Stable'
    }
  ];

  const prompt = `
    Role: You are an automated AI performance evaluator for a medical education platform that trains users to write professional clinical notes.
    
    Task: Generate a weekly performance report automatically based on the user’s latest data.
    
    Current Week Stats (MINET):
    - Notes Written: ${current.notes_written}
    - Typing Speed: ${current.typing_speed_wpm} WPM
    - Error Rate: ${current.error_rate}%
    - Structure Score: ${current.structure_score}/100
    - Clinical Reasoning Score: ${current.clinical_reasoning_score}/100
    - Calculated Final Score: ${finalScore.toFixed(1)}/100
    - Trend: ${performanceTrend}
    
    ${previous ? `Previous Week Stats (Week):
    - Typing Speed: ${previous.typing_speed_wpm} WPM
    - Error Rate: ${previous.error_rate}%
    - Structure Score: ${previous.structure_score}/100
    - Clinical Reasoning Score: ${previous.clinical_reasoning_score}/100` : ''}
    
    Provide the following fields in JSON format:
    - summary: 2-3 sentences summarizing the performance.
    - insights: 2-3 specific insights about the performance patterns.
    - strengths: 3-4 bullet points of strengths.
    - areas_for_improvement: 3-4 bullet points of areas for improvement.
    - action_plan: 2-3 specific, practical steps for next week, focusing on the weakest metric first.
    
    Be professional, clinical, and actionable.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          insights: { type: Type.ARRAY, items: { type: Type.STRING } },
          strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
          areas_for_improvement: { type: Type.ARRAY, items: { type: Type.STRING } },
          action_plan: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["summary", "insights", "strengths", "areas_for_improvement", "action_plan"],
      },
    },
  });

  const aiResult = JSON.parse(response.text || "{}");

  return {
    week_number: current.week_number,
    final_score: finalScore,
    performance_trend: performanceTrend,
    summary: aiResult.summary,
    comparisons,
    insights: aiResult.insights,
    strengths: aiResult.strengths,
    areas_for_improvement: aiResult.areas_for_improvement,
    action_plan: aiResult.action_plan
  };
}
