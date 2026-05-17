export interface DemoNoteSeed {
  id: string;
  title: string;
  content: string;
}

export const DEMO_NOTES: DemoNoteSeed[] = [
  {
    id: 'demo-japanese-101',
    title: 'Japanese 101',
    content: `Hiragana basics: あ (a), い (i), う (u).
Greeting: こんにちは means "hello" in the afternoon.
Particle は marks the topic of a sentence.
です is the polite copula — it means "is" or "am".`,
  },
  {
    id: 'demo-calc-2',
    title: 'Calculus II',
    content: `Definition: A series Σ a_n converges if the sequence of partial sums S_n approaches a finite limit L.
The ratio test: if lim |a_{n+1}/a_n| < 1, the series converges absolutely.
Integration by parts: ∫ u dv = uv − ∫ v du.`,
  },
  {
    id: 'demo-cardio-clinical',
    title: 'Cardio Clinical',
    content: `STEMI: ST-elevation myocardial infarction — emergent reperfusion indicated.
Beta-blockers reduce myocardial oxygen demand; avoid in acute decompensated HF.
BNP elevated in volume overload; use with clinical context.`,
  },
];
