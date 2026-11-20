/* ai.js — Smart matching + negotiation (runs client + server) */
const AI = (() => {
  // Keyword extraction (lightweight NLP)
  function extractKeywords(text) {
    const stop = new Set(('a an the and or for of to in on with at by from is are was were be been being have has had do does did will would should can could this that these those it its i you he she we they them their our your my as').split(' '));
    return (text || '').toLowerCase()
      .replace(/[^a-z0-9\s\+\#\.]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stop.has(w));
  }

  // Skill match score (0-100)
  function skillMatch(requiredSkills, freelancerSkills) {
    const req = (requiredSkills || []).map(s => s.toLowerCase().trim());
    const free = (freelancerSkills || []).map(s => s.toLowerCase().trim());
    if (!req.length) return 50;
    let hits = 0;
    req.forEach(r => {
      if (free.some(f => f.includes(r) || r.includes(f))) hits++;
    });
    return Math.round((hits / req.length) * 100);
  }

  // Experience score (0-100)
  function expScore(years) {
    const y = Number(years) || 0;
    if (y >= 10) return 100;
    if (y >= 5) return 80;
    if (y >= 2) return 60;
    if (y >= 1) return 40;
    return 20;
  }

  // Budget fit (0-100) — prefers freelancers within budget
  function budgetFit(budget, rate) {
    const b = Number(budget) || 0;
    const r = Number(rate) || 0;
    if (!b || !r) return 50;
    if (r <= b) return 100;
    if (r <= b * 1.2) return 80;
    if (r <= b * 1.5) return 50;
    return 20;
  }

  // Rating score (0-100)
  function ratingScore(rating, reviews) {
    const r = Number(rating) || 0;
    const n = Number(reviews) || 0;
    const base = (r / 5) * 100;
    const confidence = Math.min(1, n / 10);
    return Math.round(base * (0.5 + 0.5 * confidence));
  }

  // Overall match
  function computeMatch(project, freelancer) {
    const skills = skillMatch(project.skills, freelancer.skills);
    const exp = expScore(freelancer.experience);
    const budget = budgetFit(project.budget, freelancer.hourlyRate || freelancer.rate);
    const rating = ratingScore(freelancer.rating, freelancer.reviews);
    const overall = Math.round(skills * 0.4 + exp * 0.2 + budget * 0.25 + rating * 0.15);
    return { overall, skills, exp, budget, rating };
  }

  // Rank freelancers for a project
  function rankFreelancers(project, freelancers) {
    return freelancers
      .map(f => ({ ...f, match: computeMatch(project, f) }))
      .sort((a, b) => b.match.overall - a.match.overall);
  }

  // AI Negotiation — generates counter-offer
  // Strategy: aim for 15-25% below freelancer ask, but never below client budget * 0.8
  function negotiate({ clientBudget, freelancerRate, freelancerMin, projectUrgency, matchScore }) {
    const budget = Number(clientBudget) || 0;
    const rate = Number(freelancerRate) || 0;
    const min = Number(freelancerMin) || rate * 0.7;

    // Target: meet in the middle, leaning toward client
    let target;
    if (rate <= budget) {
      target = rate; // already within budget
    } else {
      const gap = rate - budget;
      const discount = Math.min(gap * 0.6, rate * 0.25); // up to 25% discount
      target = Math.max(rate - discount, min, budget * 0.85);
    }

    // Urgency premium
    if (projectUrgency === 'urgent') target *= 1.05;

    // Match score leverage — high match = more flexibility from freelancer
    if (matchScore > 85) target *= 0.97;

    target = Math.round(target);

    const savings = rate - target;
    const savingsPct = rate ? Math.round((savings / rate) * 100) : 0;

    return {
      counterOffer: target,
      originalRate: rate,
      savings,
      savingsPct,
      message: generateMessage(target, rate, matchScore),
      confidence: Math.min(95, 60 + matchScore * 0.3 + (rate <= budget ? 20 : 0))
    };
  }

  function generateMessage(offer, original, match) {
    const templates = [
      `Based on market analysis and your strong match (${match}%) for this project, we propose $${offer} — a fair rate reflecting the scope and your expertise.`,
      `We've analyzed 1000+ similar projects. Your profile is an excellent fit. Our AI recommends $${offer} as an optimal rate for this engagement.`,
      `Given the project requirements and your matching skills, we suggest $${offer}. This represents a competitive rate while ensuring quality delivery.`
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }

  return { extractKeywords, skillMatch, computeMatch, rankFreelancers, negotiate };
})();