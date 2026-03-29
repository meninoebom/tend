interface Quote {
  text: string;
  attribution: string;
}

const quotes: Quote[] = [
  {
    text: "What information consumes is the attention of its recipients. A wealth of information creates a poverty of attention.",
    attribution: "Herbert Simon",
  },
  {
    text: "The ability to perform deep work is becoming increasingly rare at exactly the same time it is becoming increasingly valuable.",
    attribution: "Cal Newport",
  },
  {
    text: "It is not that we have a short time to live, but that we waste a great deal of it.",
    attribution: "Seneca",
  },
  {
    text: "People think focus means saying yes to the thing you've got to focus on. It means saying no to the hundred other good ideas.",
    attribution: "Steve Jobs",
  },
  {
    text: "The key is not to prioritize what's on your schedule, but to schedule your priorities.",
    attribution: "Stephen Covey",
  },
  {
    text: "You can do anything, but not everything.",
    attribution: "David Allen",
  },
  {
    text: "Be regular and orderly in your life so that you may be violent and original in your work.",
    attribution: "Gustave Flaubert",
  },
  {
    text: "If you don't pay appropriate attention to what has your attention, it will take more of your attention than it deserves.",
    attribution: "David Allen",
  },
  {
    text: "The mind is not a vessel to be filled but a fire to be kindled.",
    attribution: "Plutarch",
  },
  {
    text: "Concentrate all your thoughts upon the work at hand. The sun's rays do not burn until brought to a focus.",
    attribution: "Alexander Graham Bell",
  },
  {
    text: "To do two things at once is to do neither.",
    attribution: "Publilius Syrus",
  },
  {
    text: "Who you are, what you think, feel, and do, what you love — is the sum of what you focus on.",
    attribution: "Cal Newport",
  },
];

/**
 * Returns the quote for today. Deterministic — same quote all day, different tomorrow.
 */
export function getTodayQuote(): Quote {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return quotes[dayOfYear % quotes.length];
}
